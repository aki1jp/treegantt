# TreeGantt — タスク管理システム 設計書

| 項目 | 内容 |
|------|------|
| バージョン | 2.34 |
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
| 1.9 | 2026年5月 | Y.js + Hocuspocus を廃止しシンプルな WebSocket broadcast に置き換え・ConnectionBadge / TodoList / yjsStore 削除・apiFetch を utils/api.ts に統合・taskTree.ts 分離 |
| 2.0 | 2026年5月 | Phase 2-A: マイルストーン（菱形◇・DB migration 003）・クリティカルパス CPM（黄背景+インディゴ枠）・バードラッグ移動/リサイズ（1日スナップ）・期限超過強調（赤背景）・期間（Duration）列・ガントバー右クリックメニュー |
| 2.1 | 2026年5月 | スクロールバーをガント列のみに制限（WBS/ガントを2パネル分割・垂直スクロール同期）・マイルストーンUI分離（MilestoneModal・専用ボタン）・WBS depth 計算バグ修正 |
| 2.2 | 2026年5月 | ツールバー2段レイアウト（行1=操作系・行2=ガント表示設定・∧/∨で折りたたみ可・状態をlocalStorageに永続化）・タスクテキスト検索（タイトル/担当者インクリメンタル検索）・テーマ選択をプロジェクトヘッダー右端へ移動 |
| 2.3 | 2026年5月 | ガントヘッダーに曜日行（dow）追加（土=青背景、日=赤背景）・WBSヘッダーを最下段揃え・GanttBarのフォントサイズを行高さに比例させる・開始日/終了日列幅をフォントサイズに応じて自動調整 |
| 2.4 | 2026年5月 | 担当者別負荷ビュー（ResourceView）：ガントエリア下部に担当者×日付の1行ヒートマップを表示。各日セルにタスク数と色を表示（1=緑/2=黄/3=橙/4+=赤）。ツールバー「担当者ビュー」トグルでON/OFF・状態をlocalStorage永続化。水平スクロールをガントと同期。 |
| 2.5 | 2026年5月 | ツールバー行2を複数行対応（flexWrap:wrap）・フィルタ（ステータス/優先度/担当者）を行2インライン直列表示に変更・フィルタドロップダウン廃止。ソート機能全廃（列ヘッダークリック・ソート解除・依存順ボタン）。 |
| 2.6 | 2026年5月 | WBSヘッダー高さ式を修正（`n×HEADER_ROW_H + 2`）。グローバル `box-sizing: border-box` により `borderBottom:2px` が `height` 内に含まれることを考慮し、ガントstickyヘッダー（`n×26 + 2px` auto-height）と一致させる。 |
| 2.7 | 2026年5月 | 親タスクの日付・期間セルを視覚的非インタラクティブ化（WBS: テキスト色をvar(--th-text-dim)に変更）。ガントバーの親タスクリサイズハンドルを非表示にし `cursor:not-allowed` を適用。 |
| 2.8 | 2026年5月 | WBSインライン編集中のテキスト選択（マウスドラッグ）で行D&Dが発動するバグを修正。`handleRowDragStart` でイベントのターゲットが `INPUT`/`SELECT`/`TEXTAREA` のとき `e.preventDefault()` でドラッグをキャンセル。 |
| 2.9 | 2026年5月 | v2.8修正: ブラウザが `dragstart` を draggable 行ラッパー自身に対して発火するため `e.target` ではなく `document.activeElement` で判定するように修正。 |
| 2.10 | 2026年5月 | 親タスクのガントバーをサマリーバーデザインに変更。上部横バー＋左右に下向き三角（突起）を描画し、子タスクの日付範囲を囲む視覚表現を実現。`isParent=true` 時は専用の SVG `path` で描画し、移動ゾーン・リサイズハンドルを完全除去。 |
| 2.11 | 2026年5月 | インポート機能を完全修正。①常に新 UUID を生成（既存タスクを上書きしない）②oldId→newId マッピングで parentId・predecessors を付け替え③3パス方式（INSERT→UPDATE parent_id→INSERT task_deps）でFK順序問題を解消④トランザクションで原子性を保証⑤不正な status/priority はフォールバック。 |
| 2.12 | 2026年5月 | `#` 列 ID を不変化。`seq` フィールド（作成時発番・以降変更不可）を追加し、並び替え・ソート後も `#` が変わらないようにした。`ord`（表示順）とは分離。migration 004 で既存行は `ord` 値を `seq` として引き継ぐ。 |
| 2.13 | 2026年6月 | TaskModal のバグ修正。先行タスク・親タスク選択の `#` 番号表示・入力が `order`（並び替えで変わる表示順）を参照していた問題を修正。`seq`（不変の作成順）を参照するよう統一。 |
| 2.14 | 2026年6月 | プロジェクトタブの削除 UI 変更。タブ内のバツ（✕）ボタンを廃止し、タブ右クリックで表示されるコンテキストメニューから削除できるよう変更。タブ表示がシンプルになり誤操作を防止。既存の `ContextMenu` コンポーネント・`clampMenuPos` ユーティリティを再利用。 |
| 2.15 | 2026年6月 | プロジェクト名変更機能を追加。右クリックメニューに「名前を変更」項目を追加。`PATCH /projects/:id` エンドポイント・`renameProject` サービス関数・`useProjects.renameProject` フックを新設。 |
| 2.16 | 2026年6月 | D&Dで行を別の親に移動した際に旧親・新親の日付が再計算されないバグを修正。`reorderTasks` が変更前後の親 ID を追跡し `recalcParentDates` で再伝播。API ルートで親への `task_updated` をブロードキャスト。WebSocket `tasks_reordered` ハンドラが `parentId` を反映するよう修正。`TodayLine` コンポーネントに `now` タイマーを内包し親から分離。サマリーバー三角を半透明（`cc`）に統一。 |
| 2.17 | 2026年6月 | ステータスに `pending`（保留）を追加。①イナズマラインではペンディングタスクをスキップ（点を追加しない）②フィルタの「DONE以外」を「DONE/保留以外」に変更（`status !== 'done' && status !== 'pending'`）③期限超過判定からペンディングを除外④DB migration 005 で CHECK 制約を更新。 |
| 2.18 | 2026年6月 | タスク行の文字色・背景色カスタマイズ機能を追加。①Task に `titleColor`・`titleBgColor` フィールドを追加（DB migration 006）②タスク右クリックメニューに色パレット（文字色・背景色）を追加。✕スウォッチで個別リセット③「タイトル」列ヘッダー右クリックで全タスクの色を一括リセット④左パネル文字色・左右パネル行背景色に反映。 |
| 2.19 | 2026年6月 | 日付未設定タスクのガント行ドラッグ時に開始日が1日前になるバグを修正。`GanttChart.tsx:startCreateDrag` 内で `new Date(...).toISOString()` を使用していたため UTC 基準の日付が返され、JST 等のタイムゾーン環境で1日ずれが発生していた。`ganttCalc.ts` に `xToDateStr(relX, minDate, dayWidth)` を追加し、コードベース全体の方針（dayjs でブラウザローカル時間を使用）に統一。 |
| 2.20 | 2026年6月 | プロジェクトタブの視認性改善。①スタイル強化：アクティブタブを下線インジケーター＋薄背景＋bold に変更、非アクティブタブにホバー効果追加、長い名前を ellipsis truncate ②タスク件数バッジ：各タブに件数を表示（`GET /projects/:id/tasks` の `total` を全プロジェクト分並列取得）③プロジェクトカラー：`projects` テーブルに `color` カラムを追加（migration 007）、右クリックメニューからプリセット6色を選択可能、タブ全体の背景色に適用。 |
| 2.21 | 2026年6月 | ガントチャート上での先行・後続タスク設定UI追加。①ドラッグ・ツー・リンク：タスクバーホバー時に右端外側にコネクタドット（●）を表示、ドラッグして別バーにドロップで先行関係を追加。ドロップ先候補バーの左端にもドット表示（矢印の着地点を視覚化）。SVGプレビュー破線を描画。②矢印右クリック削除：依存矢印を右クリック→「依存を解除」メニューで削除。③ESCキャンセル対応。④循環依存・自己参照チェック（`wouldCreateDepCycle` を `ganttCalc.ts` に追加）。⑤コネクタドットは GanttBar と切り離し SVG オーバーレイ層でレンダリング（SVG `onMouseMove` 座標ベースのホバー検出）。 |
| 2.22 | 2026年6月 | WBSパネル幅制御機能追加。①折りたたみ（◁/▷ボタン）：WBSパネルを 36px 幅に折りたたみ/展開（`wbsPanelOpen` を localStorage 永続化、`transition: width 0.15s ease` でアニメーション）。②列表示/非表示：ツールバー行2にWBS列チェックボックス（ステータス/優先度/進捗/担当者/開始日/終了日/期間）を追加（`wbsHiddenCols` を localStorage 永続化）。GanttLeftRow に `hiddenCols`・`wbsPanelOpen` props を追加し各列を条件付き表示。 |
| 2.23 | 2026年6月 | WBSトグルボタンをツールバーからWBSヘッダー内に移動。WBS開時: ヘッダー右端に `◁` ボタンを `position:absolute` で上下全体に配置。WBS閉時: `#` セル全体（`alignSelf:stretch`）が `▷` ボタンとして機能。ツールバーから `◁/▷` ボタンを削除。WBSヘッダーに `position:relative`・`minHeight:26` を追加（ヘッダー全OFF時も操作可能）。 |
| 2.24 | 2026年6月 | ガントヘッダー全OFF時のWBS/ガント上下ズレ修正。WBSヘッダーは `minHeight:26` で常に最小高さを維持。ガントヘッダー div に `minHeight: HEADER_ROW_H(26px)` を追加し、ヘッダーが0行でも WBS と同じ高さを確保。WBS開/閉問わず行の上端が揃い、最下行（QuickAddRow）のクリップも解消。 |
| 2.25 | 2026年6月 | 週ヘッダー形式の検討・採用見送り。「6月1W」形式（月内週番号）を試みたが月内週番号は計算定義が複数あり（ISO木曜基準・月曜起算等）ユーザーにとって直感的でないため採用を取りやめ、元の `W23`（ISO年内通し番号）形式を継続採用。 |
| 2.26 | 2026年6月 | ガントバー短期間タイトル表示改善。バー幅に応じてタイトル表示位置を切り替える。①バー内に収まる場合 → バー内にクリッピング表示（従来通り）②バー幅が不足する場合（推定テキスト幅 > 利用可能幅）→ バー右外にはみ出して表示（`clipPath` なし）③バー幅が極端に短い場合（< 12px）→ テキスト非表示（ツールチップに任せる）。推定テキスト幅は `title.length × fontSize × 0.6` で算出。親タスク（サマリーバー）も同ロジックを適用。 |
| 2.27 | 2026年6月 | 担当者ドロップダウン選択機能を追加。①`getUniqueAssignees(tasks)` ユーティリティで全タスクから重複排除済み担当者リストを生成。②TaskModal・MilestoneModal の担当者 `<input>` に `<datalist>` を付与し既存名から選択または新規入力できる combobox UI へ変更。③GanttLeftRow のインライン編集も同様に datalist を追加（`assigneeOptions?: string[]` prop を新設）。④Toolbar の担当者フィルターを `<select>` ドロップダウンに変更（"すべて" + 既存担当者名）。 |
| 2.28 | 2026年6月 | ガントバー create ドラッグのズレ修正。delta（相対移動量）ベースの式を廃止し、カーソルの絶対 relX から `xToDateStr` で直接日付を取得する方式に変更。左ドラッグ時に常に1日遅れていたバグを解消し、カーソルが現在いるセルを常に正確にスパンに含む。1日タスクはアンカーセル内にとどまるドラッグで作成可能。`DragState` に `anchorRelX` フィールドを追加。 |
| 2.29 | 2026年6月 | ガントバーのテキスト自動コントラスト反転。進捗バーがテキスト開始位置を超えた場合にテキスト色を白（`#fff`）へ自動切り替え。通常バー・親タスク（サマリーバー）の inside テキストに適用。outside テキスト（バー右外）は変更なし。 |
| 2.30 | 2026年6月 | 親タスク（サマリーバー）の進捗バーを `effectiveProgress`（子孫タスクの進捗平均）で描画するよう変更。従来は DB 生値 `task.progress` を使用していたため、子タスクが進んでも親バーに反映されなかった。`GanttBar` に `effectiveProgress?: number` prop を追加し、`isParent=true` 時は `effectiveProgress ?? task.progress` を使用。`GanttChart` から `progressMap.get(task.id)` を渡す。テキスト自動コントラスト反転（v2.29）もこの値を使用するため一貫性が保たれる。 |
| 2.31 | 2026年6月 | クリティカルパスの視覚強調。①ガントバー：クリティカルバーの背景 rect に SVG `feDropShadow` フィルター（インジゴ色グロー、stdDeviation=3）を適用。②依存関係矢印：クリティカルな接続（両端タスクが criticalSet に含まれる）を太線インジゴ（`#6366f1`、2.5px）＋グローフィルターで描画。専用矢印ヘッドマーカー `arrowhead-critical` を追加。`DependencyArrow` に `isCritical?: boolean` prop を追加し、`GanttChart` から `criticalSet.has(fromId) && criticalSet.has(toId)` で判定して渡す。 |
| 2.32 | 2026年6月 | 折りたたまれた親タスクへのクリティカルパス強調伝播。ツリーが閉じられている場合も、配下にクリティカルなタスクが隠れていれば親バーをクリティカルスタイルで表示する。`ganttCalc.ts` に `buildCollapsedCriticalParents(sorted, criticalSet, collapsed)` を追加（メモ化 DFS、O(n)）。`GanttChart` で計算した結果を `isCritical={criticalSet.has(id) \|\| collapsedCriticalParents.has(id)}` として `GanttBar` に渡す。 |
| 2.33 | 2026年6月 | 依存関係の接続可否バリデーション強化。**禁止ルール整理**：①自己参照（既実装）②依存グラフのループ（ドラッグ・ツー・リンクは既実装、TaskModal は未対応→今回対応）③祖先↔子孫間の依存（既未実装→今回対応）。`ganttCalc.ts` に `isAncestorOf` / `isAncestorOrDescendant` を追加。ドラッグ・ツー・リンクで祖先-子孫チェックを追加。TaskModal で先行タスク候補から祖先・子孫・循環するタスクを除外、親タスク候補から自分の子孫を除外。 |
| 2.34 | 2026年6月 | ドラッグ・ツー・リンク中、接続不可なタスクにターゲットドットを表示しない。`handleLinkMouseMove` で候補タスクのバリデーション（マイルストーン・親タスク・日付なし・祖先子孫・循環・既接続）を行い、無効な場合は `targetTaskId=null` に設定。`childCountRef` を追加してコールバック内から安定アクセス。テスト用に target dot に `data-link-target-dot` 属性を付与。 |

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

