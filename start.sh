#!/bin/bash
# TreeGantt 開発サーバー起動スクリプト
# 使い方: ./start.sh
# 停止:   Ctrl+C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── .env 読み込み ────────────────────────────────────
# プロジェクトルートに .env があれば環境変数として読み込む
# .env.example をコピーして値を変更することでポートを変更できる
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── npm のパスを確定 ─────────────────────────────────
# 非インタラクティブシェルでは ~/.bashrc / ~/.zshrc が読み込まれず
# nvm 管理の npm が見つからないことがある。よくある場所を順に探す。
if ! command -v npm &>/dev/null; then
  for candidate in \
    "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin" \
    /usr/local/bin /usr/bin /opt/homebrew/bin
  do
    if [ -x "$candidate/npm" ]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi

if ! command -v npm &>/dev/null; then
  echo "エラー: npm が見つかりません。Node.js をインストールしてください。"
  echo "  https://nodejs.org/"
  exit 1
fi

echo "=== TreeGantt 起動中 (npm $(npm --version)) ==="

# 初回のみ npm install
if [ ! -d "api/node_modules" ]; then
  echo "[API] パッケージインストール中..."
  (cd api && npm install --silent)
fi
if [ ! -d "frontend/node_modules" ]; then
  echo "[FE]  パッケージインストール中..."
  (cd frontend && npm install --silent)
fi
# mcp/ は start.sh では起動しない（MCPクライアントがstdioで都度起動する。詳細は mcp/README.md）。
# ここでは AI クライアント側の設定がすぐ使えるよう依存関係だけ準備しておく。
if [ ! -d "mcp/node_modules" ]; then
  echo "[MCP] パッケージインストール中..."
  (cd mcp && npm install --silent)
fi

_API_PORT="${PORT:-4000}"
_WS_PORT="${WS_PORT:-4001}"
_FE_PORT="${FRONTEND_PORT:-3000}"

echo ""
echo "  API       → http://localhost:${_API_PORT}/health"
echo "  WebSocket → ws://localhost:${_WS_PORT}"
echo "  Frontend  → http://localhost:${_FE_PORT}"
echo ""
echo "停止: Ctrl+C"
echo ""

cleanup() {
  echo ""
  echo "停止中..."
  kill "$API_PID" "$FE_PID" 2>/dev/null
  wait "$API_PID" "$FE_PID" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ANSI ESC を実バイトで用意する。
# sed の置換文字列内の `\033` は実装依存で、特に GNU sed では `\0`（マッチ全体への
# 後方参照）＋`33` と解釈され ESC バイトが脱落する。printf で実 ESC を生成して渡す。
ESC=$(printf '\033')

# API（青プレフィックス）・フロントエンド（緑プレフィックス）を同時起動
(cd api && npm run dev 2>&1 | sed "s/^/${ESC}[34m[API]${ESC}[0m /") &
API_PID=$!

(cd frontend && npm run dev 2>&1 | sed "s/^/${ESC}[32m[FE] ${ESC}[0m /") &
FE_PID=$!

wait "$API_PID" "$FE_PID"
