# TreeGantt 設計書

| 項目 | 内容 |
|------|------|
| 製品バージョン | **1.0** |
| ドキュメント版 | 0.2.78 |
| 作成日 | 2025年 |
| 最終更新 | 2026年6月 |
| 対象読者 | 開発者・アーキテクト |
| ステータス | リリース（1.0） |

> 本書は **TreeGantt 1.0 の完全仕様書**である。本書のみを参照して現行アプリを再実装できることを目標とし、
> 設計・仕様は各章の本文に記述する。巻末の「改訂履歴」は版数と設計上の要点の一覧であり、
> 設計の出典は本文を正とする（バグ修正の記録は履歴には残さない）。

---

## 目次

1. はじめに（目的・スコープ・前提）
2. システム概要（アーキテクチャ・コンテナ・データフロー）
3. ディレクトリ構成
4. データモデル（型定義・DBスキーマ）
5. REST API 仕様
6. リアルタイム同期（WebSocket）
7. フロントエンド設計（状態管理・コンポーネント）
8. ガントチャート描画仕様
9. UI/UX 仕様
10. Import / Export 仕様
11. 認証・セキュリティ
12. 非機能・パフォーマンス設計
13. ビルド・デプロイ
14. テスト構成
15. バージョニング方針

---

## 1. はじめに

### 1.1 目的
TreeGantt は、ツリー構造（親子）に対応したガントチャート型のプロジェクト・タスク管理ツールである。
複数ブラウザ間のリアルタイム同期を備え、社内サーバーへの Docker デプロイを想定する。

### 1.2 スコープ
- マルチプロジェクト管理、タスクのツリー構造、ガントチャート可視化、依存関係、進捗・期間管理。
- WebSocket による複数クライアント間の即時同期。
- JSON / CSV による Import / Export。
- 認証は現状ゲスト固定（社内 LAN 前提）。LDAP 認証は将来拡張（11章）。

### 1.3 前提・制約
- 単一 SQLite ファイルをデータストアとする（`better-sqlite3`、同期 API）。
- 認可・マルチテナント分離は未実装（projectId を知る全クライアントが全プロジェクトを操作可能）。
- 既存の社内 Docker 環境にデプロイする。Node.js 20 を前提とする。

---

## 2. システム概要

### 2.1 アーキテクチャ全体像
3 つのプロセスから成る。

| 層 | 技術 | 既定ポート | 役割 |
|----|------|-----------|------|
| フロントエンド | React 18 + TypeScript + Vite | 3000 | SPA。ガント UI・状態管理 |
| REST API | Fastify 5 + better-sqlite3 | 4000 | CRUD・Import/Export・/health |
| WebSocket | `ws` ライブラリ（Fastify とは別プロセス／別ポート） | 4001 | プロジェクト単位の broadcast |

- フロント→API：REST（`/api/v1`、`/health` は prefix 外）。
- フロント↔WS：`ws://host:4001` に接続し `subscribe` 後、他クライアントの変更通知を受信。
- API→WS：API はタスク変更時に `notifyRoom(projectId, message)` を呼び、WS サーバーが同一プロセス内の room へ broadcast する（API と WS は同一 Node プロセスで起動し、`wsRoom.ts` の `notifyRoom` を直接呼ぶ）。

### 2.2 コンテナ構成
`docker-compose.yml`（本番）と `docker-compose.override.yml`（開発）の 2 ファイル。

- `frontend`：Vite（dev は HMR、本番はビルド済み静的配信）。ポート `${FRONTEND_PORT:-3000}`。
- `api`：REST(4000)+WS(4001)。`./api/data` を `/app/data` にボリュームマウント（SQLite 永続化）。
- `db-ui`（任意・`profiles` でオプトイン）：`coleifer/sqlite-web` を 8888 で起動し DB を閲覧。**本番では無効にすること**（無認証）。

### 2.3 データフロー
1. クライアント起動 → `/health` でバックエンド版取得 → プロジェクト一覧取得 → 選択プロジェクトのタスクをページング取得（`fetchAllTasks`、1000件/ページ）。
2. WS で当該 projectId を `subscribe`。
3. 編集操作 → REST（楽観的更新：ローカルストアを即時更新しつつ API 呼び出し）→ API が DB 更新 → `notifyRoom` で他クライアントへ broadcast。
4. 他クライアントは WS メッセージを `applyMessage` で差分適用（`upsertTask`/`removeTasks`/`applyOrders`）。
5. Import 後はサーバーが `reload` を broadcast → 各クライアントは全件再取得。

