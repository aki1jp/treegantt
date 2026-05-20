import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, '../../data/taskflow.db');

export const hocuspocus = Server.configure({
  port: parseInt(process.env.WS_PORT ?? '4001', 10),
  extensions: [
    new SQLite({ database: dbPath }),
  ],
  async onAuthenticate(_data) {
    // Phase 2: LDAPトークン検証をここに実装
    return {};
  },
});
