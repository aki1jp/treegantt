# TreeGantt — タスク管理システム 設計書

| 項目 | 内容 |
|------|------|
| バージョン | 2.69 |
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
| 2.35 | 2026年6月 | v2.33/v2.34 で「親タスクかどうか（isParent）」を禁止条件にしていたため親タスク↔無関係タスク間の依存が張れなかったバグを修正。正しい禁止ルールは「祖先-子孫関係にあるかどうか（isAncestorOrDescendant）」のみ。コネクタドット表示条件と `handleLinkMouseMove` ターゲット検証から `isParent` チェックを削除。`childCountRef` も不要になり削除。 |
| 2.36 | 2026年6月 | 依存矢印スタイルを 3 種類から選択可能に。`DepArrowStyle = 'bezier' \| 'elbow' \| 'straight'` 型を `ganttCalc.ts` に追加。`taskStore` に `depArrowStyle` 設定を追加しlocalStorage 永続化。`DependencyArrow` に `style` prop を追加し `buildPath` 関数でパスを切り替え（elbow: 横距離が `OFFSET*2` 以上なら L 字形、未満なら S 字形迂回。`x2 ≈ x1` の真下矢印もS字になる）。ツールバーに曲線/直角/直線の 3 ボタンを追加。 |
| 2.37 | 2026年6月 | 親タスク日付の非破壊化 ＋ フロントエンド表示包含。**変更前**：子タスクの日付変更・WBSドラッグ・作成・削除のたびに `recalcParentDates`/`propagateDatesToParent` が親の `start_date`/`end_date` を DB で上書きしていた。**変更後**：APIは親の日付を一切変更しない（`recalcParentDates`・`propagateDatesToParent` 削除）。代わりに `ganttCalc.ts` の `calcParentSpanMap(allTasks)` がフロントエンドで子孫の min/max を再帰計算し、`GanttChart` が `parentSpanMap` として事前計算。`GanttBar` に `displayStart`/`displayEnd` props を追加し、`isParent=true` のバーはこれを優先して描画する。ガントバードラッグ・WBSドラッグ（移動元/移動先）・子作成・子削除・インポートいずれも `taskStore` が更新されるたびに自動再計算されるため、常に正しい包含範囲が表示される。ドラッグ中（`dragPreview`）は対象タスク自身のバーのみ動き、親バーはドロップ完了後に更新される（`effectiveProgress` と同仕様）。 |
| 2.38 | 2026年6月 | WBS/ガントヘッダー高さの自動同期。`ganttHeaderRef`（`useRef<HTMLDivElement>`）を `data-testid="gantt-header"` div に付与し、ResizeObserver でガントヘッダーの実測 `offsetHeight` を `ganttHeaderH` state に格納。WBS ヘッダーの height を `ganttHeaderH \|\| totalHeaderH`（計測値優先、jsdom等 では formula フォールバック）に変更。これにより新しいヘッダー行を追加しても `totalHeaderH` 式を手動修正する必要がなくなる。 |
| 2.39 | 2026年6月 | マイルストーン強調 UI 改善。①ガントバーのひし形アイコンに `milestoneColor` prop（`milestoneHighlightColor` を渡す）を追加し、列背景と同系色で描画。②ツールバーの「マイル強調」ON/OFFボタンとカラーピッカーを「年/月/週/日」ヘッダートグルグループの「日」の隣に移動。③マイルストーンヘッダー独立行に `data-milestone-marker` を付与しラベル色を `milestoneHighlightColor` に統一。 |
| 2.40 | 2026年6月 | マイルストーン強調カラー優先順位修正。①`isMilestoneDate` の判定を `row.level === 'day'` 限定から全ヘッダー行（year/month/week/day/dow）に拡張し、曜日（dow）行でもマイルストーン列が強調色になるよう修正。②背景色優先順位を `土/日 > マイル > 交互bg` から **`マイル > 土/日 > 交互bg`** に変更し、マイルストーンが土日と重なった場合もマイルストーン色が確実に表示されるよう修正。 |
| 2.41 | 2026年6月 | 表示期間の最小を3ヶ月に変更・長期選択肢追加。`GanttPeriod` 型を `'2w' \| '1m' \| '3m' \| '6m'` から **`'3m' \| '6m' \| '12m' \| '24m'`** に変更。`PERIOD_DAYS` に `'12m': 365`・`'24m': 730` を追加し `'2w'`・`'1m'` を削除。ツールバーの選択肢も同様に更新。デフォルト値（`'3m'`）は変更なし。 |
| 2.42 | 2026年6月 | タスクのコピー＆挿入機能を追加。①**Ctrl+ドラッグ**：WBS行ドラッグ中にCtrl/Cmdキーで「移動」→「コピー」切り替え。`effectAllowed='copy'` でカーソルに＋表示。②**右クリックメニュー**：「コピー」でclipboardに保存、「上に挿入」で右クリック行の上にExcel式挿入。③**再帰コピー**：親タスクコピー時は子・孫タスクも再帰的にコピー（順序を保持）。ルートタスクのみタイトルに`(コピー)`を付与。predecessors（依存関係）はコピーしない。`GanttChart`に `isDragCopy`・`copiedTask` stateと`onCopyInsert` propを追加。`App.tsx`の`handleCopyInsert`で`createTask`（再帰）→`reorderTasks`の2段階処理。 |
| 2.43 | 2026年6月 | ドラッグ指示線・カーソル修正。①**指示線消失・フリーズ修正**：v2.42で`handleRowDragStart`に設定した`effectAllowed='copy'`と`handleRowDragOver`の`dropEffect='move'`の不一致により、ブラウザが`dragEnd`を早期発火→`clearDrop()`で`rowDragId=null`→`showDropLine=false`となり指示線が消え画面がフリーズしていた。`effectAllowed`の設定を削除（デフォルト`'all'`のまま）して修正。②**isDragCopyをstateからuseRefに変更**：`useState`→`useRef(false)`に変更しドラッグ中の余分な再レンダリングを防止。③**Ctrlカーソルのリアルタイム切替**：`handleRowDragOver`でCtrl/Cmdキー状態を毎フレーム検出し`dropEffect='copy'`/`'move'`を切り替え。ブラウザネイティブの「＋」コピーカーソルと通常移動カーソルがリアルタイムに表示される。 |
| 2.44 | 2026年6月 | ドラッグフリーズ根本修正。v2.43で`effectAllowed`設定を全削除したことで`dataTransfer.effectAllowed`が`'uninitialized'`のままになり、Chromeが`'none'`として扱い通常ドラッグ・Ctrl+ドラッグ両方でドラッグを即キャンセルする新リグレッションが発生。`handleRowDragStart`に`effectAllowed='all'`を明示設定し、`dropEffect='copy'`/`'move'`どちらとも互換性を確保。フリーズシナリオ（早期`dragEnd`→遅延`drop`がno-op）とリカバリ（キャンセル後の再ドラッグ正常完了）のテストを追加。 |
| 2.45 | 2026年6月 | コピータイトルの命名規則をWindows風に改善。v2.42では常に`(コピー)`を付与していたため、コピーを繰り返すと`X (コピー) (コピー)`のように接尾辞が積み重なっていた。新ユーティリティ`makeCopyTitle(sourceTitle, siblingTitles)`（`utils/copyTitle.ts`）を追加：①コピー先の兄弟に同名がなければ元タイトルをそのまま使用（別階層へのコピーで接尾辞なし）②同名がある場合（同一階層へのコピー等）は末尾の`(コピー)`/`(コピーN)`接尾辞を除去したベース名に対し`(コピー)`→`(コピー2)`→`(コピー3)`…と空き番号を採番。`App.tsx`の`handleCopyInsert`がルートタスクのタイトル生成に使用（子孫タスクは従来通り改名なし）。 |
| 2.46 | 2026年6月 | タスク削除モード選択機能を追加。従来は単純DELETE（FK `ON DELETE SET NULL`により子タスクがルートに孤児化）だった。**API**：`DELETE /tasks/:id?mode=subtree\|single`（デフォルト`subtree`）。`taskService`に`deleteTaskSubtree(id)`（タスク＋全子孫をトランザクションで削除、削除ID配列を返す）と`deleteTaskKeepChildren(id)`（直下の子を削除タスクの親=祖父母に付け替えてから本体のみ削除、付け替え情報を返す）を追加。WebSocketは`subtree`時に削除IDごとの`task_deleted`、`single`時に`tasks_reordered`（parentId付け替え）＋`task_deleted`をブロードキャスト。**フロントエンド**：`useTasks.deleteTask(id, mode)`が楽観的更新（subtree=子孫ごとストアから除去／single=子のparentIdを祖父母に付け替え）。子を持つタスクの削除時は新コンポーネント`DeleteTaskDialog`で「子孫ごと削除（デフォルト・赤）」「このタスクのみ削除（子は1つ上の階層へ）」「キャンセル」を選択。子なしタスクは従来通り`confirm`。 |
| 2.47 | 2026年6月 | コピー時にサブツリー内部の依存関係もコピー。v2.42では`predecessors: []`で依存を一切コピーしなかった。新ユーティリティ`mapInternalPredecessors(subtree, idMap)`（`utils/copyDeps.ts`）が、コピー元タスクのpredecessorsをサブツリー内部のものだけにフィルタして新IDへマップしたPATCH指示リストを返す。`App.tsx`の`handleCopyInsert`が`copySubtree`で旧ID→新IDの`idMap`と訪問タスクを収集し、全タスク作成完了後の第2パスで`updateTask`により依存を付与（兄弟の作成順による前方参照問題を回避）。サブツリー外部への依存（ルートの先行タスク含む）は従来通りコピーしない。元グラフが非循環なら同型コピーも非循環のため追加バリデーション不要。 |
| 2.48 | 2026年6月 | マイルストーンヘッダーの重なり防止（多段レーン）とフォントサイズ統一。マイルストーンヘッダー行でラベルが近接して重なる問題を解消。`ganttCalc.ts`に`assignMilestoneLanes(items, fontSize)`を追加：x位置順にgreedy割り当てで各マイルストーンを最初の空きレーン（lane番号）に配置し、推定テキスト幅（`iconWidth + title.length × fontSize × 0.65 + 4px`）で重なりを判定する純関数。`GanttChart.tsx`でレーン数に応じてマイルストーンヘッダーの高さを動的計算（`laneCount × milestoneLaneH`、`milestoneLaneH = uiFontSize + 9`）。ラベルのフォントサイズをハードコード`9px`から`uiFontSize`に変更し、各ラベルのtopをレーン番号 × レーン高さで配置。 |
| 2.49 | 2026年6月 | 3件のバグ修正。①**コピー挿入位置**：ドラッグコピーで子孫展開時に指定位置と異なる場所（末尾）へ挿入されるバグを修正。`handleRowDrop`のコピー経路が移動用の`afterTaskId`計算（直上フラット行＝別タスクの子孫になりうる）を流用していたため、ドロップ位置から上方向に`parentId === newParentId`の最初の行（直上の兄弟）を走査する方式に分離。先頭ドロップは`beforeTaskId=先頭兄弟`で先頭挿入。②**seq永久欠番**：`#`（seq）が`MAX(seq)+1`採番のため最大番号タスクの削除で番号が再利用されていた。`projects.next_seq`カウンター（migration 008、既存プロジェクトは`MAX(seq)+1`で初期化）に変更し、`createTask`・importともトランザクション内でカウンターを消費。restoreモードでもリセットしない。③**削除時の依存クリーンアップ**：DB側は`task_deps`の`ON DELETE CASCADE`で正しく消えるが、フロントの楽観的削除（`useTasks.deleteTask`）とWS`task_deleted`ハンドラが残存タスクの`predecessors`から削除済みIDを除去せず、その状態でTaskModal保存するとFK違反500が発生していた。両所で削除IDを`predecessors`からフィルタ除去し、API側も`createTask`/`updateTask`の依存INSERT前に存在チェックして不在IDをスキップする防御を追加。 |
| 2.50 | 2026年6月 | マイルストーン強調を常時ON化。ツールバーの「マイル強調」ON/OFFトグルボタンを廃止し、マイルストーンヘッダー行・列強調を常に表示するよう変更。カラーピッカーは継続表示。`taskStore`から`showMilestoneLines`・`setShowMilestoneLines`を削除し、`GanttChart`のミリストーン表示条件分岐を除去。 |
| 2.51 | 2026年6月 | Markdown箇条書き・チェックボックス表示修正。①`index.html`グローバルCSS reset（`margin:0; padding:0`）が`ul/ol/li`にも適用され箇条書きのインデントと黒丸が消えていた問題を`.md-body`スコープのCSSで修正。②`- [ ]`/`- [x]`チェックボックスはGFM拡張のため`remark-gfm`を追加インストールし有効化。共通コンポーネント`MarkdownBody`（`src/components/MarkdownBody/MarkdownBody.tsx`）を新設し`remarkGfm`プラグイン設定と`.md-body`ラッパーを集約。`TaskModal`・`TaskTooltip`の`ReactMarkdown`直接使用を`MarkdownBody`に置換。 |
| 2.52 | 2026年6月 | マイルストーン行表示トグル追加＆担当者フィルターからマイルストーン除外。①ツールバー表示トグルに「マイル」ボタン（`showMilestones`）を追加し、マイルストーン行をON/OFFで一括非表示にできるようにする（localStorage永続化）。②`filterTasks`でassigneeフィルター適用時にマイルストーンタスク（`isMilestone===true`）を除外対象から外す：マイルに担当者が設定されていても担当者フィルターで行が消えないよう修正。 |
| 2.54 | 2026年6月 | マイルストーンUIレイアウト調整。①「マイル」ON/OFFトグルボタンをツールバーの表示トグルグループから「年/月/週/日」ヘッダーグループ内の「日」の隣に移動。カラーピッカーは「マイル」ボタンの右に配置。②マイルストーンヘッダーラベルのフォントサイズを`uiFontSize`（デフォルト13px）から`11`（ガント日付ヘッダー行の`TH`スタイルと同じ固定サイズ）に変更し、`milestoneLaneH`・`assignMilestoneLanes`の計算にも11を使用。 |
| 2.53 | 2026年6月 | コピー挿入時の末尾フラッシュ解消。コピー&挿入（Ctrl+ドラッグ・右クリック）で新タスクが一瞬リスト末尾に表示されてから目的位置にジャンプする視覚フラッシュを修正。原因：`createTask`が`order=maxOrd+1`（末尾）でタスクを作成し、その後`reorderTasks`で移動していたため。修正：`handleCopyInsert`でルートタスク作成前に`computeInsertOrder(siblings, afterTaskId, beforeTaskId)`で挿入先の中間`order`値を計算し、`createTask`に渡す。APIは既存の`input.order`パラメータをそのまま利用。`filterTasks`がorderでソートするため、正しいorderを持つタスクは作成直後から正しい位置に表示される。`computeInsertOrder`を`ganttCalc.ts`に純関数として追加。 |
| 2.55 | 2026年6月 | プロジェクトタブの並び替えとドロップダウン収納。①**タブ並び替え**：タブをドラッグ＆ドロップで左右に並び替え可能。順序はブラウザ別に`localStorage`（キー`treegantt-project-order`）で保存し、デバイス間で統一しない。②**ドロップダウン収納**：タブ数がヘッダー幅を超えた場合、あふれたタブを「▾ +N件」ボタンに収納。アクティブプロジェクトがあふれている場合はボタンラベルにプロジェクト名を表示。ドロップダウン内タブのクリックでプロジェクト切り替え・右クリックで通常コンテキストメニューが開く。③**レイアウト調整**：App.tsxのタブラッパーdivに`flex: 1, minWidth: 0`を追加し、テーマボタンがタブに押し出されない構造に修正。API・DB変更なし（フロントエンドのみ）。 |
| 2.56 | 2026年6月 | 担当者フィルターをコンボボックス化。ツールバーの担当者フィルターを`<select>`から`<input type="text" list="assignee-datalist"> + <datalist>`によるHTML5ネイティブコンボボックスに変更。既存の担当者名リストをdatalistのoptionとして提供し、選択または自由テキスト入力の両方でフィルタリングが可能。フィルタリングは既存の部分一致ロジック（v2.52以降）をそのまま利用する。プレースホルダーは「すべて」。API・ストア変更なし（フロントエンドのみ）。 |
| 2.57 | 2026年6月 | 担当者コンボボックスに✕クリアボタン追加。入力値が空でないときのみコンボボックスの右隣に`✕`ボタンを表示し、クリックで`filterAssignee`を空文字にリセットする。開始日フィルターの✕ボタンと同じパターンを踏襲。API・ストア変更なし（フロントエンドのみ）。 |
| 2.58 | 2026年6月 | 担当者✕ボタンをコンボボックス内部に配置。`position: relative`ラッパーdivの中に`<input>`と`✕`ボタンを置き、ボタンを`position: absolute; right: 4px; top: 50%`で右端に重ねる。テキストがボタンに隠れないよう入力値がある場合は`paddingRight: 22px`を追加。API・ストア変更なし（フロントエンドのみ）。 |
| 2.59 | 2026年6月 | 1000件パフォーマンス改善 Step 1（親台帳: `docs/performance_plan.md`）。フロントのタスク初期ロード/リロードが limit 未指定のため API デフォルト `limit=500`（taskService.ts）で501件目以降がサイレント切り捨てされていた問題を修正。`utils/api.ts` に `fetchAllTasks(projectId)` を新設し、`limit=1000` ずつ `offset` を進めてレスポンスの `total` に達するまで取得・結合するページングループ方式で件数非依存の全件取得を実現（固定 limit 明示は将来の件数増で再発するため不採用）。`App.tsx` の2箇所の取得を置き換え。開発用シードスクリプト `api/scripts/seed.ts`（`--count` 件数指定・冪等）とテスト用決定的ジェネレータ `frontend/src/__tests__/fixtures/genLargeTasks.ts` を追加。API 側のデフォルト limit は変更なし。 |
| 2.60 | 2026年6月 | 1000件パフォーマンス改善 Step 2（親台帳: `docs/performance_plan.md`）。親タスクの進捗・期間集計を O(N²)→O(N) 化。`taskTree.ts` に `buildChildrenMap(tasks)`（親ID→子配列の索引Map）と `calcAllEffectiveProgress(tasks, childrenMap?)`（post-order DFS 1パスで全タスクの実効進捗をまとめて計算、結果Mapがメモ兼用、循環は訪問中セットで検出し0を返す）を追加。既存 `calcEffectiveProgress` はシグネチャ不変のまま内部を childrenMap 方式に変更（タスクごとの `allTasks.filter` 線形探索を排除）。`ganttCalc.ts` の `calcParentSpanMap` もシグネチャ不変で内部を post-order 1パス（子孫の min start / max end を親へ畳み込み）に変更し、親ごとのサブツリー再走査と再帰ごとの visited セットコピーを排除。葉判定・マイルストーン除外・循環安全の既存仕様は維持。1000件時の進捗計算 約100万回演算→約2000回。UI からの利用箇所変更は Step 3（v2.61）で実施。 |
| 2.61 | 2026年6月 | 1000件パフォーマンス改善 Step 3（親台帳: `docs/performance_plan.md`）。`GanttChart.tsx` の派生計算を `useMemo` 化（従来は useMemo 0個で、ホバー・ドラッグ等の再レンダリングごとに全件再計算されていた）。対象: `sorted`（フィルタ結果）、`assigneeOptions`、`withAncestors/roots/childCount`（ツリー構築）、`flatRows`（平坦化）、`range(min,max)/totalWidth/headerRows`、`taskIndex/taskById`、`weekendXs`、`milestoneItems` 系、`progressMap`、`parentSpanMap`、`lightningPoints`、`criticalSet/collapsedCriticalParents`、依存矢印JSX配列。`progressMap` は v2.60 の `calcAllEffectiveProgress`（O(N) 1パス）に差し替え。`range.min` の Date 参照同一性が確保されるため後続 Step 4 の React.memo の前提となる。表示仕様・API・ストア変更なし。 |
| 2.62 | 2026年6月 | 1000件パフォーマンス改善 Step 4（親台帳: `docs/performance_plan.md`）。`GanttBar` / `GanttLeftRow` を `React.memo` でラップし、1タスク更新時の再レンダリングを全行→該当行＋祖先のみに削減。props 安定化のため: ① `GanttBar.onClick` を `(task: Task) => void` に、`GanttLeftRow.onToggleCollapse` を `(id: string) => void` に、`onRowContextMenu` を `(x, y, taskId) => void` に変更（行ごとのインラインアロー関数を廃止し全行共有の `useCallback` を渡す）。② バードラッグ開始の親タスクガードを `startDrag` 内部（childCount を ref 参照）へ移動。③ App から渡る `onEditTask`/`onInlineUpdate` 等は GanttChart 内で「最新値 ref + 安定 useCallback」パターンに変換し、App 再レンダリングの影響を遮断。調査の結果 clipPath id（`clip-` + タスクID）は同一タスクが親バーと葉バーを同時描画することがなく実害なしのため変更なし。表示仕様・API・ストア変更なし。 |
| 2.63 | 2026年6月 | 1000件パフォーマンス改善 Step 5（親台帳: `docs/performance_plan.md`）。`taskStore` に差分適用アクションを追加: `upsertTask(task)`（id一致なら置換・なければ末尾追加）、`removeTasks(ids)`（一括削除＋残存タスクの predecessors から削除IDを除去）、`applyOrders(orders)`（order/parentId の一括反映）。`useWebSocket.applyMessage` の task_created/task_updated/task_deleted/tasks_reordered と `useTasks` の楽観的更新（createTask の重複ガード・deleteTask subtree モード・reorderTasks）を同アクションへ委譲し、配列再構築ロジックを一元化。task_updated は従来「既存タスクのみ置換」だったが upsert 化により未知IDは追加される（作成通知より更新通知が先着するレースの自己回復）。Step 8 の `tasks_deleted` 一括メッセージの受け皿。表示仕様・API 変更なし。 |
| 2.64 | 2026年6月 | 1000件パフォーマンス改善 Step 6（親台帳: `docs/performance_plan.md`）。ガント行の仮想化（自前スクロール範囲スライス）を導入。react-window は右ペインが1枚SVG・2ペイン手動同期スクロール構造のため不採用。純関数 `calcVisibleRange(scrollTop, viewportH, rowHeight, rowCount, overscan=10)` を `utils/virtualRange.ts` に新設し、可視範囲 `[start, end)` を計算。WBS左パネルは上下スペーサdiv＋`flatRows.slice(start, end)`（D&D・行コンテキストメニューは絶対インデックスのまま）、右SVGは縞背景rect・GanttBar をスライス分のみ描画（SVG全高・行Y座標・スクロールバーは無変更）。依存矢印は可視範囲と交差するもののみ描画。イナズマライン・今日ライン・週末列・マイルストーン列は全高1要素のため据え置き。scrollTop は rAF スロットルで state 化（rAF 非対応環境は即時反映）、ビューポート高さは ResizeObserver＋フォールバック800px（jsdom 対策・小規模データの既存テストは全行可視のまま無影響）。1000件時の DOM+SVG 要素 約10,000〜16,000 → 約500〜800。表示仕様・API・ストア変更なし。 |
| 2.65 | 2026年6月 | 1000件パフォーマンス改善 Step 7（親台帳: `docs/performance_plan.md`）。`taskService.ts` のループ内クエリをバッチ化。① `deleteTaskSubtree`: 子孫ID収集を `WITH RECURSIVE`（`UNION` 使用で循環データでも停止）1クエリに、削除を `DELETE FROM tasks WHERE id IN (...)` の500件チャンク実行に変更（1000件サブツリー削除 約2000クエリ→約3クエリ）。② `insertPredecessors`: 存在チェック＋挿入のループを `INSERT OR IGNORE ... SELECT id, ? FROM tasks WHERE id IN (...)` の1文に統合（存在しないIDのスキップ仕様は SELECT で自然に維持）。③ `getAncestorTasks`: 親辿りごとの `getTask`（依存取得2クエリ付き）呼び出しを廃し、ID収集後に `IN` 一括取得＋`attachDeps` 1回に変更（クエリ数 深さ×3→深さ+3）。`reorderTasks` は prepared 文＋単一トランザクション済みで十分高速のため現状維持（問題化時の代替案: `json_each` 単一UPDATE）。戻り値・削除順序の意味・循環/幽霊参照の挙動は全て既存仕様を維持。API インターフェース変更なし。 |
| 2.66 | 2026年6月 | 1000件パフォーマンス改善 Step 8（親台帳: `docs/performance_plan.md`）。タスク削除の WS 通知を一括化。サーバー（`routes/tasks.ts`）は subtree 削除時に削除ID数ぶんの `task_deleted` を送っていたのを `{ type: 'tasks_deleted', projectId, ids: string[] }` 1通に変更（1000件削除で 1000通→1通）。single モードも `tasks_deleted`（`ids: [id]`）に統一。フロント（`useWebSocket.applyMessage`）に `tasks_deleted` ケースを追加し `removeTasks(ids)`（v2.63）で1回の状態更新に反映。旧 `task_deleted` 受信ハンドラは互換のため残置（サーバー先行デプロイ時、旧クライアントは新メッセージを無視するだけで reload 通知により追随可能な規模のため許容）。メッセージ型一覧（6.3節）も更新。 |
| 2.67 | 2026年6月 | 1000件パフォーマンス改善 Step 9（最終、親台帳: `docs/performance_plan.md`）。REST レスポンスの圧縮を導入。`@fastify/compress@^7`（fastify 4 対応）を追加し、`plugins/compression.ts` の `registerCompression(fastify)`（`{ global: true, threshold: 1024 }`、encodings: br/gzip）を `index.ts` で register。1024バイト未満の小レスポンスは圧縮しない。1000件タスク一覧 JSON 約300〜500KB → 約40〜60KB（転送量約85%減）。クライアント側は fetch が `Accept-Encoding`/展開を自動処理するため変更不要。ETag は更新頻度が高くキャッシュヒットしにくいため見送り。 |
| 2.68 | 2026年6月 | E2Eテスト基盤（Playwright）導入。`/workspace/e2e/` に `@playwright/test` パッケージを新設。`playwright.config.ts` で API（port 4000）・フロントエンド（port 3001）を `webServer` 自動起動（`reuseExistingServer: !CI` でローカルは起動済みサーバーを再利用）。`fixtures/app.ts` で E2E テスト用プロジェクトを自動生成・後片付けするカスタムフィクスチャを定義。テストスペック4本: `project.spec.ts`（プロジェクト作成・選択）、`task-crud.spec.ts`（タスク作成・インライン編集・子タスク・削除）、`task-modal.spec.ts`（モーダル編集・ガントバー反映）、`gantt-render.spec.ts`（SVGバー・日付ヘッダー・仮想化スクロール確認）。既存 Vitest テストは無変更。 |
| 2.69 | 2026年6月 | サブツリー一括コピー API（`POST /api/v1/projects/:id/tasks/batch`）導入。背景：`@fastify/compress` の `global: true` 設定下で連続 POST リクエストの最後が "premature close" となりコピー失敗するバグを根本修正。変更内容: (1) API — `batchCreateTasks(projectId, inputs)` サービス関数を追加（単一 SQLite トランザクションで全タスクを作成）、バッチルート追加（`parentRef` インデックスで親子解決・単一 WS `tasks_created` ブロードキャスト）。(2) Frontend — `useWebSocket.ts` に `tasks_created` ハンドラ追加、`useTasks.ts` に `batchCreateTasks` 追加、`App.tsx` の `handleCopyInsert` をシーケンシャル createTask 呼び出しからバッチ API 1リクエストに変更。HTTP リクエスト数: N件 → 1件。WS ブロードキャスト数: N件 → 1件。 |
| 2.70 | 2026年6月 | ガントヘッダーのマイルストーンマーカー位置を日付セル中心に修正。従来 `GanttChart.tsx` のマイルストーン独立行（`data-milestone-marker`）はマーカー（◆＋タイトル）を `left: m.x`（= `dateToX(startDate)` = 日付セルの**左端**）に配置しており、SVGボディ側の菱形（`GanttBar.tsx` の `cx = dateToX(...) + dayWidth/2` = 日付セル**中心**）と基準がずれていた。マーカー item の `left` を `m.x + dayWidth/2` に変更し、◆ の `<span>` に `transform: translateX(-50%)` を付与（菱形中心がセル中心に一致、タイトルはフレックスフローで右へ）。不要な `paddingLeft` を削除。位置計算のみの変更で、レーン割当（`assignMilestoneLanes`）・強調列（`milestoneXSet`）・ヘッダー高さには影響なし。 |
| 2.71 | 2026年6月 | ズーム=日のデフォルトガント開始日を「昨日（1日前）」から「7日前」に延長。`ganttCalc.ts` の `defaultGanttStart('day')` を `subtract(1, 'day')` → `subtract(7, 'day')` に変更。直前1日しか過去が映らず短すぎたため、1週間ぶんの過去を表示するようにした。この値はズーム未指定時の自動モードフォールバック（`calcGanttRange` 内 `dayjs().subtract(7, 'day')`）と一致する。week/month 分岐は変更なし。 |
| 2.72 | 2026年6月 | 依存矢印の端点を親タスクの表示スパンに整合（折りたたみ時のズレ修正）。**バグ**: 親を折りたたむと子から出ていた依存矢印が `resolveVisibleId` で親へリダイレクトされるが、`DependencyArrow` は端点X座標を `fromTask.endDate`/`toTask.startDate`（親の DB 生値）で計算していたため、`parentSpanMap`（子孫 min/max・v2.37）で描かれる親サマリーバーの実位置とズレた。親に DB 日付が無い場合は `DependencyArrow` の null ガードで矢印自体が消えた。**修正**: `GanttChart` の `dependencyArrows` で端点タスクが子を持つ（親）場合、`parentSpanMap` のスパンを用いた実効日付を計算し `DependencyArrow` に `fromEndDate`/`toStartDate` として渡す。`DependencyArrow` はこれらを優先して端点を計算（未指定時は従来どおり `fromTask.endDate`/`toTask.startDate`）。折りたたみリダイレクト時も、展開中の親自身が依存端点になる場合も、ガントバーと矢印の起点・終点が一致する。表示ロジックのみの変更で API・ストア変更なし。 |
| 2.73 | 2026年6月 | 親タスクの「生値 startDate/endDate」を使っていた残りの座標箇所を表示スパン（`parentSpanMap`）へ統一（v2.72 の横展開）。**対象**: ①リンクドラッグのコネクタドット（起点・ホバー時の丸） ②ターゲットドット（接続先左端） ③ドラッグプレビュー破線の始点 ④リンクドラッグのターゲット有効判定（親が DB 日付未設定でも接続可に） ⑤イナズマ線の折りたたみ親（status=wip）の頂点X／日付未設定の親も頂点を描画。**実装**: `GanttChart` に実効日付ヘルパー `effStartDate(task)`/`effEndDate(task)`（子を持つ＝親なら `parentSpanMap` のスパン、葉なら生値）を `useCallback` で追加し、依存矢印（v2.72 のインライン処理を置換）・上記①〜③で使用。④は `parentSpanMapRef` を追加しリンクドラッグの安定コールバックから参照。⑤は `calcLightningPoints` の行型に任意の `effectiveStart`/`effectiveEnd` を追加（未指定時は `task` の日付にフォールバック＝既存テスト無影響）し、`GanttChart` が実効日付を渡す。表示ロジックのみの変更で API・ストア変更なし。クリティカルパスの所要日数計算は全タスク一律の生値利用（表示座標ではない）のため対象外。 |
| 2.74 | 2026年6月 | セキュリティ: 未使用の脆弱依存 `fast-jwt`（**CRITICAL**: 空HMACシークレットによるJWT認証バイパス GHSA-gmvf-9v4p-v8jc ほかアルゴリズム混同・iss検証不備など計6件）を `api/package.json` から削除。Phase 2 認証用に先行インストールされていたが `api/src/` のどこからも import されておらず（認証は現状ゲストスタブ `plugins/auth.ts`）、デッドな脆弱コードだった。削除により機能影響ゼロで critical を解消。再混入防止のガードテスト（`api/src/__tests__/security.test.ts`: package.json が既知脆弱な `fast-jwt` を含まないこと）を追加。残存する `fastify`（HIGH・修正に v5 系メジャー更新が必要）・`uuid`（MODERATE・`buf` 未使用のため実害なし）は深刻度順に別途対応予定。API・表示仕様・ストア変更なし。 |

