/** REST API がリッスンするポートを返す（デフォルト 4000）
 *  PORT が未設定または空文字のときはデフォルトを使う */
export function resolveApiPort(): number {
  return parseInt(process.env.PORT || '4000', 10);
}

/** WebSocket サーバーがリッスンするポートを返す（デフォルト 4001）
 *  WS_PORT が未設定または空文字のときはデフォルトを使う */
export function resolveWsPort(): number {
  return parseInt(process.env.WS_PORT || '4001', 10);
}
