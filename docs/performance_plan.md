# TreeGantt 1000件パフォーマンス改善プラン

| 項目 | 内容 |
|------|------|
| 作成日 | 2026年6月12日 |
| 調査時点の設計書バージョン | 2.58 |
| 目標 | タスク1000件でも UI/UX が重くならないこと |
| 進め方 | 各ステップを CLAUDE.md の1サイクル（設計書更新→docsコミット→失敗テスト→実装→全テスト通過→実装コミット）で完結させる |

---

## 1. 目的と背景

別環境でタスク件数が多いと UI が重くなる問題が報告された。1000件規模を想定してフロントエンド・バックエンド双方を調査し、ボトルネックを特定した。本文書はその調査結果と、段階的な改善ロードマップ（9ステップ）を記録する「親台帳」である。

- 各ステップの実装時に `docs/treegantt_design.md` の変更履歴へ対応バージョン（v2.59〜）を1行ずつ追記する。
- ステップ完了時に本文書の「状態」欄を `未着手` → `✅完了（vX.XX）` に更新する。

---

## 2. ボトルネック調査結果（2026-06-12 時点）

### 2.1 正しさの問題（最優先）

| 箇所 | 問題 |
|------|------|
| `frontend/src/App.tsx:41,67` + `api/src/services/taskService.ts:122` | フロントが limit 指定なしでタスク取得し、API デフォルト `limit=500` により **1000件中500件しか表示されない**（エラーなしのサイレント切り捨て） |

### 2.2 フロントエンド

| 箇所 | 問題 | 規模感（1000件時） |
|------|------|------|
| `frontend/src/components/Gantt/GanttChart.tsx` 全体 | **useMemo が0個**。ホバー（`hoveredBarId`）・ドラッグ等の再レンダリングごとに全派生計算が再実行 | 毎フレーム全再計算 |
| `GanttChart.tsx:268` + `utils/taskTree.ts:93` | progressMap 構築で全タスクに `calcEffectiveProgress` を呼び、内部の `allTasks.filter(t => t.parentId === taskId)` が線形探索 → **O(N²)** | 約100万回演算/フレーム |
| `GanttChart.tsx:269` (`utils/ganttCalc.ts` の `calcParentSpanMap`) | 親ごとにサブツリー全体を再走査 → 実質 O(N²) | 同上 |
| `GanttChart.tsx:1030-1112` | 縞背景 rect・依存矢印も毎レンダリング全件生成 | — |
| 仮想化なし | 全行を一括レンダリング。WBS 左パネル DOM + 右ペイン SVG | 合計 **10,000〜16,000 要素** |
| `GanttBar.tsx` / `GanttLeftRow.tsx` | React.memo なし + 行ごとのインラインアロー関数 props | 1件更新で全1000行再レンダリング |
| `frontend/src/hooks/useWebSocket.ts:27` | WS 1メッセージごとに `setTasks` で配列全置換 | N件連続更新で N 回の全体再レンダリング |

### 2.3 バックエンド

| 箇所 | 問題 | 規模感（1000件時） |
|------|------|------|
| `api/src/services/taskService.ts:282-302` `deleteTaskSubtree` | 子孫収集＋削除を1件ずつループ実行 | 約2000クエリ |
| `api/src/services/taskService.ts:204-211` `insertPredecessors` | 先行タスクごとに存在チェック＋INSERT のループ内クエリ | 先行数×2クエリ |
| `api/src/services/taskService.ts:260-275` `getAncestorTasks` | 親辿りで `getTask`（依存取得2クエリ付き）をループ呼び出し | 深さ×2クエリ |
| `api/src/routes/tasks.ts:192-197` | サブツリー削除時に1件ずつ WS 通知 | N件削除 = N メッセージ |
| `api/src/index.ts` | gzip 圧縮なし | 1000件 JSON 約300〜500KB を毎回生送信 |

---

## 3. 改善ステップ（9ステップ）

実施順序の方針: 「正しさ＆計測基盤 → 純関数 O(N) 化 → memo 化 → React.memo → WS 差分 → 仮想化」。リスクの高い仮想化は、memo 化済みの安定した土台の上で最後に行う。バックエンドの Step 7〜9 はフロント側と独立しており、順序を入れ替えても良い。

### Step 1（v2.59）: 全件ページング取得 + 計測基盤 — 状態: ✅完了（v2.59）