本書はTreeGanttのシステム設計を記述する。本設計書を読めばそのまま実装に着手できる粒度を目指す。

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

TreeGanttはSPA（シングルページアプリケーション）＋WebSocketサーバーの2層構成をDockerコンテナで提供する。

**v1.1変更点:** `api` サービスと `ws` サービスを統合した。SQLiteファイルを2プロセスが共有することによる書き込み競合を排除し、コンテナ構成を簡素化する。

| レイヤー | 技術 | 役割 |
|----------|------|------|
| フロントエンド | React 18 + TypeScript + Vite | UI・ガントチャート・楽観的更新 |
| リアルタイム同期 | WebSocket broadcast (`ws` ライブラリ) | 変更を同一プロジェクトの全クライアントへ配信 |
| バックエンドAPI | Node.js 20 + Fastify | REST API・認証スタブ |
| 永続化 | SQLite (better-sqlite3) | タスクデータの唯一の真の状態 |
| コンテナ | Docker + docker-compose | サービス分離・ポート管理 |

### 2.2 コンテナ構成

`docker-compose.yml` で以下の **2サービス** を定義する（v1.0の3サービスから統合）。

| サービス名 | イメージ | ポート | 役割 |
|-----------|---------|--------|------|
| frontend | node:20-alpine (build) / nginx (prod) | 3000:3000 | Vite dev / Nginx static |
| api | node:20-alpine | 4000:4000, 4001:4001 | Fastify REST API + WebSocket broadcast サーバー + SQLite |

