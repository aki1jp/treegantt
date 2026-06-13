# TreeGantt

**バージョン 1.0**

ツリー構造対応のガントチャート型プロジェクト管理ツール。  
複数ブラウザ間のリアルタイム同期をサポートし、社内サーバーへの Docker デプロイに対応しています。  
アプリのバージョンは右上のハンバーガーメニュー（☰）内に表示されます（フロントエンド／バックエンド）。

設計の詳細は [`docs/treegantt_design.md`](docs/treegantt_design.md)（完全仕様書）を参照してください。

---

## 主な機能

- **ガントチャート** — タスクを日付軸のバーで可視化。日/週/月の 3 段階ズームと 2 週〜6 ヶ月の表示期間切替
- **ツリー構造** — 親子関係でタスクをネスト表示。折りたたみ/展開可能
- **インライン編集** — タスク一覧のセルをクリックして直接編集
- **依存関係矢印** — 先行タスクと後続タスクをベジェ曲線で接続
- **イナズマライン** — 全タスクの進捗を折れ線で可視化。done/wait タスクは今日を頂点として遅延を直感的に把握
- **親タスク進捗の自動計算** — 子タスクの進捗率の平均を再帰的に集計
- **リアルタイム同期** — WebSocket broadcast で複数ブラウザ間を即時同期
- **競合解決 UI** — 同一フィールドを同時編集した際に自分/相手の値を選択
- **フィルタ・ソート** — ステータス・優先度・担当者をまとめたドロップダウンでフィルタ、全列でソート
- **Import / Export** — ハンバーガーメニューから JSON・CSV 形式でのバックアップと移行
- **マルチプロジェクト** — プロジェクトをタブで切替

---

## 技術スタック

| 区分 | 採用技術 |
|------|---------|
| フロントエンド | React 18 / TypeScript / Vite / Zustand |
| API | Fastify 4 / TypeScript / tsx |
| データベース | SQLite（better-sqlite3） |
| リアルタイム | WebSocket（ws ライブラリ）broadcast 方式 |
| テスト | Vitest / @testing-library/react |
| 本番配信 | Docker multi-stage build / serve |

---

## はじめ方

### 前提条件

- Node.js 18 以上
- npm

### 開発環境の起動

```bash
git clone <repository-url>
cd treegantt
bash start.sh
```

| エンドポイント | URL |
|---------------|-----|
| フロントエンド | http://localhost:3000 |
| API | http://localhost:4000/health |
| WebSocket | ws://localhost:4001 |

停止するには `Ctrl+C` または `bash stop.sh`。

### 本番デプロイ（Docker）

```bash
docker compose build
docker compose up -d
```

`http://<サーバーIP>:3000` でアクセスできます。  
API・WebSocket の URL はブラウザの `window.location.hostname` から自動検出されるため、設定変更なしで動作します。

データは `api/data/treegantt.db`（ホストにマウント）に永続化されます。

#### 環境変数（`api` コンテナ）

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `PORT` | `4000` | REST API ポート |
| `WS_PORT` | `4001` | WebSocket ポート |
| `DB_PATH` | `/app/data/treegantt.db` | SQLite ファイルパス |
| `CORS_ORIGIN` | `*` | CORS 許可オリジン |

フロントエンドの接続先を固定したい場合は `VITE_API_URL` / `VITE_WS_URL` を `frontend/Dockerfile` の `ARG` で渡してください（未設定時は hostname 自動検出）。

---

## プロジェクト構造

```
treegantt/
├── api/                        # Fastify API サーバー
│   ├── src/
│   │   ├── db/                 # SQLite クライアント・マイグレーション
│   │   ├── routes/             # health / projects / tasks / import-export
│   │   ├── services/           # taskService（CRUD・循環参照チェック）
│   │   ├── ws/                 # WebSocket broadcast サーバー
│   │   └── __tests__/          # API テスト（46 件 → 77 件）
│   └── Dockerfile
├── frontend/                   # React アプリ
│   ├── src/
│   │   ├── components/         # Gantt / Toolbar / TaskModal / ConflictDialog
│   │   ├── hooks/              # useWebSocket / useTasks
│   │   ├── store/              # Zustand taskStore
│   │   ├── utils/              # ganttCalc / taskTree / sort / importExport / api
│   │   └── __tests__/          # フロントエンドテスト（210 件 → 240 件）
│   └── Dockerfile
├── docs/
│   ├── treegantt_design.md     # 設計書
│   └── FEATURES.md             # 機能仕様書
├── docker-compose.yml
├── start.sh                    # 開発サーバー一括起動
└── stop.sh                     # 開発サーバー一括停止
```

---

## アーキテクチャ

```
ブラウザ A                  ブラウザ B
   │                           │
   │ REST (4000)   WebSocket (4001)
   └──────────┬────────────────┘
              │
          Fastify API
              │
          SQLite DB  ←── 唯一の真の状態
```

- タスクの更新は必ず REST API 経由で SQLite に書き込む
- 書き込み後、API が同一プロジェクトの全接続クライアントへ WebSocket broadcast
- フロントエンドは楽観的更新 → broadcast 受信でサーバー値に上書き

---

## テスト

```bash
# API テスト（77 件）
cd api
npm test

# フロントエンドテスト（240 件）
cd frontend
npm test -- --run

# カバレッジ（utils / store / hooks で Statements/Branches/Lines 100%）
cd frontend
npx vitest run --coverage
```

テストカテゴリ:
- **ユニットテスト** — 純関数（ガント計算・ソート・インポート等）
- **統合テスト** — Fastify inject による HTTP エンドポイントテスト
- **シナリオテスト** — FEATURES.md の機能仕様に対応した動作確認
- **悪意テスト** — XSS・SQL インジェクション・循環参照・境界値など

---

## DB 管理（開発用）

SQLite Web UI を起動して DB の中身をブラウザで確認できます。

```bash
docker compose --profile dev-tools up db-ui
# → http://localhost:8888
```

---

## ライセンス

MIT
