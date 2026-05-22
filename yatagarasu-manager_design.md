# TaskFlow — タスク管理システム 設計書

| 項目 | 内容 |
|------|------|
| バージョン | 1.8 |
| 作成日 | 2026年5月 |
| 対象読者 | 開発者・アーキテクト |
| ステータス | レビュー済みドラフト |

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025年 | 初版作成 |
| 1.1 | 2026年5月 | CRDT構造修正・サービス統合・データモデル拡張・ガントチャート改善・Prisma Studio評価 |
| 1.2 | 2026年5月 | Docker構築フェーズを除外（既存Docker環境で開発）・Section 8をインフラ参照に縮小 |
| 1.3 | 2026年5月 | 親タスク追加・インライン編集・分割レイアウト・フィルタUX改善・ガント3ヶ月表示・リアルタイム同期修正 |
| 1.4 | 2026年5月 | CSVインポート対応・統合ガントビュー（MSProject風左固定列+タイムライン同一行）・TodoList分離廃止 |
| 1.5 | 2026年5月 | Y.js主体アーキテクチャへ刷新・リアルタイム同期修正・競合解決UI・フロントエンドテスト追加 |
| 1.6 | 2026年5月 | リアルタイム同期根本修正（onAuthenticate削除・updateTask REST化）・リロード時タスク消失修正・ガント末行クイック追加・表示期間コントロール追加 |
| 1.7 | 2026年5月 | ガント行ズレ修正・親タスク進捗自動計算（子平均・編集不可）・イナズマラインON/OFF・マルチレベルヘッダー（年/月/週/日個別トグル）・接続バッジアイコン改善 |
| 1.8 | 2026年5月 | ステータス表示ラベル変更（wip→Doing・done→DONE）・フィルタに「DONE以外」追加 |

---

## 目次