### 2.3 データフロー（★v1.9 更新）

**SQLite が唯一の真の状態。WebSocket は変更通知の配信チャネル。**

**【タスク更新】楽観的更新 + REST + broadcast**
```
useTasks.updateTask(id, patch)
  ├─ Zustand: setTasks（楽観的更新）→ このブラウザのUI即時反映
  └─ REST: PATCH /tasks/:id → DB更新
         → broadcast(projectId, { type: 'task_updated', task })
         → 他の全ブラウザの useWebSocket → setTasks
```

**【タスク作成・削除・並び替え】同様のパターン**
```
REST POST/DELETE/PATCH → DB更新
  → broadcast(projectId, { type: 'task_created' | 'task_deleted' | 'tasks_reordered', ... })
  → 全ブラウザの useWebSocket → setTasks
```

> **送信元クライアントへのエコー:** サーバーは送信元を含む全クライアントへ broadcast する。  
> - `task_created`: 重複チェック（`tasks.some(t => t.id === task.id)`）で防御  
> - `task_updated`: 楽観的更新後にサーバー値で上書き（サーバー値が正）  
> - `task_deleted` / `tasks_reordered`: べき等のため二重適用も無害

**【ブラウザ接続時の初期化】**
```
プロジェクト選択 / ページロード
  → REST GET /projects/:id/tasks → DB から即座に取得 → setTasks（表示）
  → useWebSocket(projectId) → WS接続・subscribe メッセージ送信
```

**【インポート後の他クライアント更新】**
```
インポート実行クライアント: REST POST /import → DB更新 → REST GET /tasks → setTasks（即時反映）
  → broadcast(projectId, { type: 'reload' })
  → 他ブラウザ: needsReload = true → App.tsx の useEffect → REST GET /tasks → setTasks
```

---

## 3. ディレクトリ構成