- **方式判断**: `?limit=10000` のような固定値の明示は採用しない。固定値では件数がその値を超えた時点で再びサイレント切り捨てが起きるため。API の `listTasks` は既に `{ tasks, total }` と総件数を返している（`taskService.ts:98`）ので、これを利用したページングループで件数に依存しない全件取得を行う。
- **内容**:
  - `frontend/src/utils/api.ts` に `fetchAllTasks(projectId)` を新設: `limit=1000` で1ページ目を取得 → レスポンスの `total` と比較し、足りなければ `offset` を進めて続きを取得、全件揃うまで繰り返して結合した配列を返す。API 側のデフォルト limit=500 は変更しない（既存 API テスト無影響）
  - `App.tsx` の2箇所のタスク取得を `fetchAllTasks` に置き換え
  - シードスクリプト `api/scripts/seed.ts` 新規作成（`--count=1000` で開発 DB に投入。10フェーズ×(親1+サブ親10×葉9)≈1000件、依存15%、マイルストーン10件、担当者8名、日付は今日±90日）
  - テスト用決定的ジェネレータ `frontend/src/__tests__/fixtures/genLargeTasks.ts`（以降の perf 系テストで共用）
- **変更ファイル**: `frontend/src/utils/api.ts` / `frontend/src/App.tsx` / `api/scripts/seed.ts`（新規）/ `frontend/src/__tests__/fixtures/genLargeTasks.ts`（新規）
- **テスト**: `fetchAllTasks` のページングテスト（fetch モックで total=2500 のとき3リクエストで全件結合・順序保持、total≦1000 のとき1リクエストで完了、途中ページの欠落なし）、ジェネレータの決定性・親子整合性
- **期待効果**: 1000件が実際に表示される（正しさ）。**将来件数が増えても切り捨てが起きない**。以降の計測の再現性確保
- **リスク**: 極小

### Step 2（v2.60）: childrenMap 導入で純関数を O(N²)→O(N) 化 — 状態: 未着手

- **内容**:
  - `taskTree.ts` に `buildChildrenMap(tasks)` と `calcAllEffectiveProgress(tasks, childrenMap?)` を追加（post-order DFS 1パス＋結果 Map をメモとして使用。循環は訪問中セットで検出し 0 を返す＝既存仕様維持）
  - 既存 `calcEffectiveProgress` は**シグネチャ不変**のまま内部を childrenMap 利用に書き換え（既存テスト無修正で通過）
  - `ganttCalc.ts` の `calcParentSpanMap` も**シグネチャ不変**で内部を post-order 1パスに書き換え（葉判定・マイルストーン除外・循環安全の既存仕様を維持）
- **変更ファイル**: `frontend/src/utils/taskTree.ts` / `frontend/src/utils/ganttCalc.ts`
- **テスト**: 新規 `frontend/src/__tests__/perfTaskTree.test.ts` — 1000件で新旧関数の同値性、深いチェーン・循環エッジ、補助の時間 budget（1000件で <200ms、CI 揺らぎ余裕込み）
- **期待効果**: 進捗計算 約100万回演算 → 約2000回。レンダリングごとの計算コストの最大要因を除去
- **リスク**: 低（純関数・同値性テストで担保）

### Step 3（v2.61）: GanttChart の useMemo 化 — 状態: 未着手

- **内容**: `GanttChart.tsx` の派生計算 約15箇所を useMemo 化。主な対象と依存配列:
  - `sorted`（filterTasks）← `[tasks, filterStatus, filterAssignee, filterPriority, filterSearch, showMilestones]`
  - `withAncestors / roots / childCount / flatRows` ← `[sorted, tasks]` / `[roots, collapsed]`
  - `childrenMap`（新設）← `[sorted]`
  - `range(min,max) / totalWidth / headerRows / weekendXs / milestoneItems`
  - `progressMap` → `calcAllEffectiveProgress(sorted, childrenMap)` に置換 ← `[sorted, childrenMap]`
  - `parentSpanMap / lightningPoints / criticalSet / 依存矢印 JSX 配列`
  - ※ `range.min` の Date 同一性が Step 4 の React.memo の前提になる点に注意
- **変更ファイル**: `frontend/src/components/Gantt/GanttChart.tsx`
- **テスト**: 新規 `frontend/src/__tests__/ganttPerf.test.tsx` — `calcParentSpanMap` / `calcCriticalPath` を spy 化し、svg への mousemove（ホバー再レンダリング）で**呼び出し回数が増えない**ことをアサート
- **期待効果**: ホバー・ドラッグ・メニュー操作中の再計算ゼロ化。インタラクション応答の体感改善が最大
- **リスク**: 中（依存配列漏れ → 既存のレンダリング系テスト一式が回帰検知網）

### Step 4（v2.62）: GanttBar / GanttLeftRow の React.memo 化 — 状態: 未着手

- **内容**:
  - 両コンポーネントを `React.memo` でラップ
  - props 安定化: 行ごとのインラインアロー関数を廃止し、`(e, id)` / `(task)` 形式の**共有 useCallback** に統一（`onClick`、`onToggleCollapse`、`onRowContextMenu` 等のシグネチャ変更を含む）
  - 同サイクルで clipPath id 重複（`clip-${task.id}` が親バーと子バーで衝突し得る）を `clip-bar-` / `clip-parent-` に分離
