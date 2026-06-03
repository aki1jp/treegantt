import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
const STATUS_LABELS = {
    todo: 'TODO', wip: 'Doing', done: 'DONE', wait: '待機', pending: '保留',
};
const PRIORITY_LABELS = {
    critical: '最高', high: '高', medium: '中', low: '低',
};
const FIELD = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const LABEL = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT = {
    padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4, fontSize: 14, width: '100%',
    background: 'var(--th-input-bg)', color: 'var(--th-text)',
};
export function TaskModal({ task, allTasks, initialParentId, onSave, onClose }) {
    const [shaking, setShaking] = useState(false);
    const [title, setTitle] = useState(task?.title ?? '');
    const [summary, setSummary] = useState(task?.summary ?? '');
    const [description, setDescription] = useState(task?.description ?? '');
    const [descTab, setDescTab] = useState('edit');
    const [status, setStatus] = useState(task?.status ?? 'todo');
    const [priority, setPriority] = useState(task?.priority ?? 'medium');
    const [progress, setProgress] = useState(task?.progress ?? 0);
    const [assignee, setAssignee] = useState(task?.assignee ?? '');
    const [startDate, setStartDate] = useState(task?.startDate ?? '');
    const [endDate, setEndDate] = useState(task?.endDate ?? '');
    const [parentId, setParentId] = useState(task?.parentId ?? initialParentId ?? '');
    const [predecessors, setPredecessors] = useState(task?.predecessors ?? []);
    const [predecessorText, setPredecessorText] = useState((task?.predecessors ?? [])
        .map(id => allTasks.find(t => t.id === id)?.seq)
        .filter((o) => o !== undefined)
        .join(', '));
    useEffect(() => {
        setTitle(task?.title ?? '');
        setSummary(task?.summary ?? '');
        setDescription(task?.description ?? '');
        setDescTab('edit');
        setStatus(task?.status ?? 'todo');
        setPriority(task?.priority ?? 'medium');
        setProgress(task?.progress ?? 0);
        setAssignee(task?.assignee ?? '');
        setStartDate(task?.startDate ?? '');
        setEndDate(task?.endDate ?? '');
        setParentId(task?.parentId ?? initialParentId ?? '');
        const initPreds = task?.predecessors ?? [];
        setPredecessors(initPreds);
        setPredecessorText(initPreds
            .map(id => allTasks.find(t => t.id === id)?.seq)
            .filter((o) => o !== undefined)
            .join(', '));
    }, [task]);
    const selectableTasks = allTasks.filter(t => t.id !== task?.id);
    const parentCandidates = selectableTasks.filter(t => !t.isMilestone);
    const hasChildren = task ? allTasks.some(t => t.parentId === task.id) : false;
    function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim())
            return;
        let sd = startDate || null;
        let ed = endDate || null;
        if (sd && ed && ed < sd) {
            [sd, ed] = [ed, sd];
        }
        onSave({
            title: title.trim(),
            summary,
            description,
            status,
            priority,
            progress,
            assignee,
            startDate: sd,
            endDate: ed,
            isMilestone: false,
            parentId: parentId || null,
            predecessors,
        });
    }
    function togglePredecessor(id) {
        setPredecessors(prev => {
            const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
            setPredecessorText(next
                .map(pid => selectableTasks.find(t => t.id === pid)?.seq)
                .filter((o) => o !== undefined)
                .join(', '));
            return next;
        });
    }
    const dirtyFields = {
        title: title !== (task?.title ?? ''),
        summary: summary !== (task?.summary ?? ''),
        description: description !== (task?.description ?? ''),
        status: status !== (task?.status ?? 'todo'),
        priority: priority !== (task?.priority ?? 'medium'),
        progress: progress !== (task?.progress ?? 0),
        assignee: assignee !== (task?.assignee ?? ''),
        startDate: startDate !== (task?.startDate ?? ''),
        endDate: endDate !== (task?.endDate ?? ''),
        parentId: parentId !== (task?.parentId ?? initialParentId ?? ''),
        predecessors: JSON.stringify([...predecessors].sort()) !== JSON.stringify([...(task?.predecessors ?? [])].sort()),
    };
    const isDirty = Object.values(dirtyFields).some(Boolean);
    function handleBackdropClick() {
        if (isDirty) {
            setShaking(true);
            setTimeout(() => setShaking(false), 500);
        }
        else {
            onClose();
        }
    }
    function shakeProps(dirty) {
        return dirty && shaking
            ? { 'data-shaking': true, style: { ...FIELD, animation: 'field-shake 0.45s ease' } }
            : { style: FIELD };
    }
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }, onClick: handleBackdropClick, children: _jsxs("div", { style: {
                background: 'var(--th-bg)', borderRadius: 8, padding: 24, width: 560, maxHeight: '90vh',
                overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.3)', color: 'var(--th-text)',
            }, onClick: e => e.stopPropagation(), children: [_jsx("h2", { style: { marginBottom: 16, fontSize: 18 }, children: task ? 'タスク編集' : 'タスク作成' }), _jsxs("form", { onSubmit: handleSubmit, children: [_jsxs("div", { "data-field": "title", ...shakeProps(dirtyFields.title), children: [_jsx("label", { style: LABEL, children: "\u30BF\u30A4\u30C8\u30EB *" }), _jsx("input", { style: INPUT, value: title, onChange: e => setTitle(e.target.value), required: true, maxLength: 200 })] }), _jsxs("div", { "data-field": "summary", ...shakeProps(dirtyFields.summary), children: [_jsx("label", { style: LABEL, children: "\u30B5\u30DE\u30EA" }), _jsx("input", { style: INPUT, value: summary, onChange: e => setSummary(e.target.value), maxLength: 500 })] }), _jsxs("div", { "data-field": "description", ...shakeProps(dirtyFields.description), children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--th-input-border)', marginBottom: 0 }, children: [_jsx("label", { style: { ...LABEL, marginBottom: 0, marginRight: 12 }, children: "\u8AAC\u660E" }), ['edit', 'preview'].map(tab => (_jsx("button", { type: "button", role: "tab", "aria-label": tab === 'edit' ? '編集' : 'プレビュー', onClick: () => setDescTab(tab), style: {
                                                padding: '4px 12px', border: 'none', borderBottom: descTab === tab ? '2px solid #4f46e5' : '2px solid transparent',
                                                background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: descTab === tab ? 700 : 400,
                                                color: descTab === tab ? '#4f46e5' : 'var(--th-text-muted)', marginBottom: -1,
                                            }, children: tab === 'edit' ? '編集' : 'プレビュー' }, tab)))] }), descTab === 'edit' && (_jsx("textarea", { "aria-label": "\u8AAC\u660E", style: { ...INPUT, minHeight: 80, resize: 'vertical' }, value: description, onChange: e => setDescription(e.target.value) })), descTab === 'preview' && (_jsx("div", { style: {
                                        ...INPUT, minHeight: 80, overflowY: 'auto',
                                        fontSize: 13, lineHeight: 1.7,
                                    }, children: description.trim() ? (_jsx(ReactMarkdown, { children: description })) : (_jsx("span", { style: { color: 'var(--th-text-ph)', fontStyle: 'italic' }, children: "\u8AAC\u660E\u304C\u3042\u308A\u307E\u305B\u3093" })) }))] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }, children: [_jsxs("div", { "data-field": "status", ...shakeProps(dirtyFields.status), children: [_jsx("label", { style: LABEL, children: "\u30B9\u30C6\u30FC\u30BF\u30B9" }), _jsx("select", { style: INPUT, value: status, onChange: e => setStatus(e.target.value), children: Object.entries(STATUS_LABELS).map(([v, l]) => (_jsx("option", { value: v, children: l }, v))) })] }), _jsxs("div", { "data-field": "priority", ...shakeProps(dirtyFields.priority), children: [_jsx("label", { style: LABEL, children: "\u512A\u5148\u5EA6" }), _jsx("select", { style: INPUT, value: priority, onChange: e => setPriority(e.target.value), children: Object.entries(PRIORITY_LABELS).map(([v, l]) => (_jsx("option", { value: v, children: l }, v))) })] })] }), _jsxs("div", { "data-field": "progress", ...shakeProps(dirtyFields.progress), children: [_jsxs("label", { style: LABEL, children: ["\u9032\u6357\u7387: ", progress, "%"] }), _jsx("input", { type: "range", min: 0, max: 100, value: progress, onChange: e => setProgress(Number(e.target.value)), style: { width: '100%' } })] }), _jsxs("div", { "data-field": "assignee", ...shakeProps(dirtyFields.assignee), children: [_jsx("label", { style: LABEL, children: "\u62C5\u5F53\u8005" }), _jsx("input", { style: INPUT, value: assignee, onChange: e => setAssignee(e.target.value) })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }, children: [_jsxs("div", { "data-field": "startDate", ...shakeProps(dirtyFields.startDate), children: [_jsxs("label", { style: LABEL, children: ["\u958B\u59CB\u65E5", hasChildren && _jsx("span", { style: { fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }, children: "(\u81EA\u52D5)" })] }), _jsx("input", { style: { ...INPUT, opacity: hasChildren ? 0.5 : 1 }, type: "date", value: startDate, disabled: hasChildren, onChange: e => setStartDate(e.target.value), title: hasChildren ? '子タスクの日付から自動計算されます' : undefined })] }), _jsxs("div", { "data-field": "endDate", ...shakeProps(dirtyFields.endDate), children: [_jsxs("label", { style: LABEL, children: ["\u7D42\u4E86\u65E5", hasChildren && _jsx("span", { style: { fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }, children: "(\u81EA\u52D5)" })] }), _jsx("input", { style: { ...INPUT, opacity: hasChildren ? 0.5 : 1 }, type: "date", value: endDate, disabled: hasChildren, onChange: e => setEndDate(e.target.value), title: hasChildren ? '子タスクの日付から自動計算されます' : undefined })] })] }), _jsxs("div", { "data-field": "parentId", ...shakeProps(dirtyFields.parentId), children: [_jsx("label", { style: LABEL, children: "\u89AA\u30BF\u30B9\u30AF" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { style: { ...INPUT, width: 72, flexShrink: 0 }, type: "number", min: 1, placeholder: "#", value: parentId ? (parentCandidates.find(t => t.id === parentId)?.seq ?? '') : '', onChange: e => {
                                                const num = parseInt(e.target.value, 10);
                                                const found = parentCandidates.find(t => t.seq === num);
                                                setParentId(found ? found.id : '');
                                            } }), _jsxs("select", { style: { ...INPUT, flex: 1 }, value: parentId, onChange: e => setParentId(e.target.value), children: [_jsx("option", { value: "", children: "\u306A\u3057\uFF08\u30EB\u30FC\u30C8\u30BF\u30B9\u30AF\uFF09" }), parentCandidates.map(t => (_jsxs("option", { value: t.id, children: ["#", t.seq, " ", t.title] }, t.id)))] })] })] }), selectableTasks.length > 0 && (_jsxs("div", { "data-field": "predecessors", ...shakeProps(dirtyFields.predecessors), children: [_jsx("label", { style: LABEL, children: "\u5148\u884C\u30BF\u30B9\u30AF\uFF08\u8907\u6570\u9078\u629E\u53EF\uFF09" }), _jsx("input", { style: { ...INPUT, marginBottom: 6 }, placeholder: "# \u3067\u6307\u5B9A\uFF08\u4F8B: 1, 3, 5\uFF09", value: predecessorText, onChange: e => {
                                        const text = e.target.value;
                                        setPredecessorText(text);
                                        const nums = text.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
                                        const ids = nums
                                            .map(n => selectableTasks.find(t => t.seq === n)?.id)
                                            .filter((id) => !!id);
                                        setPredecessors([...new Set(ids)]);
                                    } }), _jsx("div", { style: { border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8, maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)' }, children: selectableTasks.map(t => (_jsxs("label", { style: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }, children: [_jsx("input", { type: "checkbox", checked: predecessors.includes(t.id), onChange: () => togglePredecessor(t.id) }), _jsxs("span", { style: { fontSize: 13 }, children: [_jsxs("span", { style: { fontFamily: 'monospace', fontSize: 11, color: '#6366f1', marginRight: 4 }, children: ["#", t.seq] }), t.title] })] }, t.id))) })] })), _jsxs("div", { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }, children: [_jsx("button", { type: "button", onClick: onClose, style: { padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4, background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer' }, children: "\u30AD\u30E3\u30F3\u30BB\u30EB" }), _jsx("button", { type: "submit", style: { padding: '8px 16px', border: 'none', borderRadius: 4, background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }, children: "\u4FDD\u5B58" })] })] })] }) }));
}
