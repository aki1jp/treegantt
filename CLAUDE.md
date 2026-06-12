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

### 📝 設計書の変更履歴追記ルール

`docs/treegantt_design.md` の変更履歴テーブルに新バージョンを追記するときは **必ず既存の最終行の下に追加する**。

```
# ❌ 悪い例：old_string に前の行のテキストを含め、途中に挿入しようとする
# → 長い行の部分一致で誤って前の行が切り詰められ、残りのテキストが新行末尾に混入する

# ✅ 正しい例：末尾の区切り行（---）を目印に、その直前に追加する
old_string: "| 2.xx | ... 前バージョンの末尾テキスト。 |\n\n---"
new_string: "| 2.xx | ... 前バージョンの末尾テキスト。 |\n| 2.yy | ... 新バージョン。 |\n\n---"
```

絶対に `old_string` に長い既存行のテキストを含めてはならない（部分一致で行が壊れる）。
