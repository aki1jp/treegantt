import { buildApp } from './app.js';
import { wss } from './ws/wsRoom.js';
import { db, dbPath } from './db/client.js';
import { scheduleBackups } from './db/backup.js';
import {
  resolveApiPort,
  resolveBackupDir,
  resolveBackupIntervalHours,
  resolveBackupRetention,
} from './config.js';

const PORT = resolveApiPort();

const fastify = await buildApp({ logger: true });

await fastify.listen({ port: PORT, host: '0.0.0.0' });
fastify.log.info(`API listening on port ${PORT}`);

wss.on('listening', () => {
  fastify.log.info(`WebSocket room server listening on port ${process.env.WS_PORT ?? 4001}`);
});

// 起動時に1回＋定期的に SQLite のオンラインバックアップを取得する（§13.4）。
// import 時副作用にはせず、ここから明示的に起動する（テスト容易性のため）。
scheduleBackups({
  db,
  backupDir: resolveBackupDir(dbPath),
  intervalHours: resolveBackupIntervalHours(),
  retention: resolveBackupRetention(),
  logger: { error: (msg, err) => fastify.log.error({ err }, msg) },
});
