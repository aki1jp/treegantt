# TreeGantt

ガントチャート形式のタスク管理ツール（WBS ツリー + ガントバー + リアルタイム同期）。

設計書: `docs/treegantt_design.md`

---

## コマンド

```bash
# 開発サーバー（API + フロントエンド同時起動）
bash start.sh
# → http://localhost:3000 / API: 4000 / WS: 4001

# テスト
cd /workspace/api      && npm test            # 78件
cd /workspace/frontend && npm test -- --run   # 341件

# 本番
docker compose build && docker compose up -d
```

---

## 開発ルール

1. **TDD**: 機能追加はテスト先行（失敗確認 → 実装 → 全通過 → コミット）
2. **ドキュメント先行**: 実装前に `docs/treegantt_design.md` を更新してコミット
3. **実装後コミット**: 実装完了後に必ず git commit

---

## アーキテクチャ制約

- **SQLite が唯一の状態**。REST 経由でのみ更新。WebSocket (port 4001) は broadcast のみ
- **API URL 自動検出**: `VITE_API_URL`/`VITE_WS_URL` 未設定時は `window.location.hostname` を使用
- **マイルストーンは別 UI**: `MilestoneModal` で作成。子タスク追加・親設定は不可。`isMilestone: true`・`endDate = startDate` 固定
- **WBS/ガント 2 パネル分割**: WBS は `overflow: hidden`、ガントは `overflow: auto`。ホイール操作は WBS → ガントに転送、垂直スクロールは `onScroll` で同期
- **localStorage 永続化**: Zustand `persist` でキー `treegantt-ui` に UI 設定を保存。タスク・フィルタ・ソートは保存しない
- **ord 採番**: `COALESCE(MAX(ord), 0) + 1`。全削除後も #1 から始まる
- **親タスク進捗**: 子タスクの平均を自動計算。インライン編集不可
- **buildTree の depth**: 配列順序に依存しない DFS で計算（ソート後も正しい）

---

## テストファイル

### API (`/workspace/api/src/__tests__/`)

| ファイル | 内容 |
|---------|------|
| `helpers.ts` | インメモリ SQLite ヘルパー |
| `sort.test.ts` | ソート・フィルタ pure 関数 |
| `taskService.test.ts` | CRUD・依存関係・reorder |
| `routes.test.ts` | REST API 統合テスト |

### フロントエンド (`/workspace/frontend/src/__tests__/`)

| ファイル | 内容 |
|---------|------|
| `scenarios.test.ts` | 機能シナリオ（最大のテストファイル） |
| `ganttCalc.test.ts` | ガント計算ロジック |
| `importExport.test.ts` | JSON/CSV import・export |
| `taskStore.test.ts` | Zustand ストア・localStorage 永続化 |
| `useTasks.test.ts` | CRUD フック |
| `useWebSocket.test.ts` | WebSocket フック |
| `api.test.ts` | apiFetch |
| `ganttLayout.test.tsx` | GanttChart 2 パネルレイアウト構造・ガントヘッダー曜日表示 |
| `taskModal.test.tsx` | TaskModal Markdown プレビュータブ |
| `toolbar.test.tsx` | Toolbar 2段レイアウト・折りたたみ |
| `workloadCalc.test.ts` | 担当者別負荷マトリクス計算 |

---

## 未着手

- LDAP 認証（`api/src/plugins/auth.ts` にスタブのみ）