1. [はじめに](#1-はじめに)
2. [システム概要](#2-システム概要)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [データモデル](#4-データモデル)
5. [REST API設計](#5-rest-api設計)
6. [リアルタイム同期設計](#6-リアルタイム同期設計)
7. [フロントエンド設計](#7-フロントエンド設計)
8. [インフラ参照](#8-インフラ参照)
9. [認証設計（将来拡張）](#9-認証設計将来拡張)
10. [依存パッケージ](#10-依存パッケージ)
11. [実装フェーズ](#11-実装フェーズ)
12. [非機能要件](#12-非機能要件)
13. [Prisma Studio 採用評価](#13-prisma-studio-採用評価)

---

## 1. はじめに

### 1.1 目的

本書はTaskFlowのシステム設計を記述する。本設計書を読めばそのまま実装に着手できる粒度を目指す。

### 1.2 スコープ

- TODOリスト・ガントチャートによるタスク管理
- タスク優先度（4段階）・進捗率管理
- 先行・後続タスクの依存関係管理
- イナズマライン表示（実績と計画の境界線）
- 担当者・ステータス・優先度等による並び替え・フィルタリング
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

**v1.1変更点:** `api` サービスと `ws` サービスを統合した。SQLiteファイルを2プロセスが共有することによる書き込み競合を排除し、コンテナ構成を簡素化する。

| レイヤー | 技術 | 役割 |
|----------|------|------|
| フロントエンド | React 18 + TypeScript + Vite | UI・ガントチャート・CRDT操作 |
| リアルタイム同期 | Y.js (CRDT) + Hocuspocus | WebSocket経由のリアルタイム共同編集 |
| バックエンドAPI | Node.js 20 + Fastify | REST API・認証スタブ・Hocuspocus統合 |
| 永続化 | SQLite (better-sqlite3) | タスクデータ・Y.jsスナップショット保存 |
| コンテナ | Docker + docker-compose | サービス分離・ポート管理 |

### 2.2 コンテナ構成

`docker-compose.yml` で以下の **2サービス** を定義する（v1.0の3サービスから統合）。

| サービス名 | イメージ | ポート | 役割 |
|-----------|---------|--------|------|
| frontend | node:20-alpine (build) / nginx (prod) | 3000:3000 | Vite dev / Nginx static |
| api | node:20-alpine | 4000:4000, 4001:4001 | Fastify REST API + Hocuspocus WebSocket + SQLite |

> ※ v1.0 では `ws` サービスが `api/data` ボリュームを直接共有していたが、同一SQLiteファイルへの並行書き込みは WAL モードでも競合リスクがある。v1.1 では Hocuspocus を Fastify プロセスに統合し、単一プロセスから SQLite に書き込む構成とした。

### 2.3 データフロー（★v1.6 更新）

**真の状態は Y.js ドキュメント。tasks テーブルは Y.js の写し（キャッシュ）。**

**【インライン更新】ブラウザ → Y.js + REST 二重書き込み（★v1.6変更）**
```
useTasks.updateTask()
  ├─ Y.js: yTask.set(field, value)  → ローカルUI即時反映
  │    → observeDeep → setTasks（このブラウザ）
  └─ REST: PATCH /tasks/:id → DB更新 + syncToYjs(openDirectConnection)
         → Hocuspocus が他の全接続ブラウザへブロードキャスト
         → 他ブラウザの observeDeep → setTasks
```

> **v1.5からの変更：** v1.5では `updateTask` が Y.js のみ書き込んでいた。これだと `onStoreDocument` 経由でDBに保存されるが、Hocuspocus から他ブラウザへのブロードキャストが安定しない問題があった。v1.6では REST PATCH も呼び `syncToYjs` でブロードキャストを確実に行う。

**【タスク作成・削除】REST API 経由（ID生成・カスケード削除のため）**
```
REST POST/DELETE → tasks テーブル更新
  → syncToYjs(openDirectConnection) → Y.js 更新
  → Hocuspocus が全接続ブラウザへブロードキャスト
```

**【ブラウザ接続時の初期化】（★v1.6変更）**
```
プロジェクト選択 / ページロード
  → REST GET /projects/:id/tasks → DB から即座に取得 → setTasks（表示）
  → Y.js に不足タスクがあれば yTasks に追加（リアルタイム同期のため）
```

> **v1.5からの変更：** v1.5では `synced` フラグを待ってから表示していた。`'_none'` プロジェクトの `synced=true` が誤って先行し、実プロジェクトのタスクが消失する競合が発生していた。v1.6では `[currentProject?.id]` を依存にして REST fetch を即時実行し、Y.js の sync 状態に依存しない。

**【Hocuspocus 起動時の復元】**
```
onLoadDocument: @hocuspocus/extension-sqlite がバイナリ復元
  → それでも空なら tasks テーブルからブートストラップ
```

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
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   └── task.ts           # 共通型定義
│       ├── store/
│       │   ├── yjsStore.ts       # Y.js Document管理
│       │   ├── taskStore.ts      # Zustandストア（タスク・ソート・ズーム）
│       │   └── connectionStore.ts # WebSocket接続状態
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
│       │   ├── Toolbar/
│       │   │   └── Toolbar.tsx
│       │   └── ConnectionBadge/
│       │       └── ConnectionBadge.tsx  # 接続状態表示
│       ├── hooks/
│       │   ├── useYjs.ts         # Y.js接続フック
│       │   └── useTasks.ts       # タスク操作フック
│       └── utils/
│           ├── ganttCalc.ts      # ガントチャート計算・ズームレベル
│           ├── importExport.ts   # Import/Export
│           └── sort.ts           # 並び替え・フィルタロジック
└── api/
    ├── Dockerfile
    ├── package.json
    ├── src/
    │   ├── index.ts              # Fastify + Hocuspocus サーバー起動
    │   ├── db/
    │   │   ├── client.ts         # better-sqlite3接続・WAL設定
    │   │   └── migrations/
    │   │       ├── 001_init.sql
    │   │       └── 002_parent.sql    # ★v1.3: parent_id カラム追加
    │   ├── routes/
    │   │   ├── health.ts         # GET /health
    │   │   ├── tasks.ts          # タスクCRUD・並び替え・フィルタ
    │   │   ├── projects.ts       # プロジェクトCRUD
    │   │   └── importExport.ts   # Import/Export
    │   ├── services/
    │   │   ├── taskService.ts
    │   │   └── authService.ts    # LDAPスタブ
    │   ├── ws/
    │   │   ├── hocuspocus.ts          # Hocuspocusサーバー設定（apiプロセスに統合）
    │   │   └── hocuspocusHandlers.ts  # onLoadDocument / onStoreDocument ロジック
    │   └── plugins/
    │       └── auth.ts           # 認証プラグイン（将来用）
    └── data/
        └── taskflow.db           # SQLiteファイル（永続化）
```

---

## 4. データモデル

### 4.1 型定義 (TypeScript)

`frontend/src/types/task.ts` に定義する。すべてのコンポーネントがこの型を参照する。

```typescript
export type TaskStatus   = 'todo' | 'wip' | 'done' | 'wait';
// ★v1.8: 表示ラベル — todo:'TODO' / wip:'Doing' / done:'DONE' / wait:'待機'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type ZoomLevel    = 'day' | 'week' | 'month';

export interface Task {
  id:           string;        // UUID v4
  projectId:    string;        // 所属プロジェクトID
  parentId:     string | null; // 親タスクID（null = ルートタスク）★v1.3追加
  title:        string;        // タイトル（必須, max 200文字）
  summary:      string;        // 1行サマリ（旧 detail）
  description:  string;        // 長文説明（Markdown可）
  status:       TaskStatus;
  priority:     TaskPriority;  // 優先度
  progress:     number;        // 進捗率 0–100
  assignee:     string;        // 担当者名
  startDate:    string | null; // ISO 8601 date (YYYY-MM-DD)
  endDate:      string | null; // ISO 8601 date (YYYY-MM-DD)
  predecessors: string[];      // 先行タスクID配列
  order:        number;        // 表示順
  createdAt:    string;        // ISO 8601 datetime
  updatedAt:    string;        // ISO 8601 datetime
}

// APIレスポンス専用: successors は task_deps JOIN で計算して付与する
export type TaskWithSuccessors = Task & { successors: string[] };

export interface Project {
  id:        string;
  name:      string;
  createdAt: string;
}
```

> **v1.0からの変更点**
> - `detail` → `summary` にリネーム（役割を明確化）
> - `successors` を `Task` から除外。後続タスクはDB側で計算する派生値であり、`Task` 本体に含めると Y.js 経由で保存・更新する際に整合性が崩れる。APIレスポンスには `TaskWithSuccessors` を使用する。
> - `priority`・`progress` フィールドを追加
> - `ZoomLevel` 型を追加（ガントチャートのズーム管理に使用）
>
> **v1.3追加**
> - `parentId` フィールド追加。ツリー構造タスクを実現する。循環参照防止はアプリケーション層で担保する。

### 4.2 SQLiteスキーマ

マイグレーションは `api/src/db/client.ts` 起動時に順に実行される。既存カラムの追加は `try/catch` でべき等に処理する。

**`001_init.sql`** — 初期スキーマ

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo','wip','done','wait')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK(priority IN ('critical','high','medium','low')),
  progress    INTEGER NOT NULL DEFAULT 0
              CHECK(progress BETWEEN 0 AND 100),
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

CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at ...;
CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(project_id, assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_dates    ON tasks(project_id, start_date, end_date);
```

**`002_parent.sql`** — 親タスク対応（★v1.3追加）

```sql
ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
```

> 親タスクが削除された場合、子タスクの `parent_id` は `NULL` にリセットされる（CASCADE削除ではなくルートへの昇格）。
>
> ※ `successors` は `task_deps` を JOIN して計算するためDBには保存しない。
> ※ `PRAGMA journal_mode = WAL` と `PRAGMA foreign_keys = ON` は `client.ts` で接続時にも実行する。

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
| GET | `/health` | ヘルスチェック（Docker healthcheck用） |
| GET | `/projects` | プロジェクト一覧取得 |
| POST | `/projects` | プロジェクト作成 |
| DELETE | `/projects/:id` | プロジェクト削除（タスク含むCASCADE） |
| GET | `/projects/:id/tasks` | タスク一覧取得（deps含む）※フィルタ対応 |
| POST | `/projects/:id/tasks` | タスク作成 |
| PATCH | `/projects/:id/tasks/reorder` | タスク並び替え（`ord` 一括更新） |
| GET | `/tasks/:id` | タスク単体取得 |
| PATCH | `/tasks/:id` | タスク部分更新 |
| DELETE | `/tasks/:id` | タスク削除 |
| POST | `/projects/:id/import` | JSONインポート |
| GET | `/projects/:id/export/json` | JSONエクスポート |
| GET | `/projects/:id/export/csv` | CSVエクスポート |

> ※ v1.0 にあった `POST /ws/store`（内部永続化コールバック）は削除。Hocuspocus が `api` プロセスに統合されたため不要。

### 5.3 タスク一覧取得 `GET /projects/:id/tasks`

クエリパラメータでフィルタリング可能。

```
GET /projects/:id/tasks?status=todo&assignee=田中&priority=high&limit=100&offset=0
```

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `status` | TaskStatus | ステータスでフィルタ |
| `assignee` | string | 担当者名でフィルタ（部分一致） |
| `priority` | TaskPriority | 優先度でフィルタ |
| `limit` | number | 取得件数（デフォルト: 500） |
| `offset` | number | オフセット（デフォルト: 0） |

**レスポンス 200**

```json
{
  "tasks": [ ...TaskWithSuccessors[] ],
  "total": 42
}
```

### 5.4 タスク作成 `POST /projects/:id/tasks`

**リクエストボディ**

```json
{
  "parentId":     "uuid-parent",
  "title":        "フロントエンド実装",
  "summary":      "React + TypeScript",
  "description":  "## 詳細\n...",
  "status":       "todo",
  "priority":     "high",
  "progress":     0,
  "assignee":     "田中",
  "startDate":    "2025-05-01",
  "endDate":      "2025-05-15",
  "predecessors": ["uuid-1", "uuid-2"]
}
```

> `parentId` は省略または `null` でルートタスクとして登録される。`PATCH /tasks/:id` でも同様に更新可能。

**レスポンス 201**

```json
{ "task": { ...TaskWithSuccessors } }
```

### 5.5 並び替え `PATCH /projects/:id/tasks/reorder`

ドラッグ&ドロップ操作後に複数タスクの `ord` を一括更新する。

```json
{
  "orders": [
    { "id": "uuid-1", "order": 0 },
    { "id": "uuid-2", "order": 1 },
    { "id": "uuid-3", "order": 2 }
  ]
}
```

### 5.6 Import / Export仕様

**JSON形式**

```json
{
  "version":    "1.1",
  "exportedAt": "2026-05-01T12:00:00Z",
  "project":    { "id": "...", "name": "..." },
  "tasks":      [ ...Task[] ]
}
```

> ※ インポート時に同一 `id` のタスクが存在する場合は上書き更新、存在しない場合は新規作成（upsert）とする。

**CSV形式（列順固定）**

```
id, parentId, title, summary, description, status, priority, progress, assignee, startDate, endDate, predecessors
```

> ※ `predecessors` はセミコロン区切りのIDリスト。例: `"uuid-1;uuid-2"`
> ※ `parentId` は空文字または省略でルートタスク（親なし）。
> ※ **★v1.4：** インポート時に `.csv` 拡張子のファイルを選択すると `importFromCsv()` が呼ばれ、JSONと同様に `/projects/:id/import` エンドポイントへ送信される。ファイル選択ダイアログは `.json,.csv` の両形式を受け付ける。

---

## 6. リアルタイム同期設計

### 6.1 Y.js CRDT戦略

**v1.0の問題点:** `Y.Map<Task>` にプレーンオブジェクトを格納すると、2ユーザーが同一タスクの異なるフィールドを同時編集した場合に **後発の変更がオブジェクト全体を上書き** し、先発の編集が消失する。これはCRDTの利点を活かせていない。

**v1.1の修正:** タスクごとに `Y.Map` をネストさせ、フィールド単位でCRDTマージが行われるようにする。

```typescript
// Y.js Document構造
const ydoc  = new Y.Doc();
const yTasks = ydoc.getMap<Y.Map<unknown>>('tasks'); // key: taskId, value: Y.Map
const yMeta  = ydoc.getMap<string>('meta');
```

### 6.2 操作フロー

```typescript
// 作成
ydoc.transact(() => {
  const yTask = new Y.Map<unknown>();
  Object.entries(task).forEach(([k, v]) => yTask.set(k, v));
  yTasks.set(task.id, yTask);
});

// フィールド単位の更新（他フィールドへの影響なし）
ydoc.transact(() => {
  yTasks.get(task.id)?.set('status', newStatus);
  yTasks.get(task.id)?.set('progress', newProgress);
});

// 削除
ydoc.transact(() => {
  yTasks.delete(task.id);
});

// 変更検知 → Zustandストア更新
yTasks.observeDeep(() => {
  const tasks = Array.from(yTasks.entries()).map(([, yTask]) =>
    Object.fromEntries(yTask.entries()) as Task
  );
  useTaskStore.getState().setTasks(tasks);
});
```

> **なぜ `transact` で囲むか:** 複数フィールドの更新を単一のアンドゥ操作として扱うため。`transact` 外で複数の `set` を呼ぶと、各 `set` が独立したCRDT操作となり、他クライアントへの送信粒度が細かくなりすぎる。

### 6.3 Hocuspocusサーバー設定（`api` に統合）

`api/src/ws/hocuspocus.ts` で設定し、`api/src/index.ts` でFastifyと同一プロセス内に起動する。

```typescript
// api/src/ws/hocuspocus.ts
import { Server } from '@hocuspocus/server';
import { SQLite } from '@hocuspocus/extension-sqlite';

export const hocuspocus = Server.configure({
  port: parseInt(process.env.WS_PORT ?? '4001', 10),
  extensions: [
    new SQLite({ database: process.env.DB_PATH ?? '/app/data/taskflow.db' }),
  ],
  async onLoadDocument({ document, documentName }) {
    await handleLoadDocument(document, documentName, db);
  },
  async onStoreDocument({ document, documentName }) {
    await handleStoreDocument(document, documentName, db);
  },
  // onAuthenticate は定義しない（★v1.6修正）
  // Hocuspocus の仕様: onAuthenticate を定義するとクライアントに AUTH メッセージ送信を
  // 要求するプロトコルが有効化される。定義しない場合は認証なしで接続を受け付ける。
  // Phase 2 で LDAP 認証を実装する際に追加する。
});
```

```typescript
// api/src/index.ts（起動部分）
import Fastify from 'fastify';
import { hocuspocus } from './ws/hocuspocus.js';

const fastify = Fastify();
// ... プラグイン・ルート登録 ...

await fastify.listen({ port: 4000, host: '0.0.0.0' });
hocuspocus.listen(); // 4001ポートでWebSocket起動
```

### 6.4 フロントエンド接続 (`hooks/useYjs.ts`)

**★v1.3変更：React 18 StrictMode によるリアルタイム同期バグ修正**

React 18 StrictMode は開発環境でエフェクトを二重実行する。旧実装では `useMemo` で作成した `HocuspocusProvider` が `useEffect` クリーンアップ時に `destroy()` され、2度目の実行時には切断済みのプロバイダーが使われたまま再接続されない問題があった。

**修正方針：** `provider`/`ydoc` をモジュールレベルキャッシュ（`Map`）に保持し、`useEffect` クリーンアップでは destroy しない。`projectId` 変更時のみ旧インスタンスを破棄して新規生成する。

```typescript
// モジュールレベルキャッシュ（StrictMode二重実行対策）
const instanceCache = new Map<string, { ydoc, provider, yTasks }>();

function getOrCreate(projectId: string) {
  if (instanceCache.has(projectId)) return instanceCache.get(projectId)!;
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({ url: WS_URL, name: projectId, document: ydoc, ... });
  instanceCache.set(projectId, { ydoc, provider, yTasks: ydoc.getMap('tasks') });
  return instanceCache.get(projectId)!;
}

export function useYjs(projectId: string) {
  const instanceRef = useRef(getOrCreate(projectId));
  if (instanceRef.current.projectId !== projectId) {
    instanceRef.current = getOrCreate(projectId);
  }
  useEffect(() => {
    const { yTasks } = instanceRef.current;
    const handler = () => { /* yTasks → setTasks */ };
    yTasks.observeDeep(handler);
    return () => yTasks.unobserveDeep(handler); // destroyしない
  }, [projectId]);
  return instanceRef.current;
}
```

> ※ Y.js はオフライン中の操作をバッファリングし、再接続時に自動マージする。`ConnectionBadge` コンポーネントで接続状態を常時表示することを推奨する。

---

## 7. フロントエンド設計

### 7.1 状態管理

Zustand ストアを用途別に分割する。Y.js の `observeDeep` で変更を受信し `taskStore` を更新することでUIに反映する。

**★v1.3変更：** `activeTab`（TodoList / Gantt の切替状態）を削除。画面は常に分割レイアウトで両方を表示する。

```typescript
// store/taskStore.ts
interface TaskStore {
  tasks:              Task[];
  sortKey:            keyof Task | '';
  sortDir:            'asc' | 'desc';
  filterStatus:       TaskStatus | '' | '!done'; // ★v1.8: '!done' = DONE以外をすべて表示
  filterAssignee:     string;
  filterPriority:     string;
  zoomLevel:          ZoomLevel;     // ガントチャートのズームレベル
  ganttStartDate:     string;        // ガント表示開始日（'' = 自動）
  ganttPeriod:        GanttPeriod;   // ガント表示期間（デフォルト '3m'）
  showLightningLine:  boolean;       // ★v1.7: イナズマライン表示ON/OFF（デフォルト: true）
  ganttHeaderLevels:  {              // ★v1.7: ガントヘッダー表示レベル
    year:  boolean;                  //   年行（デフォルト: true）
    month: boolean;                  //   月行（デフォルト: true）
    week:  boolean;                  //   週行（デフォルト: true）
    day:   boolean;                  //   日行（デフォルト: true）
  };
  setSortKey:             (key: keyof Task) => void;
  setTasks:               (tasks: Task[]) => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority'>>) => void;
  setZoomLevel:           (z: ZoomLevel) => void;
  setGanttRange:          (startDate: string, period: GanttPeriod) => void;
  setShowLightningLine:   (show: boolean) => void;                          // ★v1.7
  setGanttHeaderLevels:   (levels: Partial<TaskStore['ganttHeaderLevels']>) => void; // ★v1.7
}

// store/connectionStore.ts
interface ConnectionStore {
  status: 'connected' | 'connecting' | 'disconnected';
  setStatus: (s: ConnectionStore['status']) => void;
}
```

### 7.2 ガントチャート実装仕様

#### 行高さ・アライメント仕様（★v1.7修正）

左固定列の各行と右SVGの行が1:1で対応する。ズレを防ぐため以下のルールを守る。

| 要素 | 高さの決め方 |
|------|------------|
| `GanttLeftRow` 外側 div | `height: ROW_HEIGHT_PX`（明示）・`overflow: hidden`・border は box-sizing: border-box 内に収める |
| `GanttLeftRow` 内 CELL div | `height: ROW_HEIGHT_PX; boxSizing: 'border-box'; borderBottom: 1px` |
| SVG 縞背景 rect | `y={i * ROW_HEIGHT_PX}; height={ROW_HEIGHT_PX}` |
| SVG ガントバー | `y={rowIndex * ROW_HEIGHT_PX + 4}` |

> **v1.5までの不具合：** 外側 div に `borderBottom: 1px` を付けたまま高さを明示しなかったため、div の実高さが ROW_HEIGHT_PX + 1px になり行が増えるほどズレが累積していた。

#### 親タスク進捗率の自動計算（★v1.7追加）

- **子タスクを持つタスク（親タスク）**: 進捗率 = 直接の子タスク群の進捗率の算術平均（再帰計算）。小数点以下切り捨て。UI上で編集不可（グレーアウト）。
- **子タスクを持たないタスク（リーフタスク）**: 進捗率は手動入力可能（従来通り）。

```
親タスクA の progress = round(
  (子A-1.progress + 子A-2.progress + ...) / 子の数
)
子A-1 も親なら再帰的に計算
```

計算はフロントエンドの表示時のみ行う。DBへの保存は行わない（派生値）。`GanttChart` で事前計算した `Map<taskId, effectiveProgress>` を `GanttLeftRow` に渡す。

#### ズームレベルと座標計算 (`utils/ganttCalc.ts`)

```typescript
import type { ZoomLevel, Task } from '../types/task';

// ★v1.6追加: 表示期間の定義
export type GanttPeriod = '2w' | '1m' | '3m' | '6m';
export const PERIOD_DAYS: Record<GanttPeriod, number> = {
  '2w': 14, '1m': 30, '3m': 91, '6m': 183,
};

export const ZOOM_CONFIG: Record<ZoomLevel, { dayWidth: number; headerFormat: string }> = {
  day:   { dayWidth: 28, headerFormat: 'M/D' },   // 1日 = 28px
  week:  { dayWidth: 8,  headerFormat: '[W]w' },  // 1日 = 8px（週単位ヘッダー）
  month: { dayWidth: 3,  headerFormat: 'YYYY-MM' },
};

export const ROW_HEIGHT_PX = 36;

export function dateToX(date: string, minDate: Date, zoom: ZoomLevel): number {
  const { dayWidth } = ZOOM_CONFIG[zoom];
  const d = new Date(date);
  return Math.round((d.getTime() - minDate.getTime()) / 86400000) * dayWidth;
}

// ★v1.6変更: startDate（手動モード）と period（表示幅）を追加
// 手動モード: startDate が指定された場合は startDate + period の固定範囲
// 自動モード: タスク日付から範囲を計算し、最低でも period 分の幅を確保
export function calcGanttRange(
  tasks: Task[],
  startDate?: string,
  period?: GanttPeriod,
): { min: Date; max: Date } {
  const today = Date.now();
  const periodDays = period ? PERIOD_DAYS[period] : 91;

  if (startDate) {
    const minTime = new Date(startDate).getTime();
    return { min: new Date(minTime), max: new Date(minTime + periodDays * 86400000) };
  }

  const dates = tasks.flatMap(t => [t.startDate, t.endDate]).filter(Boolean) as string[];
  let minTime: number;
  let maxTime: number;

  if (dates.length === 0) {
    minTime = today - 7 * 86400000;
    maxTime = minTime + periodDays * 86400000;
  } else {
    const times = dates.map(d => new Date(d).getTime());
    minTime = Math.min(...times) - 3 * 86400000;
    const taskMaxEnd = Math.max(...times) + 5 * 86400000;
    // タスク範囲が period より短くても最低 period 分の幅を確保
    maxTime = Math.max(taskMaxEnd, minTime + periodDays * 86400000);
  }

  return { min: new Date(minTime), max: new Date(maxTime) };
}
```

#### マルチレベルガントヘッダー（★v1.7追加）

ヘッダーは **年 / 月 / 週 / 日** の最大4行で構成し、各行を個別に ON/OFF できる。

| ヘッダー行 | ラベル例 | セル境界 |
|----------|---------|---------|
| 年 (year) | `2026` | 1月1日ごと |
| 月 (month) | `2026-05` | 月初ごと |
| 週 (week) | `W21` | 月曜日ごと |
| 日 (day) | `22` | 1日ごと |

- デフォルトは全4行表示
- 1行あたりの高さ: `HEADER_ROW_H = 26px`
- `ganttHeaderLevels` の有効行数 × 26px = 合計ヘッダー高さ（`position: sticky; top: 0`）
- 非表示にしたい行は Toolbar のトグルボタンで切り替え

#### イナズマライン (Lightning Line) の定義

**v1.0の問題点:** 「未完了タスクの中で最も早い `startDate`」だとプロジェクト開始直後は全タスクが未完了のため常に最初のタスク位置を示し、意味を持たない。

**v1.1の定義（実績と計画の境界線）:**

| 線の種類 | 色 | X座標 | 表示条件 |
|---------|-----|-------|---------|
| 今日ライン | `#E24B4A`（赤） | 今日の日付 | 常に表示 |
| イナズマライン | `#D4537E`（ピンク） | `done` タスクの最大 `endDate` と `wip/todo` タスクの最小 `startDate` の中間 | 完了・未完了タスクが混在する場合のみ |

> イナズマラインが今日ラインより左にある場合は遅延傾向、右にある場合は進行良好を示す。

#### 依存関係矢印の描画

先行タスクの右端から後続タスクの左端へ、SVGのcubic-bezierで結ぶ。ズームレベルに応じてコントロールポイントのオフセットを調整する。

```typescript
// DependencyArrow.tsx
// d={`M${x1},${y1} C${x1+30},${y1} ${x2-30},${y2} ${x2},${y2}`}
// stroke='#378ADD' strokeWidth={1.5} markerEnd='url(#arrowhead)'
```

### 7.3 並び替え・フィルタリング仕様

**ソートキー**

| ソートキー | 対象フィールド | 備考 |
|-----------|--------------|------|
| タイトル | `title` | ロケール昇順 |
| ステータス | `status` | `todo→wip→done→wait` の固定順 |
| 優先度 | `priority` | `critical→high→medium→low` の固定順 |
| 担当者 | `assignee` | ロケール昇順 |
| 開始日 | `startDate` | 日付昇順、null末尾 |
| 終了日 | `endDate` | 日付昇順、null末尾 |
| 進捗率 | `progress` | 数値昇順 |
| デフォルト | `order` | DBの `ord` フィールド順 |

**フィルタリング:** ステータス・担当者・優先度をフロントエンドのメモリ上でフィルタリングする。APIへの追加問い合わせは不要。

**★v1.8 ステータスフィルタ選択肢:**

| 値 | 表示ラベル | 動作 |
|----|---------|------|
| `''` | すべて | フィルタなし |
| `'todo'` | TODO | status === 'todo' |
| `'wip'` | Doing | status === 'wip' |
| `'done'` | DONE | status === 'done' |
| `'wait'` | 待機 | status === 'wait' |
| `'!done'` | **DONE以外** | status !== 'done' |

> ソート・フィルタはいずれもフロントエンドのメモリ上で行う。

### 7.4 画面レイアウト（★v1.4変更）

**旧設計（v1.2以前）：** TODOリストとガントチャートを「タブ」で切り替える。一度に片方しか見えない。

**v1.3設計：** 左右分割レイアウト（TodoList 42% / GanttChart 58%）。常時両方表示。

**新設計（v1.4）：** 統合ガントビュー。TodoListを廃止し、GanttChart1コンポーネントが左固定列（タスク属性）と右スクロール可能なタイムライン（バー）を同一行で表示する。MSProjectライクなレイアウト。

```
┌──────────────────────────────────────────────────────────────────┐
│ ヘッダー（プロジェクト選択）                                        │
├──────────────────────────────────────────────────────────────────┤
│ Toolbar（フィルタ・ズーム・ガント期間コントロール・Import/Export・タスク追加）  │
├──────────────────────────────────────────────────────────────────┤
│ GanttChart（全幅）                                                │
│  ┌────── 左固定列 670px ──────┬─── 右スクロールタイムライン ────┐   │
│  │タイトル│ST│優先│進捗│担当│開始│終了│Del│     ■■■■■         │   │
│  │(180) │(66)│(56)│(76)│(76)│(88)│(88)│(40)│  今日線・依存矢印  │   │
│  │  ツリーインデント・インライン  │  Ganttバー・イナズマライン    │   │
│  │  編集・右クリックメニュー     │                              │   │
│  └──────────────────────────┴──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**CSS実装:** 外側1つの `overflow: auto` コンテナ内に、左パネルを `position: sticky; left: 0` で固定。JavaScriptによるスクロール同期は不要。

**★v1.6追加 — Toolbar ガント期間コントロール:**

| コントロール | 内容 |
|------------|------|
| 開始日ピッカー | `<input type="date">` で `ganttStartDate` を設定。入力なし（空欄）= 自動モード（タスク日付から自動計算） |
| 「今日」ボタン | 開始日未設定時に表示。クリックで今日を `ganttStartDate` にセット |
| 「✕」ボタン | 開始日設定中に表示。クリックで `ganttStartDate` をリセット（自動モードへ戻す） |
| 期間セレクト | 2週間 / 1ヶ月 / 3ヶ月 / 6ヶ月 を選択して `ganttPeriod` を設定 |

### 7.5 コンポーネント責務一覧

| コンポーネント | 責務 |
|--------------|------|
| `Toolbar` | フィルタ・ズーム選択・ガント期間コントロール・**★v1.7: イナズマラインON/OFFボタン・ガントヘッダー行トグルボタン（年/月/週/日）**・Import/Export・タスク追加ボタン |
| `ConnectionBadge` | WebSocket接続状態をアイコン＋テキストバッジで常時表示。**★v1.7: 状態別アイコン**: connected=WiFiアイコン(緑)・connecting=スピナーアニメーション(橙)・disconnected=WiFi✕アイコン(赤) |
| `TodoList` | **★v1.4廃止。** 機能は `GanttChart` の左固定列（`GanttLeftRow`）に統合された |
| `GanttLeftRow` | **★v1.4新規。** 統合ガントビューの1行分の左パネル。セルクリックでインライン編集、右クリックでコンテキストメニュー、`depth` による視覚的インデント |
| `GanttChart` | **★v1.4刷新。** 左固定列（`GanttLeftRow`）+ 右タイムライン（SVG）を1コンポーネントで統合管理。ツリー構造・折りたたみ状態も内包。**★v1.7: 行高さアライメント修正・マルチレベルヘッダー・親タスク進捗自動計算・イナズマラインON/OFF対応** |
| `QuickAddRow` | **★v1.6新規。** タスクリスト末尾に常時表示する空行。クリックで入力フィールド出現、Enter でタスク作成（`onQuickAdd` コールバック）、Escape でキャンセル。Excelライクな行追加体験を実現 |
| `GanttBar` | 1タスク分のバー。クリックでモーダル起動 |
| `DependencyArrow` | SVGで矢印描画。props: `fromTask`, `toTask`, `minDate`, `zoom` |
| `LightningLine` | イナズマラインSVG縦線 |
| `TaskModal` | 新規作成・編集フォーム。**★親タスク選択セレクト**・先行タスクのmulti-select・進捗率スライダー含む |

### 7.6 インライン編集仕様（★v1.3追加・v1.6更新）

| 操作 | 動作 |
|------|------|
| セルをクリック | そのセルが編集モードになる（入力フィールドまたはセレクトボックス） |
| Enter / フォーカスアウト | 変更を `PATCH /tasks/:id` で即時保存 |
| Escape | 変更を破棄して表示モードに戻る |
| 右クリック | コンテキストメニューを表示（「編集（詳細）」「削除」） |
| 「編集（詳細）」選択 | TaskModal を開き、全フィールドを編集可能 |

> **★v1.6変更 — `updateTask` の内部動作:**
> 1. Y.js（`yTask.set`）でローカルUI即時更新（このブラウザ）
> 2. REST `PATCH /tasks/:id` でDB更新 + `syncToYjs` → 他の全ブラウザへブロードキャスト
>
> v1.5では Y.js のみに書き込んでいたが、他ブラウザへのブロードキャストが不安定だったため REST も並行して呼ぶ方式に変更した。

**インライン編集できるフィールド：** タイトル、ステータス（セレクト）、優先度（セレクト）、進捗（数値入力）、担当者、開始日、終了日

**TaskModal でのみ編集できるフィールド：** サマリ、説明、親タスク、先行タスク

### 7.7 ツリー表示仕様（★v1.3追加）

`TodoList` は `parentId` を元にツリーノードを構築し、フラット化してテーブル行として描画する。

```
親タスクA                （depth=0）
  ▼ 子タスクA-1          （depth=1, インデント 20px）
      └ 孫タスクA-1-1    （depth=2, インデント 40px）
  ▼ 子タスクA-2          （depth=1）
親タスクB                （depth=0）
```

- `depth > 0` のルートノードには `▶ / ▼` の折りたたみボタンを表示
- 子タスクの行の深さに応じて行背景色を微妙に変えて視覚的に区別する
- 親タスクが削除されると、子タスクの `parent_id` は `NULL`（ルートに昇格）になる

---

## 8. インフラ参照

> Docker環境は既存のものをそのまま使用する。本セクションは起動時の環境変数リファレンスとして残す。

### 8.1 環境変数一覧

| 変数名 | サービス | デフォルト | 説明 |
|--------|---------|-----------|------|
| `VITE_API_URL` | frontend | `http://localhost:4000` | REST APIのURL |
| `VITE_WS_URL` | frontend | `ws://localhost:4001` | WebSocketのURL |
| `DB_PATH` | api | `/app/data/taskflow.db` | SQLiteファイルパス |
| `PORT` | api | `4000` | APIポート |
| `WS_PORT` | api | `4001` | WebSocketポート |
| `LDAP_ENABLED` | api | `false` | LDAP認証の有効化フラグ |
| `LDAP_URL` | api | （未設定） | `ldap://...` 形式 |
| `LDAP_BASE_DN` | api | （未設定） | LDAP検索ベースDN |

---

## 9. 認証設計（将来拡張）

### 9.1 方針

Phase 1リリースでは認証を無効化し、`LDAP_ENABLED=false` で動作する。Phase 2でLDAP認証を有効化できるよう、プラグイン構造で実装する。

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

### 10.2 api（REST API + WebSocket統合）

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `fastify` | ^4.27 | HTTPサーバー |
| `better-sqlite3` | ^9.4 | SQLiteドライバー |
| `@fastify/cors` | ^9.0 | CORSミドルウェア |
| `@hocuspocus/server` | ^2.13 | WebSocket + CRDT管理（統合） |
| `@hocuspocus/extension-sqlite` | ^2.13 | Y.jsスナップショットSQLite保存 |
| `uuid` | ^10 | UUID生成 |
| `ldapjs` | ^3.0 | LDAP認証（Phase 2） |
| `fast-jwt` | ^3.3 | JWT発行・検証（Phase 2） |

> ※ v1.0 で独立していた `ws` サービスのパッケージを `api` に統合。

---

## 11. 実装フェーズ

| Phase | 内容 | 成果物 | 状態 |
|-------|------|--------|----- |
| Phase 1-A | Fastify + SQLite CRUD + `/health` | APIが動作する状態（既存Docker環境で起動確認） | ✅ 完了 |
| Phase 1-B | React雛形・TodoListビュー・Zustand・フィルタ・ソート | タスクCRUD UI | ✅ 完了 |
| Phase 1-C | Y.js（ネストY.Map）+ Hocuspocus接続・接続状態バッジ | リアルタイム同時編集動作確認 | ✅ 完了 |
| Phase 1-D | ガントチャート・ズームレベル・依存矢印・イナズマライン | ガント表示完成 | ✅ 完了 |
| Phase 1-E | Import/Export (JSON/CSV)・並び替えAPI | ファイルI/O | ✅ 完了 |
| Phase 1-F | UI改善（インライン編集・分割レイアウト・親タスクツリー・リアルタイム同期修正） | ★v1.3実装内容 | ✅ 完了 |
| Phase 1-G | CSVインポート対応・統合ガントビュー（MSProject風・TodoList廃止） | ★v1.4実装内容 | ✅ 完了 |
| Phase 1-H | Y.js主体アーキテクチャ・リアルタイム同期修正・競合解決UI・フロントエンドテスト | ★v1.5実装内容 | ✅ 完了 |
| Phase 1-I | リアルタイム同期根本修正（onAuthenticate削除・updateTask REST化）・リロード時タスク消失修正・ガント末行クイック追加・表示期間コントロール追加（日付ピッカー＋期間セレクト） | ★v1.6実装内容 | ✅ 完了 |
| Phase 1-J | ガント行ズレ修正・親タスク進捗自動計算・イナズマラインON/OFF・マルチレベルヘッダー・接続バッジアイコン改善 | ★v1.7実装内容 | ✅ 完了 |
| Phase 2 | LDAP認証組み込み | 認証付き本番稼働 | ⏳ 未着手 |

---

## 12. 非機能要件

| 項目 | 目標値 | 手段 |
|------|--------|------|
| 同時接続数 | 最大10名 | Hocuspocus / Node.js |
| レスポンス（REST） | 95%ile < 100ms | SQLite インデックス（status・assignee・dates） |
| リアルタイム遅延 | < 200ms | Y.js CRDT + WebSocket |
| データ保全 | WALモード有効 | `PRAGMA journal_mode=WAL`（接続時・マイグレーション時の両方で実行） |
| バックアップ | 手動 / cronによるSQLiteコピー | Dockerボリュームマウント |
| ヘルスチェック | `/health` 200応答 | Docker `healthcheck` 設定済み |

---

## 13. Prisma Studio 採用評価

### 13.1 Prisma Studio とは

Prisma Studio は Prisma ORM に付属するブラウザベースのDB GUIツールである。`npx prisma studio` で起動し、テーブルデータの閲覧・編集ができる。

### 13.2 採用しない理由

本プロジェクトでは **Prisma を採用せず、`better-sqlite3` + 生SQLマイグレーションを維持する**。

| 観点 | Prisma を採用する場合 | 現行設計（better-sqlite3） |
|------|---------------------|--------------------------|
| 型安全 | Prismaクライアントで自動生成 | TypeScriptの型定義で手動管理 |
| マイグレーション | `prisma migrate dev` で管理 | SQLファイルで直接管理（シンプル） |
| SQLiteとの相性 | サポートあり、一部制約あり | ネイティブ対応・高速（同期API） |
| スキーマの二重管理 | `schema.prisma` と SQLが乖離しない | SQLのみで一元管理 |
| Hocuspocus SQLite拡張との共存 | `@hocuspocus/extension-sqlite` は better-sqlite3 を直接使用。Prismaと混在すると接続管理が複雑化 | 問題なし |
| 開発中のDB確認 | Prisma Studio（ブラウザGUI） | 下記代替ツールを使用 |

Hocuspocus の SQLite 拡張が `better-sqlite3` に依存しており、同一DBファイルに Prisma クライアントと Hocuspocus が混在すると接続管理が複雑になる。スケール（最大10ユーザー）とシンプルさを優先し、現行設計を維持する。

### 13.3 開発中のDB確認方法（代替手段）

Prisma Studio の代わりに以下を使用する。

| ツール | 用途 | 使い方 |
|--------|------|--------|
| [DB Browser for SQLite](https://sqlitebrowser.org/) | ローカルGUI。SQLiteファイルを直接開いて閲覧・編集 | `api/data/taskflow.db` を開く |
| `sqlite3` CLI | ターミナルから即座にクエリ実行 | `sqlite3 api/data/taskflow.db` |
| `sqlite-web`（開発docker-composeに追加可） | ブラウザGUI。Prisma Studioと同等の使い勝手 | 下記参照 |

開発時に `sqlite-web` が必要な場合、`docker-compose.yml` に追加する：

```yaml
  db-ui:
    image: coleifer/sqlite-web
    ports:
      - '8888:8080'
    volumes:
      - ./api/data:/data
    command: sqlite_web --host 0.0.0.0 /data/taskflow.db
    profiles: ["dev-tools"]  # 通常起動時は除外、必要時に --profile dev-tools で起動
```
