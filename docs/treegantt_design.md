# TreeGantt 設計書

| 項目 | 内容 |
|------|------|
| 製品バージョン | **1.2.1** |
| ドキュメント版 | 0.2.119 |
| 作成日 | 2025年 |
| 最終更新 | 2026年6月 |
| 対象読者 | 開発者・アーキテクト |
| ステータス | リリース（1.2.1） |

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
16. ツールチェーン更新方針と既知の課題
17. 今後の検討事項（品質・UI/UX 改善ロードマップ）

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
│   └── package.json          version=1.2.1（/health が返す）
├── frontend/                 React SPA
│   ├── src/
│   │   ├── App.tsx           画面統合・オーケストレーション
│   │   ├── version.ts        FRONTEND_VERSION（package.json 由来）
│   │   ├── components/       Toolbar / Gantt / TaskModal 等
│   │   ├── hooks/            useTasks / useProjects / useWebSocket / useImportExport / useTheme
│   │   ├── store/taskStore.ts zustand（永続化付き）
│   │   ├── types/task.ts     Task / Project 型
│   │   └── utils/            ganttCalc / taskTree / api / importExport ほか
│   └── package.json          version=1.2.1
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
  estimateMinutes: number | null; // 予定工数（分単位の整数）。null=未設定
  createdAt: string;
  updatedAt: string;
}
// API レスポンスは TaskWithSuccessors = Task & { successors: string[] }

interface Project {
  id: string; name: string; color: string | null; createdAt: string;
  // リソース設定のプロジェクト個別上書き（null=アプリ既定 app_settings を継承）
  capacityMinutesPerDay: number | null;
  workingDays: number[] | null;
}
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
| capacity_minutes_per_day | INTEGER | NULL 可（011 追加。null=アプリ既定を継承） |
| working_days | TEXT | NULL 可（011 追加。JSON 配列。null=継承） |
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
| estimate_minutes | INTEGER | NULL 可（009 追加。予定工数＝分。null=未設定） |
| created_at / updated_at | TEXT | DEFAULT datetime('now') |

- トリガー `update_tasks_updated_at`：UPDATE 後に `updated_at` を自動更新。
- インデックス：`project`、`(project,status)`、`(project,assignee)`、`(project,start_date,end_date)`。

**task_deps**

| 列 | 制約 |
|----|------|
| predecessor_id | FK→tasks(id) ON DELETE CASCADE |
| successor_id | FK→tasks(id) ON DELETE CASCADE |
| PRIMARY KEY | (predecessor_id, successor_id) |

**app_settings**（リソース設定のアプリ既定。key-value, 010 追加）

| 列 | 型 | 制約 |
|----|----|------|
| key | TEXT | PK |
| value | TEXT | NOT NULL（JSON 文字列） |

- 既定値: `capacityMinutesPerDay`=480（8:00）、`workingDays`=`[1,2,3,4,5]`（月〜金。0=日…6=土）。行が無いキーは既定値で補完する。
- リソースビューの稼働率算出に使うアプリ全体の既定（全ユーザー共有）。プロジェクト個別の上書きは `projects` 側（後述）。

**設計上の要点**
- **親タスクの日付・進捗は DB に保存しない派生値**。子孫から都度フロントで算出する（親の start_date/end_date は API が書き換えない）。
- `seq` は `projects.next_seq` 単調増加カウンターで採番し、削除済み番号は再利用しない（永久欠番）。
- CHECK 制約変更（005）は SQLite の制約上テーブル再構築で行う。

---

## 5. REST API 仕様

### 5.1 共通仕様
- ベース URL：`/api/v1`（`/health` のみ prefix 外）。
- リクエスト/レスポンス：JSON。バリデーションは Fastify JSON スキーマ。
- **日付は ISO `YYYY-MM-DD` で保持・比較する**。インポート（CSV/JSON）時に `normalizeDateStr`（`ganttCalc.ts`、dayjs ベース）で ISO 化する。日付の大小比較は文字列順序に依存するため、`/` 区切り等の非 ISO 形式が混ざると誤判定する（`'2026/01/10' < '2026-06-16'` が false 等）ことを防ぐ。比較箇所（期限超過・遅延・親スパン集計）でも正規化してから比較する。
- リクエストの `Content-Type: application/json` は**ボディがある時のみ**付与する。空ボディに付けると Fastify が `FST_ERR_CTP_EMPTY_JSON_BODY`（400）を返すため（ボディを持たない DELETE 等が該当）。クライアント `apiFetch` は `init.body` の有無で自動制御する。
- 圧縮：`@fastify/compress`（`global:true, threshold:1024, encodings:[br,gzip]`）。1KB 未満は非圧縮。
- CORS：`CORS_ORIGIN`（既定 `*`）。**許可メソッドを明示**（`GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS`）。@fastify/cors の既定は `GET,HEAD,POST` のみで PATCH/PUT/DELETE が含まれず、クロスオリジン（フロント:3000/3001 → API:4000）の PATCH/DELETE がプリフライトで弾かれるため。設定は `plugins/cors.ts` の `corsOptions` に集約。
- 認証：`auth` プラグインが全リクエストに `req.user`（現状 `{id:'guest'}`）を付与。
- エラー：`setErrorHandler` が `{ error: message, code }` を `statusCode` で返す。

### 5.2 エンドポイント一覧

| メソッド | パス | 概要 |
|---------|------|------|
| GET | `/health` | 稼働確認。`{status, version, timestamp}` を返す |
| GET | `/api/v1/projects` | プロジェクト一覧（created_at 降順） |
| POST | `/api/v1/projects` | 作成（body: name 必須, color 任意） |
| PATCH | `/api/v1/projects/:id` | 更新（name/color/capacityMinutesPerDay/workingDays） |
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
| GET | `/api/v1/settings` | アプリ既定のリソース設定（capacity/workingDays）を取得 |
| PUT | `/api/v1/settings` | リソース設定を部分更新（指定キーのみ upsert） |

### 5.3 タスク作成/更新のボディスキーマ
`title`（1–200）必須。`status`/`priority` は enum、`progress` は 0–100、`parentId`/`startDate`/`endDate`/`titleColor`/`titleBgColor` は `string|null`、`predecessors` は string[]、`estimateMinutes` は `number|null`（予定工数＝分。負値不可）。
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

### 5.6 アプリ設定（リソース設定）
リソースビューの稼働率算出に使うアプリ全体の既定値。`app_settings`（key-value）に保存し、全ユーザーで共有する。

- **GET `/api/v1/settings`** → `{ capacityMinutesPerDay, workingDays }`。行が無いキーは既定（480／`[1,2,3,4,5]`）で補完。
- **PUT `/api/v1/settings`**（部分更新）：body は `{ capacityMinutesPerDay?: number(≥1), workingDays?: number[]（各 0–6） }`。指定キーのみ upsert し、更新後の全設定を返す。`workingDays` は重複除去・昇順・範囲外除外で正規化する。
- **プロジェクト個別の上書き（継承）**：`projects.capacity_minutes_per_day` / `working_days`（nullable, `null`=継承）を `PATCH /api/v1/projects/:id` で更新（`number\|null` / `number[]\|null`）。**実効値 = プロジェクト値 ?? アプリ既定 ?? ハードコード既定**（フロントの解決ヘルパで算出）。`workingDays` の上書きはアプリ既定と同様に正規化（0–6・重複除去・昇順）。

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
- リソース設定（capacity/workingDays のアプリ既定）は **localStorage に載せず**、別の非永続ストア `settingsStore`（zustand）に保持する。起動時に `GET /api/v1/settings` から取得（取得失敗時はハードコード既定 480／月〜金）。サーバが真実＝全ユーザー共有。プロジェクト個別の上書きは各 `Project` に同梱され、実効値は `duration.ts` の解決ヘルパで算出する（§9.8）。

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
| `ResourceView` | 担当者×日付の工数稼働率ヒートマップ（予定工数ベース、§8.9） |
| `TaskModal`/`MilestoneModal` | 作成/編集フォーム（`TaskModal` は予定工数 `estimateMinutes` 入力欄を持つ＝単位トークン/`HH:MM`、`?` 書式ヘルプ付き、§9.8） |
| `ResourceSettingsModal` | リソース設定（キャパ `HH:MM`＋稼働日チェック）の編集。アプリ既定＝ハンバーガー「リソース設定」、プロジェクト上書き＝`ProjectTabs` 右クリック「リソース設定」（「アプリ既定を継承」トグル付き＝オンで `null` 送信） |
| `GanttContextMenu`/`ContextMenu` | 右クリックメニュー |
| `TaskTooltip` | バー hover ツールチップ（Markdown） |
| `ConflictDialog` | 競合解決 UI |
| `DeleteTaskDialog` | 削除モード選択（subtree/single） |
| `MarkdownBody` | GFM Markdown 描画（`react-markdown`+`remark-gfm`、生 HTML 不許可） |

