import { useEffect, useState } from 'react';
import type { Task } from '../../types/task';
import { textStartX } from '../../utils/wbsLayout';
import { isReadonlyTask } from '../../utils/refTasks';
import { useTranslation } from '../../i18n/useTranslation';
import { GanttLeftRow } from './GanttLeftRow';
import { ExpandCollapseButtons } from './ExpandCollapseButtons';
import { QuickAddRow } from './QuickAddRow';
import { HEADER_ROW_H, WBS_COL_TOGGLE_LABEL_KEYS } from './ganttChartConstants';

// 列表示設定ポップアップで隠せる列のキー（ラベルは WBS_COL_TOGGLE_LABEL_KEYS 経由で
// 辞書に一本化する, §9.11）。GanttChart.tsx の LEFT_COLS（見出し・短縮形）とは別の
// キー・別の値（完全形）を参照する（ポップアップはスペースに余裕がありユーザーへの
// 分かりやすさを優先するため）。
const HIDEABLE_COL_KEYS = ['status', 'priority', 'progress', 'assignee', 'startDate', 'endDate', 'duration'] as const;

const RESIZABLE_COL_KEYS = new Set(['title', 'assignee']);

type LeftCol = { key: string; label: string; width: number };
type FlatRow = { task: Task; depth: number };
type ParentSpan = { startDate: string | null; endDate: string | null };

interface Props {
  // クロスプロジェクト参照（§5.8）: 現プロジェクトID。readonly ガード判定に使う。
  currentProjectId?: string;
  // レイアウト・列
  wbsPanelOpen: boolean;
  setWbsPanelOpen: (open: boolean) => void;
  leftTotal: number;
  visibleLeftCols: LeftCol[];
  colWidths: { title: number; assignee: number };
  setColResize: (v: { key: string; startX: number; startWidth: number } | null) => void;
  dateColWidth: number;
  ganttHeaderH: number;
  totalHeaderH: number;
  wbsHiddenCols: string[];
  setWbsHiddenCols: (cols: string[]) => void;
  // 展開/折りたたみ
  childCount: Map<string, number>;
  collapseAll: () => void;
  expandToDepth: (depth: number) => void;
  expandAll: () => void;
  setTitleHeaderCtxMenu: (v: { x: number; y: number } | null) => void;
  // ホイール転送
  handleWbsWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  // 行仮想化・本体
  wbsPanelRef: React.RefObject<HTMLDivElement>;
  wbsBodyRef: React.RefObject<HTMLDivElement>;
  vStart: number;
  vEnd: number;
  uiRowHeight: number;
  uiFontSize: number;
  flatRows: FlatRow[];
  /** No. 列（表示専用の通し番号, §9.2）: 全展開・フィルタなし基準の task id → 番号。 */
  rowNumberMap: Map<string, number>;
  collapsed: Set<string>;
  progressMap: Map<string, number>;
  parentSpanMap: Map<string, ParentSpan>;
  assigneeOptions: string[];
  toggleCollapse: (id: string) => void;
  handleInlineUpdate: (id: string, patch: Partial<Task>) => void;
  handleRowContextMenu: (x: number, y: number, taskId: string) => void;
  // 行 D&D
  rowDragId: string | null;
  rowDropIdx: number | null;
  rowDropDepth: number | null;
  rowDropTarget: string | null;
  handleRowDragStart: (e: React.DragEvent, taskId: string) => void;
  handleRowDragOver: (e: React.DragEvent, idx: number) => void;
  handleRowDrop: (e: React.DragEvent, idx: number) => void;
  clearDrop: () => void;
  // クイック追加・スクロール補正
  onQuickAdd: (title: string) => Promise<void>;
  hScrollbarH: number;
}

const TH: React.CSSProperties = {
  height: HEADER_ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, color: 'var(--th-text-muted)',
  borderRight: '1px solid var(--th-border)', cursor: 'default', userSelect: 'none',
  boxSizing: 'border-box', padding: '0 4px',
};

