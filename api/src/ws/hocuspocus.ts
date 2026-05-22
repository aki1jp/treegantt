import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { db } from '../db/client.js';
import { handleLoadDocument, handleStoreDocument } from './hocuspocusHandlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, '../../data/taskflow.db');

export const hocuspocus = Server.configure({
  port: parseInt(process.env.WS_PORT ?? '4001', 10),
  extensions: [
    new SQLite({ database: dbPath }),
  ],

  async onLoadDocument({ document, documentName }) {
    await handleLoadDocument(document, documentName, db);
  },

  async onStoreDocument({ document, documentName }) {
    await handleStoreDocument(document, documentName, db);
  },
});
