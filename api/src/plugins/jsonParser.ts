import type { FastifyInstance } from 'fastify';

// application/json のボディパーサを差し替え、**空ボディを許容**する。
//
// 既定の Fastify は `Content-Type: application/json` で本文が空だと
// `FST_ERR_CTP_EMPTY_JSON_BODY`(400) を返す。ブラウザの fetch は本文を持たない
// DELETE でも（クライアント側で付けてしまうと）content-type を送るため、本来正当な
// ボディなし DELETE が 400 で弾かれる。本パーサは空文字を `undefined` として通し、
// 中身のある JSON のみ従来どおりパースする（壊れた JSON は 400 のまま）。
export function registerJsonBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = (body as string).trim();
      if (text.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );
}
