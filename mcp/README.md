# treegantt-mcp

TreeGantt を外部から**読み取り専用**で参照するための MCP (Model Context Protocol) サーバー。

TreeGantt本体（`api`/`frontend`）はこのサーバーの存在を一切知らない。ここは既存の
TreeGantt REST API（`/api/v1/*`）を叩くだけの薄いクライアントであり、`api` 内部の
`services/*` は直接importしない。方針の背景・代替案・将来の拡張条件は
[`docs/ai_integration_policy.md`](../docs/ai_integration_policy.md) を参照。

## v1 の範囲

- **読み取り専用**。`list_projects` / `list_tasks` / `get_task` / `export_project` /
  `get_settings` の5ツールのみ。タスクの作成・編集・削除は行わない。
- **認証なし**。ローカルの TreeGantt API（既定 `http://localhost:4000`）を直接叩く前提。

## セットアップ

```bash
cd mcp
npm install
npm run build
```

TreeGantt の API サーバーを別途起動しておく（リポジトリルートで `bash start.sh`、
または `cd api && npm run dev`）。

## Claude Code / Claude Desktop への登録

プロジェクトルートの `.mcp.json`（Claude Code）に以下を追加する。

```json
{
  "mcpServers": {
    "treegantt": {
      "command": "node",
      "args": ["mcp/dist/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:4000"
      }
    }
  }
}
```

Claude Desktop の場合は設定ファイルの `mcpServers` に同様のエントリを追加する。

`API_BASE_URL` は TreeGantt API のポートを変更した場合のみ設定すればよい（既定は
`http://localhost:4000`）。

## テスト

```bash
npm test
```
