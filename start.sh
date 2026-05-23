#!/bin/bash
# TreeGantt 開発サーバー起動スクリプト
# 使い方: ./start.sh
# 停止:   Ctrl+C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

echo ""
echo "  API       → http://localhost:4000/health"
echo "  WebSocket → ws://localhost:4001"
echo "  Frontend  → http://localhost:3000"
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

# API（青プレフィックス）・フロントエンド（緑プレフィックス）を同時起動
(cd api && npm run dev 2>&1 | sed 's/^/\033[34m[API]\033[0m /') &
API_PID=$!

(cd frontend && npm run dev 2>&1 | sed 's/^/\033[32m[FE] \033[0m /') &
FE_PID=$!

wait "$API_PID" "$FE_PID"