---

## 3. ディレクトリ構成

```
/workspace
├── api/                      REST + WebSocket
│   ├── src/
│   │   ├── index.ts          Fastify 起動・プラグイン/ルート登録・エラーハンドラ
│   │   ├── config.ts         resolveApiPort / resolveWsPort
│   │   ├── db/
│   │   │   ├── client.ts      better-sqlite3 初期化・マイグレーション実行
│   │   │   └── migrations/    001_init 〜 008_next_seq
│   │   ├── plugins/
│   │   │   ├── auth.ts        認証フック（現状ゲスト固定）
│   │   │   └── compression.ts @fastify/compress 登録
│   │   ├── routes/           health / projects / tasks / importExport
│   │   ├── services/         projectService / taskService（DB アクセス）
│   │   ├── ws/wsRoom.ts       WebSocketServer・room 管理・notifyRoom
│   │   └── types/task.ts      Task / Project 型
│   ├── Dockerfile            多段ビルド（dev / builder / runtime）
│   └── package.json          version=1.0.0（/health が返す）
├── frontend/                 React SPA
│   ├── src/
│   │   ├── App.tsx           画面統合・オーケストレーション
│   │   ├── version.ts        FRONTEND_VERSION（package.json 由来）
│   │   ├── components/       Toolbar / Gantt / TaskModal 等
│   │   ├── hooks/            useTasks / useProjects / useWebSocket / useImportExport / useTheme
│   │   ├── store/taskStore.ts zustand（永続化付き）
│   │   ├── types/task.ts     Task / Project 型
│   │   └── utils/            ganttCalc / taskTree / api / importExport ほか
│   └── package.json          version=1.0.0
├── e2e/                       Playwright E2E
├── docs/                      本書・FEATURES.md・performance_plan.md
└── docker-compose*.yml
```

---

## 4. データモデル

### 4.1 型定義（TypeScript）
api/frontend で同型を共有（`types/task.ts`）。

```ts
type TaskStatus   = 'todo' | 'wip' | 'done' | 'wait' | 'pending';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type ZoomLevel    = 'day' | 'week' | 'month';

interface Task {
  id: string;             // UUID v4
  projectId: string;
  parentId: string | null;// 親タスク（null=ルート）
  title: string;
  summary: string;
  description: string;    // Markdown（GFM）
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;       // 0–100
  assignee: string;
  startDate: string | null; // 'YYYY-MM-DD'
  endDate: string | null;
  isMilestone: boolean;
  predecessors: string[]; // 先行タスク ID 配列
  seq: number;            // 不変の作成順（# 列表示用・永久欠番）
  order: number;          // 並び順（ドラッグで変動。DB列は ord）
  titleColor: string | null;
  titleBgColor: string | null;
  createdAt: string;
  updatedAt: string;
}
// API レスポンスは TaskWithSuccessors = Task & { successors: string[] }

interface Project { id: string; name: string; color: string | null; createdAt: string; }
```

### 4.2 SQLite スキーマ
マイグレーションは `_migrations` テーブルで適用済みを管理し、起動時に未適用のみ実行する（`db/client.ts`）。
`journal_mode=WAL`、`foreign_keys=ON`。

**projects**

| 列 | 型 | 制約 |
|----|----|------|
| id | TEXT | PK（UUID） |
| name | TEXT | NOT NULL |
| color | TEXT | NULL 可（007 追加） |
| next_seq | INTEGER | NOT NULL DEFAULT 1（008 追加。seq 採番カウンター） |
| created_at | TEXT | DEFAULT datetime('now') |

**tasks**

