// CORS 設定を集約する。フロント（別オリジン: 3000/3001）→ API（4000）の
// クロスオリジン要求を許可する。
//
// methods を明示する理由: @fastify/cors の既定 Access-Control-Allow-Methods は
// `GET,HEAD,POST` のみで PATCH/PUT/DELETE を含まない。そのためクロスオリジンの
// PATCH（ドラッグ/インライン編集/並び替え）・DELETE（削除）がプリフライトで弾かれる。
export const corsOptions = {
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