```
treegantt/
├── docker-compose.yml
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
│       │   └── taskStore.ts      # Zustandストア（タスク・フィルタ・ズーム・needsReload）
│       ├── components/
│       │   ├── ConflictDialog/
│       │   │   └── ConflictDialog.tsx # 編集競合解決ダイアログ
│       │   ├── Gantt/
│       │   │   ├── GanttChart.tsx
│       │   │   ├── GanttBar.tsx
│       │   │   ├── DependencyArrow.tsx
│       │   │   └── LightningLine.tsx  # イナズマライン + 今日ライン
│       │   ├── TaskModal/
│       │   │   └── TaskModal.tsx
│       │   └── Toolbar/
│       │       └── Toolbar.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts   # WebSocket接続・メッセージ適用フック
│       │   └── useTasks.ts       # タスク操作フック（楽観的更新 + REST）
│       └── utils/
│           ├── api.ts            # 共通 apiFetch ユーティリティ
│           ├── ganttCalc.ts      # ガントチャート計算・ズームレベル
│           ├── importExport.ts   # Import/Export
│           ├── sort.ts           # フィルタロジック（filterTasks）
│           └── taskTree.ts       # buildTree / flattenTree / calcEffectiveProgress
└── api/
    ├── Dockerfile
    ├── package.json
    ├── src/
    │   ├── index.ts              # Fastify サーバー起動（broadcast.ts を import で WS も同時起動）
    │   ├── db/
    │   │   ├── client.ts         # better-sqlite3接続・WAL設定
    │   │   └── migrations/
    │   │       ├── 001_init.sql
    │   │       ├── 002_parent.sql    # parent_id カラム追加
    │   │       └── 003_milestone.sql # is_milestone カラム追加（★v2.0）
    │   ├── routes/
    │   │   ├── health.ts         # GET /health
    │   │   ├── tasks.ts          # タスクCRUD・並び替え・フィルタ
    │   │   ├── projects.ts       # プロジェクトCRUD
    │   │   └── importExport.ts   # Import/Export
    │   ├── services/
    │   │   └── taskService.ts
    │   ├── ws/
    │   │   └── broadcast.ts      # WebSocketServer（ws ライブラリ）+ broadcast 関数
    │   └── plugins/
    │       └── auth.ts           # 認証プラグイン（Phase 2 LDAP 用スタブ）
    └── data/
        └── treegantt.db           # SQLiteファイル（永続化）
```

---

## 4. データモデル

### 4.1 型定義 (TypeScript)

`frontend/src/types/task.ts` に定義する。すべてのコンポーネントがこの型を参照する。

```typescript
export type TaskStatus   = 'todo' | 'wip' | 'done' | 'wait' | 'pending';
// ★v1.8: 表示ラベル — todo:'TODO' / wip:'Doing' / done:'DONE' / wait:'待機'
// ★v2.17: pending:'保留'
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
  isMilestone:  boolean;       // マイルストーンフラグ（★v2.0追加）
  predecessors: string[];      // 先行タスクID配列
  seq:          number;        // 作成時に発番・以降不変（# 列表示用）
  order:        number;        // 表示順（並び替えで変わる）
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
> - `successors` を `Task` から除外。後続タスクは `task_deps` を JOIN して計算する派生値。APIレスポンスには `TaskWithSuccessors` を使用する。
> - `priority`・`progress` フィールドを追加
> - `ZoomLevel` 型を追加（ガントチャートのズーム管理に使用）
>
> **v1.3追加**
> - `parentId` フィールド追加。ツリー構造タスクを実現する。循環参照防止はアプリケーション層で担保する。
>
> **v2.0追加**
> - `isMilestone` フィールド追加。`true` のタスクはガントチャートで菱形◇として表示される。

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
              CHECK(status IN ('todo','wip','done','wait','pending')),
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

**`003_milestone.sql`** — マイルストーン対応（★v2.0追加）

```sql
ALTER TABLE tasks ADD COLUMN is_milestone INTEGER NOT NULL DEFAULT 0;
```

> 親タスクが削除された場合、子タスクの `parent_id` は `NULL` にリセットされる（CASCADE削除ではなくルートへの昇格）。
>
> ※ `successors` は `task_deps` を JOIN して計算するためDBには保存しない。
> ※ `PRAGMA journal_mode = WAL` と `PRAGMA foreign_keys = ON` は `client.ts` で接続時にも実行する。
> ※ マイグレーションは `client.ts` 起動時に順番に実行。既存カラムの追加は `try/catch` でべき等に処理する。

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
| POST | `/projects` | プロジェクト作成（`name`, `color?`） |
| PATCH | `/projects/:id` | プロジェクト更新（`name?`, `color?`） |
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

> ※ v1.0 にあった `POST /ws/store`（内部永続化コールバック）は削除済み。

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
  "isMilestone":  false,
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
id, parentId, title, summary, description, status, priority, progress, assignee, startDate, endDate, isMilestone, predecessors
```

> ※ `predecessors` はセミコロン区切りのIDリスト。例: `"uuid-1;uuid-2"`
> ※ `parentId` は空文字または省略でルートタスク（親なし）。
> ※ `isMilestone` は `1`（マイルストーン）または `0`（通常タスク）。（★v2.0追加）
> ※ **★v1.4：** インポート時に `.csv` 拡張子のファイルを選択すると `importFromCsv()` が呼ばれ、JSONと同様に `/projects/:id/import` エンドポイントへ送信される。ファイル選択ダイアログは `.json,.csv` の両形式を受け付ける。

---

## 6. リアルタイム同期設計

### 6.1 設計方針（★v1.9 刷新）

**v1.8 以前（Y.js + Hocuspocus）の問題点:**
- Y.js CRDT の複雑な初期化フローが StrictMode の二重マウントと干渉し、プロジェクト切り替え時のタスク消失バグが繰り返し発生した
- Hocuspocus の `onAuthenticate` の有無でプロトコルが変わる等、仕様理解コストが高かった
- Y.js スナップショットと SQLite の2つの「真の状態」が競合した

**v1.9 の方針（シンプルな WebSocket broadcast）:**
- **SQLite を唯一の真の状態**とする。クライアントは常に REST API 経由でデータを読み書きする
- WebSocket は「変更通知チャネル」に徹する。データそのものは REST で取得する
- 楽観的更新（Zustand への即時反映）+ REST 送信 + 他クライアントへの broadcast という明確な一方向フロー

### 6.2 サーバー実装 (`api/src/ws/broadcast.ts`)

```typescript
import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = parseInt(process.env.WS_PORT ?? '4001', 10);

// projectId → 接続中クライアント一覧
const rooms = new Map<string, Set<WebSocket>>();

export const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  let room: string | null = null;

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'subscribe' && msg.projectId) {
      if (room) rooms.get(room)?.delete(ws);
      room = msg.projectId;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(ws);
    }
  });

  ws.on('close', () => {
    if (room) rooms.get(room)?.delete(ws);
  });
});

export function broadcast(projectId: string, message: unknown): void {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
```

各ルートハンドラーは DB 更新後に `broadcast(projectId, { type, projectId, ...payload })` を呼ぶ。

### 6.3 メッセージ型一覧

| `type` | 送信タイミング | payload |
|--------|--------------|---------|
| `task_created` | タスク作成後 | `{ task: Task }` |
| `task_updated` | タスク更新後 | `{ task: Task }` |
| `task_deleted` | タスク削除後 | `{ id: string }` |
| `tasks_reordered` | 並び替え後 | `{ orders: { id, order }[] }` |
| `reload` | インポート後 | （payload なし） |

### 6.4 フロントエンド接続 (`hooks/useWebSocket.ts`)

