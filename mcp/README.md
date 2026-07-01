# treegantt-mcp

TreeGantt を外部から**読み取り専用**で参照するための MCP (Model Context Protocol) サーバー。

TreeGantt本体（`api`/`frontend`）はこのサーバーの存在を一切知らない。ここは既存の
TreeGantt REST API（`/api/v1/*`）を叩くだけの薄いクライアントであり、`api` 内部の
`services/*` は直接importしない。方針の背景・代替案・将来の拡張条件は
[`docs/ai_integration_policy.md`](../docs/ai_integration_policy.md) を参照。

## v1 の範囲

- **読み取り専用**。`list_projects` / `list_tasks` / `get_task` / `export_project` /
  `get_settings` の5ツールのみ。タスクの作成・編集・削除は行わない。
- **認証なし**。TreeGantt API を直接叩く前提（既定 `http://localhost:4000`。詳細は下記「本番環境」節）。

## セットアップ（開発・本番共通）

`mcp/` はビルド不要。TypeScript を [`tsx`](https://github.com/privatenumber/tsx) でそのまま実行する
（`api` の `npm run dev` が `tsx watch` でビルド不要なのと同じ考え方）。依存関係のインストールだけ済ませる。

```bash
cd mcp
npm install
```

これはリポジトリルートで `bash start.sh` を実行すれば自動で行われる（`mcp/node_modules` が
無ければ `npm install` される。`api`/`frontend` と同様）。`mcp/` 自体は `start.sh` からは**起動されない**
（MCPクライアントが必要な時に stdio で都度起動するため。詳しくは次節）。

## Claude Code / Claude Desktop への登録

プロジェクトルートの `.mcp.json`（Claude Code）に以下を追加する。

```json
{
  "mcpServers": {
    "treegantt": {
      "command": "npx",
      "args": ["tsx", "mcp/src/index.ts"],
      "env": {
        "API_BASE_URL": "http://localhost:4000"
      }
    }
  }
}
```

Claude Desktop の場合は設定ファイルの `mcpServers` に同様のエントリを追加する（`args` の
`"mcp/src/index.ts"` は相対パスなので、Desktop の作業ディレクトリに依存しないよう絶対パスに
読み替える）。

`API_BASE_URL` は TreeGantt API のポートを変更した場合のみ設定すればよい（既定は
`http://localhost:4000`）。

## 開発環境 と 本番環境

`mcp/` は「AIクライアントがstdioでローカルに都度起動する薄いHTTPクライアント」であり、`api`/
`frontend` のような**常時稼働のサーバーではない**。そのため Docker イメージ化はしていないし、
`docker-compose.yml` にも含めていない。

- **開発中の TreeGantt を参照したい**: 上記の設定のまま（`API_BASE_URL=http://localhost:4000`）で
  `bash start.sh` した開発サーバーを参照できる。
- **本番（Docker）の TreeGantt を参照したい**: `mcp/` 自体は変わらずローカルで動かし、
  `API_BASE_URL` に本番サーバーの URL（例: `http://<本番ホスト>:4000`）を指定するだけでよい。
  `mcp/` を本番イメージに含めたり docker-compose に追加したりする必要はない。
  - ⚠️ **注意**: この場合、本番 API を `localhost` 外からアクセス可能な形で公開することになる。
    現状 TreeGantt API は無認証（ゲスト単一ユーザーモデル）のため、`localhost` 限定でなくなる
    ことの是非を検討すること。認証導入の判断基準は
    [`docs/ai_integration_policy.md`](../docs/ai_integration_policy.md) §4.3 を参照。

## テスト

```bash
npm test
```
