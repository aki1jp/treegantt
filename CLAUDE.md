# TaskFlow — 開発進捗メモ

## Rules

- 各フェーズ完了時にCLAUDE.mdの進捗を更新すること
- 長い実装の前に「これからやること」を記録すること
- セッション再開時は必ずCLAUDE.mdを読んでから始めること

---

## プロジェクト概要

設計書: `/workspace/yatagarasu-manager_design.md`
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
| ユニットテスト | vitest 46テスト全合格 | ✅ 完了 |
| Phase 1-F | インライン編集・分割レイアウト・親タスクツリー・リアルタイム同期修正 | ✅ 完了 |
| Phase 1-G | CSVインポート対応・統合ガントビュー（MSProject風・TodoList廃止） | ✅ 完了 |
| Phase 2 | LDAP認証 | ⏳ 未着手（スタブのみ） |

---

## テスト

```bash
cd /workspace/api
npm test                # 全46テスト実行（約600ms）
npm run test:coverage   # カバレッジ付き
```

**テストファイル:**
- `src/__tests__/helpers.ts` — インメモリSQLite生成ヘルパー
- `src/__tests__/sort.test.ts` — ソート・フィルタロジックのpure関数テスト (10件)
- `src/__tests__/taskService.test.ts` — CRUD・依存関係・reorderの単体テスト (17件)
- `src/__tests__/routes.test.ts` — Fastify inject による統合テスト health/projects/tasks/import/export (19件)

---

## 動作確認

```bash
# API起動
cd /workspace/api && npm install && npm run dev
# → http://localhost:4000/health  (REST API)
# → ws://localhost:4001           (Hocuspocus WebSocket)

# フロントエンド起動（別ターミナル）
cd /workspace/frontend && npm install && npm run dev
# → http://localhost:3000
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
- `src/ws/hocuspocus.ts`（パス修正済み）
- `src/index.ts`
- `src/__tests__/helpers.ts`, `sort.test.ts`, `taskService.test.ts`, `routes.test.ts`

### フロントエンド (`/workspace/frontend/`)
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `Dockerfile`
- `src/types/task.ts`
- `src/store/connectionStore.ts`, `taskStore.ts`, `yjsStore.ts`
- `src/hooks/useYjs.ts`, `useTasks.ts`
- `src/utils/sort.ts`, `ganttCalc.ts`, `importExport.ts`
- `src/components/ConnectionBadge/ConnectionBadge.tsx`
- `src/components/Toolbar/Toolbar.tsx`
- `src/components/TaskModal/TaskModal.tsx`
- `src/components/TodoList/TodoList.tsx`, `TaskRow.tsx`
- `src/components/Gantt/GanttChart.tsx`, `GanttBar.tsx`, `DependencyArrow.tsx`, `LightningLine.tsx`
- `src/App.tsx`, `src/main.tsx`

### インフラ
- `docker-compose.yml`, `.env.example`, `.gitignore`

---

## アーキテクチャメモ

- APIポート: 4000 (REST), 4001 (WebSocket)
- SQLite: `/workspace/api/data/taskflow.db`
- Y.js: タスクごとにネストY.Mapを使用（フィールド単位CRDT）
- Hocuspocusは Fastify と同一プロセス（port 4001）
- テストはインメモリSQLiteを使用（DB依存の副作用なし）
