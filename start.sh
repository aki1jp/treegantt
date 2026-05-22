#!/bin/bash
# TaskFlow 開発サーバー起動スクリプト
# 使い方: ./start.sh
# 停止:   Ctrl+C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== TaskFlow 起動中 ==="

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