### 7.3 hooks / utils
- hooks：`useTasks`（楽観的 CRUD・batch）、`useProjects`、`useWebSocket`、`useImportExport`、`useTheme`。
- utils：`ganttCalc`（座標・範囲・CPM・ヘッダー）、`taskTree`（ツリー構築・実効進捗 O(N)）、`virtualRange`（可視行）、`api`（fetch ラッパ・`fetchHealth`）、`importExport`、`sort`、`taskColors`、`workloadCalc`、`duration`（予定工数の「トークン⇄分」変換・実効リソース設定の解決）、`wbsLayout`、`copyDeps`/`copyTitle`、`menuPos`、`portConfig`、`theme`。

---

## 8. ガントチャート描画仕様

### 8.1 座標系・定数（`ganttCalc.ts`）
- `ROW_HEIGHT_PX=36`（既定 `uiRowHeight`）。
- `ZOOM_CONFIG`：day=28px/日, week=8px/日, month=3px/日。
- `PERIOD_DAYS`：3m=91, 6m=183, 12m=365, 24m=730。
- `dateToX(date,min,zoom) = round((date-min)/日) * dayWidth`（日付セル左端の X）。
- 既定表示開始日 `defaultGanttStart(zoom)`：day=7日前、week=前週頭（日曜）、month=前月1日。手動指定（`ganttStartDate`）時はその日＋period。

### 8.2 ヘッダー
`buildMultiLevelHeaders` が `ganttHeaderLevels`（年/月/週/日/曜日）に応じた多段ヘッダーを生成。曜日行は土=青背景・日=赤背景。マイルストーン日のセルはマイルストーンの色で強調するが、**強調対象は日（day）行・曜日（dow）行のセルに限る**（週/月/年レベルのセルは背景色を変えない＝マイルストーンが週頭・月初・年初に重なってもその週・月・年セル全体が色づかない）。**マイルストーンマーカー（◆）はヘッダーの独立行に、日付セル中心（`x + dayWidth/2`）に配置**（ボディの菱形と縦に揃う）。複数マイルストーンはレーン割当で重なり回避。**レーン割当は x 昇順に詰める（first-fit）＝同時に横で重なる本数ぶんだけの最小段数になるよう、左から空いた最上段へ各ラベル箱を詰める（WBS の並び順ではなく x 順で処理する。並び順のまま詰めると不要に段が増える）。各ラベルの箱幅は `assignMilestoneLanes` が `fontSize`（ヘッダーマーカーの描画と同じ 11）から `◆`＋タイトル幅で見積もる。** **レーン割当（多段）は描画範囲内に見えるマイルストーンのみで行う**＝開始日変更・表示期間で `x` が描画範囲 `[0, totalWidth)` の外（セル `[x, x+dayWidth]` が範囲と重ならない）に外れたマイルストーンはレーン割当・◆マーカー・列ハイライト帯の対象から除外し、その分だけ多段の高さ（`milestoneHeaderH`）を減らす（見えなくなったマイルストーンのために空レーンを残さない。判定は `isMilestoneXVisible(x, dayWidth, totalWidth)`）。**マイルストーンの色（ヘッダーの日付セル強調・◆マーカー行・本体の列ハイライト帯、および §8.3 の菱形バー）は、そのタスクの個別テキスト色 `task.titleColor`（WBS 右クリックの「文字色」, §9.4）を最優先で用い、未設定（`null`）のときだけ統一色 `milestoneHighlightColor`（ツールバーの「マイルストーン色」, §9.3）にフォールバックする＝統一よりも個別を優先。色解決は `milestoneColorOf(titleColor, milestoneHighlightColor)`（`utils/taskColors.ts`）に一本化する。** **`showMilestones`（「マイル」トグル）は、このヘッダーのマイルストーン表示一式＝◆マーカー行・日付セル強調・本体の全高列ハイライト帯（`milestoneItems` 由来）のみを ON/OFF する。WBS 行・本体の菱形バー（マイルストーンというタスクそのもの）は `showMilestones` に依らず常時表示する**（行のフィルタには使わない）。

### 8.3 バー描画（`GanttBar.tsx`）
- 通常バー：`x=dateToX(start)`、幅=`(dateToX(end)+dayWidth)-x`、進捗オーバーレイ、テキストはバー内/右外/非表示をバー幅で切替、進捗がテキスト開始を超えると白文字へ反転。
- **親サマリーバー**：上部横バー＋左右の下向き三角。描画位置・進捗は**子孫の派生値**を使う。
  - 期間：`calcParentSpanMap`（子孫の min start / max end、O(N) post-order）＝ `displayStart/displayEnd`。
  - 進捗：`calcAllEffectiveProgress`（葉=自身、親=直接の子の実効進捗の算術平均・再帰・四捨五入。O(N)）。
  - 親は移動/リサイズ不可（ハンドルなし）。
- マイルストーン：日付セル中心 `cx=dateToX(start)+dayWidth/2` に菱形、ラベルは右。**菱形・ラベルの基本色は §8.2 と同じ規則（個別 `titleColor` を最優先、未設定時のみ統一 `milestoneHighlightColor`）で決める。** 期限超過/クリティカルのときは従来どおり状態色（赤/黄）で上書きする（状態強調 > 基本色）。**移動・リサイズ用のハンドルは持たず、菱形クリックでモーダルを開くのみ（ガント上で動かせない）**。`endDate` は常に `startDate` と同値（1点）。
- **遅延赤帯**：進捗到達点（イナズマ線頂点＝`calcVertexX`、§8.6）が**現在時刻 `nowX` より左**＝スケジュール遅延のとき、バー上の `[頂点X, min(nowX, 終了X)]` 区間に赤帯を重ねる（今を越えてバー終端を超える分はバー内にクランプ）。前倒し/オントラック（頂点が `nowX` 以右）は区間ゼロで非表示。展開中の親はスキップ。**従来の期限超過（`endDate < 今日` でバー全体を薄赤）とは独立に併存**する。
- 期限超過・遅延の日付比較は **`normalizeDateStr` で ISO 化してから**行うため、`/` 区切り等の非 ISO 形式でも正しく判定される（§5.1）。

### 8.4 実効日付（依存・コネクタの整合）
依存矢印・コネクタドット・ドラッグプレビューの端点座標は、対象が親（子を持つ）なら**親サマリーバーと同じ表示スパン**（`parentSpanMap`）を、葉なら生値を使う（`effStartDate`/`effEndDate`）。これにより親を折りたたんで子の依存が親へリダイレクトされても、矢印・ドットが親バー端と一致する。

### 8.5 依存矢印（`DependencyArrow.tsx`）
- 端点：起点=`from の実効 end + dayWidth`、終点=`to の実効 start`。
- **終点がマイルストーンのとき**は、終点 X を菱形の左頂点（`dateToX(start) + dayWidth/2 - r`、`r=(rowHeight-14)/2` でボディの菱形と同式）に補正し、矢印が菱形の頂点に接続するようにする。マイルストーンは依存関係の**後続（終点）にのみ**なれる（先行にはなれない＝コネクタドットを出さない、§9.4）。
- スタイル：`bezier`（C 曲線）/`elbow`（L または S 字折れ線）/`straight`。
- 折りたたみ時は `resolveVisibleId` で可視祖先へリダイレクト。可視範囲と交差するもののみ描画。

### 8.6 イナズマライン（`LightningLine`/`calcLightningPoints`）
全タスクの進捗到達点を折れ線で結ぶ。頂点 X は `calcVertexX`（`ganttCalc.ts`）で算出し、バーの遅延赤帯（§8.3）と共有する：
- **親（子を持つ）＝ status に依らず集計進捗の割合 X（`startX+(endX-startX)*progress/100`）**。親はステータスを集計しないため、進捗％を頂点とする（status 分岐より優先。`pending`/マイルストーン/日付なしのスキップ判定のみ先に適用）。
- `wip`=進捗割合の X（`startX+(endX-startX)*progress/100`）。
- `todo`=**開始日が今日より前なら開始 X（左＝遅れを表す）／そうでなければ現在時刻 X（`nowX`）**。
- `done`/`wait`=現在時刻 X（`nowX`）。`pending`/マイルストーン/日付なし=スキップ。
- **親タスクは展開中はスキップ**（子が各自描画）。**折りたたみ親のみ**子集計（実効進捗・実効日付）で 1 頂点を描く。