| 列 | 型 | 制約 |
|----|----|------|
| id | TEXT | PK（UUID） |
| project_id | TEXT | NOT NULL, FK→projects(id) **ON DELETE CASCADE** |
| parent_id | TEXT | FK→tasks(id) **ON DELETE SET NULL**（親削除で子はルート昇格。002 追加） |
| title | TEXT | NOT NULL |
| summary / description | TEXT | NOT NULL DEFAULT '' |
| status | TEXT | DEFAULT 'todo', CHECK in (todo,wip,done,wait,pending)（pending は 005 追加） |
| priority | TEXT | DEFAULT 'medium', CHECK in (critical,high,medium,low) |
| progress | INTEGER | DEFAULT 0, CHECK 0–100 |
| assignee | TEXT | NOT NULL DEFAULT '' |
| start_date / end_date | TEXT | NULL 可 |
| is_milestone | INTEGER | NOT NULL DEFAULT 0（003 追加） |
| ord | INTEGER | NOT NULL DEFAULT 0（並び順） |
| seq | INTEGER | NOT NULL DEFAULT 0（作成順。004 追加） |
| title_color / title_bg_color | TEXT | NULL 可（006 追加） |
| created_at / updated_at | TEXT | DEFAULT datetime('now') |

- トリガー `update_tasks_updated_at`：UPDATE 後に `updated_at` を自動更新。
- インデックス：`project`、`(project,status)`、`(project,assignee)`、`(project,start_date,end_date)`。

**task_deps**

| 列 | 制約 |
|----|------|
| predecessor_id | FK→tasks(id) ON DELETE CASCADE |
| successor_id | FK→tasks(id) ON DELETE CASCADE |
| PRIMARY KEY | (predecessor_id, successor_id) |

**設計上の要点**
- **親タスクの日付・進捗は DB に保存しない派生値**。子孫から都度フロントで算出する（親の start_date/end_date は API が書き換えない）。
- `seq` は `projects.next_seq` 単調増加カウンターで採番し、削除済み番号は再利用しない（永久欠番）。
- CHECK 制約変更（005）は SQLite の制約上テーブル再構築で行う。

---

## 5. REST API 仕様

### 5.1 共通仕様
- ベース URL：`/api/v1`（`/health` のみ prefix 外）。
- リクエスト/レスポンス：JSON。バリデーションは Fastify JSON スキーマ。
- 圧縮：`@fastify/compress`（`global:true, threshold:1024, encodings:[br,gzip]`）。1KB 未満は非圧縮。
- CORS：`CORS_ORIGIN`（既定 `*`）。
- 認証：`auth` プラグインが全リクエストに `req.user`（現状 `{id:'guest'}`）を付与。
- エラー：`setErrorHandler` が `{ error: message, code }` を `statusCode` で返す。

### 5.2 エンドポイント一覧

| メソッド | パス | 概要 |
|---------|------|------|
| GET | `/health` | 稼働確認。`{status, version, timestamp}` を返す |
| GET | `/api/v1/projects` | プロジェクト一覧（created_at 降順） |
| POST | `/api/v1/projects` | 作成（body: name 必須, color 任意） |
| PATCH | `/api/v1/projects/:id` | 更新（name/color） |
| DELETE | `/api/v1/projects/:id` | 削除（タスクは CASCADE） |
| GET | `/api/v1/projects/:id/tasks` | タスク一覧（query: status/assignee/priority/limit/offset）。`{tasks,total}` |
| POST | `/api/v1/projects/:id/tasks` | タスク作成 |
| PATCH | `/api/v1/projects/:id/tasks/reorder` | 並び替え（orders[]） |
| POST | `/api/v1/projects/:id/tasks/batch` | サブツリー一括作成（parentRef でツリー指定） |
| GET | `/api/v1/tasks/:id` | 単一取得 |
| PATCH | `/api/v1/tasks/:id` | 更新 |
| DELETE | `/api/v1/tasks/:id?mode=subtree\|single` | 削除（既定 subtree=子孫ごと／single=子は祖父母へ付替え） |
| POST | `/api/v1/projects/:id/import` | Import（mode: append/restore） |
| GET | `/api/v1/projects/:id/export/json` | JSON エクスポート |
| GET | `/api/v1/projects/:id/export/csv` | CSV エクスポート |

### 5.3 タスク作成/更新のボディスキーマ
`title`（1–200）必須。`status`/`priority` は enum、`progress` は 0–100、`parentId`/`startDate`/`endDate`/`titleColor`/`titleBgColor` は `string|null`、`predecessors` は string[]。
- 作成・更新時に `parentId` を指定した場合、同一プロジェクト・非マイルストーン・循環不可（`wouldCreateCycle`）を検証し、不正は 400（`INVALID_PARENT`/`CYCLE_DETECTED`/`MILESTONE_CANNOT_BE_PARENT`）。
- `seq` は `projects.next_seq` から採番（カウンターを +1）。

