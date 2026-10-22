import { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { Task, TaskStatus, TaskPriority } from '../../types/task';
import { addDays, calcDuration, isValidOptionalDate, DATE_INPUT_MIN, DATE_INPUT_MAX } from '../../utils/ganttCalc';
import { titlePaddingLeft, wbsColWidth, TOGGLE_W, TOGGLE_GAP, type WbsColSizes } from '../../utils/wbsLayout';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';
import { TaskTooltip } from './TaskTooltip';
import { STATUS_COLOR, PRIORITY_COLOR } from '../../utils/taskColors';
import { isRefGroupId } from '../../utils/refTasks';
import { useTranslation } from '../../i18n/useTranslation';
import { showToast, useToastStore } from '../../store/toastStore';

export interface GanttLeftRowProps {
  task: Task;
  /** No. 列（表示専用の通し番号, §9.2）: 全展開・フィルタなし基準で固定した行番号。 */
  rowNumber?: number;
  depth: number;
  hasChildren: boolean;
  /** 直接の子の件数（フィルタ前の全タスク基準, §9.3）。 */
  childCount?: number;
  /** 全子がフィルタで非表示のときの直接の子の件数（それ以外は 0, §9.3）。 */
  hiddenChildCount?: number;
  isCollapsed: boolean;
  effectiveProgress: number;
  fontSize: number;
  rowHeight: number;
  titleWidth: number;
  assigneeWidth: number;
  dateColWidth: number;
  isDragging?: boolean;
  hiddenCols?: string[];
  wbsPanelOpen?: boolean;
  assigneeOptions?: string[];
  displayStart?: string | null;
  displayEnd?:   string | null;
  /** クロスプロジェクト参照（§5.8）: 参照タスク・合成グループ行は読み取り専用（淡色＋🔗、インライン編集不可） */
  readOnly?: boolean;
  onToggleCollapse: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onRowContextMenu: (x: number, y: number, taskId: string) => void;
}

// タイトル右の子件数バッジ「N」／「+N」共通: 親タスクの配色で強調（両テーマでコントラスト比 4.5:1 以上, §9.3）
const CHILD_BADGE_STYLE: React.CSSProperties = {
  flexShrink: 0, userSelect: 'none', fontSize: 10, lineHeight: '14px', padding: '0 6px',
  borderRadius: 8, background: 'var(--th-bg-parent)', color: 'var(--th-text-parent)',
  border: '1px solid var(--th-border-strong)', fontWeight: 700,
};

// React.memo: 全行が親の再レンダリングごとに再描画されるのを防ぐ。
// コールバック props は全行共有の安定参照（GanttChart 側 useCallback）であることが前提
export const GanttLeftRow = memo(function GanttLeftRow({
  task, rowNumber = 0, depth, hasChildren, childCount = 0, hiddenChildCount = 0, isCollapsed, effectiveProgress, fontSize, rowHeight,
  titleWidth, assigneeWidth, dateColWidth,
  isDragging = false,
  hiddenCols = [], wbsPanelOpen = true,
  assigneeOptions,
  displayStart, displayEnd,
  readOnly = false,
  onToggleCollapse, onInlineUpdate, onRowContextMenu,
}: GanttLeftRowProps) {
  const { t } = useTranslation();
  // ステータス/優先度の表示ラベルは TaskModal.tsx と同じ辞書キーを使う（二重管理防止）。
  // taskColors.ts の STATUS_LABEL/PRIORITY_LABEL は色分け等の翻訳と無関係なロジックで
  // 引き続き使われうるため削除せず、UI 表示のみここでローカルに t() 経由へ差し替える。
  const STATUS_LABELS: Record<TaskStatus, string> = {
    todo: 'TODO', wip: 'Doing', done: 'DONE', wait: t('toolbar.status.wait'), pending: t('toolbar.status.pending'),
  };
  const PRIORITY_LABELS: Record<TaskPriority, string> = {
    critical: t('toolbar.priority.critical'), high: t('toolbar.priority.high'),
    medium: t('toolbar.priority.medium'), low: t('toolbar.priority.low'),
  };
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editStartVal, setEditStartVal] = useState('');
  const [conflict, setConflict] = useState<{ field: string; theirVal: string; myVal: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── ツールチップ ──────────────────────────────────────────
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTooltipContent = task.summary.trim().length > 0 || task.description.trim().length > 0;

  const handleTitleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (isDragging || !hasTooltipContent) return;
    setTooltipPos({ x: e.clientX, y: e.clientY });
    tooltipTimer.current = setTimeout(() => setTooltipVisible(true), 250);
  }, [isDragging, hasTooltipContent]);

  const handleTitleMouseLeave = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipVisible(false);
  }, []);

  // ドラッグ開始時にツールチップを強制非表示
  useEffect(() => {
    if (isDragging) {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
      setTooltipVisible(false);
    }
  }, [isDragging]);

  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }, []);

  useEffect(() => {
    if (editField && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editField]);

  function startEdit(field: string, val: string) {
    if (readOnly) return; // 参照タスク・合成グループ行は読み取り専用（§5.8）
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipVisible(false);
    setEditField(field);
    setEditVal(val);
    setEditStartVal(val);
  }

  function commit(field: string, myVal: string | number | null) {
    if ((field === 'startDate' || field === 'endDate') && !isValidOptionalDate(myVal == null ? null : String(myVal))) {
      showToast(t('common.invalidDate'), 'error');
      setEditField(null);
      return;
    }
    const currentVal = String(task[field as keyof Task] ?? '');
    if (currentVal !== editStartVal) {
      setConflict({ field, theirVal: currentVal, myVal: String(myVal ?? '') });
      setEditField(null);
      return;
    }
    // マイルストーンは1点: 開始日を編集したら終了日も同値に追従させる
    const patch: Partial<Task> =
      task.isMilestone && field === 'startDate'
        ? { startDate: myVal as string | null, endDate: myVal as string | null }
        // 開始日・終了日の前後矛盾チェック: 矛盾する場合は両方を新しい値にクランプ
        : field === 'startDate' && myVal && task.endDate && (myVal as string) > task.endDate
        ? { startDate: myVal as string, endDate: myVal as string }
        : field === 'endDate' && myVal && task.startDate && (myVal as string) < task.startDate
        ? { startDate: myVal as string, endDate: myVal as string }
        : { [field]: myVal };

    // 実質変更なし（クリックしただけ／同じ値で確定）なら保存しない
    const changed = Object.entries(patch).some(([k, v]) => (task[k as keyof Task] ?? null) !== (v ?? null));
    if (!changed) { setEditField(null); return; }

    onInlineUpdate(task.id, patch);
    setEditField(null);
  }

  function resolveConflict(useTheirs: boolean) {
    if (!conflict) return;
    if (!useTheirs) {
      // フィールド名で型を決める（値の見た目で数値かどうかを推測しない）。
      // progress のみ数値、それ以外は文字列のまま送る
      const value: string | number = conflict.field === 'progress' ? Number(conflict.myVal) : conflict.myVal;
      onInlineUpdate(task.id, { [conflict.field]: value });
    }
    setConflict(null);
  }

  function onKey(e: React.KeyboardEvent, field: string, val: string | null) {
    if (e.key === 'Enter') commit(field, val);
    if (e.key === 'Escape') setEditField(null);
  }

  function commitDuration(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || !task.startDate) { setEditField(null); return; }
    const newEndDate = addDays(task.startDate, n - 1);
    if (newEndDate === task.endDate) { setEditField(null); return; }
    onInlineUpdate(task.id, { endDate: newEndDate });
    setEditField(null);
  }

  const CELL: React.CSSProperties = {
    height: rowHeight, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize, overflow: 'hidden', whiteSpace: 'nowrap',
    boxSizing: 'border-box', color: 'var(--th-text2)',
  };
  const INPUT_S: React.CSSProperties = {
    width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
    borderRadius: 3, fontSize, outline: 'none',
    background: 'var(--th-input-bg)', color: 'var(--th-text)',
  };

  // 列レイアウトの導出（相対座標, §9.2）に使う単一の真実源。
  const sizes: WbsColSizes = { colWidths: { title: titleWidth, assignee: assigneeWidth }, dateColWidth };

  const show = (key: string) => wbsPanelOpen && !hiddenCols.includes(key);
  // 「行」「#」列は設計書 §9.2 により wbsPanelOpen=false でも常時表示だが、
  // ヘッダー・LEFT_TOTAL と基準を揃えるため hiddenCols だけは尊重する。
  const showAlways = (key: string) => !hiddenCols.includes(key);

  // 子が全てフィルタで非表示の親（§9.3）: トグルは ▶ 固定・押しても折りたたまず通知のみ
  const allChildrenHidden = hasChildren && hiddenChildCount > 0;
  const hiddenLabel = t('wbs.row.hiddenChildren', { n: hiddenChildCount });
  const isRootParent = depth === 0 && hasChildren;
  const indent = titlePaddingLeft(depth);
  const rowBg = task.titleBgColor ?? (isRootParent ? 'var(--th-bg-parent)' : 'var(--th-bg)');
  const readOnlyStyle: React.CSSProperties = readOnly ? { opacity: 0.65 } : {};
  const effectiveStartDate = hasChildren ? (displayStart ?? null) : task.startDate;
  const effectiveEndDate   = hasChildren ? (displayEnd   ?? null) : task.endDate;
  const duration = calcDuration({ ...task, startDate: effectiveStartDate, endDate: effectiveEndDate });
  // マイルストーンは1点（endDate=startDate）。終了日は親と同様に編集不可（淡色）。
  const endLocked = hasChildren || task.isMilestone;

  return (
    <div
      style={{
        display: 'flex', background: rowBg,
        height: rowHeight, boxSizing: 'border-box',
        borderBottom: '1px solid var(--th-border)',
        boxShadow: isRootParent ? 'inset 3px 0 0 var(--th-border-strong)' : undefined,
        ...readOnlyStyle,
      }}
      onContextMenu={e => { e.preventDefault(); if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltipVisible(false); onRowContextMenu(e.clientX, e.clientY, task.id); }}
    >
      {/* No. (表示専用の通し番号: 全展開・フィルタなし基準で固定、詰め直さない) */}
      {showAlways('rowNumber') && <div data-testid="row-number" style={{ ...CELL, width: wbsColWidth('rowNumber', sizes), justifyContent: 'center', color: 'var(--th-text-dim)', userSelect: 'none' }}>
        {rowNumber}
      </div>}

      {/* # (seq: 作成時発番・不変) */}
      {showAlways('order') && <div style={{ ...CELL, width: wbsColWidth('order', sizes), justifyContent: 'center', color: 'var(--th-text-dim)', userSelect: 'none' }}>
        {task.isMilestone ? '◇' : task.seq}
      </div>}

      {/* タイトル */}
      {wbsPanelOpen && <div style={{ ...CELL, width: wbsColWidth('title', sizes), paddingLeft: indent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: TOGGLE_GAP, width: '100%', overflow: 'hidden' }}>
          {hasChildren ? (
            <button
              aria-label={allChildrenHidden ? hiddenLabel : isCollapsed ? t('wbs.row.expand') : t('wbs.row.collapse')}
              title={allChildrenHidden ? hiddenLabel : undefined}
              onClick={e => {
                e.stopPropagation();
                if (!allChildrenHidden) { onToggleCollapse(task.id); return; }
                // フィルタ前から折りたたまれていた親は、フィルタ解除だけでは子が見えないため案内を変える
                const msg = t(isCollapsed ? 'wbs.row.hiddenChildrenToastCollapsed' : 'wbs.row.hiddenChildrenToast', { n: hiddenChildCount });
                // 連打で同じ通知が積み重ならないよう、表示中なら出さない
                if (!useToastStore.getState().toasts.some(x => x.message === msg)) showToast(msg, 'info');
              }} style={{
              width: TOGGLE_W, height: TOGGLE_W, border: 'none', background: 'none', cursor: 'pointer',
              padding: 0, fontSize: 9, color: allChildrenHidden ? 'var(--th-text-ph)' : 'var(--th-text-muted)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {allChildrenHidden || isCollapsed ? '▶' : '▼'}
            </button>
          ) : depth > 0 ? (
            <span style={{ width: TOGGLE_W, flexShrink: 0, textAlign: 'center', color: 'var(--th-text-ph)', fontSize: 11, userSelect: 'none' }}>└</span>
          ) : (
            <span style={{ width: TOGGLE_W, flexShrink: 0 }} />
          )}
          {editField === 'title' ? (
            <input ref={inputRef} style={INPUT_S} value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => { if (editVal.trim()) commit('title', editVal.trim()); else setEditField(null); }}
              onKeyDown={e => onKey(e, 'title', editVal.trim() || null)} />
          ) : (
            <span
              onClick={() => startEdit('title', task.title)}
              onMouseEnter={handleTitleMouseEnter}
              onMouseLeave={handleTitleMouseLeave}
              style={{
                cursor: readOnly ? 'default' : 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: isRootParent ? 700 : 400,
                color: task.titleColor ?? (isRootParent ? 'var(--th-text-parent)' : 'var(--th-text2)'),
              }}>
              {readOnly && !isRefGroupId(task.id) && '🔗 '}
              {task.title}
            </span>
          )}
          {allChildrenHidden && (
            <span data-testid="hidden-children-badge" title={hiddenLabel} style={CHILD_BADGE_STYLE}>+{hiddenChildCount}</span>
          )}
          {hasChildren && !allChildrenHidden && childCount > 0 && (
            <span data-testid="child-count-badge" title={t('wbs.row.childCount', { n: childCount })} style={CHILD_BADGE_STYLE}>{childCount}</span>
          )}
          <TaskTooltip task={task} pos={tooltipPos} visible={tooltipVisible} />
        </div>
      </div>}

      {/* ステータス */}
      {show('status') && <div style={{ ...CELL, width: wbsColWidth('status', sizes) }}>
        {editField === 'status' ? (
          <select style={{ ...INPUT_S, width: 'auto', fontSize: 11 }} value={editVal} autoFocus
            onChange={e => commit('status', e.target.value)}
            onBlur={() => setEditField(null)}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <span onClick={() => startEdit('status', task.status)} style={{ cursor: 'pointer' }}>
            <span style={{
              padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: STATUS_COLOR[task.status] + '22', color: STATUS_COLOR[task.status],
            }}>
              {STATUS_LABELS[task.status]}
            </span>
          </span>
        )}
      </div>}

      {/* 優先度 */}
      {show('priority') && <div style={{ ...CELL, width: wbsColWidth('priority', sizes) }}>
        {editField === 'priority' ? (
          <select style={{ ...INPUT_S, width: 'auto', fontSize: 11 }} value={editVal} autoFocus
            onChange={e => commit('priority', e.target.value)}
            onBlur={() => setEditField(null)}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : (
          <span onClick={() => startEdit('priority', task.priority)} style={{ cursor: 'pointer' }}>
            <span style={{
              padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
              background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority],
            }}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </span>
        )}
      </div>}

      {/* 進捗 — 親タスクは自動計算・編集不可 */}
      {show('progress') && <div style={{ ...CELL, width: wbsColWidth('progress', sizes) }}>
        {!hasChildren && editField === 'progress' ? (
          <input ref={inputRef} style={{ ...INPUT_S, width: 52 }} type="number" min={0} max={100} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('progress', Math.min(100, Math.max(0, Number(editVal))))}
            onKeyDown={e => {
              if (e.key === 'Enter') commit('progress', Math.min(100, Math.max(0, Number(editVal))));
              if (e.key === 'Escape') setEditField(null);
            }} />
        ) : (
          <div
            onClick={() => { if (!hasChildren) startEdit('progress', String(task.progress)); }}
            title={hasChildren ? t('wbs.row.progressAutoTitle') : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%',
              cursor: hasChildren ? 'default' : 'text' }}>
            <div style={{ width: 40, height: 5, background: 'var(--th-border)', borderRadius: 3, flexShrink: 0 }}>
              <div style={{
                width: `${effectiveProgress}%`, height: '100%', borderRadius: 3,
                background: hasChildren ? '#a5b4fc' : '#4f46e5',
              }} />
            </div>
            <span style={{ fontSize: 10, color: hasChildren ? '#a5b4fc' : 'var(--th-text-muted)' }}>
              {effectiveProgress}%
            </span>
          </div>
        )}
      </div>}

      {/* 担当者 */}
      {show('assignee') && <div style={{ ...CELL, width: wbsColWidth('assignee', sizes) }}>
        {editField === 'assignee' ? (
          <>
            <input ref={inputRef} style={INPUT_S} value={editVal}
              list={assigneeOptions ? `assignee-opts-row-${task.id}` : undefined}
              onChange={e => setEditVal(e.target.value)}
              onBlur={() => commit('assignee', editVal)}
              onKeyDown={e => onKey(e, 'assignee', editVal)} />
            {assigneeOptions && (
              <datalist id={`assignee-opts-row-${task.id}`}>
                {assigneeOptions.map(a => <option key={a} value={a} />)}
              </datalist>
            )}
          </>
        ) : (
          <span onClick={() => startEdit('assignee', task.assignee)}
            style={{ cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: task.assignee ? 'var(--th-text2)' : 'var(--th-text-ph)' }}>
            {task.assignee || '—'}
          </span>
        )}
      </div>}

      {/* 開始日 */}
      {show('startDate') && <div style={{ ...CELL, width: wbsColWidth('startDate', sizes) }}>
        {!hasChildren && editField === 'startDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            min={DATE_INPUT_MIN} max={task.endDate || DATE_INPUT_MAX}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('startDate', editVal || null)}
            onKeyDown={e => onKey(e, 'startDate', editVal || null)} />
        ) : (
          <span
            data-testid={hasChildren ? 'date-readonly' : undefined}
            onClick={() => !hasChildren && startEdit('startDate', task.startDate ?? '')}
            title={hasChildren ? t('wbs.row.dateAutoTitle') : undefined}
            style={{
              cursor: hasChildren ? 'default' : 'text',
              color: hasChildren ? 'var(--th-text-dim)' : (task.startDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
            }}>
            {effectiveStartDate ?? '—'}
          </span>
        )}
      </div>}

      {/* 終了日（マイルストーンは開始日に同期する1点のため編集不可） */}
      {show('endDate') && <div style={{ ...CELL, width: wbsColWidth('endDate', sizes) }}>
        {!endLocked && editField === 'endDate' ? (
          <input ref={inputRef} style={INPUT_S} type="date" value={editVal}
            min={task.startDate || DATE_INPUT_MIN} max={DATE_INPUT_MAX}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit('endDate', editVal || null)}
            onKeyDown={e => onKey(e, 'endDate', editVal || null)} />
        ) : (
          <span
            data-testid={endLocked ? 'date-readonly' : undefined}
            onClick={() => !endLocked && startEdit('endDate', task.endDate ?? '')}
            title={task.isMilestone ? t('wbs.row.milestoneEndSyncTitle') : hasChildren ? t('wbs.row.dateAutoTitle') : undefined}
            style={{
              cursor: endLocked ? 'default' : 'text',
              color: endLocked ? 'var(--th-text-dim)' : (task.endDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
            }}>
            {effectiveEndDate ?? '—'}
          </span>
        )}
      </div>}

      {/* 期間（日数） */}
      {show('duration') && <div style={{ ...CELL, width: wbsColWidth('duration', sizes) }}>
        {!hasChildren && editField === 'duration' ? (
          <input ref={inputRef}
            style={{ ...INPUT_S, width: 38 }} type="number" min={1} value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commitDuration(editVal)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitDuration(editVal);
              if (e.key === 'Escape') setEditField(null);
            }} />
        ) : (
          <span
            onClick={() => {
              if (!hasChildren && task.startDate) startEdit('duration', String(duration ?? ''));
            }}
            title={hasChildren ? t('wbs.row.dateAutoTitle') : undefined}
            style={{
              cursor: (!hasChildren && task.startDate) ? 'text' : 'default',
              color: hasChildren ? 'var(--th-text-dim)' : (duration !== null ? 'var(--th-text2)' : 'var(--th-text-ph)'),
            }}>
            {duration !== null ? duration : '—'}
          </span>
        )}
      </div>}

      {conflict && (
        <ConflictDialog
          field={conflict.field}
          theirVal={conflict.theirVal}
          myVal={conflict.myVal}
          onResolve={resolveConflict}
        />
      )}
    </div>
  );
});
