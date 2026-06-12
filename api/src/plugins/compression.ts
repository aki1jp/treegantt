import compress from '@fastify/compress';
import type { FastifyInstance } from 'fastify';

// REST レスポンスの圧縮（v2.67）。
// 1000件タスク一覧のような大きな JSON の転送量を約85%削減する。
// threshold 未満の小レスポンスは圧縮コストの方が高いためスキップする。
export async function registerCompression(fastify: FastifyInstance): Promise<void> {
  await fastify.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip'],
  });
}