React 18 StrictMode の二重マウント対策として、WebSocket インスタンスをモジュールレベルのシングルトンで管理する。

```typescript
// モジュールレベルシングルトン（StrictMode二重マウント対策）
let _ws: WebSocket | null = null;
let _projectId: string | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function applyMessage(msg) {
  const store = useTaskStore.getState();
  switch (msg.type) {
    case 'task_created':
      // 重複チェック（楽観的追加との競合防止）
      if (!store.tasks.some(t => t.id === msg.task.id))
        store.setTasks([...store.tasks, msg.task]);
      break;
    case 'task_updated':
      store.setTasks(store.tasks.map(t => t.id === msg.task.id ? msg.task : t));
      break;
    case 'task_deleted':
      store.setTasks(store.tasks.filter(t => t.id !== msg.id));
      break;
    case 'tasks_reordered':
      // ... order を map で一括更新
      break;
    case 'reload':
      store.setNeedsReload(true); // App.tsx の useEffect が REST re-fetch をトリガー
      break;
  }
}

export function useWebSocket(projectId: string | null) {
  useEffect(() => {
    if (!projectId) { /* disconnect */ return; }
    if (_projectId === projectId && _ws?.readyState === WebSocket.OPEN) return;
    openWs(projectId); // 接続・subscribe・3秒後自動再接続
  }, [projectId]);
}
```

---

## 7. フロントエンド設計

### 7.1 状態管理

Zustand の `taskStore` 1つに統一する（★v1.9: `connectionStore` / `yjsStore` 廃止）。WebSocket の `applyMessage` が `useTaskStore.getState().setTasks()` を直接呼ぶことでUIに反映する。

```typescript
// store/taskStore.ts
interface TaskStore {
  tasks:              Task[];
  needsReload:        boolean;       // ★v1.9: import後のre-fetchトリガー
  filterStatus:       TaskStatus | '' | '!done'; // '!done' = DONE以外をすべて表示
  filterAssignee:     string;
  filterPriority:     string;
  zoomLevel:          ZoomLevel;     // ガントチャートのズームレベル
  ganttStartDate:     string;        // ガント表示開始日（'' = 自動）
  ganttPeriod:        GanttPeriod;   // ガント表示期間（デフォルト '3m'）
  showLightningLine:  boolean;       // イナズマライン表示ON/OFF（デフォルト: true）
  showCriticalPath:   boolean;       // クリティカルパス表示ON/OFF（★v2.0追加）
  ganttHeaderLevels:  {              // ガントヘッダー表示レベル
    year:  boolean;
    month: boolean;
    week:  boolean;
    day:   boolean;
  };
  setTasks:               (tasks: Task[]) => void;
  setNeedsReload:         (v: boolean) => void;
  setFilter:              (filter: Partial<Pick<TaskStore, 'filterStatus' | 'filterAssignee' | 'filterPriority'>>) => void;
  setZoomLevel:           (z: ZoomLevel) => void;
  setGanttRange:          (startDate: string, period: GanttPeriod) => void;
  setShowLightningLine:   (show: boolean) => void;
  setShowCriticalPath:    (show: boolean) => void;  // ★v2.0追加
  setGanttHeaderLevels:   (levels: Partial<TaskStore['ganttHeaderLevels']>) => void;
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

#### 親タスク 読み取り専用デザイン（★v2.6追加）

子タスクを持つ**親タスク**は日付・期間・進捗率が自動計算されるため、WBS・ガントともに「触れないデザイン」にする。

| 領域 | 項目 | 実装 |
|------|------|------|
| WBS 日付セル | `startDate` / `endDate` / `duration` | テキスト色を `var(--th-text-dim)`（薄グレー）に変更。クリックしてもテキスト入力に遷移しない（`onClick` 無効） |
| WBS 進捗セル | `progress` | 既存：色を薄くして `cursor: default`（変更なし） |
| ガントバー | リサイズハンドル（左右） | `isParent=true` のとき描画しない |
| ガントバー | ドラッグゾーン | `cursor: not-allowed` に変更（移動・リサイズ操作なし） |

> **`GanttBar` への `isParent` prop**: `GanttChart` 側で `childCount.get(task.id) > 0` を評価して渡す。バー自体のクリック（タスク詳細を開く）は親でも有効のまま維持する。

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
| 週 (week) | `W21`（ISO年内通し番号） | 月曜日ごと |
| 日 (day) | `22` | 1日ごと |

- デフォルトは全4行表示（day 行が有効のとき dow 行も自動生成されるため最大5行）
- 1行あたりの高さ: `HEADER_ROW_H = 26px`
- **ガントヘッダー内行は必ず `boxSizing: 'border-box'`** を指定する。ri > 0 の行に `borderTop: 1px` が付くが、border-box なら行全体がなお 26px に収まる。border-box なしだと 1行ごとに +1px され、n行で最大 (n-1)px のズレが生じる
- ガントstickyヘッダー合計高さ = `n × HEADER_ROW_H + 2px`（n行の内側divの合計 + 外側の `borderBottom: 2px`。外側 div は auto-height のため border は外に加算される）
- **WBSヘッダー高さの注意**: `index.html` でグローバル `box-sizing: border-box` を設定しているため、明示的な `height` に `borderBottom` が含まれる。ガントと一致させるには `height: n × HEADER_ROW_H + 2` と指定する必要がある
- `data-testid="gantt-header"` が付与されており、内行の `boxSizing` スタイルはテストで保護される
- **週ヘッダーは ISO 年内通し番号（W1〜W53）を採用**。「6月1W」のような月内週番号は計算定義が複数存在する（ISO木曜基準・月曜起算・日曜起算等）ため採用しない
- 非表示にしたい行は Toolbar のトグルボタンで切り替え

#### イナズマライン (Lightning Line) の定義

**描画方式（進捗ベースのジグザグ折れ線）:**

各タスクのバー上における進捗 X 座標を `{x, y}` 点として収集し、行順に polyline でつなぐ。

```
進捗 X = startX + (endX - startX) × effectiveProgress / 100
Y = rowIndex × ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2  （行の中心）
```

日付が未設定のタスク行はスキップ（折れ線がその行を飛ぶ）。日付設定済みタスクが 2 件以上あるときのみ描画する。

| 線の種類 | 色 | 描画方式 | 表示条件 |
|---------|-----|---------|---------|
| 今日ライン | `#E24B4A`（赤） | 今日の日付を X 座標にした縦破線 | 常に表示 |
| イナズマライン | `#7c3aed`（紫） | 各行の進捗 X 座標を polyline でつなぐジグザグ折れ線 | 日付設定済みタスクが 2 件以上 |

