/** Vite 開発サーバーがリッスンするポートを返す（デフォルト 3000）
 *  FRONTEND_PORT が未設定または空文字のときはデフォルトを使う */
export function resolveFrontendPort() {
    return parseInt(process.env.FRONTEND_PORT || '3000', 10);
}
