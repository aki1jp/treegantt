# TaskFlow — タスク管理システム 設計書

| 項目 | 内容 |
|------|------|
| バージョン | 1.0 |
| 作成日 | 2025年 |
| 対象読者 | 開発者・アーキテクト |
| ステータス | ドラフト |

---

## 目次

1. [はじめに](#1-はじめに)
2. [システム概要](#2-システム概要)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [データモデル](#4-データモデル)
5. [REST API設計](#5-rest-api設計)
6. [リアルタイム同期設計](#6-リアルタイム同期設計)
7. [フロントエンド設計](#7-フロントエンド設計)
8. [Docker / インフラ構成](#8-docker--インフラ構成)
9. [認証設計（将来拡張）](#9-認証設計将来拡張)
10. [依存パッケージ](#10-依存パッケージ)
11. [実装フェーズ](#11-実装フェーズ)
12. [非機能要件](#12-非機能要件)

---

## 1. はじめに

### 1.1 目的

本書はTaskFlowのシステム設計を記述する。本設計書を読めばそのまま実装に着手できる粒度を目指す。

### 1.2 スコープ

- TODOリスト・ガントチャートによるタスク管理
- 先行・後続タスクの依存関係管理
- イナズマライン表示（進捗基準線）
- 担当者・ステータス等による並び替え
- JSON / CSV Import / Export
- WebSocketを用いたリアルタイム同時編集（〜10人同時）
- SQLiteによるファイルベース永続化
- Dockerコンテナによるデプロイ
- LDAP認証（将来拡張として設計上の考慮のみ）

### 1.3 前提・制約

| 項目 | 内容 |
|------|------|
| 同時接続ユーザー数 | 最大10名 |
| データ規模 | タスク数 〜10,000件 / プロジェクト |
| ネットワーク | 社内LAN / VPN環境を想定 |
| OS | Linux (Docker on Ubuntu 22.04 LTS) |
| 認証 | 初期リリースは無し。LDAP拡張を設計上考慮 |

---

## 2. システム概要

### 2.1 アーキテクチャ全体像

TaskFlowはSPA（シングルページアプリケーション）＋WebSocketサーバーの2層構成をDockerコンテナで提供する。

| レイヤー | 技術 | 役割 |
|----------|------|------|
| フロントエンド | React 18 + TypeScript + Vite | UI・ガントチャート・CRDT操作 |
| リアルタイム同期 | Y.js (CRDT) + Hocuspocus | WebSocket経由のリアルタイム共同編集 |
| バックエンドAPI | Node.js 20 + Fastify | REST API・認証スタブ・ファイルI/O |
| 永続化 | SQLite (better-sqlite3) | タスクデータ・ユーザーデータ保存 |
| コンテナ | Docker + docker-compose | サービス分離・ポート管理 |

### 2.2 コンテナ構成

`docker-compose.yml` で以下の3サービスを定義する。

| サービス名 | イメージ | ポート | 役割 |
|-----------|---------|--------|------|
| frontend | node:20-alpine (build) | 3000:3000 | Vite dev / Nginx static（本番） |
| api | node:20-alpine | 4000:4000 | Fastify REST API + SQLite |
| ws | node:20-alpine | 4001:4001 | Hocuspocus WebSocketサーバー |

> ※ 開発時はfrontendコンテナでVite devサーバーを起動する。本番ビルドではNginxで静的ファイルを配信する。

### 2.3 データフロー

1. ユーザー操作 → Y.js Document に対するCRDT操作
2. Y.js → WebSocket（Hocuspocus）→ 他クライアントに即時ブロードキャスト
3. Hocuspocusの `onStoreDocument` コールバック → Fastify API → SQLite へ永続化
4. ページロード時: Fastify API → SQLite からスナップショットを取得 → Y.js Documentに適用

---

## 3. ディレクトリ構成

```
taskflow/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── frontend/
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx              # エントリーポイント
│       ├── App.tsx
│       ├── types/
│       │   └── task.ts           # 共通型定義
│       ├── store/
│       │   ├── yjsStore.ts       # Y.js Document管理
│       │   └── taskStore.ts      # Zustandストア
│       ├── components/
│       │   ├── TodoList/
│       │   │   ├── TodoList.tsx
│       │   │   └── TaskRow.tsx
│       │   ├── Gantt/
│       │   │   ├── GanttChart.tsx
│       │   │   ├── GanttBar.tsx
│       │   │   ├── DependencyArrow.tsx
│       │   │   └── LightningLine.tsx
│       │   ├── TaskModal/
│       │   │   └── TaskModal.tsx
│       │   └── Toolbar/
│       │       └── Toolbar.tsx
│       ├── hooks/
│       │   ├── useYjs.ts         # Y.js接続フック
│       │   └── useTasks.ts       # タスク操作フック
│       └── utils/
│           ├── ganttCalc.ts      # ガントチャート計算
│           ├── importExport.ts   # Import/Export
│           └── sort.ts           # 並び替えロジック
├── api/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.ts              # Fastifyサーバー起動
│   │   ├── db/
│   │   │   ├── client.ts         # better-sqlite3接続
│   │   │   └── migrations/
│   │   │       └── 001_init.sql
│   │   ├── routes/
│   │   │   ├── tasks.ts          # タスクCRUD
│   │   │   ├── projects.ts       # プロジェクト
│   │   │   └── importExport.ts   # Import/Export
│   │   ├── services/
│   │   │   ├── taskService.ts
│   │   │   └── authService.ts    # LDAPスタブ
│   │   └── plugins/
│   │       └── auth.ts           # 認証プラグイン（将来用）
│   └── data/
│       └── taskflow.db           # SQLiteファイル（永続化）
└── ws/
    ├── Dockerfile
    ├── package.json
    └── src/
        └── index.ts              # Hocuspocusサーバー
```

---

## 4. データモデル

### 4.1 型定義 (TypeScript)

`frontend/src/types/task.ts` に以下を定義する。すべてのコンポーネントがこの型を参照する。

```typescript
// タスクステータス
export type TaskStatus = 'todo' | 'wip' | 'done' | 'wait';

export interface Task {
  id:           string;        // UUID v4
  projectId:    string;        // 所属プロジェクトID
  title:        string;        // タイトル（必須, max 200文字）
  detail:       string;        // 詳細（1行サマリ）
  description:  string;        // 長文説明（Markdown可）
  status:       TaskStatus;
  assignee:     string;        // 担当者名
  startDate:    string | null; // ISO 8601 date (YYYY-MM-DD)
  endDate:      string | null; // ISO 8601 date (YYYY-MM-DD)
  predecessors: string[];      // 先行タスクID配列
  successors:   string[];      // 後続タスクID配列（計算値）
  order:        number;        // 表示順
  createdAt:    string;        // ISO 8601 datetime
  updatedAt:    string;        // ISO 8601 datetime
}

export interface Project {
  id:        string;
  name:      string;
  createdAt: string;
}
```

### 4.2 SQLiteスキーマ

`api/src/db/migrations/001_init.sql` に定義する。

```sql
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo','wip','done','wait')),
  assignee    TEXT NOT NULL DEFAULT '',
  start_date  TEXT,
  end_date    TEXT,
  ord         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_deps (
  predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (predecessor_id, successor_id)
);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_tasks_updated_at
  AFTER UPDATE ON tasks
  BEGIN
    UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
  END;
```

> ※ `successors` は `task_deps` を JOIN して計算するため、DBには保存しない。

---

## 5. REST API設計

### 5.1 共通仕様

- Base URL: `http://localhost:4000/api/v1`
- Content-Type: `application/json`
- エラーレスポンス: `{ "error": "message", "code": "ERROR_CODE" }`
- 認証ヘッダー（将来）: `Authorization: Bearer <JWT>`

### 5.2 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/projects` | プロジェクト一覧取得 |
| POST | `/projects` | プロジェクト作成 |
| GET | `/projects/:id/tasks` | タスク一覧取得（deps含む） |
| POST | `/projects/:id/tasks` | タスク作成 |
| GET | `/tasks/:id` | タスク単体取得 |
| PATCH | `/tasks/:id` | タスク部分更新 |
| DELETE | `/tasks/:id` | タスク削除 |
| POST | `/projects/:id/import` | JSONインポート |
| GET | `/projects/:id/export/json` | JSONエクスポート |
| GET | `/projects/:id/export/csv` | CSVエクスポート |
| POST | `/ws/store` | Hocuspocusからの永続化コールバック（内部） |

### 5.3 タスク作成 `POST /projects/:id/tasks`

**リクエストボディ**

```json
{
  "title":        "フロントエンド実装",
  "detail":       "React + TypeScript",
  "description":  "## 詳細\n...",
  "status":       "todo",
  "assignee":     "田中",
  "startDate":    "2025-05-01",
  "endDate":      "2025-05-15",
  "predecessors": ["uuid-1", "uuid-2"]
}
```

**レスポンス 201**

```json
{ "task": { ...Task } }
```

### 5.4 Import / Export仕様

**JSON形式**

```json
{
  "version":    "1.0",
  "exportedAt": "2025-05-01T12:00:00Z",
  "project":    { "id": "...", "name": "..." },
  "tasks":      [ ...Task[] ]
}
```

**CSV形式（列順固定）**

```
id, title, detail, description, status, assignee, startDate, endDate, predecessors
```

> ※ `predecessors` はセミコロン区切りのIDリストとする。例: `"uuid-1;uuid-2"`

---

## 6. リアルタイム同期設計

### 6.1 Y.js CRDT戦略

Y.js の `Y.Map` を使い、タスクIDをキー・Task オブジェクトをバリューとするネスト構造を採用する。

```typescript
// Y.js Document構造
const ydoc = new Y.Doc();
const yTasks = ydoc.getMap<Task>('tasks');  // key: taskId, value: Task
const yMeta  = ydoc.getMap('meta');          // key: "updatedAt" 等のメタ情報
```

### 6.2 操作フロー

| 操作 | Y.js呼び出し |
|------|-------------|
| 作成 | `yTasks.set(task.id, task)` |
| 更新 | `yTasks.set(task.id, { ...yTasks.get(task.id), ...patch })` |
| 削除 | `yTasks.delete(task.id)` |
| 変更検知 | `yTasks.observe(event => { /* Zustandストア更新 */ })` |

### 6.3 Hocuspocusサーバー設定 (`ws/src/index.ts`)

```typescript
import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

Server.configure({
  port: 4001,
  extensions: [
    new SQLite({ database: '/data/taskflow.db' }),
  ],
  async onAuthenticate(data) {
    // Phase 2: LDAPトークン検証をここに実装
    return true; // Phase 1は常に許可
  },
  async onStoreDocument(data) {
    // Y.jsスナップショットをSQLiteに永続化
    // Fastify APIの /ws/store に投げてもよい
  },
}).listen();
```

### 6.4 フロントエンド接続 (`hooks/useYjs.ts`)

```typescript
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';

export function useYjs(projectId: string) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const provider = useMemo(() =>
    new HocuspocusProvider({
      url: `ws://localhost:4001`,
      name: projectId,   // ドキュメント名 = プロジェクトID
      document: ydoc,
    }), [projectId]);

  const yTasks = ydoc.getMap<Task>('tasks');
  return { ydoc, provider, yTasks };
}
```

---

## 7. フロントエンド設計

### 7.1 状態管理

Zustand ストアを使用する。Y.js の `observe` で変更を受信し、ストアを更新することでUIに反映する。

```typescript
// store/taskStore.ts
interface TaskStore {
  tasks:      Task[];
  sortKey:    keyof Task | '';
  sortDir:    'asc' | 'desc';
  activeTab:  'todo' | 'gantt';
  setSortKey: (key: keyof Task) => void;
  setTasks:   (tasks: Task[]) => void;
}
```

### 7.2 ガントチャート実装仕様

#### 座標計算ロジック (`utils/ganttCalc.ts`)

```typescript
const DAY_WIDTH_PX = 28; // 1日あたりのピクセル幅
const ROW_HEIGHT_PX = 36;

export function dateToX(date: string, minDate: Date): number {
  const d = new Date(date);
  return Math.round((d.getTime() - minDate.getTime()) / 86400000) * DAY_WIDTH_PX;
}

export function calcGanttRange(tasks: Task[]): { min: Date; max: Date } {
  // 全タスクのstartDate/endDateを収集してパディング付きで返す
  // min: 最小日付 -3日, max: 最大日付 +5日
}
```

#### イナズマライン (Lightning Line) の定義

イナズマラインはプロジェクトの「計画基準日」を示す縦線である。
具体的には「完了していないタスクの中で最も早い `startDate`」のX座標に描画する。

| 線の種類 | 色 | 表示条件 |
|---------|-----|---------|
| 今日ライン | `#E24B4A`（赤） | 常に表示 |
| イナズマライン | `#D4537E`（ピンク） | 未完了タスクが存在する場合のみ |

#### 依存関係矢印の描画

先行タスクの右端から後続タスクの左端へ、SVGのベジェ曲線（cubic-bezier）で結ぶ。

```typescript
// DependencyArrow.tsx
// d={`M${x1},${y1} C${x1+30},${y1} ${x2-30},${y2} ${x2},${y2}`}
// stroke='#378ADD' strokeWidth={1.5} markerEnd='url(#arrowhead)'
```

### 7.3 並び替え仕様

| ソートキー | 対象フィールド | 備考 |
|-----------|--------------|------|
| タイトル | `title` | ロケール昇順 |
| ステータス | `status` | `todo→wip→done→wait` の固定順 |
| 担当者 | `assignee` | ロケール昇順 |
| 開始日 | `startDate` | 日付昇順、null末尾 |
| 終了日 | `endDate` | 日付昇順、null末尾 |
| デフォルト | `order` | DBの `ord` フィールド順 |

> ※ ソートはフロントエンドのメモリ上で行い、APIへの問い合わせは不要。

### 7.4 コンポーネント責務一覧

| コンポーネント | 責務 |
|--------------|------|
| `Toolbar` | タブ切替・ソート選択・Import/Export・タスク追加ボタン |
| `TodoList` | タスク一覧テーブル。ソート済み `tasks[]` を受け取り表示 |
| `TaskRow` | 1行分。セルクリックでインライン編集またはモーダル起動 |
| `GanttChart` | 日付ヘッダー・バーエリアのスクロールコンテナ管理 |
| `GanttBar` | 1タスク分のバー。クリックでモーダル起動 |
| `DependencyArrow` | SVGで矢印描画。props: `fromTask`, `toTask`, `minDate` |
| `LightningLine` | イナズマラインSVG縦線 |
| `TaskModal` | 新規作成・編集フォーム。先行タスクのmulti-select含む |

---

## 8. Docker / インフラ構成

### 8.1 `docker-compose.yml`（開発）

```yaml
version: '3.9'
services:
  frontend:
    build: ./frontend
    ports:
      - '3000:3000'
    volumes:
      - ./frontend/src:/app/src
    environment:
      - VITE_API_URL=http://localhost:4000
      - VITE_WS_URL=ws://localhost:4001
    depends_on: [api, ws]

  api:
    build: ./api
    ports:
      - '4000:4000'
    volumes:
      - ./api/data:/app/data  # SQLiteファイル永続化
    environment:
      - DB_PATH=/app/data/taskflow.db
      - PORT=4000
      - LDAP_ENABLED=false

  ws:
    build: ./ws
    ports:
      - '4001:4001'
    volumes:
      - ./api/data:/data  # apiと同じボリュームを共有
    environment:
      - WS_PORT=4001
```

### 8.2 各Dockerfile（共通パターン）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE <PORT>
CMD ["node", "dist/index.js"]
```

### 8.3 環境変数一覧

| 変数名 | サービス | デフォルト | 説明 |
|--------|---------|-----------|------|
| `VITE_API_URL` | frontend | `http://localhost:4000` | REST APIのURL |
| `VITE_WS_URL` | frontend | `ws://localhost:4001` | WebSocketのURL |
| `DB_PATH` | api | `/app/data/taskflow.db` | SQLiteファイルパス |
| `PORT` | api | `4000` | APIポート |
| `WS_PORT` | ws | `4001` | WebSocketポート |
| `LDAP_ENABLED` | api | `false` | LDAP認証の有効化フラグ |
| `LDAP_URL` | api | （未設定） | `ldap://...` 形式 |
| `LDAP_BASE_DN` | api | （未設定） | LDAP検索ベースDN |

---

## 9. 認証設計（将来拡張）

### 9.1 方針

Phase 1リリースでは認証を無効化し、`LDAP_ENABLED=false` で動作する。
Phase 2でLDAP認証を有効化できるよう、プラグイン構造で実装する。

### 9.2 Phase 2 LDAP認証フロー

1. ユーザーが ID / Password を入力
2. Fastify API が `ldapjs` を使い `LDAP_URL` に bind 試行
3. 成功したら JWT（HS256, 24h有効）を発行、クッキーに設定
4. 以降のAPIリクエストは `Authorization: Bearer <JWT>` ヘッダーで認証
5. Hocuspocusの `onAuthenticate` でも同JWTを検証

### 9.3 認証プラグインの実装位置

```typescript
// api/src/plugins/auth.ts
export async function authPlugin(fastify: FastifyInstance) {
  if (process.env.LDAP_ENABLED !== 'true') {
    // 認証バイパス: リクエストにguestユーザーを付与
    fastify.addHook('preHandler', async (req) => {
      req.user = { id: 'guest', name: 'Guest' };
    });
    return;
  }
  // LDAP認証の実装（Phase 2）
  // 1. POST /auth/login でldapjs bind
  // 2. 成功したらfast-jwt でJWT発行
  // 3. fastify.addHook で全ルートにJWT検証を追加
}
```

---

## 10. 依存パッケージ

### 10.1 frontend

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `react` | ^18.3 | UIフレームワーク |
| `typescript` | ^5.4 | 型安全 |
| `vite` | ^5.2 | ビルドツール |
| `yjs` | ^13.6 | CRDT同期 |
| `@hocuspocus/provider` | ^2.13 | WebSocketプロバイダー |
| `zustand` | ^4.5 | 状態管理 |
| `dayjs` | ^1.11 | 日付操作 |
| `uuid` | ^10 | UUID生成 |
| `papaparse` | ^5.4 | CSV Parse/Stringify |

### 10.2 api

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `fastify` | ^4.27 | HTTPサーバー |
| `better-sqlite3` | ^9.4 | SQLiteドライバー |
| `@fastify/cors` | ^9.0 | CORSミドルウェア |
| `uuid` | ^10 | UUID生成 |
| `ldapjs` | ^3.0 | LDAP認証（Phase 2） |
| `fast-jwt` | ^3.3 | JWT発行・検証（Phase 2） |

### 10.3 ws

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `@hocuspocus/server` | ^2.13 | WebSocket + CRDT管理 |
| `@hocuspocus/extension-sqlite` | ^2.13 | Y.jsスナップショットSQLite保存 |

---

## 11. 実装フェーズ

| Phase | 内容 | 成果物 |
|-------|------|--------|
| Phase 1-A | Docker環境構築・Fastify + SQLite CRUD | APIが動作するコンテナ |
| Phase 1-B | React雛形・TodoListビュー・Zustand | タスクCRUD UI |
| Phase 1-C | Y.js + Hocuspocus接続・リアルタイム同期 | 同時編集動作確認 |
| Phase 1-D | ガントチャート・依存矢印・イナズマライン | ガント表示完成 |
| Phase 1-E | Import/Export (JSON/CSV) | ファイルI/O |
| Phase 2 | LDAP認証組み込み | 認証付き本番稼働 |

---

## 12. 非機能要件

| 項目 | 目標値 | 手段 |
|------|--------|------|
| 同時接続数 | 最大10名 | Hocuspocus / Node.js |
| レスポンス（REST） | 95%ile < 100ms | SQLite インデックス |
| リアルタイム遅延 | < 200ms | Y.js CRDT + WebSocket |
| データ保全 | WALモード有効 | `PRAGMA journal_mode=WAL` |
| バックアップ | 手動 / cronによるSQLiteコピー | Dockerボリュームマウント |