### 5.4 一覧取得・並び替え・バッチ
- 一覧：`WHERE project_id=? [AND status/assignee LIKE/priority]`、`ORDER BY ord ASC LIMIT ? OFFSET ?`（既定 limit=500）。`attachDeps` で predecessors/successors を 2 クエリ一括付与。
- 並び替え：`orders[] = {id, order, parentId?}` を単一トランザクションで `ord`/`parent_id` 更新。
- バッチ作成：`tasks[]` の各要素は `parentRef`（配列内インデックス、範囲外は 400）で親子を解決。単一トランザクションで作成し、WS `tasks_created` 1 通を broadcast。

### 5.5 削除のセマンティクス
- `subtree`（既定）：再帰 CTE で子孫 ID を収集し、500 件チャンクで一括 DELETE。WS `tasks_deleted`（ids[]）1 通。
- `single`：直下の子を削除対象の親（祖父母）へ付替えてから本体のみ削除。付替えは WS `tasks_reordered`、本体削除は `tasks_deleted`。

すべての全 SQL はパラメータ化（プレースホルダ）。

---

## 6. リアルタイム同期（WebSocket）

### 6.1 設計方針
Y.js/CRDT は採用せず、シンプルな projectId 単位の broadcast とする。`ws.WebSocketServer`（`wsRoom.ts`）が
`rooms: Map<projectId, Set<WebSocket>>` を保持。クライアントは `{type:'subscribe', projectId}` を送信して購読する。
API は変更後 `notifyRoom(projectId, message)` で同 room の全接続へ JSON を送信する。

### 6.2 メッセージ型一覧（サーバー→クライアント）

| type | ペイロード | 用途 |
|------|-----------|------|
| `task_created` | `{projectId, task}` | 単一作成 |
| `task_updated` | `{projectId, task}` | 更新 |
| `tasks_created` | `{projectId, tasks[]}` | バッチ作成 |
| `tasks_deleted` | `{projectId, ids[]}` | 削除（subtree/single 共通） |
| `tasks_reordered` | `{projectId, orders[]}` | 並び替え・single 削除の付替え |
| `reload` | `{projectId}` | Import 後の全件再取得指示 |
| `task_deleted`（旧） | `{projectId, id}` | 互換のため受信のみ残置 |

### 6.3 クライアント接続（`useWebSocket.ts`）
- モジュールレベルのシングルトン接続（StrictMode の二重マウント耐性）。
- `onmessage` で `msg.projectId` が購読中と一致するもののみ `applyMessage` に渡す。
- `applyMessage`：created/updated→`upsertTask`（先着レース自己回復）、tasks_created→各 upsert、tasks_deleted/task_deleted→`removeTasks`、tasks_reordered→`applyOrders`、reload→`needsReload=true`。
- `onclose` で 3 秒後に自動再接続。

---

## 7. フロントエンド設計

