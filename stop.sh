#!/bin/bash
# TreeGantt 開発サーバー停止スクリプト
# 使い方: ./stop.sh

STOPPED=0

stop_process() {
  local label="$1"
  local pattern="$2"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "停止中: $label (PID $pids)"
    kill $pids 2>/dev/null
    STOPPED=$((STOPPED + 1))
  fi
}

stop_process "API (port 4000/4001)" "tsx watch src/index.ts"
stop_process "Frontend (port 3000)"  "node_modules/.bin/vite"

if [ "$STOPPED" -eq 0 ]; then
  echo "起動中のサーバーが見つかりませんでした。"
else
  echo "完了: ${STOPPED} 件のプロセスを停止しました。"
fi