### 8.7 今日ライン・週末列・クリティカルパス
- 今日ライン：`showTodayLine` で現在時刻の縦線。
- 週末列：`showWeekend` で土日列に淡背景。
- クリティカルパス（`calcCriticalPath`、CPM）：先行関係から ES/EF・LS/LF を計算し総余裕 0 のタスク集合を黄背景＋インディゴ枠で強調。折りたたみ親に子のクリティカルを伝播（`buildCollapsedCriticalParents`）。

### 8.8 行仮想化
`calcVisibleRange(scrollTop, viewportH, rowHeight, rowCount, overscan=10)` で可視範囲のみ DOM/SVG を描画（WBS は上下スペーサ、SVG はスライス分のバー）。全高 1 要素のライン類（イナズマ/今日/週末/マイルストーン）は据え置き。

`scrollTop` は計算前に有効範囲 `[0, max(0, rowCount*rowHeight - viewportH)]` へクランプする。行数が急減（プロジェクト切替・フィルタ・折りたたみ）してもブラウザの自動スクロール縮小では `scroll` イベントが発火せず `scrollTop` state が過大なまま残り得るため、クランプしないと `start > end` となり可視範囲が空＝白画面になる。クランプにより常に末尾までの有効範囲を描画する。

加えて、プロジェクト切替時（`GanttChart` の `projectId` prop 変化）はガント右パネル／WBS ボディの DOM `scrollTop` と `scrollTop` state を 0 に戻し、新しいプロジェクトを先頭から表示する。

### 8.9 リソースビュー（担当者別 工数負荷）

`showResourceView` のとき、ガント下部に担当者×日付の**負荷ヒートマップ**を表示する（`ResourceView.tsx`）。ガント本体と横スクロールを同期し、座標系（`ZOOM_CONFIG[zoomLevel].dayWidth`・`min`・`totalWidth`）を共有する。左固定列に担当者名、右スクロール領域に日付ヘッダーと負荷セルを置く。

**高さのリサイズと縦スクロール**: 担当者が多くてもガント本体を覆わないよう、行表示領域の高さに上限を設ける。上限は**パネル上端の境界線をマウスでドラッグして増減でき**（上で高く＝より多く表示／下で低く）、値は UI 設定 `resourceViewHeight`（px・既定 6 行ぶん）として localStorage に**永続化**する。行が少なければ内容にフィット（空白を作らない）、上限を超える担当者は**縦スクロール**で閲覧する。ヘッダー（タイトル/凡例・日付）は固定し、左の担当者ラベル列と右のセル列の**縦スクロールを同期**（左列に可視スクロールバー、右セル上のホイールも同じ縦位置へ反映）。横スクロールは従来どおりガントと同期。ドラッグ時はガント本体を最低 120px 残すようクランプする。

**負荷の定義（工数ベースの稼働率モデル）**: 各担当者・各稼働日の **稼働率 = 需要 ÷ キャパシティ** を表示する。集計は共有ユーティリティ `calcUtilizationMatrix`（`workloadCalc.ts`）に一本化する。

- **行（担当者）対象**: `assignee` あり・`status !== 'done'`・`startDate`/`endDate` 両方あり・**リーフタスクのみ**（親サマリーは二重計上回避で除外）。これに該当する担当者を昇順表示。0 名ならパネル非表示（`null`）。
- **需要（demand）**: 上記のうち **`estimateMinutes != null`** のタスクについて、予定工数をタスク期間内の**稼働日数で均等配分**し、各稼働日の需要（分）に積算する（複数タスクは合算）。工数未入力は需要 0（計上しない）。期間が全て非稼働日のタスクは配分先が無いためスキップ。
- **キャパシティ／稼働カレンダー**: 1 稼働日あたり `capacityMinutesPerDay`（実効値）。稼働日は `workingDays`（実効値, 既定 月〜金）で判定し、非稼働日は需要 0。実効値＝プロジェクト上書き ?? アプリ既定 ?? ハードコード既定（`duration.ts`、§9.8）。
- **稼働率** = その日の需要(分) ÷ `capacityMinutesPerDay`。

**ズーム整合**: セルが表す期間について、内包稼働日の稼働率の**期間内ピーク（最大値）**をセル値とする（平均は使わない）。

**着色（`utilizationColor`）／バンド**: `〜80% 余裕（淡緑）／80–100% 適正（緑）／100–120% 注意（黄）／>120% 過負荷（赤）`、0%＝透明。パネルヘッダーに凡例を表示。セルには稼働率%を表示。

**サマリ**: 左固定列の各担当者行に、合計予定工数（`HH:MM`）とピーク稼働率（%）を併記する。

**ドリルダウン**: 需要のあるセルに `title` ツールチップを付け、稼働率を決めた**ピーク日**の内訳を列挙する＝「稼働率% ／ 合計需要(`HH:MM`) ÷ 1日キャパ(`HH:MM`)」と、寄与する**各タスクのその日の按分時間**（`タスク名 HH:MM`）。各タスクの按分時間の和＝合計需要＝稼働率の分子になる。集計（`dayTasks[a][d]`）は各タスクの `{ title, minutes }`（按分後の分）を保持する。

> 旧「同時進行タスク数」モデル（`calcWorkloadMatrix`）は工数非依存の暫定実装（FEATURES.md Step 1）。本節の稼働率モデルが正。日付グリッド（ローカル整形）・`workloadBuckets` は両モデルで共有する。

---

## 9. UI/UX 仕様

### 9.1 画面レイアウト
上部 `ProjectTabs` → `Toolbar`（2 段：操作行＋ガント表示設定行、∧/∨ で 2 行目折りたたみ）→ `GanttChart`（左 WBS＋右ガント、垂直スクロール同期、水平スクロールはガント列のみ）→ 下部 `ResourceView`（任意）。

### 9.2 WBS とインライン編集
- 列：#（seq）・タイトル・担当者・進捗・開始日・終了日・期間。`wbsHiddenCols` で表示列を制御、`wbsPanelOpen` で WBS パネル開閉。
- セルクリックで直接編集。**親タスクの日付・進捗は自動計算のため編集不可**（淡色表示・ツールチップ）。**マイルストーン行の終了日も編集不可**（淡色表示・1点のため）。マイルストーンの開始日を編集すると終了日も同じ日付に追従する（モーダル／ガントと同じく `endDate=startDate` を保つ）。
- ツリー：親行に折りたたみトグル（▼/▶）。`depth` でインデント。

### 9.3 ツールバー
- 操作：タスク追加・マイルストーン追加・ハンバーガー（Import 追記/レストア、Export JSON/CSV、**バージョン表示**）。
- フィルタ：ステータス（「DONE/保留以外」=`!done` 含む）・優先度・担当者（部分一致・datalist 補完・クリア）・タスク検索。
  - **担当者フィルタの親子継承**：担当者フィルタは、タスク自身の担当者が一致する場合に加え、**祖先タスクのいずれかが一致する場合もそのタスクを表示する**（自分が担当する親タスク配下の子タスクは、子の担当者に関わらず全て表示）。判定は `parentId` を遡る再帰で、任意の深さの子孫に及ぶ。マイルストーンは従来どおり常に表示。他フィルタ（ステータス／優先度／検索）は各タスク自身の値で AND 判定する（親子継承しない）。
- ガント表示設定：ズーム（日/週/月）、表示期間（3/6/12/24 ヶ月）、イナズマ/週末/クリティカル/担当者ビュー/今日ライン/マイルストーンの各トグル、フォントサイズ・行高さ、ヘッダー段（年/月/週/日）、依存矢印スタイル、マイルストーン色、テーマ。
  - **「マイル」トグル**（ヘッダー段グループ内）は **ヘッダーのマイルストーン表示（◆マーカー行・日付セル強調・列ハイライト帯）のみ** を ON/OFF する（§8.2）。WBS のマイルストーン行・本体の菱形バーは常時表示で、このトグルでは消えない（行のフィルタリングではない）。

