# TreeGantt

設計書: `docs/treegantt_design.md`

## コマンド

```bash
# 開発サーバー（API + フロントエンド同時起動）
bash start.sh
# → http://localhost:3000 / API: 4000 / WS: 4001

# テスト
cd /workspace/api      && npm test
cd /workspace/frontend && npm test -- --run

# 本番
docker compose build && docker compose up -d
```

## 開発ルール

順序厳守: **ドキュメントコミット → 失敗テスト追加 → 実装 → 全通過 → 実装コミット**

1. 実装前に `docs/treegantt_design.md` を更新してコミット
2. テストを先に書いて失敗確認 → 実装 → 全テスト通過 → コミット