### 7.1 状態管理（`store/taskStore.ts`、zustand + persist）
- データ：`tasks`、`needsReload`。
- フィルタ：`filterStatus`（`'' | TaskStatus | '!done'`）、`filterAssignee`、`filterPriority`、`filterSearch`。
- ガント表示：`zoomLevel`(既定 day)、`ganttStartDate`、`ganttPeriod`(既定 3m)、`showLightningLine/Weekend/CriticalPath/ResourceView/TodayLine/Milestones`、`milestoneHighlightColor`(#8b5cf6)、`uiFontSize`(13)、`uiRowHeight`(36)、`ganttHeaderLevels`(month/day=true)、`depArrowStyle`(bezier)。
- レイアウト：`theme`(auto)、`ganttBarOpen`、`wbsPanelOpen`、`wbsHiddenCols`。
- 差分適用アクション：`upsertTask`/`removeTasks`/`applyOrders`（未変更タスクの参照を保ち `React.memo` 行の再描画を最小化）。
- 永続化：`partialize` で UI 設定のみ `localStorage('treegantt-ui')` に保存（tasks は保存しない）。

### 7.2 コンポーネント責務

| コンポーネント | 責務 |
|---------------|------|
| `App` | 全体オーケストレーション。プロジェクト/タスク取得、WS 接続、モーダル制御、`/health` 取得（バック版） |
| `Toolbar` | 操作系（追加/Import/Export）・フィルタ・ガント表示設定・テーマ・ハンバーガーメニュー（バージョン表示） |
| `ProjectTabs` | プロジェクトのタブ切替・作成・改名・色・削除 |
| `GanttChart` | WBS 左パネル＋右タイムライン SVG の統合。ツリー・折りたたみ・行仮想化・ドラッグ・依存・派生計算 |
| `GanttLeftRow` | WBS 1 行（インライン編集・進捗バー・折りたたみトグル） |
| `GanttBar` | 1 タスクの SVG バー（通常/親サマリー/マイルストーン） |
| `DependencyArrow` | 依存矢印（bezier/elbow/straight） |
| `LightningLine`/`TodayLine` | イナズマライン・今日ライン |
| `ResourceView` | 担当者×日付の負荷ヒートマップ |
| `TaskModal`/`MilestoneModal` | 作成/編集フォーム |
| `GanttContextMenu`/`ContextMenu` | 右クリックメニュー |
| `TaskTooltip` | バー hover ツールチップ（Markdown） |
| `ConflictDialog` | 競合解決 UI |
| `DeleteTaskDialog` | 削除モード選択（subtree/single） |
| `MarkdownBody` | GFM Markdown 描画（`react-markdown`+`remark-gfm`、生 HTML 不許可） |

### 7.3 hooks / utils
- hooks：`useTasks`（楽観的 CRUD・batch）、`useProjects`、`useWebSocket`、`useImportExport`、`useTheme`。
- utils：`ganttCalc`（座標・範囲・CPM・ヘッダー）、`taskTree`（ツリー構築・実効進捗 O(N)）、`virtualRange`（可視行）、`api`（fetch ラッパ・`fetchHealth`）、`importExport`、`sort`、`taskColors`、`workloadCalc`、`wbsLayout`、`copyDeps`/`copyTitle`、`menuPos`、`portConfig`、`theme`。

---

## 8. ガントチャート描画仕様

### 8.1 座標系・定数（`ganttCalc.ts`）
- `ROW_HEIGHT_PX=36`（既定 `uiRowHeight`）。
- `ZOOM_CONFIG`：day=28px/日, week=8px/日, month=3px/日。
- `PERIOD_DAYS`：3m=91, 6m=183, 12m=365, 24m=730。
- `dateToX(date,min,zoom) = round((date-min)/日) * dayWidth`（日付セル左端の X）。
- 既定表示開始日 `defaultGanttStart(zoom)`：day=7日前、week=前週頭（日曜）、month=前月1日。手動指定（`ganttStartDate`）時はその日＋period。

### 8.2 ヘッダー
`buildMultiLevelHeaders` が `ganttHeaderLevels`（年/月/週/日/曜日）に応じた多段ヘッダーを生成。曜日行は土=青背景・日=赤背景。マイルストーン日のセルは `milestoneHighlightColor` で強調。**マイルストーンマーカー（◆）はヘッダーの独立行に、日付セル中心（`x + dayWidth/2`）に配置**（ボディの菱形と縦に揃う）。複数マイルストーンはレーン割当で重なり回避。

### 8.3 バー描画（`GanttBar.tsx`）
- 通常バー：`x=dateToX(start)`、幅=`(dateToX(end)+dayWidth)-x`、進捗オーバーレイ、テキストはバー内/右外/非表示をバー幅で切替、進捗がテキスト開始を超えると白文字へ反転。
- **親サマリーバー**：上部横バー＋左右の下向き三角。描画位置・進捗は**子孫の派生値**を使う。
  - 期間：`calcParentSpanMap`（子孫の min start / max end、O(N) post-order）＝ `displayStart/displayEnd`。
  - 進捗：`calcAllEffectiveProgress`（葉=自身、親=直接の子の実効進捗の算術平均・再帰・四捨五入。O(N)）。
  - 親は移動/リサイズ不可（ハンドルなし）。
- マイルストーン：日付セル中心 `cx=dateToX(start)+dayWidth/2` に菱形、ラベルは右。期限超過/クリティカルで配色変化。

### 8.4 実効日付（依存・コネクタの整合）
依存矢印・コネクタドット・ドラッグプレビューの端点座標は、対象が親（子を持つ）なら**親サマリーバーと同じ表示スパン**（`parentSpanMap`）を、葉なら生値を使う（`effStartDate`/`effEndDate`）。これにより親を折りたたんで子の依存が親へリダイレクトされても、矢印・ドットが親バー端と一致する。

### 8.5 依存矢印（`DependencyArrow.tsx`）
- 端点：起点=`from の実効 end + dayWidth`、終点=`to の実効 start`。
- スタイル：`bezier`（C 曲線）/`elbow`（L または S 字折れ線）/`straight`。
- 折りたたみ時は `resolveVisibleId` で可視祖先へリダイレクト。可視範囲と交差するもののみ描画。

### 8.6 イナズマライン（`LightningLine`/`calcLightningPoints`）
全タスクの進捗到達点を折れ線で結ぶ。`wip`=進捗割合の X、`todo/done/wait`=現在時刻 X（`nowX`）、`pending`=スキップ。
- **親タスクは展開中はスキップ**（子が各自描画）。**折りたたみ親のみ**子集計（実効進捗・実効日付）で 1 頂点を描く。日付なしタスクはスキップ。

### 8.7 今日ライン・週末列・クリティカルパス
- 今日ライン：`showTodayLine` で現在時刻の縦線。
- 週末列：`showWeekend` で土日列に淡背景。
- クリティカルパス（`calcCriticalPath`、CPM）：先行関係から ES/EF・LS/LF を計算し総余裕 0 のタスク集合を黄背景＋インディゴ枠で強調。折りたたみ親に子のクリティカルを伝播（`buildCollapsedCriticalParents`）。

### 8.8 行仮想化
`calcVisibleRange(scrollTop, viewportH, rowHeight, rowCount, overscan=10)` で可視範囲のみ DOM/SVG を描画（WBS は上下スペーサ、SVG はスライス分のバー）。全高 1 要素のライン類（イナズマ/今日/週末/マイルストーン）は据え置き。

---

## 9. UI/UX 仕様

### 9.1 画面レイアウト
上部 `ProjectTabs` → `Toolbar`（2 段：操作行＋ガント表示設定行、∧/∨ で 2 行目折りたたみ）→ `GanttChart`（左 WBS＋右ガント、垂直スクロール同期、水平スクロールはガント列のみ）→ 下部 `ResourceView`（任意）。

### 9.2 WBS とインライン編集
- 列：#（seq）・タイトル・担当者・進捗・開始日・終了日・期間。`wbsHiddenCols` で表示列を制御、`wbsPanelOpen` で WBS パネル開閉。
- セルクリックで直接編集。**親タスクの日付・進捗は自動計算のため編集不可**（淡色表示・ツールチップ）。
- ツリー：親行に折りたたみトグル（▼/▶）。`depth` でインデント。

### 9.3 ツールバー
- 操作：タスク追加・マイルストーン追加・ハンバーガー（Import 追記/レストア、Export JSON/CSV、**バージョン表示**）。
- フィルタ：ステータス（「DONE/保留以外」=`!done` 含む）・優先度・担当者（部分一致・datalist 補完・クリア）・タスク検索。
- ガント表示設定：ズーム（日/週/月）、表示期間（3/6/12/24 ヶ月）、イナズマ/週末/クリティカル/担当者ビュー/今日ライン/マイルストーンの各トグル、フォントサイズ・行高さ、ヘッダー段（年/月/週/日）、依存矢印スタイル、マイルストーン色、テーマ。

### 9.4 操作（ドラッグ等）
- バードラッグ：移動・左右リサイズ（1 日スナップ）。親バーは不可。
- 依存付与：バー hover で右端コネクタドット → ドラッグして別バーへドロップ（自己参照・循環・祖先子孫・マイルストーン・日付なしは禁止）。
- WBS 行ドラッグ：並び替え・親子変更（depth インジケーター）。Ctrl/Cmd で「コピー」（サブツリー再帰コピー、`tasks/batch` 1 リクエスト、predecessors は内部参照のみ再マップ）。
- 右クリックメニュー：タスク操作・依存解除など。
- 競合解決：同一フィールドの同時編集検知時に自分/相手の値を選択（`ConflictDialog`）。

### 9.5 バージョン表示
ハンバーガーメニュー内に「Frontend v{FRONTEND_VERSION} / Backend v{health.version}」を表示。フロント版は `version.ts`（`package.json` 由来）、バック版は起動時に `/health` から取得（取得失敗時は「—」）。

### 9.6 テーマ
`theme`（auto/light/dark）。CSS 変数（`--th-*`）で配色。auto は OS 設定追従。

---

## 10. Import / Export 仕様

- **データ形式バージョン = `1.0`**（エクスポート JSON の `version` フィールド。互換判定用の別軸。インポートは version 非検証で後方互換）。
- **JSON Export**：`{version:'1.0', exportedAt, project:{id,name}, tasks[]}`。
- **CSV Export**：ヘッダ `id,parentId,title,...,predecessors`。`id`/`parentId`/`predecessors` は `seq` 番号で出力。カンマ/引用符/改行は CSV エスケープ（`"` 二重化）。
- **CSV Import**：CSV ファイルは**フロントエンド側で `papaparse` によりパース**し、`seq` 参照を解決してタスク配列へ変換した上で下記 Import API（JSON）を呼ぶ（API は JSON のみ受け付ける）。
- **Import（API）**：`{tasks[], mode}`。`mode='restore'` は既存タスク全削除後に投入、それ以外は追記。全タスクに新 UUID を採番し、`parentId`/`predecessors` を旧→新 ID へリマップ（バッチ外参照は除外）。3 パス（全件 INSERT→親リマップ→依存挿入）で FK 順序問題を回避。完了後 `reload` を broadcast。
- 文字列は許可リストで正規化（status/priority は不正値を既定へ、progress は 0–100 にクランプ）。

---

## 11. 認証・セキュリティ

- **認証**：`auth` プラグインが `LDAP_ENABLED!=='true'` のとき全リクエストに `req.user={id:'guest'}` を付与（ゲスト固定）。LDAP は将来拡張（フック実装位置のみ用意）。
- **認可**：未実装。projectId を知る全クライアントが全プロジェクトを操作可能（社内 LAN 前提）。
- **入力検証**：Fastify JSON スキーマ（enum/長さ/型）。全 SQL はパラメータ化（SQL インジェクション対策）。
- **XSS**：Markdown は `react-markdown`（生 HTML 不許可・URL サニタイズ既定）。`dangerouslySetInnerHTML`/`eval` 不使用。
- **依存セキュリティ**：`npm audit` クリーン（fastify 5 系・uuid 11 系。未使用の脆弱依存 fast-jwt は不採用）。
- **CORS**：`CORS_ORIGIN`（既定 `*`）。本番は具体的オリジンの許可リスト化を推奨。
- **CSV**：式インジェクション（先頭 `=+-@`）の中和は将来課題。

---

## 12. 非機能・パフォーマンス設計

- **集計の O(N) 化**：`taskTree.ts` の `buildChildrenMap`/`calcAllEffectiveProgress`、`ganttCalc.calcParentSpanMap` を post-order 1 パスで算出。
- **行仮想化**：`virtualRange.ts`（8.8 節）。
- **REST 圧縮**：`@fastify/compress`（br/gzip、threshold 1024）。
- **差分適用**：WS 受信・楽観的更新を `upsertTask`/`removeTasks`/`applyOrders` に集約し、`React.memo` 行の再描画を最小化。
- **サーバー側バッチ**：subtree 削除は再帰 CTE＋チャンク DELETE、サブツリーコピーは `tasks/batch` 単一トランザクション＋WS 1 通。
- 詳細な改善経緯は `docs/performance_plan.md` を参照。

---

## 13. ビルド・デプロイ

### 13.1 環境変数

| 変数 | 既定 | 用途 |
|------|------|------|
| `PORT` | 4000 | REST API |
| `WS_PORT` | 4001 | WebSocket |
| `CORS_ORIGIN` | `*` | CORS 許可オリジン |
| `DB_PATH` | `api/data/treegantt.db` | SQLite ファイル |
| `LDAP_ENABLED` | （未設定=ゲスト） | LDAP 有効化フラグ |
| `FRONTEND_PORT` | 3000 | フロント配信ポート |
| `API_PROXY_TARGET` | `http://localhost:4000` | dev の Vite プロキシ先 |
| `VITE_API_URL` / `VITE_WS_URL` | host:4000 / host:4001 | フロントの接続先上書き |

### 13.2 Docker
- `api/Dockerfile`：多段（dev / builder / runtime）。builder で `tsc` ビルド＋`npm prune --omit=dev`。runtime は `node:20-slim` に `node_modules`/`dist`/**`package.json`**（/health のバージョン用）をコピー。
- コマンド：開発 `bash start.sh`（API+フロント同時起動）、本番 `docker compose build && docker compose up -d`。

### 13.3 主要依存ライブラリ（再実装の基準）

| 層 | パッケージ | 版 | 用途 |
|----|-----------|----|------|
| frontend | react / react-dom | ^18.3 | UI |
| frontend | zustand | ^4.5 | 状態管理（persist） |
| frontend | dayjs | ^1.11 | 日付計算（ローカルタイム解釈） |
| frontend | react-markdown / remark-gfm | ^10 / ^4 | Markdown(GFM) 描画 |
| frontend | papaparse | ^5.4 | CSV パース（インポート） |
| frontend | vite / @vitejs/plugin-react | ^5 / ^4 | ビルド・dev サーバー |
| frontend | vitest | ^4 | テスト |
| api | fastify | ^5.8 | REST フレームワーク |
| api | @fastify/cors / @fastify/compress | ^11 / ^9 | CORS・圧縮（fastify5 対応ライン） |
| api | better-sqlite3 | ^9.4 | SQLite（同期 API） |
| api | uuid | ^11.1 | UUID v4 採番 |
| api | ws | ^8.20 | WebSocket サーバー |
| api | ldapjs | ^3.0 | LDAP（将来拡張・現状未使用） |
| api | vitest | ^4 | テスト |
| e2e | @playwright/test | — | E2E |

Node.js 20 を前提（fastify5 の要件・Docker は `node:20-slim`）。

---

## 14. テスト構成

- 単体/結合：Vitest。`cd api && npm test`（サービス・ルート inject・WS・圧縮・敵対的入力）、`cd frontend && npm test -- --run`（ガント計算・描画・ストア・hooks・コンポーネント）。
- E2E：`e2e/`（Playwright）。プロジェクト/タスク CRUD・モーダル・ガント描画。
- 依存ガード：`api/src/__tests__/security.test.ts`（既知脆弱依存の混入防止・fastify/cors/compress/uuid の major 下限）。

---

## 15. バージョニング方針

- **製品バージョン**：セマンティック。現行リリース = **1.0**。`api`/`frontend` の `package.json` `version` を単一の出典とし、ハンバーガーと `/health` に表示。
- **本設計書のドキュメント版**：`0.2.x`（現行 `0.2.78`）。設計改訂ごとに `0.2.79…` と進める。
- **データ形式版**（Export JSON）：`1.0`。後方互換目的の独立軸。
- 採番ルール（開発手順）は `CLAUDE.md` を参照：**設計変更は本書の該当章を更新**し、改訂履歴には版数と要点のみを残す（バグ修正は履歴に記載しない）。

---

## 改訂履歴（要点のみ）

設計の正は本文。以下は版数と主な設計上の到達点の要約（〜0.2.78）。

| 版 | 時期 | 主な設計到達点 |
|----|------|---------------|
| 0.1.x | 2025–2026/5 | 初期設計。プロジェクト/タスク CRUD、分割レイアウト、CSV インポート、統合ガントビュー |
| 0.1.9 | 2026/5 | Y.js/Hocuspocus を廃し、シンプルな WebSocket broadcast 同期へ刷新 |
| 0.2.0–0.2.5 | 2026/5 | マイルストーン・クリティカルパス・バードラッグ・期限超過強調・期間列・右クリックメニュー・曜日ヘッダー・リソースビュー |
| 0.2.6–0.2.37 | 2026/5–6 | 親タスク読み取り専用化、親サマリーバー、親日付の DB 非破壊化＋フロント `calcParentSpanMap` 算出、依存接続バリデーション、矢印スタイル |
| 0.2.42–0.2.55 | 2026/6 | コピー＆挿入（サブツリー再帰）、Markdown(GFM)、プロジェクトタブ |
| 0.2.58–0.2.69 | 2026/6 | パフォーマンス（O(N) 集計・行仮想化・REST 圧縮・差分適用・バッチ削除/作成）、E2E 基盤、`tasks/batch` API |
| 0.2.70–0.2.78 | 2026/6 | ガント微修正（マイルストーン中心配置・day 既定開始日 7 日前）、親折りたたみ時の依存矢印/コネクタ/イナズマ整合（実効日付）、依存セキュリティ刷新（fast-jwt 除去・fastify5・uuid11）、製品 1.0 化＋バージョン表示 |