### 9.4 操作（ドラッグ等）
- バードラッグ：移動・左右リサイズ（1 日スナップ）。親バーは不可。**マイルストーンも移動・リサイズ不可**（菱形にドラッグ入口を持たせず、クリックでモーダルを開くのみ。`endDate` は常に `startDate` と同値の1点として扱う）。
- 作成ドラッグ：開始日が未設定の葉タスク（非親・非マイルストーン）の行は crosshair で、行背景をドラッグして開始/終了日を作成できる。**クリックの手ぶれによる誤作成を防ぐため、mousedown 位置から `CREATE_DRAG_THRESHOLD_PX`（既定 4px）以上ドラッグして初めて作成対象になる**（閾値未満の mouseup では日付を作らない。閾値を一度超えればその後は通常追従＝スティッキー）。アンカーセル内に収まるドラッグは 1 日タスクを作成する。
- 依存付与：バー hover で右端コネクタドット → ドラッグして別バーへドロップ（自己参照・循環・祖先子孫・日付なしは禁止）。**マイルストーンは後続（終点）にのみ接続可**＝通常タスクのコネクタドットからマイルストーンへドロップできるが、マイルストーン自身はコネクタドットを出さない（先行＝始点にはなれない）。マイルストーンの先行タスクは `MilestoneModal` の「先行タスク」欄でも設定でき、候補は非マイルストーン・循環/祖先子孫を除外する。コネクタドットはバーの移動・リサイズドラッグ中（`dragState` 非 null）は非表示にする（操作の邪魔にならないよう）。コネクタドットの表示可否を `canStartLink`（`hoveredBarId && !linkDragState && !dragState`）として一か所で判定する。
- WBS 行ドラッグ：並び替え・親子変更（depth インジケーター）。Ctrl/Cmd で「コピー」（サブツリー再帰コピー、`tasks/batch` 1 リクエスト、predecessors は内部参照のみ再マップ）。
- 右クリックメニュー：タスク操作・依存解除・文字色/背景色（`titleColor`/`titleBgColor`）など。**マイルストーン行で「文字色」を選ぶと、その色がガント本体の菱形バーとヘッダーのマイルストーン表示（◆マーカー・日付セル強調・列ハイライト帯）に反映される（個別 > 統一, §8.2/§8.3）。リセット（`null`）でツールバーの統一色に戻る。** **一番上は「＋ 子追加」で、ホバーすると「タスク」「マイルストーン」の子メニュー（フライアウト）が開き、対象タスクを親 ID とする子タスク／子マイルストーンを追加できる**（`AddChildMenuItem`。クリックで対応するモーダルを `initialParentId` 付きで開く）。マイルストーンには「＋ 子追加」を出さない（マイルストーンは親になれないため）。親が非マイルストーンであれば子にマイルストーンを持てる（`MILESTONE_CANNOT_BE_PARENT` は親がマイルストーンの場合のみ。親集計は子マイルストーンを除外）。
- 競合解決：同一フィールドの同時編集検知時に自分/相手の値を選択（`ConflictDialog`）。

### 9.5 バージョン表示
ハンバーガーメニュー内に「Frontend v{FRONTEND_VERSION} / Backend v{health.version}」を表示。フロント版は `version.ts`（`package.json` 由来）、バック版は起動時に `/health` から取得（取得失敗時は「—」）。

### 9.6 テーマ
`theme`（auto/light/dark）。CSS 変数（`--th-*`）で配色。auto は OS 設定追従。

### 9.7 プロジェクトのアドレス（URL）
各プロジェクトを固有の URL で直接開ける。ルーターは導入せず History API でフロントのみで実現（バックエンド変更なし。`serve -s`／Vite の SPA フォールバックで `/p/...` は index.html に解決）。`projectUrl.ts` の純関数群と `useProjects` が担う。

- **URL 形式**：`/p/<key>`（`key` は `encodeURIComponent` 済みのプロジェクト名または ID）。トップ `/` は現状維持（localStorage の前回→無ければ先頭。URL は `/` のまま）。
- **URL→プロジェクト解決**（`findProjectByPathKey`、**ID 優先**）：①ID 一致 → ②名前がちょうど 1 件一致 → ③名前が複数一致は先頭（created_at DESC） → ④無ければ null。これにより名前でも ID でも開け、同名衝突は ID で一意に開ける。名前が他プロジェクトの ID と一致した場合は ID 側を開く（ID の一意保証を優先）。
- **プロジェクト→URL 生成**（`projectPath`）：名前がユニークなら `/p/<名前>`、同名が複数あるプロジェクトは `/p/<id>`（正準アドレス）。
- **初期選択**（`resolveInitialProject`）：URL（`findProjectByPathKey`）＞ localStorage 保存 ID ＞ 先頭。URL に key があり解決不能ならトップ挙動にフォールバックし `/` へ `replaceState`。有効な URL（名前/ID どちらでも）はそのまま残す。
- **同期**：プロジェクト切替で `pushState(projectPath)`（localStorage 保存も継続）、戻る/進む（`popstate`）で URL から再解決（push しない）、改名で当該プロジェクトのアドレス表示中なら新しい `projectPath` へ `replaceState`。
- **注意**：名前は一意制約が無いため、改名すると名前 URL は変わり、同名が増えると正準 URL は ID 形式になる。

### 9.8 予定工数の入力書式と実効リソース設定（`duration.ts`）

予定工数（`estimateMinutes`）は **DB・計算は分**、**入力/表示は人間向け**に変換する。境界で `duration.ts` の純関数を通す。

- **入力 → 分（`parseDuration`）**：単位トークン `Nd`/`Nh`/`Nm`/`Nw`（空白区切りの複合 `1d 4h` 可）と `HH:MM`（`7:45`）を受理し分へ正規化。小数（`1.5h`）も可。
  - 換算：`1h=60`、`1m=1`、`1d=capacityMinutesPerDay`（実効値）、`1w=稼働日数/週 × capacityMinutesPerDay`。**入力時点の実効キャパで分に固定**（後でキャパを変えても既存値は再換算しない＝見積もり凍結。MS Project/Jira と同挙動）。
  - 空文字は `null`（未設定）、解釈不能は `null`。
- **分 → 表示（`formatMinutes`）**：`HH:MM`（`465`→`7:45`、`null`→空）。
- **実効リソース設定の解決**：`resolveCapacityMinutes(project値, アプリ既定)` ／ `resolveWorkingDays(...)` = `プロジェクト値 ?? アプリ既定 ?? ハードコード既定`（480／`[1,2,3,4,5]`）。`1d`/`1w` 換算とリソースビュー稼働率はこの実効値を使う。

---

## 10. Import / Export 仕様

- **データ形式バージョン = `1.1`**（エクスポート JSON の `version` フィールド。**情報用メタデータであり、インポート時には検証・利用しない**。下記「設計判断」を参照）。`1.1` で `estimateMinutes`（予定工数＝分）を追加。
- **JSON Export**：`{version:'1.1', exportedAt, project:{id,name}, tasks[]}`。タスクは全フィールド（`estimateMinutes` 含む）をそのまま出力し、インポートは `...t` 展開で取り込む（追加フィールドは自動往復）。
- **CSV Export**：ヘッダ `id,parentId,title,...,estimateMinutes,predecessors`。`id`/`parentId`/`predecessors` は `seq` 番号で出力。`estimateMinutes` は分の整数（未設定は空欄）。カンマ/引用符/改行は CSV エスケープ（`"` 二重化）。
- **後方/前方互換**：`estimateMinutes` 追加は非破壊。旧データ（フィールド無し）は **null** として取り込み、未知フィールドは黙って破棄（寛容な取り込み）。版ガードは行わない（§10.1）。
- **CSV Import**：CSV ファイルは**フロントエンド側で `papaparse` によりパース**し、`seq` 参照を解決してタスク配列へ変換した上で下記 Import API（JSON）を呼ぶ（API は JSON のみ受け付ける）。
- **Import（API）**：`{tasks[], mode}`。`mode='restore'` は既存タスク全削除後に投入、それ以外は追記。全タスクに新 UUID を採番し、`parentId`/`predecessors` を旧→新 ID へリマップ（バッチ外参照は除外）。3 パス（全件 INSERT→親リマップ→依存挿入）で FK 順序問題を回避。完了後 `reload` を broadcast。
- 文字列は許可リストで正規化（status/priority は不正値を既定へ、progress は 0–100 にクランプ）。