- **変更ファイル**: `frontend/src/components/Gantt/GanttBar.tsx` / `GanttLeftRow.tsx` / `GanttChart.tsx`（必要に応じ `App.tsx` のコールバックも useCallback 化）
- **テスト**: 新規 `frontend/src/__tests__/ganttRenderCount.test.tsx` — 1件だけ progress 更新したとき再レンダーされた行数が「更新行＋祖先」以下であることをアサート。既存 `ganttBar.test.tsx` / `ganttLeftRow.test.tsx` はシグネチャ追随
- **期待効果**: 1タスク更新時の再レンダー 1000行 → 数行。WS 受信時・楽観的更新時のカクつき解消
- **リスク**: 中（イベント系既存テストが検知網）

### Step 5（v2.63）: zustand 差分適用アクション — 状態: 未着手

- **内容**: `taskStore.ts` に `upsertTask(task)` / `removeTasks(ids)`（依存クリーンアップ含む）/ `applyOrders(orders)` を追加（`setTasks` は温存）。`useWebSocket.ts` の `applyMessage` と `useTasks.ts` の楽観的更新を同アクションへ委譲し一元化
- **変更ファイル**: `frontend/src/store/taskStore.ts` / `frontend/src/hooks/useWebSocket.ts` / `frontend/src/hooks/useTasks.ts`
- **テスト**: `taskStore.test.ts` に各アクション、`useWebSocket.test.ts` に連続メッセージ受信ケースを追加
- **期待効果**: 中（主に保守性と Step 8 の受け皿。連続受信時のスナップショット競合解消）
- **リスク**: 低

### Step 6（v2.64）: 行仮想化（自前スクロール範囲スライス） — 状態: 未着手

- **方式判断**: **react-window は不採用**。右ペインが1枚の SVG 内に絶対 Y 座標で行を配置する構造であり、左 WBS＋右 SVG の2ペイン手動同期スクロール・行 D&D・QuickAddRow と適合しないため。両ペインを同一の `[startIdx, endIdx)` ウィンドウでスライスする自前方式とする（依存追加ゼロ）。
- **内容**:
  - 純関数 `calcVisibleRange(scrollTop, viewportH, rowHeight, rowCount, overscan=10)` を新規 `frontend/src/utils/virtualRange.ts` に作成
  - `scrollTop` を rAF スロットルで state 化、viewport 高さは ResizeObserver + フォールバック 800px（jsdom 対策。既存テストのタスク数は全行可視のままで無影響）
  - 左パネル: 上下スペーサ div + `flatRows.slice(start, end)`（D&D は絶対 idx のまま）
  - SVG: 縞背景 rect と GanttBar をスライス分のみ描画（SVG 全高は維持＝スクロールバー・座標計算は無変更）。依存矢印は可視範囲と交差するもののみ。イナズマライン・今日ライン・週末列は全高1要素なので据え置き
- **変更ファイル**: `frontend/src/components/Gantt/GanttChart.tsx` / `frontend/src/utils/virtualRange.ts`（新規）
- **テスト**: 新規 `frontend/src/__tests__/ganttVirtualization.test.tsx` — `calcVisibleRange` 境界テスト、1000件 render で WBS 行 DOM 数・SVG バー数が <80 をアサート、スクロールでウィンドウ移動・スペーサ高さ整合
- **期待効果**: **最大**。DOM+SVG 要素 10,000〜16,000 → 約500〜800。初回マウント・スクロール・全再レンダーが一定コスト化
- **リスク**: 高（D&D・スクロール同期・折りたたみとの相互作用）→ 最後に実施し、既存テスト群＋シードデータでの手動確認で担保

### Step 7（v2.65）: バックエンド DB バッチ化 — 状態: 未着手

- **内容**:
  - `deleteTaskSubtree`: 子孫収集を `WITH RECURSIVE` 1クエリ化、削除を `DELETE FROM tasks WHERE id IN (...)` の500件チャンクに（トランザクション・戻り値は不変）
  - `insertPredecessors`: `INSERT OR IGNORE ... SELECT id, ? FROM tasks WHERE id IN (...)` の1文化（存在しない ID をスキップする既存仕様を保持）
  - `getAncestorTasks`: `WITH RECURSIVE` で祖先チェーンを1クエリ取得
  - `reorderTasks` は prepared 文＋単一トランザクション済みで better-sqlite3 では十分高速なため**現状維持**（問題化した場合の代替案: `json_each` を使った単一 UPDATE）
- **変更ファイル**: `api/src/services/taskService.ts`
- **テスト**: `api/src/__tests__/taskService.test.ts` 追補 — 1000子孫ツリー削除の正しさ（削除 ID 一覧・FK 残骸なし・他プロジェクト無影響）、依存一括挿入の同値
- **期待効果**: 1000件サブツリー削除 約2000クエリ → 約5クエリ
- **リスク**: 低

