# TaskFlow 機能仕様書

| 項目 | 内容 |
|------|------|
| 文書バージョン | 1.0 |
| 対応アプリバージョン | v1.8 |
| 作成日 | 2026年5月 |
| 目的 | 本アプリが持つ機能の詳細記述。同等アプリを再実装できるレベルの粒度 |

---

## 目次

1. [アプリ概要](#1-アプリ概要)
2. [画面全体構成](#2-画面全体構成)
3. [プロジェクト管理](#3-プロジェクト管理)
4. [タスクデータモデル](#4-タスクデータモデル)
5. [ガントチャート](#5-ガントチャート)
6. [タスク一覧（左固定列）](#6-タスク一覧左固定列)
7. [タスク詳細モーダル](#7-タスク詳細モーダル)
8. [フィルタ・ソート](#8-フィルタソート)
9. [Import / Export](#9-import--export)
10. [リアルタイム同期](#10-リアルタイム同期)
11. [接続状態バッジ](#11-接続状態バッジ)
12. [REST API 仕様](#12-rest-api-仕様)
13. [データ永続化](#13-データ永続化)
14. [技術スタック](#14-技術スタック)

---

## 1. アプリ概要

TaskFlow はプロジェクト単位でタスクを管理するウェブアプリケーション。最大 10 名が同時にブラウザから接続し、タスクの作成・編集・進捗管理をリアルタイムで共有できる。

**主な特徴**

- MSProject 風のガントチャート（左にタスク一覧・右にタイムライン）
- WebSocket（Y.js CRDT）によるリアルタイム同時編集
- 親子タスクによるツリー構造
- タスク間の依存関係（先行タスク）と矢印描画
- イナズマライン（実績と計画の境界線）
- JSON / CSV の Import / Export

---

## 2. 画面全体構成

画面は上から以下の 3 段で構成される。

```
┌─────────────────────────────────────────────────────┐
│  プロジェクト選択ヘッダー（常時表示・固定）               │
├─────────────────────────────────────────────────────┤
│  ツールバー（フィルタ・ズーム・期間・トグル群・操作ボタン）  │
├─────────────────────────────────────────────────────┤
│  ガントチャート（残余領域いっぱいに表示・縦横スクロール）    │
│  ┌────── 左固定列 670px ──────┬── 右タイムライン ────┐  │
│  │ # │タイトル│ST│優先│進捗│担当│開始│終了  │  SVG 領域  │  │
│  │...│       │  │    │    │    │    │      │  バー/矢印 │  │
│  │   クイック追加行（末尾固定）  │            │  │
│  └──────────────────────────┴────────────────┘  │
└─────────────────────────────────────────────────────┘
```

- **プロジェクト選択ヘッダー**: 画面最上部に固定。横スクロール・縦スクロールしても常に見える。
- **ツールバー**: ヘッダーの直下に固定。ガントチャートを縦スクロールしても見える。
- **ガントチャート**: 残余の領域すべてを使い、縦横スクロールが可能。左パネルは横スクロールしても固定（`position: sticky; left: 0`）、ヘッダー行は縦スクロールしても固定（`position: sticky; top: 0`）。

---

## 3. プロジェクト管理

### 3.1 プロジェクトの概念

全タスクはプロジェクトに属する。プロジェクトを切り替えると、そのプロジェクトのタスク一覧・ガントチャートが表示される。

### 3.2 プロジェクト作成

- ヘッダーの「+ プロジェクト」ボタンをクリックすると `prompt()` ダイアログが表示される。
- プロジェクト名を入力して OK を押すと、`POST /api/v1/projects` が呼ばれてプロジェクトが作成される。
- 作成直後、そのプロジェクトに自動的に切り替わる。

### 3.3 プロジェクト切り替え

- ヘッダーに全プロジェクト名がタブとして並ぶ。
- 現在表示中のプロジェクトは紺色（`#4f46e5`）のハイライト表示。
- タブをクリックすると即座にそのプロジェクトへ切り替わる。
- 切り替え時: REST API でタスクを取得し即時表示 → WebSocket でリアルタイム同期を開始。

### 3.4 プロジェクト削除

- 各プロジェクトタブの右側に「✕」ボタンがある。
- クリックすると確認ダイアログ（`confirm()`）が表示される。
- 「OK」で `DELETE /api/v1/projects/:id` が呼ばれ、プロジェクトと**その配下の全タスク**がカスケード削除される。
- 削除後、残りのプロジェクトの先頭を表示（プロジェクトが0件になった場合は「プロジェクトがありません」メッセージと作成ボタンのみ）。

### 3.5 データモデル

```
Project {
  id:        string  // UUID v4
  name:      string  // プロジェクト名（制約なし）
  createdAt: string  // ISO 8601 datetime
}
```

---

## 4. タスクデータモデル

タスクが持つ全フィールドの仕様。

| フィールド | 型 | 説明 | 制約 |
|-----------|-----|------|------|
| `id` | string | UUID v4 | 自動生成 |
| `projectId` | string | 所属プロジェクト UUID | 必須 |
| `parentId` | string \| null | 親タスクの UUID。null = ルートタスク | |
| `title` | string | タスクタイトル | 必須、最大 200 文字 |
| `summary` | string | 1 行サマリ | デフォルト空文字 |
| `description` | string | 長文説明（Markdown 可） | デフォルト空文字 |
| `status` | TaskStatus | 状態（下表参照） | デフォルト `todo` |
| `priority` | TaskPriority | 優先度（下表参照） | デフォルト `medium` |
| `progress` | number | 進捗率 0〜100 | 整数 |
| `assignee` | string | 担当者名（自由文字列） | デフォルト空文字 |
| `startDate` | string \| null | 開始日 YYYY-MM-DD 形式 | null = 未設定 |
| `endDate` | string \| null | 終了日 YYYY-MM-DD 形式 | null = 未設定 |
| `predecessors` | string[] | 先行タスクIDの配列 | デフォルト `[]` |
| `order` | number | 表示順（整数） | デフォルト 0 |
| `createdAt` | string | 作成日時 ISO 8601 | 自動設定 |
| `updatedAt` | string | 更新日時 ISO 8601 | 自動更新 |

### 4.1 ステータス（TaskStatus）

| 値 | 表示ラベル | バッジ色 | ガントバー色 |
|----|---------|---------|------------|
| `todo` | TODO | グレー `#6b7280` | グレー |
| `wip` | Doing | 青 `#3b82f6` | 青 |
| `done` | DONE | 緑 `#22c55e` | 緑 |
| `wait` | 待機 | 橙 `#f59e0b` | 橙 |

### 4.2 優先度（TaskPriority）

| 値 | 表示ラベル | バッジ色 |
|----|---------|---------|
| `critical` | 最高 | 赤 `#ef4444` |
| `high` | 高 | オレンジ `#f97316` |
| `medium` | 中 | グレー `#6b7280` |
| `low` | 低 | 薄グレー `#d1d5db` |

---

## 5. ガントチャート

### 5.1 基本構造

ガントチャートは**左固定列**と**右タイムライン**で構成される 1 つのコンポーネント。

- 左固定列: タスクの属性を表形式で表示（幅 670px 固定）。横スクロール時も左端に固定される。
- 右タイムライン: SVG で描画したバー・矢印・ライン。横スクロール可。
- 各タスクは 1 行で左右を対応付け。左列の行高 = SVG の行高 = `ROW_HEIGHT_PX` = **36px**（厳密に一致させ、累積ズレをゼロにする）。

### 5.2 マルチレベルヘッダー

ヘッダーは最大 **4 段**で構成される。各段は独立して表示/非表示を切り替えられる。

| 段 | ラベル例 | セル境界 | デフォルト |
|----|---------|---------|----------|
| 年（year） | `2026` | 1 月 1 日ごと | 表示 |
| 月（month） | `2026-05` | 月初ごと | 表示 |
| 週（week） | `W21` | 月曜日ごと | 表示 |
| 日（day） | `22` | 1 日ごと | 表示 |

- 1 段あたりの高さ: **26px**。全 4 段有効時: 104px のヘッダー。
- ヘッダーはページ縦スクロール時も上端に固定（`position: sticky; top: 0`）。
- 交互にわずかに背景色を変えてセルの境界を視覚的に分かりやすくする。
- 最上段（最初の有効な段）にのみ左固定列の列名を表示する。それ以下の段では左固定列は空欄。
- トグルボタンはツールバーの「ヘッダー」グループ内の「年」「月」「週」「日」ボタン。アクティブ時は紺色塗りつぶし。

### 5.3 ズームレベル

ツールバーの「ズーム」セレクトボックスで切り替える。

| ズームレベル | 1 日あたりのピクセル幅 | 主な用途 |
|------------|---------------------|---------|
| 日（day） | 28px | 短期タスクの詳細確認 |
| 週（week） | 8px | 標準的な進捗管理 |
| 月（month） | 3px | 長期プロジェクトの俯瞰 |

### 5.4 表示期間コントロール

ツールバーで開始日と期間を指定し、ガントの表示範囲を制御する。

**自動モード（デフォルト）**
- 開始日が空欄の場合、タスクの `startDate` / `endDate` から最小・最大を自動計算。
- タスクが 0 件のときは「今日 − 7 日」を起点に選択期間分を表示。
- タスク範囲が選択期間より短くても、最低でも選択期間分は確保する。

**手動モード**
- 開始日（date ピッカー）を指定すると、そこから選択期間分の固定範囲を表示。
- 「今日」ボタン: 今日の日付を開始日にセット。
- 「✕」ボタン（開始日設定中のみ表示）: 開始日をクリアして自動モードに戻す。

**期間セレクト**

| 選択肢 | 表示日数 |
|--------|---------|
| 2 週間 | 14 日 |
| 1 ヶ月 | 30 日 |
| 3 ヶ月（デフォルト） | 91 日 |
| 6 ヶ月 | 183 日 |

### 5.5 ガントバー

- `startDate` または `endDate` が未設定のタスクはバーを描画しない。
- バーの x 座標: `startDate` から表示範囲の最小日を引いた日数 × 1 日あたりのピクセル幅。
- バーの幅: `endDate` の右端 x − `startDate` の x（最小でも 1 日分）。
- バーの色: ステータスに対応した色（`#..44` の半透明背景 + 実線ボーダー）。
- 進捗バー: バー幅 × `progress / 100` の長さで内部を塗りつぶす（やや濃い色 `#..aa`）。
- バー内にタイトルテキストを表示（バー幅を超えた部分はクリップ）。
- クリックで該当タスクのタスク詳細モーダルが開く。

### 5.6 依存関係矢印

先行タスクの設定がある場合、ガントバー同士を矢印で結ぶ。

- 起点: 先行タスクの `endDate` の右端。
- 終点: 後続タスクの `startDate` の左端。
- 形状: SVG の cubic-bezier パス（`C`コマンド）。制御点オフセット ±30px。
- 色: `#378ADD`（青）。線幅 1.5px。終点に矢印マーカー。
- `startDate` / `endDate` のどちらかが未設定の場合は描画しない。

### 5.7 今日ライン

- 今日の日付の x 座標に垂直な破線（`stroke-dasharray: 4 3`）を引く。
- 色: `#E24B4A`（赤）。線幅 2px。
- ラベル「今日」をライン上部に表示。
- 常に表示（非表示にする設定はない）。

### 5.8 イナズマライン

実績（完了タスク）と計画（未完了タスク）の境界を示す垂直線。

**X 座標の計算**:
1. `status === 'done'` かつ `endDate` を持つタスクのうち最も遅い `endDate` を取得 → x1
2. `status !== 'done'` かつ `startDate` を持つタスクのうち最も早い `startDate` を取得 → x2
3. イナズマ X = `(x1 + x2) / 2`（小数点以下四捨五入）

**表示条件**: `done` タスクと未 `done` タスクの両方が 1 件以上あるときのみ表示。

- 色: `#D4537E`（ピンク）。線幅 2px。破線。ラベル「⚡」。
- ラインが今日ラインより左 = 遅延傾向 / 右 = 進行良好の目安。
- ツールバーの「⚡ イナズマ」トグルボタンで ON/OFF 切り替え可能（デフォルト: ON）。

### 5.9 縞背景

偶数行: 白 `#fff` / 奇数行: 薄グレー `#fafafa` の交互背景で行の視認性を向上。

---

## 6. タスク一覧（左固定列）

### 6.1 列定義

左固定列の幅は合計 **670px**。

| 列キー | ヘッダーラベル | 幅 | 内容 |
|-------|-------------|-----|------|
| `order` | `#` | 36px | 表示順番号。クリックでソート。 |
| `title` | タイトル | 180px | タスクタイトル。ツリーインデント付き。 |
| `status` | ST | 66px | ステータスバッジ（色付き丸角バッジ）。 |
| `priority` | 優先 | 56px | 優先度バッジ。 |
| `progress` | 進捗 | 76px | プログレスバー + パーセンテージ表示。 |
| `assignee` | 担当 | 76px | 担当者名。未設定時は「—」。 |
| `startDate` | 開始 | 88px | 開始日 YYYY-MM-DD。未設定時は「—」。 |
| `endDate` | 終了 | 88px | 終了日 YYYY-MM-DD。未設定時は「—」。 |

ヘッダー行の各列をクリックするとその列でソートが切り替わる（昇順 → 降順 → 昇順 ...）。ソート中の列には `↑` / `↓` を表示。

### 6.2 インライン編集

セルをクリックすると編集モードに切り替わる。フォーカスアウトまたは Enter で確定、Escape でキャンセル。

| フィールド | 編集 UI | 備考 |
|-----------|--------|------|
| タイトル | テキスト入力 | 空文字のまま確定するとキャンセル扱い |
| ステータス | セレクトボックス | 選択と同時に確定 |
| 優先度 | セレクトボックス | 選択と同時に確定 |
| 進捗 | 数値入力（0〜100） | Enter または フォーカスアウトで確定。範囲外は 0 または 100 にクランプ |
| 担当者 | テキスト入力 | |
| 開始日 | date ピッカー | |
| 終了日 | date ピッカー | |

**親タスクの進捗フィールドは編集不可**（子タスクの平均を自動表示、詳細は 6.6 節）。

確定時の動作:
1. Y.js のフィールドを即時更新（このブラウザの UI に即反映）。
2. `PATCH /api/v1/tasks/:id` を呼び、DB 更新 + 他ブラウザへのブロードキャスト。

### 6.3 競合解決ダイアログ

同一フィールドを異なるブラウザで同時編集した場合、後から確定しようとした側に競合ダイアログを表示。

- 表示される情報: フィールド名・相手の値（`theirVal`）・自分の値（`myVal`）。
- 「相手の変更を使う」: 自分の編集を破棄。
- 「自分の変更を使う」: `PATCH /tasks/:id` で自分の値を強制上書き。

### 6.4 右クリックコンテキストメニュー

任意の行を右クリックすると 2 項目のメニューが表示される。

| メニュー項目 | 動作 |
|------------|------|
| 編集（詳細） | タスク詳細モーダルを開く |
| 削除 | 確認ダイアログを表示し、OK でタスクを削除 |

### 6.5 ツリー表示・折りたたみ

- `parentId` を元にツリーノードを構築し、フラットなリストにして表示する。
- 深さ（depth）に応じてタイトル列を左インデント（1 段 = 16px）。
- 深さ > 0 の行の背景色を `hsl(240, 15%, 99 - depth%)` で微妙に変化させて視覚的に区別。
- 子タスクを持つタスクの行には `▶` / `▼` の折りたたみボタンを表示。
  - `▼`: 展開状態（子タスクが表示されている）
  - `▶`: 折りたたみ状態（子タスクが非表示）
- 子タスクを持たない depth > 0 のタスクには `└` プレフィックスを表示。
- 折りたたみ状態はブラウザセッション内のみ保持（ページリロードで展開に戻る）。

### 6.6 親タスク進捗の自動計算

- 子タスクを 1 件以上持つタスクは「親タスク」と判定。
- 親タスクの進捗率 = 直接の子タスクの進捗率の算術平均（再帰計算）、小数点以下切り捨て。
- 子タスクがさらに子を持つ場合も再帰的に計算する（孫タスクの平均 → 子タスクの平均 → 親タスク）。
- 親タスクの進捗バーは薄紫（`#a5b4fc`）で描画し、クリックしても編集モードにならない。
- ホバー時に「子タスクの平均（自動計算）」というツールチップを表示。
- 計算はフロントエンドの表示時のみ行い、DB には保存しない（派生値）。

### 6.7 クイック追加行（末尾固定）

タスク一覧の最終行として常に「＋ タスクを追加…」の行が表示される。

- 灰色の背景（`#fafafa`）と上部に点線ボーダー（`1px dashed #e5e7eb`）で視覚的に区別。
- その行をクリックするとタイトル入力フィールドが現れる。
- Enter: タイトルを入力してタスクを作成（`POST /projects/:id/tasks`）。作成後は入力フィールドが閉じてプレースホルダーに戻る。
- Escape またはフォーカスアウト（タイトルが空の場合）: 入力をキャンセル。
- 作成されるタスクのデフォルト値: status=`todo`、priority=`medium`、progress=0、他フィールドは空。

---

## 7. タスク詳細モーダル

ガントバーのクリック、または左固定列の右クリック「編集（詳細）」から開く。新規作成は「+ タスク追加」ボタン。

### 7.1 表示形式

- 画面中央にオーバーレイとして表示（背景はダーク半透明 `rgba(0,0,0,0.45)`）。
- モーダル外クリックで閉じる。
- スクロール可能（`maxHeight: 90vh; overflowY: auto`）。

### 7.2 フォームフィールド

| フィールド | UI 要素 | 備考 |
|-----------|--------|------|
| タイトル | テキスト入力 | 必須。最大 200 文字。 |
| サマリ | テキスト入力 | 任意。概要の 1 行説明。 |
| 説明 | テキストエリア（リサイズ可） | Markdown 記述可（表示時はプレーンテキストとして保存）。 |
| ステータス | セレクトボックス | TODO / Doing / DONE / 待機 |
| 優先度 | セレクトボックス | 最高 / 高 / 中 / 低 |
| 進捗率 | レンジスライダー（0〜100） | 現在値をラベル表示 |
| 担当者 | テキスト入力 | 自由記述 |
| 開始日 | date ピッカー | |
| 終了日 | date ピッカー | |
| 親タスク | セレクトボックス | 「なし（ルートタスク）」+ 全タスク一覧（自分自身を除く） |
| 先行タスク | チェックボックスリスト | 自分自身を除く全タスクを一覧表示。複数選択可。スクロール可（最大高さ 120px）。 |

### 7.3 保存・キャンセル

- 「保存」ボタン（紺色）: フォームを送信。タイトルが空ならバリデーションエラー（`required` 属性）。
  - 新規作成: `POST /projects/:id/tasks`。
  - 既存タスク編集: `PATCH /tasks/:id`。
- 「キャンセル」ボタン: 変更を破棄してモーダルを閉じる。

---

## 8. フィルタ・ソート

ツールバーに常時表示されるコントロール群。フィルタとソートはすべてフロントエンドのメモリ上で行い、API への追加問い合わせは不要。

### 8.1 ステータスフィルタ

| 選択肢 | 動作 |
|--------|------|
| すべて（デフォルト） | フィルタなし。全タスクを表示。 |
| TODO | `status === 'todo'` のタスクのみ表示。 |
| Doing | `status === 'wip'` のタスクのみ表示。 |
| DONE | `status === 'done'` のタスクのみ表示。 |
| 待機 | `status === 'wait'` のタスクのみ表示。 |
| **DONE 以外** | `status !== 'done'` のタスクのみ表示（進行中のタスクを一覧する際に便利）。 |

### 8.2 優先度フィルタ

セレクトボックスで選択。「すべて」/ 最高 / 高 / 中 / 低。

### 8.3 担当者フィルタ

テキスト入力による部分一致フィルタ。入力した文字列を `assignee` フィールドに含むタスクのみ表示。

### 8.4 ソート

左固定列のヘッダーセルをクリックするとその列でソート。同じ列を再クリックすると昇順/降順が切り替わる。

| ソートキー | ロジック |
|-----------|--------|
| `#`（order） | `ord` フィールドの数値昇順（デフォルト表示順） |
| タイトル | ロケール順（`localeCompare('ja')`） |
| ステータス | todo → wip → done → wait の固定順 |
| 優先度 | critical → high → medium → low の固定順 |
| 進捗 | 数値昇順 |
| 担当者 | ロケール昇順 |
| 開始日 / 終了日 | 日付昇順。null は末尾。 |

---

## 9. Import / Export

ツールバー右端の「インポート」「JSON 出力」「CSV 出力」ボタンから操作する。

### 9.1 JSON エクスポート

- ボタン「JSON 出力」をクリックすると、現在のプロジェクトの全タスクを JSON ファイルとしてダウンロード。
- ファイル名: `taskflow-{projectId}.json`

**JSON 形式**:
```json
{
  "version": "1.1",
  "exportedAt": "2026-05-01T12:00:00.000Z",
  "project": { "id": "...", "name": "プロジェクト名" },
  "tasks": [ ...Task[] ]
}
```

### 9.2 CSV エクスポート

- ボタン「CSV 出力」をクリックすると、現在のプロジェクトの全タスクを CSV ファイルとしてダウンロード。
- ファイル名: `taskflow-{projectId}.csv`

**CSV 列順**（固定）:
```
id, parentId, title, summary, description, status, priority, progress,
assignee, startDate, endDate, predecessors
```

- `predecessors` 列はセミコロン区切りのID列。例: `"uuid-1;uuid-2"`
- `parentId` が null の場合は空文字。

### 9.3 インポート

- ボタン「インポート」をクリックすると、非表示の `<input type="file">` をクリックして OS のファイル選択ダイアログを開く。
- `.json` または `.csv` ファイルを選択可。
- JSON インポート: `importFromJson()` でパース → `POST /projects/:id/import`。
- CSV インポート: 拡張子または MIME タイプで判定 → `importFromCsv()` でパース → `POST /projects/:id/import`。
- 同じ `id` のタスクが存在する場合は上書き（upsert）、存在しない場合は新規作成。
- インポート完了後、REST API で最新タスク一覧を再取得して表示を更新。
- パース・ネットワークエラー時は `alert()` でエラーメッセージを表示。

---

## 10. リアルタイム同期

### 10.1 概要

複数ブラウザ（タブ）間の変更をリアルタイムに同期する。Y.js CRDT を用いた競合のない共同編集を実現する。

**同期フロー（タスク更新時）**:
```
ブラウザ A で updateTask() 呼び出し
  │
  ├─ [1] Y.js ローカル更新 → ブラウザ A の UI 即時反映
  │
  └─ [2] REST PATCH /tasks/:id
              ↓
         DB 更新 + syncToYjs（openDirectConnection）
              ↓
         Hocuspocus が全接続ブラウザへブロードキャスト
              ↓
         ブラウザ B の observeDeep → setTasks → UI 反映
```

### 10.2 Y.js CRDT 構造

```
Y.Doc（プロジェクトIDがドキュメント名）
  └─ getMap('tasks')  ← Y.Map<Y.Map<unknown>>
        ├─ "task-uuid-1" → Y.Map { title: "...", status: "todo", ... }
        ├─ "task-uuid-2" → Y.Map { ... }
        └─ ...
```

- タスクごとに独立した `Y.Map` でネストさせる。
- **フィールド単位で CRDT マージが行われる**ため、異なるフィールドを同時編集しても競合が起きない。
- 複数フィールドの同時変更は `ydoc.transact(() => {...})` で 1 つのアンドゥ操作にまとめる。

### 10.3 初期化フロー（プロジェクト切り替え時）

1. REST GET `/projects/:id/tasks` → DB から即座にタスクを取得 → `setTasks()` でUI表示。
2. Y.js ドキュメントに不足しているタスクを追加（リアルタイム同期への備え）。
3. 以降の変更は `observeDeep` イベントで検知し、自動的に UI に反映。

### 10.4 React 18 StrictMode 対策

React 18 は開発環境で `useEffect` を 2 度実行する（StrictMode）。`HocuspocusProvider` インスタンスをモジュールレベルの `Map`（`instanceCache`）でキャッシュし、`useEffect` クリーンアップでは `destroy()` しない。プロジェクト ID が変わった場合のみ新規インスタンスを生成する。

### 10.5 競合解決 UI

インライン編集の確定時に、自分が編集を開始した後に他のユーザーが同フィールドを変更していた場合:

1. 確定操作をブロックし、競合ダイアログを表示。
2. ダイアログに「相手の値（theirVal）」「自分の値（myVal）」「フィールド名」を表示。
3. ユーザーがいずれかを選択:
   - **相手の変更を使う**: 自分の入力を捨てて現在の Y.js 値をそのまま使用。
   - **自分の変更を使う**: `PATCH /tasks/:id` で自分の値を強制適用。

---

## 11. 接続状態バッジ

ツールバー右端に WebSocket の接続状態を常時表示する。

| 状態 | アイコン | バッジ色 | ラベル |
|------|---------|---------|--------|
| connected | WiFi シグナルアイコン（SVG） | 緑 `#16a34a` | 接続中 |
| connecting | スピナー（CSS アニメーション回転） | 橙 `#d97706` | 接続中... |
| disconnected | WiFi ✕ アイコン（斜め線で X） | 赤 `#dc2626` | 未接続 |

- スピナーは CSS `@keyframes` で 1 秒 1 回転の無限ループアニメーション。
- WiFi アイコン: 3 本の弧（外・中・内）+ ドットを SVG で描画。
- disconnected 時は WiFi 弧を半透明にし、斜め線を重ねて「✕」を表現。

---

## 12. REST API 仕様

### 12.1 共通仕様

- Base URL: `http://localhost:4000/api/v1`
- Content-Type: `application/json`
- エラーレスポンス: `{ "error": "message", "code": "ERROR_CODE" }`

### 12.2 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック。`{ status: 'ok', time: '...' }` を返す。 |
| GET | `/projects` | 全プロジェクト一覧。`{ projects: Project[] }` |
| POST | `/projects` | プロジェクト作成。Body: `{ name: string }` |
| DELETE | `/projects/:id` | プロジェクト削除（タスクを CASCADE 削除） |
| GET | `/projects/:id/tasks` | タスク一覧（フィルタ対応、後述） |
| POST | `/projects/:id/tasks` | タスク作成 |
| PATCH | `/projects/:id/tasks/reorder` | 表示順の一括更新 |
| GET | `/tasks/:id` | タスク単体取得 |
| PATCH | `/tasks/:id` | タスク部分更新（任意フィールドのみ送信可） |
| DELETE | `/tasks/:id` | タスク削除 |
| POST | `/projects/:id/import` | タスクの一括インポート（upsert） |
| GET | `/projects/:id/export/json` | JSON エクスポート（ダウンロード用） |
| GET | `/projects/:id/export/csv` | CSV エクスポート（ダウンロード用） |

### 12.3 タスク一覧取得 `GET /projects/:id/tasks`

クエリパラメータでサーバーサイドフィルタが可能（フロントエンドは使用しないが API として実装済み）。

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `status` | string | ステータス一致フィルタ |
| `assignee` | string | 担当者名部分一致フィルタ |
| `priority` | string | 優先度一致フィルタ |
| `limit` | number | 最大取得件数（デフォルト 500） |
| `offset` | number | オフセット（デフォルト 0） |

レスポンス:
```json
{
  "tasks": [ ...TaskWithSuccessors[] ],
  "total": 42
}
```

`TaskWithSuccessors` は `Task` に `successors: string[]`（後続タスクID配列）を付加したもの。

### 12.4 タスク作成 `POST /projects/:id/tasks`

```json
{
  "title": "フロントエンド実装",          // 必須
  "parentId": "uuid-parent",             // null または省略でルートタスク
  "summary": "React + TypeScript",
  "description": "## 詳細\n...",
  "status": "todo",
  "priority": "high",
  "progress": 0,
  "assignee": "田中",
  "startDate": "2026-05-01",
  "endDate": "2026-05-15",
  "predecessors": ["uuid-1", "uuid-2"]
}
```

レスポンス 201: `{ "task": TaskWithSuccessors }`

### 12.5 タスク部分更新 `PATCH /tasks/:id`

変更したいフィールドのみ送信可（undefined フィールドは変更されない）。

```json
{ "status": "done", "progress": 100 }
```

サーバー側では DB 更新後に `syncToYjs(openDirectConnection)` を呼び、Hocuspocus 経由で全接続ブラウザに変更をブロードキャストする。

### 12.6 表示順一括更新 `PATCH /projects/:id/tasks/reorder`

```json
{
  "orders": [
    { "id": "uuid-1", "order": 0 },
    { "id": "uuid-2", "order": 1 }
  ]
}
```

### 12.7 インポート `POST /projects/:id/import`

```json
{
  "tasks": [ ...Partial<Task>[] ]
}
```

各タスクを `id` で照合し、存在する場合は更新（upsert）、存在しない場合は新規作成する。

---

## 13. データ永続化

### 13.1 SQLite スキーマ

```sql
-- プロジェクト
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- タスク
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES tasks(id) ON DELETE SET NULL,  -- 親削除時は子をルートへ昇格
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK(status IN ('todo','wip','done','wait')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK(priority IN ('critical','high','medium','low')),
  progress    INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  assignee    TEXT NOT NULL DEFAULT '',
  start_date  TEXT,
  end_date    TEXT,
  ord         INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 依存関係（先行・後続）
CREATE TABLE task_deps (
  predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (predecessor_id, successor_id)
);
```

- `PRAGMA journal_mode = WAL`: 並行読み書きのパフォーマンス向上。
- `PRAGMA foreign_keys = ON`: 外部キー制約を有効化。
- `updated_at` は UPDATE トリガーで自動更新。

### 13.2 Y.js スナップショット

- Hocuspocus の `@hocuspocus/extension-sqlite` が Y.js バイナリドキュメントを同じ SQLite ファイルに保存する。
- サーバー再起動時は `onLoadDocument` で SQLite からバイナリを復元 → Y.js ドキュメントに適用。
- それでも空の場合は `tasks` テーブルからブートストラップしてY.jsに書き込む。

---

## 14. 技術スタック

### 14.1 フロントエンド

| 技術 | バージョン | 役割 |
|------|-----------|------|
| React | 18.x | UI フレームワーク |
| TypeScript | 5.x | 型安全 |
| Vite | 5.x | ビルドツール・開発サーバー（port 3000） |
| Zustand | 4.x | クライアント状態管理 |
| Y.js | 13.x | CRDT ライブラリ |
| @hocuspocus/provider | 2.13 | WebSocket Y.js プロバイダー |
| dayjs | 1.11 | 日付計算（ガントヘッダー生成） |
| papaparse | 5.x | CSV パース・生成 |
| uuid | 10.x | UUID v4 生成 |

UIは **全て CSS-in-JS（インラインスタイル）** で記述。外部 CSS ファイル・CSS フレームワーク・アイコンライブラリは使用しない。ガントチャートの描画は **SVG**（React 要素として記述）。

### 14.2 バックエンド

| 技術 | バージョン | 役割 |
|------|-----------|------|
| Node.js | 20.x | ランタイム |
| Fastify | 4.x | HTTP サーバー（port 4000） |
| better-sqlite3 | 9.x | SQLite ドライバー（同期 API） |
| @hocuspocus/server | 2.13 | WebSocket サーバー（port 4001） |
| @hocuspocus/extension-sqlite | 2.13 | Y.js スナップショットの SQLite 保存 |
| Y.js | 13.x | CRDT（サーバー側）|
| uuid | 10.x | UUID 生成 |

### 14.3 ポート構成

| ポート | 用途 |
|--------|------|
| 3000 | フロントエンド（Vite dev server） |
| 4000 | REST API（Fastify） |
| 4001 | WebSocket（Hocuspocus Y.js） |

### 14.4 状態管理の設計方針

| 種別 | 管理場所 |
|------|---------|
| タスク一覧・ソート・フィルタ・ズーム・ガント表示設定 | `taskStore`（Zustand） |
| WebSocket 接続状態 | `connectionStore`（Zustand） |
| Y.js ドキュメント・プロバイダー | モジュールレベルキャッシュ（React 外） |
| 折りたたみ状態・インライン編集状態 | コンポーネント `useState` |

---

## 付録 A: 実装済みコンポーネント一覧

| コンポーネント | ファイル | 概要 |
|--------------|---------|------|
| `App` | `App.tsx` | ルートコンポーネント。プロジェクト管理・モーダル制御・Import/Export 処理。 |
| `Toolbar` | `Toolbar/Toolbar.tsx` | フィルタ・ズーム・期間・ヘッダートグル・イナズマトグル・操作ボタン群。 |
| `ConnectionBadge` | `ConnectionBadge/ConnectionBadge.tsx` | WebSocket 接続状態バッジ（SVG アイコン付き）。 |
| `GanttChart` | `Gantt/GanttChart.tsx` | 統合ガントビュー。左固定列・マルチレベルヘッダー・SVG タイムラインを統合。 |
| `GanttLeftRow` | `GanttChart.tsx` 内 | 1 行分の左固定列。インライン編集・右クリックメニュー・競合ダイアログを含む。 |
| `QuickAddRow` | `GanttChart.tsx` 内 | 末尾の行追加 UI。 |
| `GanttBar` | `Gantt/GanttBar.tsx` | 1 タスクのバー（進捗バー・タイトル・クリップパス含む）。 |
| `DependencyArrow` | `Gantt/DependencyArrow.tsx` | 先行タスク → 後続タスクの cubic-bezier 矢印。 |
| `LightningLine` | `Gantt/LightningLine.tsx` | 今日ライン・イナズマラインの縦破線。 |
| `TaskModal` | `TaskModal/TaskModal.tsx` | 全フィールド編集のモーダルフォーム。 |
| `ConflictDialog` | `ConflictDialog/ConflictDialog.tsx` | 同時編集競合の解決ダイアログ。 |

## 付録 B: 主なユーティリティ関数

| 関数 | ファイル | 概要 |
|------|---------|------|
| `calcGanttRange(tasks, startDate?, period?)` | `ganttCalc.ts` | 手動/自動モードでガント表示範囲を計算。 |
| `dateToX(date, minDate, zoom)` | `ganttCalc.ts` | 日付を SVG の x 座標に変換。 |
| `calcTodayX(minDate, zoom)` | `ganttCalc.ts` | 今日の x 座標を計算。 |
| `calcLightningX(tasks, minDate, zoom)` | `ganttCalc.ts` | イナズマラインの x 座標を計算。 |
| `ganttTotalWidth(tasks, zoom, startDate?, period?)` | `ganttCalc.ts` | SVG の全体幅を計算。 |
| `buildMultiLevelHeaders(min, max, zoom, levels)` | `GanttChart.tsx` 内 | 年/月/週/日 各段のヘッダーセル配列を生成。 |
| `buildTree(tasks)` | `GanttChart.tsx` 内 | タスク配列からツリーノードと子カウントマップを生成。 |
| `flattenTree(nodes, collapsed)` | `GanttChart.tsx` 内 | ツリーをフラットな行配列に変換（折りたたみ考慮）。 |
| `calcEffectiveProgress(taskId, childCountMap, allTasks)` | `GanttChart.tsx` 内 | 親タスクの進捗を再帰計算。 |
| `sortAndFilter(tasks, sortKey, sortDir, filterStatus, ...)` | `sort.ts` | ソート・フィルタ適用。`'!done'` フィルタに対応。 |
| `exportToJson(project, tasks)` | `importExport.ts` | JSON 文字列を生成。 |
| `exportToCsv(tasks)` | `importExport.ts` | CSV 文字列を生成（papaparse 使用）。 |
| `importFromJson(jsonStr)` | `importExport.ts` | JSON 文字列をパース。 |
| `importFromCsv(csvStr)` | `importExport.ts` | CSV 文字列をパース（papaparse 使用）。 |
