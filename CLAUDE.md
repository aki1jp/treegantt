# TreeGantt — 開発進捗メモ

## Rules

- 各フェーズ完了時にCLAUDE.mdの進捗を更新すること
- 長い実装の前に「これからやること」を記録すること
- セッション再開時は必ずCLAUDE.mdを読んでから始めること
- 実装前には docs/treegantt_design.md を更新しgitコミットすること
- 実装後には gitコミットすること

---

## プロジェクト概要

設計書: `/workspace/docs/treegantt_design.md`
プロジェクトルート: `/workspace/` (`api/`, `frontend/`, `docker-compose.yml`)

---

## 実装フェーズ状況

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1-A | Fastify + SQLite CRUD + `/health` | ✅ 完了 |
| Phase 1-B | React雛形・TodoList・Zustand・フィルタ・ソート | ✅ 完了 |
| Phase 1-C | Y.js（ネストY.Map）+ Hocuspocus + 接続バッジ | ✅ 完了 |
| Phase 1-D | ガントチャート・ズーム・依存矢印・イナズマライン | ✅ 完了 |
| Phase 1-E | Import/Export (JSON/CSV)・並び替えAPI | ✅ 完了 |
| ユニットテスト | vitest 199テスト全合格（API: 46件、フロントエンド: 153件） | ✅ 完了 |
| Phase 1-F | インライン編集・分割レイアウト・親タスクツリー・リアルタイム同期修正 | ✅ 完了 |
| Phase 1-G | CSVインポート対応・統合ガントビュー（MSProject風・TodoList廃止） | ✅ 完了 |
| Phase 1-H | Y.js主体アーキテクチャ・リアルタイム同期修正・競合解決UI・フロントエンドテスト | ✅ 完了 |
| Phase 1-I | リアルタイム同期根本修正（onAuthenticate削除・updateTask REST化）・リロード時消失修正・ガント末行クイック追加・表示期間コントロール | ✅ 完了 |
| Phase 1-J | ガント行ズレ修正・親タスク進捗自動計算（子平均・編集不可）・イナズマラインON/OFF・マルチレベルヘッダー（年/月/週/日個別トグル） | ✅ 完了 |
| Phase 1-K | Y.js + Hocuspocus 廃止・WebSocket broadcast 導入・ConnectionBadge/TodoList 削除・apiFetch 統合・taskTree.ts 分離・シナリオテスト追加 | ✅ 完了 |
| Phase 1-L | イナズマライン done/wait → todayX 固定・本番 Dockerfile（マルチステージ）・docker-compose 本番化・API URL 自動検出（window.location.hostname）| ✅ 完了 |
| テスト強化 | フロントエンド全ファイル Statements/Branches/Lines 100% 達成（210件）・useWebSocket を renderHook + MockWebSocket でテスト | ✅ 完了 |
| Phase 2-A | マイルストーン・クリティカルパス・バードラッグ移動/リサイズ・期限超過強調・期間フィールド | ✅ 完了 |
| Phase 2 | LDAP認証 | ⏳ 未着手（スタブのみ） |

---

## 今後の機能候補

### 必須に近い機能（標準的な WBS/ガントツールに共通）

| 機能 | 説明 | 優先度 |
|------|------|--------|
| バーのドラッグ移動・リサイズ | バーをドラッグして開始日を移動、端をドラッグして期間を変更 | ★★★ |
| マイルストーン | 期間ゼロのタスク。ガントに菱形◇で表示 | ★★★ |
| クリティカルパス表示 | 全体納期に影響するタスク経路をハイライト | ★★★ |
| ベースライン（計画線） | 当初計画を別色で保存し、現在との差分を可視化 | ★★ |
| 期間（Duration）フィールド | 開始日＋日数から終了日を自動計算 | ★★ |
| 期限超過の強調 | endDate < 今日 かつ 未完了のバーを赤などで警告表示 | ★★ |

### あると便利な機能

| 機能 | 説明 | 優先度 |
|------|------|--------|
| タスク検索 | タイトル・担当者でインクリメンタル検索 | ★★ |
| 行のドラッグ並び替え | マウスで行を掴んで順番を変更 | ★★ |
| タグ／ラベル | 色付きタグで任意分類。フィルタにも使える | ★★ |
| PDF・画像出力 | ガントチャートをそのままレポートに貼れる | ★★ |
| 折りたたみ状態の永続化 | ブラウザを閉じても折りたたみ状態を記憶 | ★ |
| 複数担当者 | 現状は1人。複数割り当て対応 | ★ |
| 依存関係の種類 | 現状 FS のみ。SS・FF・SF も対応 | ★ |
| コメント／履歴 | タスク単位で会話・変更ログを残す | ★ |
| キーボードショートカット | 新規追加・保存・削除など | ★ |

### 高度な機能（本格的な PM ツール向け）