### Step 8（v2.66）: 削除 WS 通知の一括化 — 状態: 未着手

- **内容**: `routes/tasks.ts` の削除通知を `{ type: 'tasks_deleted', projectId, ids }` 1通に変更（single 削除も `ids:[id]` に統一）。フロント `applyMessage` に `tasks_deleted` ケースを追加（Step 5 の `removeTasks` を使用）。旧 `task_deleted` ハンドラは互換のため残す（サーバー先行デプロイ時、旧クライアントは reload 通知で追随できる規模のため許容）
- **変更ファイル**: `api/src/routes/tasks.ts` / `frontend/src/hooks/useWebSocket.ts`
- **テスト**: `api/src/__tests__/routes.test.ts` の WS 期待値を「1通の tasks_deleted」へ変更、`useWebSocket.test.ts` に `tasks_deleted` ケース追加
- **期待効果**: 1000件削除時 WS 1000通＋クライアント側1000回の配列再構築 → 1通＋1回
- **リスク**: 低〜中（プロトコル変更だがサーバー・フロント同時リリース）

### Step 9（v2.67）: gzip 圧縮（@fastify/compress） — 状態: 未着手

- **内容**: `api/src/index.ts` に `@fastify/compress` を register（`{ global: true, threshold: 1024 }`、br/gzip）。ETag は更新頻度が高くヒットしにくいため見送り（任意項目）
- **変更ファイル**: `api/src/index.ts` / `api/package.json`
- **テスト**: `routes.test.ts` 追補 — `accept-encoding: gzip` 付き 1000件取得で `content-encoding` ヘッダと展開後ボディの同値を検証
- **期待効果**: 1000件 JSON 約300〜500KB → 約40〜60KB（転送量約85%減）
- **リスク**: 極小（依存追加1つ）

---

## 4. パフォーマンス計測方法

### シードデータ

- 開発 DB への投入: `npx tsx api/scripts/seed.ts --count=1000`（Step 1 で作成、冪等に再シード可）
- テスト用: `genLargeTasks(n, seed)`（決定的ジェネレータ、全 perf 系テストで共用）

### 手動計測（各ステップ前後で記録）

1. **初回表示**: React DevTools Profiler で GanttChart の commit duration（改善前想定: 数百ms〜秒 / 目標: <50ms）
2. **インタラクション**: Chrome Performance でバー上 mousemove 5秒間のフレームタイム（目標: 16ms 以下）
3. **スクロール**: 同上で FPS
4. **API**: `curl -so /dev/null -w '%{time_total} %{size_download}\n' -H 'Accept-Encoding: gzip' http://localhost:4000/api/v1/projects/<id>/tasks?limit=10000`、削除は `time curl -X DELETE ...`

### テストでの担保（決定的指標を主軸）

| ステップ | 指標 |
|---|---|
| Step 2 | 新旧関数の同値性テスト＋緩い時間 budget |
| Step 3 | 計算関数の呼び出し回数 spy（ホバー再レンダーで増えない） |
| Step 4 | コンポーネント再レンダー回数（1件更新で更新行＋祖先のみ） |
| Step 6 | DOM ノード数上限（1000件で <80 行分） |
| Step 8 | WS メッセージ数（削除1操作 = 1通） |
| Step 9 | `content-encoding` ヘッダ＋展開後ボディ同値 |

---

## 5. サマリー

| Step | 版 | 内容 | 領域 | 効果 | リスク | 状態 |
|---|---|---|---|---|---|---|
| 1 | 2.59 | 全件ページング取得（500件切り捨て修正・件数増に耐性）+ シード + フィクスチャ | FE+API | 正しさ（必須） | 極小 | ✅完了 |
| 2 | 2.60 | childrenMap で O(N²)→O(N) 化 | FE | 大（計算量） | 低 | 未着手 |
| 3 | 2.61 | GanttChart useMemo 化 | FE | 大（操作応答） | 中 | 未着手 |
| 4 | 2.62 | React.memo + props 安定化 | FE | 大（更新時） | 中 | 未着手 |
| 5 | 2.63 | zustand 差分アクション | FE | 中（基盤） | 低 | 未着手 |
| 6 | 2.64 | 行仮想化（自前スライス） | FE | 最大（DOM 数） | 高 | 未着手 |
| 7 | 2.65 | DB バッチ化（CTE + DELETE IN） | API | 中（削除系） | 低 | 未着手 |
| 8 | 2.66 | tasks_deleted 一括通知 | API+FE | 中 | 低〜中 | 未着手 |
| 9 | 2.67 | @fastify/compress 圧縮 | API | 中（転送量85%減） | 極小 | 未着手 |