---

## 目次

1. [はじめに](#1-はじめに)
2. [システム概要](#2-システム概要)
3. [ディレクトリ構成](#3-ディレクトリ構成)
4. [データモデル](#4-データモデル)
5. [REST API設計](#5-rest-api設計)
6. [リアルタイム同期設計](#6-リアルタイム同期設計)
7. [フロントエンド設計](#7-フロントエンド設計)
   - [7.8 プロジェクトタブ設計](#78-プロジェクトタブ設計-v255追加)
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
| `tasks_deleted` | タスク削除後（★v2.66: subtree/single とも1通に一括） | `{ ids: string[] }` |
| `task_deleted` | （旧形式。v2.66以降サーバーは送信しないが、受信ハンドラは互換のため維持） | `{ id: string }` |
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

#### 親タスク日付のフロントエンド計算（★v2.37追加）

**設計方針**: APIは親タスクの `start_date` / `end_date` を一切書き換えない。子孫タスクの日付包含範囲はフロントエンドで動的に計算して表示する。

- `ganttCalc.ts` の `calcParentSpanMap(allTasks)` が子孫の min/max を再帰計算
- `GanttChart` が `parentSpanMap: Map<taskId, {start, end}>` として事前計算
- `GanttBar` に `displayStart` / `displayEnd` props を追加し、`isParent=true` のバーはこれを優先して描画
- `taskStore` 更新のたびに自動再計算（ドラッグ・作成・削除・インポート後も即時反映）
- ドラッグ中（`dragPreview`）は対象タスク自身のバーのみ動き、親バーはドロップ完了後に更新（`effectiveProgress` と同仕様）

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

// ★v2.41変更: 最小3ヶ月・最大24ヶ月に変更（2w・1m廃止）
export type GanttPeriod = '3m' | '6m' | '12m' | '24m';
export const PERIOD_DAYS: Record<GanttPeriod, number> = {
  '3m': 91, '6m': 183, '12m': 365, '24m': 730,
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
- **★v2.38以降 WBSヘッダー高さの自動同期**: `ganttHeaderRef`（`useRef<HTMLDivElement>`）を `data-testid="gantt-header"` div に付与し、ResizeObserver でガントヘッダーの実測 `offsetHeight` を `ganttHeaderH` state に格納。WBSヘッダーの height は `ganttHeaderH || totalHeaderH`（計測値優先、jsdom等ではフォールバック）。新しいヘッダー行を追加しても手動で式を修正する必要がない
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

先行タスクの右端から後続タスクの左端へ SVG で結ぶ。矢印スタイルは `DepArrowStyle` の3種から選択可能（★v2.36追加）。`taskStore` の `depArrowStyle` に localStorage 永続化し、ツールバーで切り替え。

| スタイル | 説明 |
|---------|------|
| `bezier` | cubic-bezier 曲線（デフォルト） |
| `elbow` | 横距離が `OFFSET×2` 以上なら L字形、未満なら S字形迂回 |
| `straight` | 始点→終点の直線 |

```typescript
// DependencyArrow.tsx
export type DepArrowStyle = 'bezier' | 'elbow' | 'straight';
// stroke='#378ADD' strokeWidth={1.5} markerEnd='url(#arrowhead)'
// クリティカルパス上の矢印: stroke='#6366f1' strokeWidth={2.5} markerEnd='url(#arrowhead-critical)'
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

### 7.8 プロジェクトタブ設計（★v2.55追加）

#### 概要

ヘッダー左部に表示されるプロジェクトタブは以下の機能を持つ。

| 機能 | 説明 |
|------|------|
| タブ切り替え | クリックでプロジェクトを切り替え |
| 右クリックメニュー | 名前変更 / 色変更 / 削除 |
| タスク件数バッジ | 各タブにタスク数を表示 |
| タブカラー | プロジェクト単位の背景色（6プリセット + なし） |
| **並び替え（v2.55）** | ドラッグ＆ドロップで左右に並び替え可能 |
| **ドロップダウン収納（v2.55）** | タブ数がヘッダー幅を超えたとき自動収納 |

#### タブ並び替え（localStorage管理）

- **操作**: タブを左右にドラッグ＆ドロップ
- **保存先**: `localStorage`（キー: `treegantt-project-order`）
- **保存形式**: プロジェクト ID の配列 `["id1","id3","id2"]`
- **ブラウザ独立**: デバイスやブラウザ間で順序は共有されない（意図的設計）
- **新規プロジェクト**: `localStorage` に未登録の場合は末尾に追加
- **削除されたプロジェクト**: `localStorage` に ID が残っていても `find()` で無視される（自動クリーンアップ不要）

```
// sortedProjects の計算
inOrder = order.map(id => projects.find(p => p.id === id)).filter(Boolean)
rest    = projects.filter(p => !order.includes(p.id))
sortedProjects = [...inOrder, ...rest]
```

**ドラッグ実装（HTML5 Drag API）**:

| イベント | 処理 |
|----------|------|
| `onDragStart` | `dragId` をセット、`effectAllowed = 'move'` |
| `onDragOver` | `preventDefault`、マウス X 位置からドロップ挿入位置（`dropBeforeId`）を決定 |
| `onDrop` | `sortedProjects` を並び替え、`localStorage` に保存 |
| `onDragEnd` | `dragId`・`dropBeforeId` をクリア |

ドロップ位置インジケータ: `dropBeforeId` のタブ左端に白い縦線（2px）を表示。

#### ドロップダウン収納

タブ幅推定（文字数ベース）とコンテナ幅（ResizeObserver）を比較してドロップダウン分割点を計算。

```
estimateTabWidth(name) = min(160, name.length × 8) + 48   // padding込み推定
DROPDOWN_BTN_W = 84                                        // 「▾ +N件」予約幅

// 分割計算（visibleProjects / overflowProjects）
accumulate widths of sortedProjects until
  accumulated + w + reserve > containerWidth
→ split here
```

**ドロップダウンボタン表示ルール**:

| 状態 | ボタンラベル | スタイル |
|------|------------|--------|
| 通常 | `▾ +N件` | 非アクティブ |
| アクティブプロジェクトがオーバーフロー中 | `プロジェクト名 ▾` | アクティブ（白下線） |

**ドロップダウンリスト**:
- `position: fixed` でポジショニング（ヘッダーのオーバーフローにクリップされない）
- 各項目クリック → `onSelect`
- 各項目右クリック → 通常タブと同じコンテキストメニュー

#### レイアウト構造（App.tsx）

```
ヘッダー（display: flex）
├─ "TreeGantt" ラベル（shrink: 0）
├─ タブラッパー（flex: 1, minWidth: 0）  ← v2.55で追加
│   ├─ ProjectTabs（flex: 1）
│   │   ├─ visible tabs（display: flex, overflow: hidden）
│   │   └─ DropdownButton（overflow時のみ）
│   └─ "+ プロジェクト" ボタン（flexShrink: 0）
└─ テーマ選択ボタン（marginLeft: auto, shrink: 0）
```

`flex: 1, minWidth: 0` を設定することで ProjectTabs がヘッダーの残余幅に収まり、テーマボタンが押し出されなくなる。

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

#### マイルストーン列の強調表示（★v2.39/v2.40追加）

**背景色優先順位: マイルストーン > 土日 > 交互背景**

| 項目 | 仕様 |
|------|------|
| `isMilestoneDate` 適用範囲 | 全ヘッダー行（year/month/week/day/dow）に適用 |
| 菱形アイコン色 | `milestoneColor` prop に `milestoneHighlightColor` を渡す（列背景と同系色） |
| ヘッダー独立行ラベル色 | `milestoneHighlightColor` に統一（`data-milestone-marker` 付与） |
| ツールバー配置 | 「マイル強調」ON/OFFボタンとカラーピッカーは「年/月/週/日」トグルの「日」の隣に配置 |

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
