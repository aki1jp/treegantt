import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

const dbPath = process.env.DB_PATH ?? '/app/data/taskflow.db';

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
