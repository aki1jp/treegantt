# TaskFlow — 開発進捗メモ

## Rules

- 各フェーズ完了時にCLAUDE.mdの進捗を更新すること
- 長い実装の前に「これからやること」を記録すること
- セッション再開時は必ずCLAUDE.mdを読んでから始めること

---

## プロジェクト概要

設計書: `/workspace/yatagarasu-manager_design.md`  
プロジェクトルート: `/workspace/taskflow/`  
（`/workspace/api/` はroot所有のため書き込み不可 → `/workspace/taskflow/` を使用）

---

## 実装フェーズ状況

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1-A | Fastify + SQLite CRUD + `/health` | ✅ 完了 |
| Phase 1-B | React雛形・TodoList・Zustand・フィルタ・ソート | ✅ 完了 |
| Phase 1-C | Y.js（ネストY.Map）+ Hocuspocus + 接続バッジ | ✅ 完了 |
| Phase 1-D | ガントチャート・ズーム・依存矢印・イナズマライン | ✅ 完了 |
| Phase 1-E | Import/Export (JSON/CSV)・並び替えAPI | ✅ 完了 |
| Phase 2 | LDAP認証 | ⏳ 未着手（スタブのみ） |

---

## 全完成ファイル一覧

### API (`/workspace/taskflow/api/`)
- `package.json`, `tsconfig.json`, `Dockerfile`
- `src/types/task.ts`
- `src/db/migrations/001_init.sql`, `src/db/client.ts`
- `src/services/taskService.ts`
- `src/routes/health.ts`, `projects.ts`, `tasks.ts`, `importExport.ts`
- `src/plugins/auth.ts`
- `src/ws/hocuspocus.ts`
- `src/index.ts`

### フロントエンド (`/workspace/taskflow/frontend/`)
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
- `docker-compose.yml`, `.env.example`

---

## 次のステップ

- Phase 2: LDAP認証（`api/src/plugins/auth.ts` に実装）
- 動作確認: `cd /workspace/taskflow/api && npm install && npm run dev`

---

## アーキテクチャメモ

- `/workspace/api/` (root所有) → 使用不可。`/workspace/taskflow/` を新規作成して使用
- APIポート: 4000 (REST), 4001 (WebSocket)
- SQLite: `/workspace/taskflow/api/data/taskflow.db`
- Y.js: タスクごとにネストY.Mapを使用（フィールド単位CRDT）
- Hocuspocusは Fastify と同一プロセス（port 4001）