### 10.1 設計判断：バージョン互換チェックは導入しない

Import/Export の `version` フィールドは**書き出すだけで、インポート時の互換判定・マイグレーションには使わない**ことを 1.0 時点の方針として決定した（バージョンガード／CSV への版埋め込みは**意図的に不採用**）。

- **現状の挙動**：インポートは version を無視し、既知フィールドを既定値付きでマッピングする「寛容な取り込み」。
  - 同一構造のファイル（過去の `1.1` 形式を含む）は問題なく取り込める。
  - 未知フィールドは黙って破棄され、構造が大きく異なるファイルは「Invalid format」エラーまたはベストエフォート取り込みになる。
- **不採用の理由**：1.0 時点では追加する複雑さに見合わない。CSV にはバージョンを置く自然な場所が無く（先頭コメント行/専用列はいずれも難点あり）、社内利用では寛容な取り込みで許容できる。
- **将来**：フォーマットを非互換に変更する必要が生じた段階で、メジャー番号による互換判定（同一メジャー=互換／上位メジャー=拒否）等を改めて検討する。それまでは `version` は情報表示用にとどめる。

---

## 11. 認証・セキュリティ

- **認証**：`auth` プラグインが `LDAP_ENABLED!=='true'` のとき全リクエストに `req.user={id:'guest'}` を付与（ゲスト固定）。LDAP は将来拡張（フック実装位置のみ用意）。
- **認可**：未実装。projectId を知る全クライアントが全プロジェクトを操作可能（社内 LAN 前提）。
- **入力検証**：Fastify JSON スキーマ（enum/長さ/型）。全 SQL はパラメータ化（SQL インジェクション対策）。
- **XSS**：Markdown は `react-markdown`（生 HTML 不許可・URL サニタイズ既定）。`dangerouslySetInnerHTML`/`eval` 不使用。
- **依存セキュリティ**：`npm audit` クリーン（fastify 5 系・uuid 11 系。未使用の脆弱依存 fast-jwt は不採用）。
- **CORS**：`CORS_ORIGIN`（既定 `*`）＋許可メソッド明示（`plugins/cors.ts` の `corsOptions`、5.1 参照）。本番は具体的オリジンの許可リスト化を推奨。プリフライト（OPTIONS）が PATCH/DELETE を許可することを `cors.test.ts` で回帰検証する（`app.inject()` の CRUD テストはプリフライトを経由しないため、別途プリフライトを明示的に inject する）。
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
- E2E：`e2e/`（Playwright、フロント:3001 → API:4000 の**クロスオリジン**実構成）。プロジェクト/タスク CRUD・モーダル・ガント描画・**ガントバーのドラッグ（日付変更=PATCH）**。実ブラウザ×実サーバのため CORS など結合不具合を最終的に捕捉する（CORS プリフライトは E2E が定期実行されていれば検出できた）。
- 依存ガード：`api/src/__tests__/security.test.ts`（既知脆弱依存の混入防止・fastify/cors/compress/uuid の major 下限）。
- **本番配線テスト**：`api/src/app.ts` の `buildApp()`（cors/compress/auth/全ルート/エラーハンドラを登録）を `app.test.ts` で inject 検証する（`/health` の version 返却、エラーハンドラ形、CORS プリフライトが PATCH/DELETE を許可）。`index.ts` は `buildApp()` + `listen()` のみ。WSサーバ `wsRoom` のブロードキャストは `ws.test.ts` で実ソケット検証。
- カバレッジ計測：フロントは `src/**/*.{ts,tsx}` を対象（コンポーネント/App/version を含む）。provider は **istanbul**（`@vitest/coverage-istanbul`）。理由：`vitest@4` が内部で `vite@8`（rolldown/oxc）を使う一方フロントの dev/build は `vite@5`＋`@vitejs/plugin-react@4`（babel/esbuild）で、この混在下では **v8 provider が一部ファイル（theme/useTheme/version/sort 等）をソースマップ再マップ失敗で計上漏れ**していた。istanbul はトランスフォーム時にコードへ計測を埋め込むため oxc のソースマップに依存せず全実行ファイルを正確に計上する。
- 設計方針：行カバレッジだけでなく、**ブラウザ経由でしか出ない結合（CORS プリフライト等）も明示的にテスト**する（`app.inject()` の CRUD はプリフライトを経由しないため）。

---

## 15. バージョニング方針

- **製品バージョン**：セマンティック。現行リリース = **1.2**。`api`/`frontend` の `package.json` `version` を単一の出典とし、ハンバーガーと `/health` に表示。
- **本設計書のドキュメント版**：`0.2.x`（現行版はヘッダー参照）。設計改訂ごとに版を1つ進める。
- **データ形式版**（Export JSON）：`1.1`。後方互換目的の独立軸（1.1 で予定工数 `estimateMinutes` を追加）。
- **製品のリリース履歴**：リポジトリ直下の `CHANGELOG.md`（[Keep a Changelog] 準拠）に版ごとの変更（追加/変更/修正）を時系列で記録する。本書の改訂履歴（設計の要点・バグ修正は除外）とは役割が異なる。
- 採番ルール（開発手順）は `CLAUDE.md` を参照：**設計変更は本書の該当章を更新**し、改訂履歴には版数と要点のみを残す（バグ修正は履歴に記載しない）。

---

## 16. ツールチェーン更新方針と既知の課題

### 16.1 現状（ビルド/テストの vite 世代不整合）
フロントエンドのツールチェーンに**世代の不整合**がある。

