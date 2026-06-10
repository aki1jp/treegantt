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

### ✅ 厳守する実装順序（例外なし）

1. `docs/treegantt_design.md` を更新
2. `git commit`（ドキュメントのみ）
3. テストを書く（この時点でテストは**失敗すること**）
4. テスト失敗を確認
5. 実装する
6. 全テスト通過を確認（`npm test`）
7. `git commit`（実装）

### ❌ 絶対禁止（違反したら即中断して正しい順序からやり直す）

- テストを書かずに実装ファイルを Edit/Write してはならない
- `docs/treegantt_design.md` を更新・コミットする前に実装してはならない
- 実装完了後にコミットせずに会話を終了してはならない