- リソース管理 — 担当者ごとの稼働率・過負荷検出
- 工数（見積 vs 実績） — 作業時間の追跡
- スプリント／フェーズ — タスクをグループ化して管理
- 通知 — 期限切れ・変更をメール or ブラウザ通知
- ロールバック／Undo — 操作履歴を戻せる

---

## テスト

```bash
cd /workspace/api
npm test                    # API 46テスト実行（約600ms）
npm run test:coverage       # カバレッジ付き

cd /workspace/frontend
npm test -- --run           # フロントエンド 210テスト実行
npx vitest run --coverage   # カバレッジ付き（Statements/Branches/Lines 100%）
```

**APIテストファイル:**
- `src/__tests__/helpers.ts` — インメモリSQLite生成ヘルパー
- `src/__tests__/sort.test.ts` — ソート・フィルタロジックのpure関数テスト (7件)
- `src/__tests__/taskService.test.ts` — CRUD・依存関係・reorderの単体テスト (19件)
- `src/__tests__/routes.test.ts` — Fastify inject による統合テスト health/projects/tasks/import/export (20件)

**フロントエンドテストファイル:**
- `src/__tests__/ganttCalc.test.ts` — ガント計算ロジックテスト (15件)
- `src/__tests__/importExport.test.ts` — JSON/CSV import・export・downloadFile テスト (12件)
- `src/__tests__/scenarios.test.ts` — FEATURES.md §3〜§8 対応シナリオテスト (143件)
- `src/__tests__/api.test.ts` — apiFetch 単体テスト・fetchモック (4件)
- `src/__tests__/taskStore.test.ts` — Zustand ストア全アクションテスト (16件)
- `src/__tests__/useTasks.test.ts` — CRUD フック・fetchモック (7件)
- `src/__tests__/useWebSocket.test.ts` — WebSocket フック・MockWebSocket + renderHook (15件)

**フロントエンドカバレッジ（utils・store・hooks）:**
- Statements: 100% / Branches: 100% / Lines: 100% / Functions: 98.57%

---

## 動作確認

```bash
# 開発環境（ローカル）
bash start.sh
# → http://localhost:3000 / http://localhost:4000/health / ws://localhost:4001

# 本番環境（社内サーバー等）
docker compose build
docker compose up -d
# → http://サーバーIP:3000  ※API・WebSocket URL はブラウザが自動検出
```

---

## 全完成ファイル一覧

### API (`/workspace/api/`)
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile`
- `src/types/task.ts`
- `src/db/migrations/001_init.sql`, `src/db/migrations/002_parent.sql`, `src/db/client.ts`
- `src/services/taskService.ts`
- `src/routes/health.ts`, `projects.ts`, `tasks.ts`, `importExport.ts`
- `src/plugins/auth.ts`
- `src/ws/broadcast.ts`
- `src/index.ts`
- `src/__tests__/helpers.ts`, `sort.test.ts`, `taskService.test.ts`, `routes.test.ts`

### フロントエンド (`/workspace/frontend/`)
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `Dockerfile`
- `src/types/task.ts`
- `src/store/taskStore.ts`
- `src/hooks/useWebSocket.ts`, `useTasks.ts`
- `src/utils/api.ts`, `sort.ts`, `ganttCalc.ts`, `importExport.ts`, `taskTree.ts`
- `src/components/ConflictDialog/ConflictDialog.tsx`
- `src/components/Toolbar/Toolbar.tsx`
- `src/components/TaskModal/TaskModal.tsx`
- `src/components/Gantt/GanttChart.tsx`, `GanttBar.tsx`, `DependencyArrow.tsx`, `LightningLine.tsx`
- `src/App.tsx`, `src/main.tsx`
- `src/__tests__/ganttCalc.test.ts`, `importExport.test.ts`, `scenarios.test.ts`, `api.test.ts`, `taskStore.test.ts`, `useTasks.test.ts`, `useWebSocket.test.ts`

### インフラ
- `docker-compose.yml`, `.env.example`, `.gitignore`

---

## アーキテクチャメモ

- APIポート: 4000 (REST), 4001 (WebSocket broadcast)
- SQLite: `/workspace/api/data/treegantt.db`（唯一の真の状態）
- WebSocket: `ws` ライブラリによる broadcast サーバー（port 4001）。SQLite は REST 経由でのみ更新
- フロントエンドの API/WS URL: `VITE_API_URL`/`VITE_WS_URL` 環境変数で上書き可。未設定時は `window.location.hostname` を自動使用（社内サーバー対応）
- イナズマライン: `done`/`wait` ステータスのタスクは進捗率ではなく todayX（今日の縦線位置）を頂点として表示
- 本番デプロイ: `docker compose build && docker compose up -d`。フロントエンドは `serve` で静的配信、API は `node dist/index.js`
- テストはインメモリSQLiteを使用（DB依存の副作用なし）