> イナズマラインが全体的に今日ラインより左にある場合は遅延傾向、右にある場合は進行良好を示す。

#### 依存関係矢印の描画

先行タスクの右端から後続タスクの左端へ、SVGのcubic-bezierで結ぶ。ズームレベルに応じてコントロールポイントのオフセットを調整する。

```typescript
// DependencyArrow.tsx
// d={`M${x1},${y1} C${x1+30},${y1} ${x2-30},${y2} ${x2},${y2}`}
// stroke='#378ADD' strokeWidth={1.5} markerEnd='url(#arrowhead)'
```

### 7.3 フィルタリング仕様

**表示順:** 常に `order`（DBの `ord` フィールド）昇順。ソート機能は持たない。ドラッグ＆ドロップで並び順を変更できる（ソートなし時のみ有効）。

**フィルタリング:** ステータス・担当者・優先度をフロントエンドのメモリ上でフィルタリングする。APIへの追加問い合わせは不要。

**★v1.8 ステータスフィルタ選択肢:**

| 値 | 表示ラベル | 動作 |
|----|---------|------|
| `''` | すべて | フィルタなし |
| `'todo'` | TODO | status === 'todo' |
| `'wip'` | Doing | status === 'wip' |
| `'done'` | DONE | status === 'done' |
| `'wait'` | 待機 | status === 'wait' |
| `'pending'` | 保留 | status === 'pending' |
| `'!done'` | **DONE/保留以外** | status !== 'done' && status !== 'pending' |

> フィルタはフロントエンドのメモリ上で行う。

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

**CSS実装（★v2.1変更）:** WBS左パネルとガントパネルを **独立した2カラム** に分離する。

| 領域 | overflow | 説明 |
|------|----------|------|
| 外側ラッパー | `hidden` | スクロールバー非表示 |
| WBS左パネル | `overflow: hidden` | 水平・垂直ともスクロールバーなし |
| ガント右パネル | `overflow: auto` | 横スクロールバーはガント下のみ表示 |

垂直スクロールはガント右パネルの `onScroll` で WBS 左パネルの `scrollTop` を同期する（1行の JS）。
旧実装（`position: sticky; left: 0`）ではスクロールバーが WBS 幅まで及んでいたため廃止。

**★v2.8追加（v2.9修正） — WBS行D&D中のインライン編集テキスト選択干渉対策:**

WBS行は `draggable` 属性でD&Dを実現している。インライン編集中（タイトル・担当者等の `<input>` にフォーカスがある状態）にテキストをマウスドラッグで選択しようとすると、ブラウザが行D&Dの `dragstart` を発火してしまう。

**実装上の注意**: `dragstart` イベントはブラウザが draggable 要素（行ラッパー `<div>`）を起点として発火する。そのため `e.target` は行ラッパー自身になり、子要素の `<input>` を `e.target` で検出することはできない。

正しいアプローチは `document.activeElement` を確認すること。インライン編集中は `<input>` がフォーカスを持つため、`activeElement.tagName` で判定できる。

```typescript
function handleRowDragStart(e: React.DragEvent, taskId: string) {
  const active = document.activeElement;
  const tag = active?.tagName ?? '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    e.preventDefault();
    return;
  }
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  setRowDragId(taskId);
}
```

**★v2.10追加 — 親タスク サマリーバーデザイン:**

`GanttBar` の `isParent=true` 時に専用の SVG 構造を描画する。

| 要素 | 内容 |
|------|------|
| 上部横バー | `<rect>` で全幅・高さ `topH = Math.round(barHeight × 0.42)` |
| 左下向き三角 | `<polygon>` — 左辺垂直、斜辺が左上→右下方向 |
| 右下向き三角 | `<polygon>` — 右辺垂直、斜辺が右上→左下方向（左の鏡像） |
| タイトル | `<text>` + `<clipPath>` で横バー内に表示 |

```
topH = Math.round(barHeight * 0.42)  // 上部バー高さ
legW = topH + 2                       // 三角の底辺幅（≈topH）

左三角: (x, y+topH) → (x+legW, y+topH) → (x, y+barHeight)
右三角: (x+w-legW, y+topH) → (x+w, y+topH) → (x+w, y+barHeight)
```

移動・リサイズハンドルは描画しない。`<g>` 全体に `cursor: pointer` を設定し、クリックで詳細ダイアログを開く。

**★v2.6追加 — WBS/ガントヘッダー高さ揃えの制約:**

`index.html` に `*, *::before, *::after { box-sizing: border-box }` を適用しているため、`height` を明示した要素は `borderBottom` が **高さ内に含まれる**。

| 要素 | height指定 | 実高さ | 備考 |
|------|-----------|--------|------|
| WBSヘッダー（明示height） | `n × HEADER_ROW_H + 2` | `n×26 + 2` | border-box: border は height 内に含まれる。+2 がないとガントより 2px 低くなる |
| ガントstickyヘッダー（auto-height） | なし | `n×26 + 2` | inner rows の合計 n×26 に、外側 div の borderBottom 2px が自動付加される |

