import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { addDays, calcDuration } from '../../utils/ganttCalc';
import { titlePaddingLeft } from '../../utils/wbsLayout';
import { ConflictDialog } from '../ConflictDialog/ConflictDialog';
import { TaskTooltip } from './TaskTooltip';
const STATUS_COLOR = {
    todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b', pending: '#94a3b8',
};
const STATUS_LABEL = {
    todo: 'TODO', wip: 'Doing', done: 'DONE', wait: '待機', pending: '保留',
};
const PRIORITY_COLOR = {
    critical: '#ef4444', high: '#f97316', medium: '#6b7280', low: '#d1d5db',
};
const PRIORITY_LABEL = {
    critical: '最高', high: '高', medium: '中', low: '低',
};
export function GanttLeftRow({ task, depth, hasChildren, isCollapsed, effectiveProgress, fontSize, rowHeight, titleWidth, assigneeWidth, dateColWidth, isDragging = false, onToggleCollapse, onInlineUpdate, onRowContextMenu, }) {
    const [editField, setEditField] = useState(null);
    const [editVal, setEditVal] = useState('');
    const [editStartVal, setEditStartVal] = useState('');
    const [conflict, setConflict] = useState(null);
    const inputRef = useRef(null);
    // ── ツールチップ ──────────────────────────────────────────
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const tooltipTimer = useRef(null);
    const hasTooltipContent = task.summary.trim().length > 0 || task.description.trim().length > 0;
    const handleTitleMouseEnter = useCallback((e) => {
        if (isDragging || !hasTooltipContent)
            return;
        setTooltipPos({ x: e.clientX, y: e.clientY });
        tooltipTimer.current = setTimeout(() => setTooltipVisible(true), 250);
    }, [isDragging, hasTooltipContent]);
    const handleTitleMouseLeave = useCallback(() => {
        if (tooltipTimer.current)
            clearTimeout(tooltipTimer.current);
        setTooltipVisible(false);
    }, []);
    // ドラッグ開始時にツールチップを強制非表示
    useEffect(() => {
        if (isDragging) {
            if (tooltipTimer.current)
                clearTimeout(tooltipTimer.current);
            setTooltipVisible(false);
        }
    }, [isDragging]);
    useEffect(() => () => { if (tooltipTimer.current)
        clearTimeout(tooltipTimer.current); }, []);
    useEffect(() => {
        if (editField && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editField]);
    function startEdit(field, val) {
        if (tooltipTimer.current)
            clearTimeout(tooltipTimer.current);
        setTooltipVisible(false);
        setEditField(field);
        setEditVal(val);
        setEditStartVal(val);
    }
    function commit(field, myVal) {
        const currentVal = String(task[field] ?? '');
        if (currentVal !== editStartVal) {
            setConflict({ field, theirVal: currentVal, myVal: String(myVal ?? '') });
            setEditField(null);
            return;
        }
        // 開始日・終了日の前後矛盾チェック: 矛盾する場合は両方を新しい値にクランプ
        if (field === 'startDate' && myVal && task.endDate && myVal > task.endDate) {
            onInlineUpdate(task.id, { startDate: myVal, endDate: myVal });
            setEditField(null);
            return;
        }
        if (field === 'endDate' && myVal && task.startDate && myVal < task.startDate) {
            onInlineUpdate(task.id, { startDate: myVal, endDate: myVal });
            setEditField(null);
            return;
        }
        onInlineUpdate(task.id, { [field]: myVal });
        setEditField(null);
    }
    function resolveConflict(useTheirs) {
        if (!conflict)
            return;
        if (!useTheirs) {
            const parsed = isNaN(Number(conflict.myVal)) ? conflict.myVal : Number(conflict.myVal);
            onInlineUpdate(task.id, { [conflict.field]: parsed });
        }
        setConflict(null);
    }
    function onKey(e, field, val) {
        if (e.key === 'Enter')
            commit(field, val);
        if (e.key === 'Escape')
            setEditField(null);
    }
    function commitDuration(raw) {
        const n = parseInt(raw, 10);
        if (isNaN(n) || n < 1 || !task.startDate) {
            setEditField(null);
            return;
        }
        onInlineUpdate(task.id, { endDate: addDays(task.startDate, n - 1) });
        setEditField(null);
    }
    const CELL = {
        height: rowHeight, display: 'flex', alignItems: 'center',
        padding: '0 6px', fontSize, overflow: 'hidden', whiteSpace: 'nowrap',
        boxSizing: 'border-box', color: 'var(--th-text2)',
    };
    const INPUT_S = {
        width: '100%', padding: '2px 4px', border: '1px solid #4f46e5',
        borderRadius: 3, fontSize, outline: 'none',
        background: 'var(--th-input-bg)', color: 'var(--th-text)',
    };
    const isRootParent = depth === 0 && hasChildren;
    const indent = titlePaddingLeft(depth);
    const rowBg = isRootParent ? 'var(--th-bg-parent)' : 'var(--th-bg)';
    const duration = calcDuration(task);
    return (_jsxs("div", { style: {
            display: 'flex', background: rowBg,
            height: rowHeight, boxSizing: 'border-box',
            borderBottom: '1px solid var(--th-border)',
            borderLeft: isRootParent ? '3px solid var(--th-border-strong)' : '3px solid transparent',
        }, onContextMenu: e => { e.preventDefault(); if (tooltipTimer.current)
            clearTimeout(tooltipTimer.current); setTooltipVisible(false); onRowContextMenu(e.clientX, e.clientY); }, children: [_jsx("div", { style: { ...CELL, width: 36, justifyContent: 'center', color: 'var(--th-text-dim)', userSelect: 'none' }, children: task.isMilestone ? '◇' : task.seq }), _jsx("div", { style: { ...CELL, width: titleWidth, paddingLeft: indent }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 3, width: '100%', overflow: 'hidden' }, children: [hasChildren ? (_jsx("button", { onClick: e => { e.stopPropagation(); onToggleCollapse(); }, style: {
                                width: 16, height: 16, border: 'none', background: 'none', cursor: 'pointer',
                                padding: 0, fontSize: 9, color: 'var(--th-text-muted)', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }, children: isCollapsed ? '▶' : '▼' })) : depth > 0 ? (_jsx("span", { style: { width: 16, flexShrink: 0, textAlign: 'center', color: 'var(--th-text-ph)', fontSize: 11, userSelect: 'none' }, children: "\u2514" })) : (_jsx("span", { style: { width: 16, flexShrink: 0 } })), editField === 'title' ? (_jsx("input", { ref: inputRef, style: INPUT_S, value: editVal, onChange: e => setEditVal(e.target.value), onBlur: () => { if (editVal.trim())
                                commit('title', editVal.trim());
                            else
                                setEditField(null); }, onKeyDown: e => onKey(e, 'title', editVal.trim() || null) })) : (_jsx("span", { onClick: () => startEdit('title', task.title), onMouseEnter: handleTitleMouseEnter, onMouseLeave: handleTitleMouseLeave, style: {
                                cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                fontWeight: isRootParent ? 700 : 400,
                                color: isRootParent ? 'var(--th-text-parent)' : 'var(--th-text2)',
                            }, children: task.title })), _jsx(TaskTooltip, { task: task, pos: tooltipPos, visible: tooltipVisible })] }) }), _jsx("div", { style: { ...CELL, width: 66 }, children: editField === 'status' ? (_jsx("select", { style: { ...INPUT_S, width: 'auto', fontSize: 11 }, value: editVal, autoFocus: true, onChange: e => commit('status', e.target.value), onBlur: () => setEditField(null), children: Object.entries(STATUS_LABEL).map(([v, l]) => _jsx("option", { value: v, children: l }, v)) })) : (_jsx("span", { onClick: () => startEdit('status', task.status), style: { cursor: 'pointer' }, children: _jsx("span", { style: {
                            padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
                            background: STATUS_COLOR[task.status] + '22', color: STATUS_COLOR[task.status],
                        }, children: STATUS_LABEL[task.status] }) })) }), _jsx("div", { style: { ...CELL, width: 56 }, children: editField === 'priority' ? (_jsx("select", { style: { ...INPUT_S, width: 'auto', fontSize: 11 }, value: editVal, autoFocus: true, onChange: e => commit('priority', e.target.value), onBlur: () => setEditField(null), children: Object.entries(PRIORITY_LABEL).map(([v, l]) => _jsx("option", { value: v, children: l }, v)) })) : (_jsx("span", { onClick: () => startEdit('priority', task.priority), style: { cursor: 'pointer' }, children: _jsx("span", { style: {
                            padding: '1px 5px', borderRadius: 9999, fontSize: 10, fontWeight: 600,
                            background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority],
                        }, children: PRIORITY_LABEL[task.priority] }) })) }), _jsx("div", { style: { ...CELL, width: 76 }, children: !hasChildren && editField === 'progress' ? (_jsx("input", { ref: inputRef, style: { ...INPUT_S, width: 52 }, type: "number", min: 0, max: 100, value: editVal, onChange: e => setEditVal(e.target.value), onBlur: () => commit('progress', Math.min(100, Math.max(0, Number(editVal)))), onKeyDown: e => {
                        if (e.key === 'Enter')
                            commit('progress', Math.min(100, Math.max(0, Number(editVal))));
                        if (e.key === 'Escape')
                            setEditField(null);
                    } })) : (_jsxs("div", { onClick: () => { if (!hasChildren)
                        startEdit('progress', String(task.progress)); }, title: hasChildren ? '子タスクの平均（自動計算）' : undefined, style: { display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                        cursor: hasChildren ? 'default' : 'text' }, children: [_jsx("div", { style: { width: 40, height: 5, background: 'var(--th-border)', borderRadius: 3, flexShrink: 0 }, children: _jsx("div", { style: {
                                    width: `${effectiveProgress}%`, height: '100%', borderRadius: 3,
                                    background: hasChildren ? '#a5b4fc' : '#4f46e5',
                                } }) }), _jsxs("span", { style: { fontSize: 10, color: hasChildren ? '#a5b4fc' : 'var(--th-text-muted)' }, children: [effectiveProgress, "%"] })] })) }), _jsx("div", { style: { ...CELL, width: assigneeWidth }, children: editField === 'assignee' ? (_jsx("input", { ref: inputRef, style: INPUT_S, value: editVal, onChange: e => setEditVal(e.target.value), onBlur: () => commit('assignee', editVal), onKeyDown: e => onKey(e, 'assignee', editVal) })) : (_jsx("span", { onClick: () => startEdit('assignee', task.assignee), style: { cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: task.assignee ? 'var(--th-text2)' : 'var(--th-text-ph)' }, children: task.assignee || '—' })) }), _jsx("div", { style: { ...CELL, width: dateColWidth }, children: !hasChildren && editField === 'startDate' ? (_jsx("input", { ref: inputRef, style: INPUT_S, type: "date", value: editVal, max: task.endDate || undefined, onChange: e => setEditVal(e.target.value), onBlur: () => commit('startDate', editVal || null), onKeyDown: e => onKey(e, 'startDate', editVal || null) })) : (_jsx("span", { "data-testid": hasChildren ? 'date-readonly' : undefined, onClick: () => !hasChildren && startEdit('startDate', task.startDate ?? ''), title: hasChildren ? '子タスクの日付から自動計算' : undefined, style: {
                        cursor: hasChildren ? 'default' : 'text',
                        color: hasChildren ? 'var(--th-text-dim)' : (task.startDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
                    }, children: task.startDate ?? '—' })) }), _jsx("div", { style: { ...CELL, width: dateColWidth }, children: !hasChildren && editField === 'endDate' ? (_jsx("input", { ref: inputRef, style: INPUT_S, type: "date", value: editVal, min: task.startDate || undefined, onChange: e => setEditVal(e.target.value), onBlur: () => commit('endDate', editVal || null), onKeyDown: e => onKey(e, 'endDate', editVal || null) })) : (_jsx("span", { "data-testid": hasChildren ? 'date-readonly' : undefined, onClick: () => !hasChildren && startEdit('endDate', task.endDate ?? ''), title: hasChildren ? '子タスクの日付から自動計算' : undefined, style: {
                        cursor: hasChildren ? 'default' : 'text',
                        color: hasChildren ? 'var(--th-text-dim)' : (task.endDate ? 'var(--th-text2)' : 'var(--th-text-ph)'),
                    }, children: task.endDate ?? '—' })) }), _jsx("div", { style: { ...CELL, width: 50 }, children: !hasChildren && editField === 'duration' ? (_jsx("input", { ref: inputRef, style: { ...INPUT_S, width: 38 }, type: "number", min: 1, value: editVal, onChange: e => setEditVal(e.target.value), onBlur: () => commitDuration(editVal), onKeyDown: e => {
                        if (e.key === 'Enter')
                            commitDuration(editVal);
                        if (e.key === 'Escape')
                            setEditField(null);
                    } })) : (_jsx("span", { onClick: () => {
                        if (!hasChildren && task.startDate)
                            startEdit('duration', String(duration ?? ''));
                    }, title: hasChildren ? '子タスクの日付から自動計算' : undefined, style: {
                        cursor: (!hasChildren && task.startDate) ? 'text' : 'default',
                        color: hasChildren ? 'var(--th-text-dim)' : (duration !== null ? 'var(--th-text2)' : 'var(--th-text-ph)'),
                    }, children: duration !== null ? duration : '—' })) }), conflict && (_jsx(ConflictDialog, { field: conflict.field, theirVal: conflict.theirVal, myVal: conflict.myVal, onResolve: resolveConflict }))] }));
}
