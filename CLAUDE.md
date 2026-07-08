# TreeGantt

設計書: `docs/treegantt_design.md` — **現行ソフトの完全仕様書**。設計の正は本文（各章）。

## コマンド

```bash
bash start.sh                       # 開発（フロント:3000 / API:4000 / WS:4001）
cd api      && npm test             # typecheck / lint / audit も npm run で実行可
cd frontend && npm test -- --run
cd e2e      && npx playwright test
docker compose build && docker compose up -d   # 本番
```

## 開発フロー（詳細な順序チェックはフックが Edit/Write 時・終了時に表示）

**設計書更新→docsコミット → 失敗テスト → 失敗確認 → 実装 → 全通過 → 実装コミット** を厳守。

- 全コミット末尾に空行＋ `Co-Authored-By: Claude <実際に使用中のモデル名> <noreply@anthropic.com>`（例: `Claude Fable 5`。固定値をハードコードしない）
- 設計書: 仕様変更は該当章の**本文**を更新し、ヘッダーのドキュメント版を +1。改訂履歴は**昇順・テーブル末尾に追記**（長い既存行を `old_string` に含めない）。バグ修正は履歴に載せない。
- インフラ変更は start.sh（開発）と Docker（本番）の両方への影響を確認する。
- **Definition of Done**：全テスト通過に加え `typecheck`・`lint`・（プロジェクトにあれば）コンソールエラー0。
- **エラーハンドリング**：無言の `catch(() => {})` 禁止。ユーザーに必ず通知する（トースト等）。
- **コミットメッセージ**は Conventional Commits（`feat/fix/docs/test:` 等）に従う。

## リリース手順（変更箇所は固定・全て同じ x.y.z に揃える）

1. `api`/`frontend` の `package.json` `version`。両 `package-lock.json` は**ルート `version` のみ**（各ファイル先頭と `packages[""]` の2箇所。依存側の同名文字列は触らない）
2. 設計書: ヘッダー「製品バージョン」「ステータス（`リリース（x.y.z）`）」、§3 構成図の2箇所、§15 現行リリース（**major.minor が変わったときのみ**）、ドキュメント版 +1・改訂履歴末尾に1行
3. `CHANGELOG.md` 先頭に `## [x.y.z] - YYYY-MM-DD`（`### 追加/変更/修正`。⚠️ CHANGELOG は**降順**＝設計書の改訂履歴と逆方向）
4. `README.md` 冒頭のバージョンバッジ
5. `npm test` 全通過確認（バージョン表示は `package.json` を実行時参照するためコード変更不要）。メモリ（versioning）も最新版へ更新。