| 用途 | 使用 vite | React 変換 |
|------|-----------|-----------|
| dev / build（`vite`/`vite build`） | `vite@5` | `@vitejs/plugin-react@4`（babel/esbuild） |
| テスト（`vitest@4`） | 内部で `vite@8`（rolldown/**oxc**） | 同上プラグインが噛む |

`vitest@4` が新しい oxc ベースの vite を引く一方、React プラグインは esbuild 前提の旧世代のため、
テスト実行時に「esbuild オプションは oxc を使え」という**警告**が出る。

### 16.2 現在の決定（2026年6月時点）
- **カバレッジは provider=istanbul で正確化済み**（v8 の計上漏れを解消。14章参照）。計測の正確性は確保されている。
- **ツールチェーンの統一は当面見送り**。dev/build を支障なく動かせており、急ぐ必要がないため。
- **oxc/esbuild の警告は非致命の表示**であり、機能・カバレッジ正確性には影響しない。

### 16.3 今後の更新方針（バージョンアップで段階的に統一）
将来のバージョンアップで**新しい側（oxc 系）へ段階的に統一**していく。原則は以下。
1. **関連ツール群をまとめて揃える**：`vite` + `@vitejs/plugin-react-oxc` + `vitest` を1つの世代に。dev/build と test の vite を一本化する。
2. **全依存の一括最新化はしない**：React・fastify・better-sqlite3 等の無関係なメジャー更新を巻き込まない（破壊的変更の同時多発を避ける）。
3. **テストを安全網に段階実施**：各ステップで全テスト（ユニット＋E2E）を回し、緑を確認しながら進める。
4. **newer ≠ safer**：新しい＝安全ではない。CORS 不具合（0.2.80）は **fastify 4→5 のメジャー更新が契機**だった。更新は恩恵とリスクを天秤にかけ、テストで裏取りする。
5. **React プラグインは変換エンジンと対で選ぶ**：esbuild なら `@vitejs/plugin-react`、oxc なら `@vitejs/plugin-react-oxc`。これを外すと 16.1 の警告が出る。

### 16.4 既知の保留課題
- **frontend の esbuild dev 専用脆弱性**：`npm audit` に残る（高/中 各1）。**dev サーバー専用**で本番イメージには非同梱。修正には vite のメジャー更新（破壊的）が必要なため、16.3 の統一に合わせて解消する。
- **`App.tsx` のユニット未テスト**：オーケストレーション層はユニット未カバー（カバレッジ 0%）。現状は E2E（実ブラウザ）で実行カバーしている。必要に応じてスモークテストを追加検討。

---

## 17. 今後の検討事項（品質・UI/UX 改善ロードマップ）

> 以下は**未着手の検討候補**。品質向上と UI/UX 改善を目的とする。優先度の目安を付す（実施時に本書へ反映する）。

### 17.1 自動ゲート（最優先・再発防止）
現状 **CI なし・ESLint/Prettier なし・lint/typecheck スクリプトなし**。CORS 不具合（0.2.80）が
すり抜けた／E2E が定期実行されていなかった／`tsc` のテスト型エラーが放置、はいずれも自動ゲート不在に起因する。
- **CI（GitHub Actions）新設**：push/PR で API・フロントのテスト、`tsc --noEmit`、lint、E2E(Playwright)、`npm audit` を自動実行。
- **ESLint + Prettier 導入**：特に `react-hooks/exhaustive-deps`（stale closure 検出）、`no-floating-promises`（未処理 async 検出）が有効。`lint`/`format`/`typecheck` の npm script を追加。
- **型チェックのゲート化**：`tsc --noEmit` を必須化し、既存のテスト型エラー（約34件）を清掃。
- **カバレッジ閾値**：istanbul で正確化済み（16章/14章）なので最低ラインを設定し、黙って下がるのを防ぐ。

### 17.2 UI/UX 改善
- **アクセシビリティ（a11y）監査＋修正**（高優先）：`axe-core`（Playwright か `vitest`+`jest-axe`）で自動チェックを導入し、キーボード操作（ガント/WBS のフォーカス移動）、ARIA ロール/ラベル、モーダル/メニューのフォーカストラップ、コントラスト比(WCAG) を是正。
- **ビジュアルリグレッションテスト**：Playwright のスクリーンショット比較。描画中心のアプリ（バー/マイルストーン/依存矢印）で意図しない見た目変化を検出。
- **エラー/空/ローディング状態の整備**：現状 `App.tsx`（ロード系 `useEffect`）が失敗を無言で握りつぶしており（`.catch(() => {})`）、読込失敗時にユーザーへ何も表示されない。失敗はトースト/バナーで可視化し、空・ローディング表示を統一する。
- **レスポンシブ／マルチビューポート検証**：Playwright で複数解像度・ブラウザを確認。

### 17.3 開発プロセス（CLAUDE.md への追記候補）
- **Definition of Done の拡張**：「全テスト通過」に加え `tsc` + lint + コンソールエラー0 + a11y チェック通過。
- **エラーハンドリング方針**：無言の `catch(() => {})` を禁止し、ユーザーに必ず通知する。
- **Conventional Commits** の明文化（既にほぼ実践：`feat/fix/docs/test:`）。

### 17.4 クロスプロジェクトのタスク参照（ペンディング）
別プロジェクトのタスク（や親タスク）を**読み取り専用の参照**として現在プロジェクトに取り込み、進捗を確認しつつ**プロジェクトをまたぐ依存関係**（先行/後続）をつなぎたい、という要望。現時点では**保留**（実装しない）。調査メモ:
- `task_deps(predecessor_id, successor_id)` は project 非依存でタスク ID のみを持ち、`attachDeps` は他プロジェクトの予先 ID も `predecessors`/`successors` に含める。create/update に同一プロジェクト限定の予先検証も無い → **DB/API 層は既にクロスプロジェクト依存を保持可能**。
- `GET /tasks/:id` は project 非スコープで任意タスクを返す → 外部タスクの内容（進捗・日付）はフロントから取得可能。
- 未対応: フロントの**参照行（読み取り専用）描画**（現状 `resolveVisibleId` は現在プロジェクト外の予先 ID を描画しない）、外部参照の追加 UI、**進捗のライブ更新**（WS ルームはプロジェクト単位のため、クロスルーム購読/通知の拡張が必要）。
- 想定スコープ案: ①依存ベースの参照（依存が在れば外部タスクを参照行で表示）→ ②ロード時取得（ライブは後段）→ ③両方向（先行/後続）。依存なしの「ウォッチ」専用参照は別テーブルが必要で更に大きい。
- 任意：PR ＋ 自己コードレビュー（`/code-review`）をマージ前に。

### 17.4 着手順の目安
**① CI＋ESLint/Prettier（土台）→ ② a11y 監査＋修正 → ③ ビジュアルリグレッション → ④ エラー可視化**。
①で再発防止の基盤を作り、②③④で UI/UX 品質を直接押し上げる。

### 17.5 単独実行ファイル化（検討・保留）

**現時点の判断: 実施しない（`docker compose up -d` で十分）**

現状の Docker ワンコマンド起動は十分に簡潔であり、自分の開発機・チーム用途では追加の実装コストに見合わない。配布目的（Docker なし環境に渡す）や体感起動速度の改善が必要になった時点で再検討する。

**やるなら必要な変更:**

| 項目 | 内容 |
|------|------|
| アーキテクチャ変更 | API が Frontend の静的ファイルも配信する 1 サーバー構成にする。`:3000`（serve）を廃止し、`:4000`（Fastify）がすべてを担う |
| `@fastify/static` 追加 | `api/src/app.ts` で `frontend/dist/` を静的配信。`/api/v1/*` 以外は `index.html` にフォールバック（SPA ルーティング） |
| ビルドスクリプト | `vite build` → `tsc` → `pkg` の順に実行するスクリプトを追加 |
| `pkg` によるバンドル | `api/package.json` に pkg 設定を追加し `frontend/dist/` を assets として埋め込む。`better-sqlite3` のネイティブアドオン（`.node`）は pkg が初回実行時に temp ディレクトリへ自動展開するためユーザー操作不要 |
| 速度改善 | Docker コンテナ起動のオーバーヘッドがなくなり、起動は 2〜5 秒 → 0.1〜0.5 秒程度に短縮。実行速度（API 処理・描画）はどちらも Node.js で変わらない |
| クロスコンパイル | macOS / Linux / Windows それぞれ向けに `pkg --target` でコンパイルが必要 |

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
| 0.2.79 | 2026/6 | Import/Export のバージョン互換チェックは導入しないと決定（`version` は情報用メタデータに留め、インポートは寛容な取り込みを継続）。10.1 節に設計判断として明文化 |
| 0.2.80 | 2026/6 | CORS 許可メソッドを明示（`GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS`）。@fastify/cors の既定 `GET,HEAD,POST` ではクロスオリジンの PATCH/DELETE がプリフライトで弾かれていた（fastify5/cors11 更新で顕在化）。設定を `plugins/cors.ts` に集約し、プリフライト回帰テスト `cors.test.ts` を追加 |
| 0.2.81 | 2026/6 | テスト網羅性の是正。本番配線を `app.ts` の `buildApp()` に抽出し `index.ts` を薄くして、本番と同じ配線で `/health`(version)・エラーハンドラ・CORS を検証（`app.test.ts`）。WSサーバ `wsRoom` のブロードキャストを `ws.test.ts` で検証。フロントは `useTheme`/`version`/`api.fetchHealth`/`batchCreateTasks`/Toolbar バージョン表示などの欠落ユニットを補完し、カバレッジ計測対象を `src/**/*.{ts,tsx}`（components/App 含む）へ拡大 |
| 0.2.82 | 2026/6 | E2E 拡充。`e2e/tests/gantt-drag.spec.ts` を追加し、ガントバーのドラッグ（日付変更）→ PATCH が成功して DB の日付が更新されることを実ブラウザ（クロスオリジン）で検証。CORS プリフライト不具合（旧 0.2.80）のような結合不具合を E2E で最終捕捉できるようにした |
| 0.2.83 | 2026/6 | カバレッジ計測の信頼性回復。フロントのカバレッジ provider を v8→**istanbul** に変更。`vitest@4`（内部 vite8/oxc）と dev/build の `vite5`＋`plugin-react@4`(babel/esbuild) の混在で v8 が一部ファイルを計上漏れしていた問題を解消（theme/useTheme/version/sort 等が正しく 100% で計上されることを確認）。`coverage/` を `.gitignore` 化（生成物の誤コミット防止）。oxc/esbuild の警告自体は dev/test の vite バージョン差に由来する非致命の表示（別途、ツールチェーン統一で解消可能）。 |
| 0.2.84 | 2026/6 | ツールチェーン更新方針を明文化（新セクション16）。vite/vitest/plugin-react の世代不整合の現状、現時点の決定（istanbul で計測は正確化済み・統一は当面見送り・警告は非致命）、今後の更新方針（バージョンアップで段階的に新しい側へ統一／グループ単位／一括最新化はしない／テストを安全網／newer≠safer）、既知の保留課題（esbuild dev脆弱性・App.tsx ユニット未テスト）を記録。コード変更なし。 |
| 0.2.85 | 2026/6 | 今後の検討事項を明文化（新セクション17）。品質・UI/UX 改善ロードマップとして、自動ゲート（CI/ESLint/Prettier/typecheck/カバレッジ閾値）、UI/UX（a11y 監査・ビジュアルリグレッション・エラー可視化・レスポンシブ）、開発プロセス（DoD 拡張・無言 catch 禁止・PR/レビュー）を未着手の検討候補として記録。コード変更なし。 |
| 0.2.86 | 2026/6 | 進捗遅延の可視化を追加。進捗到達点（イナズマ線頂点）が現在時刻より左＝遅れのとき、バーの `[頂点, 今]` 区間を赤帯で強調（§8.3）。頂点計算を `calcVertexX` に共通化し、イナズマ線とバーで一致。todo の頂点ルールを更新し、開始日が過去の未着手タスクは頂点を開始位置（左）に置いて遅れを表すよう変更（§8.6）。既存の期限超過（全体薄赤）とは独立に併存。 |
| 0.2.87 | 2026/6 | 日付は ISO `YYYY-MM-DD` で保持・比較する方針を明文化（§5.1）。インポート時に `normalizeDateStr` で ISO 化し、期限超過・遅延・親スパン集計の比較も正規化前提にすることで、`/` 区切り等の非 ISO 形式でも赤（超過/遅延）が正しく判定されるようにした。 |
| 0.2.88 | 2026/6 | 担当者フィルタに親子継承を導入（§9.3）。担当者フィルタの判定を「自身の担当者が一致」から「自身または祖先のいずれかの担当者が一致」へ拡張し、自分が担当する親タスク配下の子タスクを担当に関わらず全て表示するようにした（`parentId` を遡る再帰・任意の深さ・循環ガードあり）。マイルストーンは常表示、他フィルタは各タスク自身の値で AND 判定（非継承）。 |
| 0.2.89 | 2026/6 | 親タスクのイナズマ線頂点（および §8.3 遅延赤帯の起点）を集計進捗の％位置に統一（§8.6）。親はステータスを集計しないため、従来は親の既定 status `todo`＋開始日超過の未着手ルールに落ちて頂点が開始 X（左端）に固定されていた。`calcVertexX` に「親か」を渡し、親は status 分岐より優先して進捗割合 X（`startX+(endX-startX)*progress/100`）を使うよう変更。葉の未着手（todo＋開始日超過）は従来どおり開始 X。 |
| 0.2.92 | 2026/6 | 右クリックメニューの一番上「＋ 子タスクを追加」を「＋ 子追加」のフライアウト子メニュー化（§9.4）。ホバーで「タスク」「マイルストーン」を表示し、対象タスクを親とする子タスク／子マイルストーンを追加できるようにした（`AddChildMenuItem`、`MilestoneModal` に `initialParentId` を導入）。マイルストーンには「＋ 子追加」を出さない既存方針は維持。 |
| 0.2.93 | 2026/6 | 右クリック子メニューの文言調整（§9.4）。トリガを「＋ 追加」→「＋ 子追加」、子項目を「子タスク／子マイルストーン」→「タスク／マイルストーン」にして収まりを改善（挙動は変更なし）。 |
| 0.2.91 | 2026/6 | 「マイル」トグル（`showMilestones`）の意味を「ヘッダーのマイルストーン表示」に限定（§8.2・§9.3）。従来は `sorted` の行フィルタとして働き OFF で WBS 行・本体の菱形まで消えていたが、行フィルタを撤去してマイルストーン行・菱形は常時表示にし、トグルは `milestoneItems`（◆マーカー行・日付セル強調・全高列ハイライト帯）のみをゲートするよう変更。ボタンは「ヘッダー」グループに属するため挙動をヘッダー表示の ON/OFF に合わせた。 |
| 0.2.90 | 2026/6 | マイルストーンを依存関係の**後続（終点）**にできるようにした（§9.4・§8.5）。ドラッグ・ツー・リンクの禁止リストから「マイルストーン」を外し、通常タスクのコネクタドットからマイルストーンへドロップして先行→マイルストーンの矢印を張れるようにした（マイルストーン自身はコネクタドットを出さず先行＝始点にはなれない方針は維持）。依存矢印の終点がマイルストーンのときは菱形の左頂点に接続するよう端点 X を補正。`MilestoneModal` の「先行タスク」候補に非マイルストーン・循環/祖先子孫の除外ガードを追加。 |
| 0.2.94 | 2026/6 | 行仮想化の白画面対策（§8.8）。`calcVisibleRange` で `scrollTop` を有効範囲にクランプし、行数急減（プロジェクト切替/フィルタ/折りたたみ）後に `scrollTop` state が過大なまま残っても可視範囲が空にならないようにした。加えてプロジェクト切替（`GanttChart` の `projectId` 変化）で右パネル/WBS の DOM `scrollTop` と state を 0 にリセットし先頭表示にする。 |
| 0.2.95 | 2026/6 | 作成ドラッグにドラッグ閾値を導入（§9.4）。日付未設定タスクの作成ドラッグが 1px の手ぶれでも日付を確定し「クリックで作成される」ように見えていたため、`CREATE_DRAG_THRESHOLD_PX`（既定 4px）以上ドラッグして初めて作成対象になるようにした（閾値未満はプレビュー非生成＝非作成、一度超えればスティッキー）。move/resize/リンクドラッグは変更なし。 |
| 0.2.96 | 2026/6 | プロジェクトごとのアドレス（URL）を追加（§9.7）。`/p/<名前またはID>` で各プロジェクトを直接開ける（History API・フロントのみ・バックエンド変更なし）。解決は ID 優先（ID→名前1件→名前先頭→null）で名前でも ID でも開け、同名衝突は ID で一意化。正準アドレスは名前ユニーク時 `/p/<名前>`・同名複数時 `/p/<id>`。切替で `pushState`、戻る/進むで `popstate` 再解決、改名で `replaceState` 追従。トップ `/` は現状維持。 |
| 0.2.97 | 2026/6 | 製品バージョンを **1.1.0** に更新（ヘッダー・ステータス・構成図・§15）。製品リリース履歴を `CHANGELOG.md`（リポジトリ直下・Keep a Changelog 準拠）に分離し §15 から参照。クロスプロジェクトのタスク参照機能はペンディングとして §17.4 に調査メモを記録（実装なし）。 |
| 0.2.98 | 2026/6 | ヘッダーのマイルストーン強調（背景色）対象を日（day）行・曜日（dow）行のセルに限定（§8.2）。従来は行レベルを問わずセル左端 X の一致だけで判定していたため、マイルストーンが週頭・月初・年初に重なると週/月/年セル全体（幅いっぱい）まで色づいていた。判定を `row.level==='day'\|\|'dow'` でゲートし、日付セルのみ強調するよう変更（◆マーカー行・列ハイライト帯は変更なし）。 |
| 0.2.99 | 2026/6 | マイルストーン＝1点・不動を仕様の正に統一（§8.3・§9.4・§9.2）。ガントの菱形に残っていた移動ドラッグ入口（透明クリック矩形に覆われ実 UI では発火しないデッドコード）と、ドラッグ終了時の `endDate=startDate` 同期分岐を撤去し、マイルストーンは移動・リサイズ不可（クリックでモーダルのみ）に明示。WBS でもマイルストーン行の終了日を編集不可（淡色）にし、開始日編集時に終了日を同値へ追従させて常に1点を保つようにした。 |
| 0.2.100 | 2026/6 | 製品バージョンを **1.1.1** に更新（ヘッダー・ステータス・構成図・§15）。0.2.97 で設計書・CHANGELOG を 1.1.0 に更新した際に `api`/`frontend` の `package.json`（`/health`・ハンバーガー表示の出典）のバンプが漏れていたため、これを 1.1.1 に揃えて解消。1.1.0 以降のマイルストーン関連の挙動修正（§8.2 ヘッダー強調のセル限定・§8.3 1点固定の徹底）を製品リリースとして `CHANGELOG.md` の `[1.1.1]` に記録。 |
| 0.2.101 | 2026/6 | リソースビュー（担当者別負荷）を仕様の正として明文化（新 §8.9）。負荷を「同時進行タスク数」モデルに統一し、集計を共有 `calcWorkloadMatrix` に一本化（対象＝`assignee`あり・`done`除外・`startDate`/`endDate`両方あり）。土日は負荷非加算（キャパ0、淡背景は表示として残す）。ズーム時はセル期間内の同時進行数の**ピーク（最大）**で集計（平均不使用）。色凡例の表示とセル `title` への寄与タスク列挙を規定。工数ベースの稼働率モデルは `FEATURES.md` Step 2 として別途。 |
| 0.2.102 | 2026/6 | 予定工数フィールド `estimateMinutes`（分単位の整数, null=未設定）をタスクに追加（§4.1・§4.2・§5.3）。SQLite 列 `estimate_minutes`（009 追加）、API ボディ（`number\|null`・負値不可）、Import/Export（データ形式 1.1・CSV 列追加・JSON は `...t` 展開で自動往復・旧データは null・版ガードなし）に反映。FEATURES.md Step 2 の基盤（工数ベース稼働率モデル）。 |
| 0.2.103 | 2026/6 | アプリ既定のリソース設定 `app_settings`（key-value, 010 追加）と API（`GET`/`PUT /api/v1/settings`）を追加（§4.2・§5.2・§5.6）。`capacityMinutesPerDay`（既定480=8:00）・`workingDays`（既定 月〜金=`[1,2,3,4,5]`）を全ユーザー共有で保持。リソースビュー稼働率モデルの土台。プロジェクト個別上書き（継承）は後続。 |
| 0.2.104 | 2026/6 | リソース設定のプロジェクト個別上書き（継承）を追加（§4.1・§4.2・§5.2・§5.6）。`projects` に nullable 列 `capacity_minutes_per_day`／`working_days`（011 追加, `null`=アプリ既定を継承）を追加し、`PATCH /api/v1/projects/:id` で更新可能に。実効値＝プロジェクト値 ?? アプリ既定 ?? ハードコード既定。 |
| 0.2.105 | 2026/6 | 予定工数の入力書式と実効リソース設定の解決を `duration.ts` として明文化（§7.3・§9.8）。入力は単位トークン `Nd`/`Nh`/`Nm`/`Nw`＋`HH:MM`→分（`1d`=実効キャパ・`1w`=稼働日数×キャパ、入力時点で固定）、表示は `HH:MM`。実効値=プロジェクト値 ?? アプリ既定 ?? ハードコード既定。 |
| 0.2.106 | 2026/6 | フロントのリソース設定取得基盤と TaskModal 予定工数入力を追加（§7.1・§7.2）。非永続ストア `settingsStore` を起動時に `GET /settings` で満たし（失敗時ハードコード既定）、`TaskModal` に予定工数欄（単位トークン/`HH:MM` 入力・`?` 書式ヘルプ・保存時 `duration.parseDuration` で分へ・表示は `formatMinutes`）を追加。実効キャパは `duration.ts` の解決ヘルパで算出。 |
| 0.2.107 | 2026/6 | リソースビューを工数ベースの稼働率モデルへ刷新（§8.9）。`calcUtilizationMatrix` を追加し、予定工数を稼働日へ均等配分した日次需要 ÷ 実効キャパで稼働率を算出（リーフのみ・工数未入力は需要0・稼働日は実効 `workingDays`）。バンド着色（〜80/100/120%）・%表示・担当者サマリ（合計工数/ピーク%）・寄与タスク tooltip。ズームはピーク。旧 `calcWorkloadMatrix`（同時進行数）は暫定として残置。 |
| 0.2.108 | 2026/6 | リソース設定を UI から編集できるよう `ResourceSettingsModal` を追加（§7.2）。アプリ既定はハンバーガー「リソース設定」→ `PUT /settings`、プロジェクト上書きは `ProjectTabs` 右クリック「リソース設定」→ `PATCH /projects/:id`（「アプリ既定を継承」トグルで `null` 送信＝継承）。キャパは `HH:MM` 入力、稼働日はチェックボックス。 |
| 0.2.109 | 2026/6 | リソースビューの行表示領域に高さ上限（`MAX_VISIBLE_ROWS` 行）と縦スクロールを追加（§8.9）。担当者が多くてもガント本体を覆わない。ヘッダー固定・左右列の縦スクロール同期（左に可視バー、右セル上のホイールも反映）。横はガント同期のまま。 |
| 0.2.110 | 2026/6 | リソースビューの高さを**境界線ドラッグでリサイズ可能**に（§8.9）。固定上限（6行）からユーザー調整値へ。UI 設定 `resourceViewHeight`（px）を追加し localStorage に永続化。行が少なければ内容にフィット、超過は縦スクロール。ドラッグはガント本体を最低120px残すようクランプ。 |
| 0.2.111 | 2026/6 | リソースビューのセル tooltip に稼働率の**内訳**を表示（§8.9）。ピーク日の「稼働率% ／ 合計需要 ÷ 1日キャパ」＋各タスクのその日の按分時間を列挙。`calcUtilizationMatrix.dayTasks` をタスク名のみ→`{ title, minutes }`（按分後の分）保持に変更。 |
| 0.2.112 | 2026/6 | リソースビューのパネル見出しを「担当者別負荷」→「**担当者別 工数負荷**」に改称し、予定工数（タスクの工数設定）とのリンクを明確化（§8.9 見出し・§7.2）。§7.2 の説明も「同時進行タスク数モデル」→「工数稼働率ヒートマップ（予定工数ベース）」へ実態反映。 |
| 0.2.113 | 2026/6 | 製品バージョンを **1.2.0** に更新（ヘッダー・ステータス・構成図・§15）。リソースビュー工数化（予定工数 `estimateMinutes`・工数稼働率モデル・リソース設定の継承・高さリサイズ・内訳tooltip）一連を製品リリースとして `CHANGELOG.md` の `[1.2.0]` に記録。§15 のデータ形式版も 1.1 に同期。 |
| 0.2.114 | 2026/6 | マイルストーンの色を個別テキスト色 `titleColor` 連動に変更（§8.2・§8.3・§9.4）。従来は統一色 `milestoneHighlightColor` のみで描いていたヘッダーの日付セル強調・◆マーカー行・列ハイライト帯・本体の菱形バーを、WBS 右クリックの「文字色」（`task.titleColor`）を最優先・未設定時のみ統一色にフォールバックする方式（統一よりも個別を優先）に統一。色解決を `milestoneColorOf(titleColor, milestoneHighlightColor)`（`utils/taskColors.ts`）へ一本化し、`assignMilestoneLanes` をジェネリック化して per-item の色をヘッダー各要素へ持ち回す。期限超過/クリティカルの状態色上書きは従来どおり維持。 |
| 0.2.115 | 2026/6 | マイルストーンヘッダーの多段（レーン）を**描画範囲内に見えるものだけ**で構成するよう変更（§8.2）。従来は開始日変更・表示期間で `x` が描画範囲外（左に見切れ等）になったマイルストーンもレーン割当に残り、見えないのに多段の高さ（`milestoneHeaderH`）が確保され空レーンが残っていた。`assignMilestoneLanes` 前に `isMilestoneXVisible(x, dayWidth, totalWidth)`（セル `[x,x+dayWidth]` が `[0,totalWidth)` と重なるか）で範囲外を除外し、見えなくなった分だけ多段を減らすようにした。 |
| 0.2.116 | 2026/6 | マイルストーンヘッダーの多段レーン割当を **x 昇順の first-fit** に明確化（§8.2）。`assignMilestoneLanes` は入力順のまま詰めており、WBS 並び（x 非昇順）で渡されると重なっていなくても不要に段が増えていた。関数内で x 昇順にソートしてから詰めるようにし、同時に横で重なる本数ぶんだけの最小段数（隙間なく上に詰めるパズル詰め）になるよう統一。 |
| 0.2.117 | 2026/6 | 製品バージョンを **1.2.1** に更新（ヘッダー・ステータス・構成図）。マイルストーン改善（色を個別 `titleColor` 連動・ヘッダー多段を可視範囲のみ構成・レーン割当を x 昇順 first-fit）一連を製品リリースとして `CHANGELOG.md` の `[1.2.1]` に記録。 |
| 0.2.118 | 2026/6 | 単独実行ファイル化の検討結果を §17.5 に記録（現時点は Docker ワンコマンドで十分として保留）。やる場合の必要作業（`@fastify/static` 追加・`pkg` バンドル・ビルドスクリプト・クロスコンパイル）も記載。 |
| 0.2.119 | 2026/6 | バーのドラッグ中はコネクタドットを非表示にした（§9.4）。`canStartLink`（`hoveredBarId && !linkDragState && !dragState`）として表示可否を一か所で判定するよう整理。 |
