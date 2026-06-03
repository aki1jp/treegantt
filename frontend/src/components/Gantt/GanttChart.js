import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { filterTasks } from '../../utils/sort';
import { calcGanttRange, calcLightningPoints, ganttTotalWidth, ZOOM_CONFIG, calcCriticalPath, addDays, buildMultiLevelHeaders, } from '../../utils/ganttCalc';
import { buildTree, flattenTree, calcEffectiveProgress, includeAncestors } from '../../utils/taskTree';
import { textStartX, INDENT } from '../../utils/wbsLayout';
import { GanttBar } from './GanttBar';
import { ResourceView } from './ResourceView';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine, TodayLine } from './LightningLine';
import { ContextMenu } from './GanttContextMenu';
import { GanttLeftRow } from './GanttLeftRow';
const HEADER_ROW_H = 26;
// ── 左パネル列定義 ──────────────────────────────────
const LEFT_COLS = [
    { key: 'order', label: '#', width: 36 },
    { key: 'title', label: 'タイトル', width: 180 },
    { key: 'status', label: 'ST', width: 66 },
    { key: 'priority', label: '優先', width: 56 },
    { key: 'progress', label: '進捗', width: 76 },
    { key: 'assignee', label: '担当', width: 76 },
    { key: 'startDate', label: '開始', width: 88 },
    { key: 'endDate', label: '終了', width: 88 },
    { key: 'duration', label: '日数', width: 50 },
];
const RESIZABLE_COL_KEYS = new Set(['title', 'assignee']);
const COL_MIN_WIDTHS = { title: 80, assignee: 50 };
// ── クイック追加行 ──────────────────────────────────
function QuickAddRow({ onAdd, titleWidth, assigneeWidth, dateColWidth }) {
    const { uiRowHeight, uiFontSize } = useTaskStore();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState('');
    const inputRef = useRef(null);
    useEffect(() => {
        if (editing && inputRef.current)
            inputRef.current.focus();
    }, [editing]);
    async function submit() {
        const t = title.trim();
        if (t) {
            await onAdd(t);
            setTitle('');
        }
        setEditing(false);
    }
    const CELL = {
        height: uiRowHeight, display: 'flex', alignItems: 'center',
        padding: '0 6px', fontSize: uiFontSize, overflow: 'hidden', boxSizing: 'border-box',
    };
    return (_jsxs("div", { style: {
            display: 'flex', background: 'var(--th-bg2)',
            height: uiRowHeight, boxSizing: 'border-box',
            borderTop: '1px dashed var(--th-border)',
        }, children: [_jsx("div", { style: { ...CELL, width: 36 } }), _jsx("div", { style: { ...CELL, width: titleWidth }, children: editing ? (_jsx("input", { ref: inputRef, style: { width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3, fontSize: uiFontSize, outline: 'none' }, value: title, onChange: e => setTitle(e.target.value), onBlur: submit, onKeyDown: e => {
                        if (e.key === 'Enter')
                            submit();
                        if (e.key === 'Escape') {
                            setTitle('');
                            setEditing(false);
                        }
                    } })) : (_jsx("span", { onClick: () => setEditing(true), style: { color: 'var(--th-text-dim)', cursor: 'text', fontSize: uiFontSize, userSelect: 'none' }, children: "\uFF0B \u30BF\u30B9\u30AF\u3092\u8FFD\u52A0\u2026" })) }), [66, 56, 76, assigneeWidth, dateColWidth, dateColWidth, 50].map((w, i) => _jsx("div", { style: { ...CELL, width: w } }, i))] }));
}
export function GanttChart({ onEditTask, onDeleteTask, onInlineUpdate, onQuickAdd, onAddSubTask, onReorder }) {
    const { tasks, filterStatus, filterAssignee, filterPriority, filterSearch, zoomLevel, ganttStartDate, ganttPeriod, showLightningLine, showWeekend, showCriticalPath, showResourceView, uiFontSize, uiRowHeight, ganttHeaderLevels, } = useTaskStore();
    const sorted = filterTasks(tasks, filterStatus, filterAssignee, filterPriority, filterSearch);
    // 列幅（タイトル・担当者はドラッグでリサイズ可）
    const [colWidths, setColWidths] = useState({ title: 180, assignee: 76 });
    const [colResize, setColResize] = useState(null);
    const colResizeRef = useRef(null);
    useEffect(() => { colResizeRef.current = colResize; }, [colResize]);
    // フォントサイズに連動した日付列幅 (YYYY-MM-DD の10文字が収まる幅)
    const dateColWidth = 80 + (uiFontSize - 11) * 5; // 11px→80, 13px→90, 15px→100
    const LEFT_TOTAL = LEFT_COLS.reduce((s, c) => {
        if (c.key === 'startDate' || c.key === 'endDate')
            return s + dateColWidth;
        return s + (colWidths[c.key] ?? c.width);
    }, 0);
    const handleColMouseMove = useCallback((e) => {
        const cr = colResizeRef.current;
        if (!cr)
            return;
        const minW = COL_MIN_WIDTHS[cr.key] ?? 40;
        setColWidths(prev => ({
            ...prev,
            [cr.key]: Math.max(minW, cr.startWidth + e.clientX - cr.startX),
        }));
    }, []);
    const handleColMouseUp = useCallback(() => setColResize(null), []);
    useEffect(() => {
        if (!colResize)
            return;
        window.addEventListener('mousemove', handleColMouseMove);
        window.addEventListener('mouseup', handleColMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleColMouseMove);
            window.removeEventListener('mouseup', handleColMouseUp);
        };
    }, [colResize, handleColMouseMove, handleColMouseUp]);
    const [collapsed, setCollapsed] = useState(new Set());
    const withAncestors = includeAncestors(sorted, tasks);
    const { roots, childCount } = buildTree(withAncestors);
    const flatRows = flattenTree(roots, collapsed);
    const collapseAll = () => setCollapsed(new Set(childCount.keys()));
    const expandAll = () => setCollapsed(new Set());
    const start = ganttStartDate || undefined;
    const period = ganttPeriod || undefined;
    const range = calcGanttRange(sorted, start, period, zoomLevel);
    const { min, max } = range;
    const totalWidth = ganttTotalWidth(sorted, zoomLevel, start, period);
    const headerRows = buildMultiLevelHeaders(min, max, zoomLevel, ganttHeaderLevels);
    const taskIndex = new Map(flatRows.map(({ task }, i) => [task.id, i]));
    const taskById = new Map(sorted.map(t => [t.id, t]));
    const totalHeight = (flatRows.length + 1) * uiRowHeight;
    const { dayWidth } = ZOOM_CONFIG[zoomLevel];
    // 土日列
    const weekendXs = [];
    if (showWeekend) {
        let curTime = min.getTime();
        const endTime = max.getTime();
        while (curTime < endTime) {
            const dow = new Date(curTime).getDay();
            if (dow === 0 || dow === 6) {
                weekendXs.push(Math.round((curTime - min.getTime()) / 86400000) * dayWidth);
            }
            curTime += 86400000;
        }
    }
    // 親タスクの進捗事前計算
    const progressMap = new Map(sorted.map(t => [t.id, calcEffectiveProgress(t.id, childCount, sorted)]));
    // イナズマライン
    const lightningPoints = calcLightningPoints(flatRows.map(r => ({
        task: r.task,
        effectiveProgress: progressMap.get(r.task.id) ?? 0,
        hasChildren: (childCount.get(r.task.id) ?? 0) > 0,
        isCollapsed: collapsed.has(r.task.id),
    })), min, zoomLevel, uiRowHeight);
    // クリティカルパス
    const criticalSet = showCriticalPath ? calcCriticalPath(sorted) : new Set();
    // ── ドラッグ状態（バー移動・リサイズ） ──────────────
    const [dragState, setDragState] = useState(null);
    const [dragPreview, setDragPreview] = useState(null);
    const dragPreviewRef = useRef(null);
    const [barCtxMenu, setBarCtxMenu] = useState(null);
    const [rowCtxMenu, setRowCtxMenu] = useState(null);
    // ── 行 D&D（ソートなし時の並び替え） ─────────────────
    const wbsPanelRef = useRef(null);
    const [rowDragId, setRowDragId] = useState(null);
    const [rowDropIdx, setRowDropIdx] = useState(null);
    const [rowDropDepth, setRowDropDepth] = useState(null);
    const [rowDropTarget, setRowDropTarget] = useState(null);
    function clearDrop() {
        setRowDragId(null);
        setRowDropIdx(null);
        setRowDropDepth(null);
        setRowDropTarget(null);
    }
    function handleRowDragStart(e, taskId) {
        const tag = document.activeElement?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            e.preventDefault();
            return;
        }
        if (e.dataTransfer)
            e.dataTransfer.effectAllowed = 'move';
        setRowDragId(taskId);
    }
    function handleRowDragOver(e, idx) {
        e.preventDefault();
        if (e.dataTransfer)
            e.dataTransfer.dropEffect = 'move';
        // ── Y位置で子採用ゾーンか判定（行の下端70%）──
        const rowRect = e.currentTarget.getBoundingClientRect();
        const relY = e.clientY - rowRect.top;
        const isAdoptZone = rowRect.height > 0 && relY / rowRect.height > 0.3;
        const candidate = flatRows[idx];
        if (isAdoptZone && candidate?.task.id !== rowDragId && !candidate?.task.isMilestone) {
            setRowDropTarget(candidate.task.id);
            setRowDropIdx(null);
            setRowDropDepth(null);
            return;
        }
        // ── バー挿入モード ──
        setRowDropTarget(null);
        const rowAbove = idx > 0 ? flatRows[idx - 1] : null;
        const rowBelow = flatRows[idx];
        let depth;
        if (!rowAbove || rowAbove.depth === rowBelow.depth) {
            // 同階層同士: 深さ固定（X軸不要）
            depth = rowBelow.depth;
        }
        else {
            // 親子の境目: X軸で深さを選択
            const panelLeft = wbsPanelRef.current?.getBoundingClientRect().left ?? 0;
            const mouseX = e.clientX - panelLeft;
            const maxDepth = rowBelow.depth <= rowAbove.depth ? rowAbove.depth : rowAbove.depth + 1;
            depth = Math.min(Math.max(0, Math.floor((mouseX - textStartX(0)) / INDENT)), maxDepth);
        }
        setRowDropIdx(idx);
        setRowDropDepth(depth);
    }
    function handleRowDrop(e, dropIdx) {
        e.preventDefault();
        if (!rowDragId)
            return;
        const dragIdx = flatRows.findIndex(r => r.task.id === rowDragId);
        if (dragIdx === -1) {
            clearDrop();
            return;
        }
        // ── 子採用モード ──
        if (rowDropTarget) {
            const moved = flatRows[dragIdx].task;
            const siblings = flatRows.filter(r => r.task.parentId === rowDropTarget);
            const maxSibOrder = siblings.length > 0
                ? Math.max(...siblings.map(r => r.task.order))
                : 0;
            onReorder([{ id: moved.id, order: maxSibOrder + 1, parentId: rowDropTarget }]);
            clearDrop();
            return;
        }
        // ── バー挿入モード ──
        if (dragIdx === dropIdx) {
            clearDrop();
            return;
        }
        const moved = flatRows[dragIdx].task;
        const d = rowDropDepth ?? 0;
        // 深さ → 新しい parentId を逆引き
        const targetParentId = (() => {
            if (d === 0)
                return null;
            for (let i = dropIdx - 1; i >= 0; i--) {
                if (flatRows[i].task.id === rowDragId)
                    continue;
                if (flatRows[i].depth === d - 1)
                    return flatRows[i].task.id;
                if (flatRows[i].depth < d - 1)
                    break;
            }
            return null;
        })();
        // 循環参照防止・マイルストーン保護
        const newParentId = moved.isMilestone || targetParentId === moved.id ? moved.parentId : targetParentId;
        const parentIdChanged = newParentId !== moved.parentId;
        const newRows = [...flatRows.map(r => r.task)];
        const [removed] = newRows.splice(dragIdx, 1);
        const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
        newRows.splice(insertAt, 0, removed);
        if (insertAt === dragIdx && !parentIdChanged) {
            clearDrop();
            return;
        }
        const orders = newRows.map((t, i) => ({
            id: t.id, order: i + 1,
            ...(t.id === moved.id && parentIdChanged ? { parentId: newParentId } : {}),
        }));
        onReorder(orders);
        clearDrop();
    }
    function handleRowDragEnd() {
        clearDrop();
    }
    const svgRef = useRef(null);
    const wbsBodyRef = useRef(null);
    const ganttPanelRef = useRef(null);
    const workloadScrollRef = useRef(null);
    function handleScroll(e) {
        if (wbsBodyRef.current)
            wbsBodyRef.current.scrollTop = e.currentTarget.scrollTop;
        if (workloadScrollRef.current)
            workloadScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    // WBSパネル上のホイール操作をガントパネルに転送（WBSはoverflow:hiddenのため）
    function handleWbsWheel(e) {
        if (ganttPanelRef.current) {
            ganttPanelRef.current.scrollTop += e.deltaY;
            ganttPanelRef.current.scrollLeft += e.deltaX;
        }
    }
    // SVG へのネイティブ contextmenu リスナー（React 合成イベントは SVG で不安定なため）
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg)
            return;
        function handleContextMenu(e) {
            e.preventDefault();
            const el = e.target.closest('[data-task-id]');
            if (!el)
                return;
            const taskId = el.getAttribute('data-task-id');
            if (taskId) {
                setBarCtxMenu({ x: e.clientX, y: e.clientY, taskId });
                setRowCtxMenu(null);
            }
        }
        svg.addEventListener('contextmenu', handleContextMenu);
        return () => svg.removeEventListener('contextmenu', handleContextMenu);
    }, []);
    // どちらかのコンテキストメニューが開いている間、mousedown で両方を閉じる
    useEffect(() => {
        if (!barCtxMenu && !rowCtxMenu)
            return;
        const close = () => { setBarCtxMenu(null); setRowCtxMenu(null); };
        window.addEventListener('mousedown', close);
        return () => window.removeEventListener('mousedown', close);
    }, [barCtxMenu, rowCtxMenu]);
    useEffect(() => {
        dragPreviewRef.current = dragPreview;
    }, [dragPreview]);
    const handleMouseMove = useCallback((e) => {
        if (!dragState)
            return;
        const delta = Math.round((e.clientX - dragState.startClientX) / dayWidth);
        let newStart = dragState.origStart;
        let newEnd = dragState.origEnd;
        if (dragState.type === 'move') {
            newStart = addDays(dragState.origStart, delta);
            newEnd = addDays(dragState.origEnd, delta);
        }
        else if (dragState.type === 'resize-right') {
            newEnd = addDays(dragState.origEnd, delta);
            if (newEnd < newStart)
                newEnd = newStart;
        }
        else {
            newStart = addDays(dragState.origStart, delta);
            if (newStart > newEnd)
                newStart = newEnd;
        }
        setDragPreview({ taskId: dragState.taskId, startDate: newStart, endDate: newEnd });
    }, [dragState, dayWidth]);
    const handleMouseUp = useCallback(() => {
        const preview = dragPreviewRef.current;
        if (preview && dragState) {
            if (preview.startDate !== dragState.origStart || preview.endDate !== dragState.origEnd) {
                const patch = { startDate: preview.startDate, endDate: preview.endDate };
                // マイルストーンは startDate のみ（endDate は同日）
                const task = taskById.get(preview.taskId);
                if (task?.isMilestone)
                    patch.endDate = preview.startDate;
                onInlineUpdate(preview.taskId, patch);
            }
        }
        setDragState(null);
        setDragPreview(null);
    }, [dragState, taskById, onInlineUpdate]);
    useEffect(() => {
        if (!dragState)
            return;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, handleMouseMove, handleMouseUp]);
    function startDrag(e, taskId, type) {
        if (e.button !== 0)
            return;
        e.preventDefault();
        const task = taskById.get(taskId);
        if (!task?.startDate)
            return;
        setDragState({
            taskId, type,
            startClientX: e.clientX,
            origStart: task.startDate,
            origEnd: task.endDate ?? task.startDate,
        });
    }
    function toggleCollapse(id) {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    const TH = {
        height: HEADER_ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'var(--th-text-muted)',
        borderRight: '1px solid var(--th-border)', cursor: 'default', userSelect: 'none',
        boxSizing: 'border-box', padding: '0 4px',
    };
    return (_jsxs("div", { style: {
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            cursor: dragState ? 'grabbing' : colResize ? 'col-resize' : 'default',
        }, children: [_jsxs("div", { style: { flex: 1, display: 'flex', overflow: 'hidden' }, children: [_jsxs("div", { "data-testid": "wbs-panel", ref: wbsPanelRef, onWheel: handleWbsWheel, style: {
                            flexShrink: 0, width: LEFT_TOTAL, display: 'flex', flexDirection: 'column',
                            overflow: 'hidden', borderRight: '2px solid var(--th-border-strong)', background: 'var(--th-bg)',
                        }, children: [_jsx("div", { "data-testid": "wbs-header", style: {
                                    flexShrink: 0, height: headerRows.length * HEADER_ROW_H + 2,
                                    display: 'flex', alignItems: 'flex-end', background: 'var(--th-bg2)', borderBottom: '2px solid var(--th-border)',
                                }, children: LEFT_COLS.map(col => {
                                    const w = (col.key === 'startDate' || col.key === 'endDate')
                                        ? dateColWidth
                                        : (colWidths[col.key] ?? col.width);
                                    const resizable = RESIZABLE_COL_KEYS.has(col.key);
                                    const isTitleCol = col.key === 'title';
                                    return (_jsxs("div", { style: { ...TH, width: w,
                                            position: resizable ? 'relative' : undefined,
                                            justifyContent: isTitleCol ? 'flex-start' : 'center', gap: 2 }, children: [isTitleCol && childCount.size > 0 && (_jsx("div", { style: { display: 'flex', gap: 1, paddingRight: 4 }, children: [
                                                    { icon: '⊞', title: 'すべて展開', action: expandAll },
                                                    { icon: '⊟', title: 'すべて折りたたむ', action: collapseAll },
                                                ].map(({ icon, title, action }) => (_jsx("button", { title: title, onClick: e => { e.stopPropagation(); action(); }, style: { border: 'none', background: 'none', cursor: 'pointer',
                                                        fontSize: 12, color: 'var(--th-text-dim)', padding: '1px 2px', borderRadius: 2,
                                                        lineHeight: 1, fontWeight: 400 }, onMouseEnter: e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }, onMouseLeave: e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }, children: icon }, icon))) })), col.label, resizable && (_jsx("div", { style: { position: 'absolute', right: 0, top: 4, bottom: 4, width: 4,
                                                    cursor: 'col-resize', background: '#c7d2fe', borderRadius: 2, zIndex: 1 }, onMouseDown: e => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setColResize({ key: col.key, startX: e.clientX, startWidth: w });
                                                }, onClick: e => e.stopPropagation() }))] }, col.key));
                                }) }), _jsxs("div", { ref: wbsBodyRef, style: { flex: 1, overflowY: 'hidden' }, children: [(() => {
                                        const dragIdx = rowDragId ? flatRows.findIndex(r => r.task.id === rowDragId) : -1;
                                        return flatRows.map(({ task, depth }, idx) => {
                                            const isNoOp = dragIdx !== -1 && (rowDropIdx === dragIdx || rowDropIdx === dragIdx + 1);
                                            const showDropLine = rowDropIdx === idx && !!rowDragId && !isNoOp;
                                            return (_jsxs("div", { draggable: true, onDragStart: (e) => handleRowDragStart(e, task.id), onDragOver: (e) => handleRowDragOver(e, idx), onDrop: (e) => handleRowDrop(e, idx), onDragEnd: handleRowDragEnd, style: {
                                                    opacity: rowDragId === task.id ? 0.4 : 1,
                                                    cursor: 'grab',
                                                    position: 'relative',
                                                    outline: rowDropTarget === task.id ? '2px solid #4f46e5' : undefined,
                                                    outlineOffset: '-1px',
                                                    zIndex: rowDropTarget === task.id ? 1 : undefined,
                                                }, children: [showDropLine && (_jsx("div", { "data-drop-line": true, style: {
                                                            position: 'absolute',
                                                            left: textStartX(rowDropDepth ?? 0),
                                                            right: 0, top: -2,
                                                            height: 3, background: '#4f46e5',
                                                            borderRadius: 2, boxShadow: '0 0 6px rgba(79,70,229,0.5)',
                                                            pointerEvents: 'none', zIndex: 5,
                                                        } })), _jsx(GanttLeftRow, { task: task, depth: depth, hasChildren: (childCount.get(task.id) ?? 0) > 0, isCollapsed: collapsed.has(task.id), effectiveProgress: progressMap.get(task.id) ?? task.progress, fontSize: uiFontSize, rowHeight: uiRowHeight, titleWidth: colWidths.title, assigneeWidth: colWidths.assignee, dateColWidth: dateColWidth, isDragging: rowDragId !== null, onToggleCollapse: () => toggleCollapse(task.id), onInlineUpdate: onInlineUpdate, onRowContextMenu: (x, y) => { setRowCtxMenu({ x, y, taskId: task.id }); setBarCtxMenu(null); } })] }, task.id));
                                        });
                                    })(), _jsx(QuickAddRow, { onAdd: onQuickAdd, titleWidth: colWidths.title, assigneeWidth: colWidths.assignee, dateColWidth: dateColWidth })] })] }), _jsx("div", { "data-testid": "gantt-panel", ref: ganttPanelRef, style: { flex: 1, overflow: 'auto' }, onScroll: handleScroll, children: _jsxs("div", { style: { width: totalWidth }, children: [_jsx("div", { "data-testid": "gantt-header", style: {
                                        position: 'sticky', top: 0, zIndex: 20,
                                        borderBottom: '2px solid var(--th-border)', background: 'var(--th-bg2)',
                                    }, children: headerRows.map((row, ri) => (_jsx("div", { style: {
                                            width: totalWidth, position: 'relative',
                                            height: HEADER_ROW_H, boxSizing: 'border-box',
                                            background: 'var(--th-bg2)',
                                            borderTop: ri > 0 ? '1px solid var(--th-border)' : undefined,
                                        }, children: row.cells.map((cell, ci) => {
                                            const isSat = (row.level === 'day' || row.level === 'dow') && cell.dow === 6;
                                            const isSun = (row.level === 'day' || row.level === 'dow') && cell.dow === 0;
                                            const bg = isSat
                                                ? 'rgba(59,130,246,0.18)'
                                                : isSun
                                                    ? 'rgba(239,68,68,0.18)'
                                                    : ci % 2 === 0 ? 'var(--th-bg2)' : 'var(--th-bg3)';
                                            return (_jsx("div", { "data-dow": row.level === 'dow' ? cell.dow : undefined, style: {
                                                    position: 'absolute', left: cell.x, width: cell.width, height: HEADER_ROW_H,
                                                    background: bg,
                                                    borderRight: '1px solid var(--th-border)',
                                                    display: 'flex', alignItems: 'center',
                                                    justifyContent: (row.level === 'day' || row.level === 'dow') ? 'center' : undefined,
                                                    paddingLeft: (row.level === 'day' || row.level === 'dow') ? 0 : 4,
                                                    fontSize: row.level === 'dow' ? 10 : row.level === 'day' ? 10 : 10,
                                                    fontWeight: row.level === 'year' ? 800 : 600,
                                                    color: row.level === 'dow'
                                                        ? (isSat ? '#3b82f6' : isSun ? '#ef4444' : 'var(--th-text-muted)')
                                                        : row.level === 'year' ? 'var(--th-text2)' : 'var(--th-text-muted)',
                                                    boxSizing: 'border-box', overflow: 'hidden',
                                                }, children: cell.label }, ci));
                                        }) }, row.level))) }), _jsxs("svg", { ref: svgRef, width: totalWidth, height: Math.max(totalHeight, 1), style: { display: 'block' }, children: [_jsx("defs", { children: _jsx("marker", { id: "arrowhead", markerWidth: "6", markerHeight: "6", refX: "6", refY: "3", orient: "auto", children: _jsx("path", { d: "M0,0 L6,3 L0,6 Z", fill: "#378ADD" }) }) }), flatRows.map(({ task, depth }, i) => {
                                            const isRootParent = depth === 0 && (childCount.get(task.id) ?? 0) > 0;
                                            return (_jsx("rect", { x: 0, y: i * uiRowHeight, width: totalWidth, height: uiRowHeight, style: { fill: isRootParent ? 'var(--th-bg-parent)' : (i % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)') } }, i));
                                        }), weekendXs.map((x, i) => (_jsx("rect", { x: x, y: 0, width: dayWidth, height: Math.max(totalHeight, 1), fill: "rgba(148,163,184,0.18)" }, i))), flatRows.map(({ task }, i) => {
                                            const preview = dragPreview?.taskId === task.id ? dragPreview : null;
                                            const isParent = (childCount.get(task.id) ?? 0) > 0;
                                            return (_jsx(GanttBar, { task: task, minDate: min, zoom: zoomLevel, rowIndex: i, isCritical: criticalSet.has(task.id), dragPreview: preview, rowHeight: uiRowHeight, isParent: isParent, onMoveStart: (e, id) => !isParent && startDrag(e, id, 'move'), onResizeLeftStart: (e, id) => !isParent && startDrag(e, id, 'resize-left'), onResizeRightStart: (e, id) => !isParent && startDrag(e, id, 'resize-right'), onClick: () => !dragState && onEditTask(task) }, task.id));
                                        }), sorted.flatMap(task => task.predecessors.map(predId => {
                                            const pred = taskById.get(predId);
                                            return pred ? (_jsx(DependencyArrow, { fromTask: pred, toTask: task, minDate: min, zoom: zoomLevel, taskIndex: taskIndex, rowHeight: uiRowHeight }, `${predId}->${task.id}`)) : null;
                                        })), _jsx(TodayLine, { min: min, zoomLevel: zoomLevel, height: Math.max(totalHeight, 1) }), showLightningLine && lightningPoints && (_jsx(LightningLine, { points: lightningPoints, color: "#7c3aed" }))] })] }) }), [
                        barCtxMenu && { menu: barCtxMenu, close: () => setBarCtxMenu(null) },
                        rowCtxMenu && { menu: rowCtxMenu, close: () => setRowCtxMenu(null) },
                    ].map((entry, i) => {
                        if (!entry)
                            return null;
                        const { menu, close } = entry;
                        const task = taskById.get(menu.taskId);
                        if (!task)
                            return null;
                        return (_jsxs(ContextMenu, { x: menu.x, y: menu.y, onMouseDown: e => e.stopPropagation(), onClick: e => e.stopPropagation(), children: [!task.isMilestone && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => { onAddSubTask(task.id); close(); }, style: {
                                                display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                                                background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                                                color: 'var(--th-text2)',
                                            }, onMouseEnter: e => (e.currentTarget.style.background = 'var(--th-bg2)'), onMouseLeave: e => (e.currentTarget.style.background = 'none'), children: "\uFF0B \u5B50\u30BF\u30B9\u30AF\u3092\u8FFD\u52A0" }), _jsx("div", { style: { height: 1, background: 'var(--th-border)' } })] })), _jsx("button", { onClick: () => { onEditTask(task); close(); }, style: {
                                        display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                                        background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                                        color: 'var(--th-text2)',
                                    }, onMouseEnter: e => (e.currentTarget.style.background = 'var(--th-bg2)'), onMouseLeave: e => (e.currentTarget.style.background = 'none'), children: "\u7DE8\u96C6\uFF08\u8A73\u7D30\uFF09" }), _jsx("div", { style: { height: 1, background: 'var(--th-border)' } }), _jsx("button", { onClick: () => { onDeleteTask(task.id); close(); }, style: {
                                        display: 'block', width: '100%', padding: '8px 14px', border: 'none',
                                        background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#ef4444',
                                    }, onMouseEnter: e => (e.currentTarget.style.background = '#fef2f2'), onMouseLeave: e => (e.currentTarget.style.background = 'none'), children: "\u524A\u9664" })] }, i));
                    })] }), showResourceView && (_jsx(ResourceView, { tasks: sorted, min: min, zoomLevel: zoomLevel, totalWidth: totalWidth, labelWidth: LEFT_TOTAL, scrollRef: workloadScrollRef, onEditTask: onEditTask }))] }));
}