> **auto-height 要素では box-sizing は height に影響しない**。height 未指定要素はコンテンツが自動決定し、border は常に外側に追加される。

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
| `Toolbar` | **2段レイアウト**。行1（常時表示・height 44px）: 検索ボックス（タイトル/担当者インクリメンタル検索）・タスク追加・マイルストーン追加・Import/Export（☰メニュー）・∧/∨折りたたみトグル。行2（∧/∨で折りたたみ可・状態はlocalStorage永続化・**flexWrap:wrap** で複数行表示可）: フィルタ（ステータス/優先度/担当者セレクト直列＋クリア）・ズーム選択・ガント開始日・期間・ヘッダー行トグル（年/月/週/日）・イナズマラインON/OFF・土日強調・クリティカルパスCP・**担当者ビューON/OFF**・文字サイズ・行高・デフォルトリセット。フィルタドロップダウンポップアップは廃止。テーマ選択はプロジェクトヘッダー右端に配置 |
| `GanttChart` | 左固定列（`GanttLeftRow`）+ 右タイムライン（SVG）を1コンポーネントで統合管理。ツリー構造・折りたたみ状態も内包。行高さアライメント・マルチレベルヘッダー（年/月/週/日/曜日行）・親タスク進捗自動計算・イナズマラインON/OFF対応。バードラッグ（移動/リサイズ）状態管理・DragState/DragPreview。SVGネイティブ contextmenu リスナーで右クリックメニューを制御。期間（Duration）列表示。下部に `ResourceView` を配置 |
| `ResourceView` | ガントエリア下部の担当者別負荷ビュー。担当者ごとに1行、各日セルにタスク数（色＋数字）を表示。`showResourceView` が false のとき非表示。水平スクロールをガントパネルと同期。将来のタブ化を見据えた独立コンポーネント設計 |
| `GanttLeftRow` | 統合ガントビューの1行分の左パネル。セルクリックでインライン編集、右クリックでコンテキストメニュー、`depth` による視覚的インデント。編集開始値と現在値を比較して競合を検知し `ConflictDialog` を呼び出す |
| `ConflictDialog` | インライン編集中に他ユーザーが同じフィールドを更新した場合に表示する競合解決ダイアログ。「別のユーザーの変更を使う」「自分の変更を適用する」の2択 |
| `QuickAddRow` | タスクリスト末尾に常時表示する空行。クリックで入力フィールド出現、Enter でタスク作成、Escape でキャンセル |
| `GanttBar` | 1タスク分のバー。クリックでモーダル起動。`isMilestone` 時は菱形◇表示。`isCritical` 時は黄背景+インディゴ枠。`isOverdue` 時は赤背景。左右端6pxをドラッグでリサイズ、中央をドラッグで移動。右クリックはGanttChart側のネイティブリスナーで処理。バー幅に応じてタイトル表示位置を切り替え（バー内 / バー右外 / 非表示の3段階）。 |
| `DependencyArrow` | SVGで矢印描画。props: `fromTask`, `toTask`, `minDate`, `zoom` |
| `LightningLine` | イナズマライン（polyline）と今日ライン（line）を描画。`calcLightningPoints` が返す `{x,y}[]` を受け取り斜線で結ぶ |
| `TaskModal` | 新規作成・編集フォーム。親タスク選択セレクト・先行タスクのmulti-select・進捗率スライダー含む。説明フィールドは「編集」/「プレビュー」タブで切り替え（`react-markdown` でレンダリング） |

### 7.6 インライン編集仕様（★v1.3追加・v1.6更新）

| 操作 | 動作 |
|------|------|
| セルをクリック | そのセルが編集モードになる（入力フィールドまたはセレクトボックス） |
| Enter / フォーカスアウト | 変更を `PATCH /tasks/:id` で即時保存 |
| Escape | 変更を破棄して表示モードに戻る |
| 右クリック | コンテキストメニューを表示（「編集（詳細）」「削除」） |
| 「編集（詳細）」選択 | TaskModal を開き、全フィールドを編集可能 |

> **★v1.9 — `updateTask` の内部動作:**
> 1. Zustand `setTasks`（楽観的更新）でこのブラウザのUIを即時反映
> 2. REST `PATCH /tasks/:id` でDB更新
> 3. サーバーが `broadcast(projectId, { type: 'task_updated', task })` → 他の全ブラウザが Zustand を更新

**インライン編集できるフィールド：** タイトル、ステータス（セレクト）、優先度（セレクト）、進捗（数値入力）、担当者、開始日、終了日

#### タスク検索（★v2.1追加）

Toolbar 最左端に常時表示するインクリメンタル検索ボックス。

| 項目 | 仕様 |
|------|------|
| 対象フィールド | タイトル・担当者（部分一致・大文字小文字無視） |
| 状態 | `filterSearch: string`（Zustand。localStorage には保存しない） |
| 適用タイミング | 1文字入力ごとにリアルタイムでWBS/ガントを絞り込み |
| ロジック | `filterTasks` の引数に追加（他フィルタと AND 条件） |

**TaskModal でのみ編集できるフィールド：** サマリ、説明、親タスク、先行タスク

#### 説明フィールドの Markdown プレビュー（★v2.1追加）

説明フィールドは「編集」/「プレビュー」タブで切り替えできる。

| タブ | 内容 |
|------|------|
| 編集（デフォルト） | `<textarea>` で Markdown を入力 |
| プレビュー | `react-markdown` でレンダリングした HTML を表示 |

- タブ状態はモーダル開閉ごとにリセット（デフォルト「編集」）
- 空の場合は「説明がありません」とプレースホルダー表示
- ライブラリ: `react-markdown`（XSSセーフ、デフォルト設定）

### 7.7 ツリー表示仕様（★v1.3追加）

`GanttChart` は `parentId` を元にツリーノードを構築し（`utils/taskTree.ts`）、フラット化してテーブル行として描画する。

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
| `DB_PATH` | api | `/app/data/treegantt.db` | SQLiteファイルパス |
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
5. WebSocket の `subscribe` メッセージでも同JWTを検証（Phase 2 実装時）

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
| `zustand` | ^4.5 | 状態管理 |
| `dayjs` | ^1.11 | 日付操作 |
| `papaparse` | ^5.4 | CSV Parse/Stringify |

### 10.2 api（REST API + WebSocket）

| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `fastify` | ^4.27 | HTTPサーバー |
| `better-sqlite3` | ^9.4 | SQLiteドライバー |
| `@fastify/cors` | ^9.0 | CORSミドルウェア |
| `ws` | ^8.x | WebSocketサーバー（broadcast） |
| `uuid` | ^10 | UUID生成（サーバー側のみ） |
| `ldapjs` | ^3.0 | LDAP認証（Phase 2） |
| `fast-jwt` | ^3.3 | JWT発行・検証（Phase 2） |

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
| Phase 1-K | Y.js + Hocuspocus 廃止・WebSocket broadcast 導入・ConnectionBadge/TodoList 削除・apiFetch 統合・taskTree.ts 分離・シナリオテスト138件追加（フロントエンド計153件） | ★v1.9実装内容 | ✅ 完了 |
| Phase 2-A | バーのドラッグ移動・リサイズ・マイルストーン・クリティカルパス・期限超過強調・期間フィールド・ガントバー右クリックメニュー | WBS標準機能完成 | ✅ 完了 |
| Phase 2 | LDAP認証組み込み | 認証付き本番稼働 | ⏳ 未着手 |

---

## 11-A. Phase 2-A 機能設計

### 11-A.1 バーのドラッグ移動・リサイズ