// WBS 左パネル（ヘッダー・列リサイズ・展開/折りたたみクラスタ・行仮想化・行 D&D・
// 列表示設定ポップアップ・QuickAddRow）。GanttChart から抽出（挙動不変, D4）。
export function WbsPanel(props: Props) {
  const {
    currentProjectId,
    wbsPanelOpen, setWbsPanelOpen, leftTotal, visibleLeftCols, colWidths, setColResize,
    dateColWidth, ganttHeaderH, totalHeaderH, wbsHiddenCols, setWbsHiddenCols,
    childCount, collapseAll, expandToDepth, expandAll, setTitleHeaderCtxMenu,
    handleWbsWheel, wbsPanelRef, wbsBodyRef, vStart, vEnd, uiRowHeight, uiFontSize,
    flatRows, rowNumberMap, collapsed, progressMap, parentSpanMap, assigneeOptions,
    toggleCollapse, handleInlineUpdate, handleRowContextMenu,
    rowDragId, rowDropIdx, rowDropDepth, rowDropTarget,
    handleRowDragStart, handleRowDragOver, handleRowDrop, clearDrop,
    onQuickAdd, hScrollbarH,
  } = props;

  const { t } = useTranslation();
  const HIDEABLE_COLS = HIDEABLE_COL_KEYS.map(key => ({ key, label: t(WBS_COL_TOGGLE_LABEL_KEYS[key]) }));

  // WBS列表示設定ポップアップの開閉位置（このコンポーネント内でのみ完結する）
  const [wbsColMenuPos, setWbsColMenuPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!wbsColMenuPos) return;
    const close = () => setWbsColMenuPos(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [wbsColMenuPos]);

  return (
    <>
      {/* ── WBS 左パネル（スクロールバーなし） ── */}
      <div data-testid="wbs-panel" ref={wbsPanelRef} onWheel={handleWbsWheel} style={{
        flexShrink: 0, width: leftTotal, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', borderRight: '2px solid var(--th-border-strong)', background: 'var(--th-bg)',
        transition: 'width 0.15s ease',
      }}>
        {/* WBS ヘッダー（高さをガントヘッダーに合わせる） */}
        <div data-testid="wbs-header" style={{
          flexShrink: 0, height: ganttHeaderH || totalHeaderH,
          minHeight: 26,
          display: 'flex', alignItems: 'flex-end', background: 'var(--th-bg2)', borderBottom: '2px solid var(--th-border)',
          position: 'relative',
        }}>
          {/* WBS 閉じているとき: # セル全体が ▷ ボタン */}
          {!wbsPanelOpen && (
            <div
              title={t('wbs.show')}
              role="button"
              aria-label={t('wbs.show')}
              onClick={() => setWbsPanelOpen(true)}
              style={{ ...TH, width: 36, cursor: 'pointer', alignSelf: 'stretch', height: 'auto', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e0e7ff'; (e.currentTarget as HTMLElement).style.color = '#4f46e5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--th-text-muted)'; }}
            >
              ▷
            </div>
          )}

          {/* WBS 開いているとき: 各列ヘッダーを描画 */}
          {wbsPanelOpen && visibleLeftCols.map(col => {
            const w = (col.key === 'startDate' || col.key === 'endDate')
              ? dateColWidth
              : (colWidths[col.key as keyof typeof colWidths] ?? col.width);
            const resizable = RESIZABLE_COL_KEYS.has(col.key);
            const isTitleCol = col.key === 'title';
            return (
              <div
                key={col.key}
                style={{ ...TH, width: w,
                  position: resizable ? 'relative' : undefined,
                  justifyContent: isTitleCol ? 'flex-start' : 'center', gap: 2 }}
                onContextMenu={isTitleCol ? e => { e.preventDefault(); setTitleHeaderCtxMenu({ x: e.clientX, y: e.clientY }); } : undefined}
              >
                {isTitleCol && childCount.size > 0 && (
                  <ExpandCollapseButtons
                    variant="compact"
                    collapseAll={collapseAll}
                    expandToDepth={expandToDepth}
                    expandAll={expandAll}
                    onSelect={(action, e) => { e.stopPropagation(); action(); }}
                  />
                )}
                {col.label}
                {resizable && (
                  <div
                    style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 4,
                      cursor: 'col-resize', background: '#c7d2fe', borderRadius: 2, zIndex: 1 }}
                    onMouseDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      setColResize({ key: col.key, startX: e.clientX, startWidth: w });
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </div>
            );
          })}

          {/* WBS 開いているとき: 右端に列設定・閉じるボタン群（絶対配置・上下全体） */}
          {wbsPanelOpen && (
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex' }}>
              <button
                title={t('wbs.colSettingsTitle')}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setWbsColMenuPos(wbsColMenuPos ? null : { x: r.left, y: r.bottom + 2 });
                }}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--th-text-dim)', padding: '0 6px',
                  borderRadius: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
              >
                {t('wbs.colButtonLabel')}
              </button>
              <button
                title={t('wbs.hide')}
                aria-label={t('wbs.hide')}
                onClick={() => setWbsPanelOpen(false)}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--th-text-dim)', padding: '0 6px',
                  borderRadius: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
              >
                ◁
              </button>
            </div>
          )}
        </div>

        {/* WBS ボディ（垂直スクロールはガントパネルと同期） */}
        <div ref={wbsBodyRef} style={{ flex: 1, overflowY: 'hidden' }}>
          {/* 仮想化: 可視範囲外は上下スペーサで高さのみ確保（スクロール同期を維持） */}
          <div style={{ height: vStart * uiRowHeight, flexShrink: 0 }} />
          {(() => {
            const dragIdx = rowDragId ? flatRows.findIndex(r => r.task.id === rowDragId) : -1;
            return flatRows.slice(vStart, vEnd).map(({ task, depth }, sliceIdx) => {
              const idx = vStart + sliceIdx; // D&D は絶対インデックスで処理する
              const isNoOp = dragIdx !== -1 && (rowDropIdx === dragIdx || rowDropIdx === dragIdx + 1);
              const showDropLine = rowDropIdx === idx && !!rowDragId && !isNoOp;
              const readOnly = isReadonlyTask(task, currentProjectId);
              return (
                <div
                  key={task.id}
                  draggable={!readOnly}
                  onDragStart={(e) => handleRowDragStart(e, task.id)}
                  onDragOver={(e) => handleRowDragOver(e, idx)}
                  onDrop={(e) => handleRowDrop(e, idx)}
                  onDragEnd={clearDrop}
                  style={{
                    opacity: rowDragId === task.id ? 0.4 : 1,
                    cursor: 'grab',
                    position: 'relative',
                    outline: rowDropTarget === task.id ? '2px solid #4f46e5' : undefined,
                    outlineOffset: '-1px',
                    zIndex: rowDropTarget === task.id ? 1 : undefined,
                  }}
                >
                  {showDropLine && (
                    <div data-drop-line style={{
                      position: 'absolute',
                      left: textStartX(rowDropDepth ?? 0),
                      right: 0, top: -2,
                      height: 3, background: '#4f46e5',
                      borderRadius: 2, boxShadow: '0 0 6px rgba(79,70,229,0.5)',
                      pointerEvents: 'none', zIndex: 5,
                    }} />
                  )}
                  <GanttLeftRow
                    task={task}
                    rowNumber={rowNumberMap.get(task.id) ?? 0}
                    depth={depth}
                    hasChildren={(childCount.get(task.id) ?? 0) > 0}
                    isCollapsed={collapsed.has(task.id)}
                    effectiveProgress={progressMap.get(task.id) ?? task.progress}
                    fontSize={uiFontSize}
                    rowHeight={uiRowHeight}
                    titleWidth={colWidths.title}
                    assigneeWidth={colWidths.assignee}
                    dateColWidth={dateColWidth}
                    isDragging={rowDragId !== null}
                    hiddenCols={wbsHiddenCols}
                    wbsPanelOpen={wbsPanelOpen}
                    assigneeOptions={assigneeOptions}
                    displayStart={(childCount.get(task.id) ?? 0) > 0 ? (parentSpanMap.get(task.id)?.startDate ?? null) : undefined}
                    displayEnd={(childCount.get(task.id) ?? 0) > 0   ? (parentSpanMap.get(task.id)?.endDate   ?? null) : undefined}
                    readOnly={readOnly}
                    onToggleCollapse={toggleCollapse}
                    onInlineUpdate={handleInlineUpdate}
                    onRowContextMenu={handleRowContextMenu}
                  />
                </div>
              );
            });
          })()}
          <div style={{ height: (flatRows.length - vEnd) * uiRowHeight, flexShrink: 0 }} />
          <QuickAddRow onAdd={onQuickAdd} titleWidth={colWidths.title} assigneeWidth={colWidths.assignee} dateColWidth={dateColWidth} />
          {/* 横スクロールバー分の高さを補完してガントとのスクロール同期ズレを防止 */}
          <div style={{ height: hScrollbarH, flexShrink: 0 }} />
        </div>
      </div>

      {/* WBS列表示設定ポップアップ */}
      {wbsColMenuPos && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: wbsColMenuPos.x, top: wbsColMenuPos.y,
            background: 'var(--th-bg)', border: '1px solid var(--th-border)',
            borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px 12px', zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12,
          }}
        >
          {HIDEABLE_COLS.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', color: 'var(--th-text2)' }}>
              <input
                type="checkbox"
                checked={!wbsHiddenCols.includes(col.key)}
                onChange={e => setWbsHiddenCols(
                  e.target.checked
                    ? wbsHiddenCols.filter(k => k !== col.key)
                    : [...wbsHiddenCols, col.key]
                )}
                style={{ accentColor: '#4f46e5', cursor: 'pointer' }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </>
  );
}
