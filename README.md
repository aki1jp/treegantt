<div align="center">

# 🌳 TreeGantt

**ツリー構造 × ガントチャートで、プロジェクトを“見たまま”動かす。**

複数ブラウザでリアルタイム同期する、社内向けプロジェクト/タスク管理ツール。

![version](https://img.shields.io/badge/version-1.0-2563eb)
![license](https://img.shields.io/badge/license-MIT-22c55e)
![node](https://img.shields.io/badge/node-20+-3c873a)
![React](https://img.shields.io/badge/React-18-61dafb)
![Fastify](https://img.shields.io/badge/Fastify-5-000000)

</div>

> 📸 _アプリ全体のスクリーンショット / デモ GIF は順次追加予定_
<!-- ![TreeGantt 全体像](docs/images/hero.png) -->

---

## なぜ TreeGantt？

- 🌳 **ツリー × ガント** — 親子でネストしたタスクを、そのままガントチャートで可視化。親バーは子の期間・進捗を自動集計。
- ⚡ **リアルタイム同期** — WebSocket で複数ブラウザを即時同期。誰かの編集がすぐ全員に反映。
- 🪶 **軽量・自己完結** — データストアは SQLite 1ファイル。社内サーバーへ `docker compose` で即デプロイ。
- 🖱️ **直感操作** — バーのドラッグで日付変更、ドラッグ＆ドロップで依存付け、セルのインライン編集。

---

## ✨ 主な機能

- 📊 **ガントチャート** — 日/週/月の 3 段階ズーム、3〜24ヶ月の表示期間切替
- 🌳 **ツリー構造** — 親子タスクの折りたたみ／展開、親バーへの自動集計（期間・進捗）
- 🖱️ **ドラッグで日付設定** — バーを掴んで移動・リサイズ（下記 GIF）
- 🔗 **依存関係** — 先行/後続をドラッグ＆ドロップで接続（ベジェ/直角/直線）
- ⚡ **イナズマライン** — 全タスクの進捗到達点を折れ線で可視化し、遅れを直感把握
- 🎯 **クリティカルパス** — CPM で余裕ゼロの経路を強調
- ✏️ **インライン編集** — WBS のセルを直接編集
- 👥 **担当者別負荷ビュー** — 日付×担当のヒートマップ
- 🔄 **競合解決 UI** — 同一フィールドの同時編集を自分/相手で選択
- 🗂️ **マルチプロジェクト** — タブで切替
- 📥 **Import / Export** — JSON・CSV でバックアップ/移行

### 🖱️ ドラッグで開始日・終了日を設定

ガントバーを掴んで動かすだけで、開始日・終了日が変わり WBS にも即反映されます。

![ドラッグで開始日・終了日を変更する様子](docs/images/drag-date.gif)

---

## 📸 スクリーンショット

> 📸 _以下は近日追加予定（画像は `docs/images/` に配置）_

<!--
| 全体 | 依存関係 | 競合解決 |
|------|----------|----------|
| ![全体](docs/images/overview.png) | ![依存矢印](docs/images/dependency.png) | ![競合解決](docs/images/conflict.png) |
-->

---

## 🚀 クイックスタート

### 前提
- Node.js **20 以上** / npm

### 開発（ホットリロード）
```bash
git clone <repository-url>
cd treegantt
bash start.sh        # API + フロントエンドを一括起動
```

| エンドポイント | URL |
|---------------|-----|
| フロントエンド | http://localhost:3000 |
| API（ヘルス） | http://localhost:4000/health |
| WebSocket | ws://localhost:4001 |

停止は `Ctrl+C` または `bash stop.sh`。

### 本番（Docker）
```bash
docker compose build
docker compose up -d
```
`http://<サーバーIP>:3000` でアクセス。API/WS の接続先はブラウザの `window.location.hostname` から自動検出されるため、設定変更なしで動作します。データは `api/data/treegantt.db`（ホストにマウント）へ永続化されます。

#### 主な環境変数（`api`）
| 変数 | 既定 | 説明 |
|------|------|------|
| `PORT` | `4000` | REST API ポート |
| `WS_PORT` | `4001` | WebSocket ポート |
| `DB_PATH` | `/app/data/treegantt.db` | SQLite ファイル |
| `CORS_ORIGIN` | `*` | CORS 許可オリジン |

---

## 🧩 技術スタック

| 区分 | 採用技術 |
|------|---------|
| フロントエンド | React 18 / TypeScript / Vite / Zustand / dayjs / react-markdown |
| API | **Fastify 5** / TypeScript / better-sqlite3 |
| リアルタイム | WebSocket（`ws`）broadcast 方式 |
| テスト | Vitest / Testing Library / **Playwright（E2E）** |
| 配信 | Docker multi-stage（`node:20-slim`） |

---

## 🏗 アーキテクチャ

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

- タスク更新は必ず REST API 経由で SQLite に書き込む
- 書き込み後、API が同一プロジェクトの全クライアントへ WebSocket broadcast
- フロントは楽観的更新 → broadcast 受信でサーバー値に整合

---

## ✅ テスト

```bash
cd api      && npm test            # API（211 件・サービス/ルート/WS/CORS/本番配線）
cd frontend && npm test -- --run   # フロント（913 件・計算/描画/ストア/hooks/コンポーネント）
cd e2e      && npx playwright test  # E2E（実ブラウザ・クロスオリジン実構成）
```

- **ユニット**：純関数（ガント計算・ツリー集計・ソート・Import/Export 等）
- **結合**：Fastify `inject` による API、`buildApp()` で本番配線（CORS プリフライト含む）
- **E2E**：Playwright で CRUD・ガント描画・**バードラッグでの日付変更**などを実ブラウザ検証
- **カバレッジ**：`npx vitest run --coverage`（provider=istanbul、`coverage/index.html` で per-file 確認）

---

## 📚 ドキュメント

- 📘 [`docs/treegantt_design.md`](docs/treegantt_design.md) — **完全仕様書**（これ一冊で再実装できることを目標）
- 📋 [`docs/FEATURES.md`](docs/FEATURES.md) — 機能仕様
- ⚙️ [`docs/performance_plan.md`](docs/performance_plan.md) — 1000件パフォーマンス改善の記録

---

## 🗺 ロードマップ

今後の品質・UI/UX 改善の検討事項（CI、ESLint/Prettier、アクセシビリティ、ビジュアルリグレッション 等）は
設計書の **「17. 今後の検討事項」** に整理しています。

---

## 🛠 DB 管理（開発用）

```bash
docker compose --profile dev-tools up db-ui   # → http://localhost:8888
```
SQLite の中身をブラウザで確認できます（**本番では無効化**してください／無認証のため）。

---

## 📄 ライセンス

MIT