| 項目 | 仕様 |
|------|------|
| ドラッグ移動 | バー中央部を掴んで左右にドラッグ → startDate/endDate を同じ日数分シフト |
| 左端リサイズ | バー左端6px ゾーンをドラッグ → startDate を変更（endDate は固定） |
| 右端リサイズ | バー右端6px ゾーンをドラッグ → endDate を変更（startDate は固定） |
| スナップ | 1日グリッドにスナップ（dayWidth px 単位で四捨五入） |
| プレビュー | ドラッグ中はバーをリアルタイム移動表示 |
| コミット | mouseup 時に `PATCH /tasks/:id` へ新 startDate/endDate を送信 |
| カーソル | 中央: `move`、端: `ew-resize`、ドラッグ中: 全体に `grabbing` |
| マイルストーンの扱い | 移動のみ対応（endDate 自動同期）、リサイズ不可 |

**実装方針（GanttChart.tsx）:**
```
dragState: { taskId, type: 'move'|'resize-left'|'resize-right', startClientX, origStart, origEnd } | null
dragPreview: { taskId, startDate, endDate } | null
```
- `dragState` が非 null の間、`window.addEventListener('mousemove'/'mouseup')` で追跡
- `dragPreviewRef` (useRef) で最新プレビューをクロージャ外から参照
- `GanttBar` は `dragPreview` prop で上書き座標を受け取り描画

### 11-A.2 マイルストーン

| 項目 | 仕様 |
|------|------|
| データ | `tasks.is_milestone INTEGER NOT NULL DEFAULT 0`（DB migration 003） |
| 判定 | `isMilestone: boolean` フィールドで明示管理 |
| 描画 | 菱形 `◇` を startDate 位置に表示（endDate は描画に使わない） |
| サイズ | 対角線 = ROW_HEIGHT_PX - 12 px |
| 期限超過との組み合わせ | 菱形も赤枠になる |
| ドラッグ | 移動のみ対応（startDate + endDate を同日で同期） |

### 11-A.3 クリティカルパス

標準的な CPM（Critical Path Method）を依存関係グラフに適用する。

**アルゴリズム:**
1. 依存グラフを Kahn のアルゴリズムでトポロジカルソート
2. **Forward pass**: `EF[i] = ES[i] + dur(i)`, `ES[i] = max(EF[predecessors])`（先行なし = 0）
3. **Backward pass**: `LS[i] = LF[i] - dur(i)`, `LF[i] = min(LS[successors])`（後続なし = projectEF）
4. **Total Float** = `LS - ES`。Float = 0 のタスクがクリティカルパス上のタスク
5. 依存関係が1つもなければ空セット（表示なし）

**実装:** `calcCriticalPath(tasks: Task[]): Set<string>` を `ganttCalc.ts` に追加

**UI:** ツールバーの「CP」トグルボタンで ON/OFF。ON 時はクリティカルなバーに以下のスタイルを適用する。

| 要素 | スタイル |
|------|---------|
| バー背景 | `#fef08a`（薄黄色） |
| バー枠線 | `#6366f1`（インディゴ）、strokeWidth 2.5 |
| リサイズハンドル | `#6366f1aa`（インディゴ半透明） |
| マイルストーン菱形 | 同様に黄背景+インディゴ枠 |
| テキスト色 | `#6366f1`（インディゴ） |

> イナズマライン（紫 `#7c3aed`）と色相が近いが、黄色背景で明確に区別できる。期限超過（赤）・クリティカル（黄+インディゴ枠）・イナズマライン（紫）の3者が視覚的に識別可能。

### 11-A.4 期限超過の強調

| 条件 | `endDate < today` かつ `status !== 'done'` |
|------|------|
| 通常バー背景 | `#fca5a5`（赤）|
| 通常バー枠線 | `#ef4444`（赤） |
| リサイズハンドル | `#dc2626`（濃い赤） |
| マイルストーン菱形 | `#fca5a5` 背景 + `#ef4444` 枠線（strokeWidth 2.5） |

> 期限超過はクリティカルパス表示より優先される（両方が真の場合は期限超過スタイルが適用される）。

### 11-A.5 期間（Duration）フィールド

- 左パネルに「日数」列（50px）を追加
- 表示値: `endDate - startDate + 1`（日）。日付なし・終了 < 開始 の場合は `—`
- インライン編集: 日数を変更すると `endDate = startDate + (N-1) 日` を自動計算して反映
- startDate がない場合は編集不可

### 11-A.6 ガントバー右クリックメニュー

ガントバー（通常・マイルストーン）を右クリックすると、WBS左パネルと同じコンテキストメニューを表示する。

**実装方針:**
- React の合成イベント `onContextMenu` は SVG `<g>` 要素では信頼性が低いため使用しない
- SVG 要素に `useRef` でネイティブ `addEventListener('contextmenu')` を設定
- `data-task-id` 属性 + `e.target.closest('[data-task-id]')` でヒットテスト
- メニュー表示: `{ x: clientX, y: clientY, taskId }` を state に保存 → fixed div で描画
- メニュー非表示: `window.addEventListener('mousedown', close)` でメニュー外クリックを検知

| メニュー項目 | 動作 |
|------------|------|
| 編集 | TaskModal を開く |
| 削除 | タスクを削除（確認なし） |

---

## 12. 非機能要件

| 項目 | 目標値 | 手段 |
|------|--------|------|
| 同時接続数 | 最大10名 | WebSocket broadcast / Node.js |
| レスポンス（REST） | 95%ile < 100ms | SQLite インデックス（status・assignee・dates） |
| リアルタイム遅延 | < 200ms | WebSocket broadcast（楽観的更新で体感0ms） |
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
| 開発中のDB確認 | Prisma Studio（ブラウザGUI） | 下記代替ツールを使用 |

スケール（最大10ユーザー）とシンプルさを優先し、現行設計を維持する。

### 13.3 開発中のDB確認方法（代替手段）

Prisma Studio の代わりに以下を使用する。

| ツール | 用途 | 使い方 |
|--------|------|--------|
| [DB Browser for SQLite](https://sqlitebrowser.org/) | ローカルGUI。SQLiteファイルを直接開いて閲覧・編集 | `api/data/treegantt.db` を開く |
| `sqlite3` CLI | ターミナルから即座にクエリ実行 | `sqlite3 api/data/treegantt.db` |
| `sqlite-web`（開発docker-composeに追加可） | ブラウザGUI。Prisma Studioと同等の使い勝手 | 下記参照 |

開発時に `sqlite-web` が必要な場合、`docker-compose.yml` に追加する：

```yaml
  db-ui:
    image: coleifer/sqlite-web
    ports:
      - '8888:8080'
    volumes:
      - ./api/data:/data
    command: sqlite_web --host 0.0.0.0 /data/treegantt.db
    profiles: ["dev-tools"]  # 通常起動時は除外、必要時に --profile dev-tools で起動
```
