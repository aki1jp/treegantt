import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
const FIELD = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const LABEL = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT = {
    padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4,
    fontSize: 14, width: '100%', background: 'var(--th-input-bg)', color: 'var(--th-text)',
};
export function MilestoneModal({ task, allTasks, onSave, onClose }) {
    const [shaking, setShaking] = useState(false);
    const [title, setTitle] = useState(task?.title ?? '');
    const [date, setDate] = useState(task?.startDate ?? '');
    const [assignee, setAssignee] = useState(task?.assignee ?? '');
    const [predecessors, setPredecessors] = useState(task?.predecessors ?? []);
    const [predecessorText, setPredecessorText] = useState((task?.predecessors ?? [])
        .map(id => allTasks.find(t => t.id === id)?.order)
        .filter((o) => o !== undefined)
        .join(', '));
    useEffect(() => {
        setTitle(task?.title ?? '');
        setDate(task?.startDate ?? '');
        setAssignee(task?.assignee ?? '');
        const initPreds = task?.predecessors ?? [];
        setPredecessors(initPreds);
        setPredecessorText(initPreds
            .map(id => allTasks.find(t => t.id === id)?.order)
            .filter((o) => o !== undefined)
            .join(', '));
    }, [task]);
    const candidates = allTasks.filter(t => t.id !== task?.id);
    function togglePredecessor(id) {
        setPredecessors(prev => {
            const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
            setPredecessorText(next
                .map(pid => candidates.find(t => t.id === pid)?.order)
                .filter((o) => o !== undefined)
                .join(', '));
            return next;
        });
    }
    function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim())
            return;
        onSave({
            title: title.trim(),
            assignee,
            startDate: date || null,
            endDate: date || null,
            isMilestone: true,
            predecessors,
            summary: task?.summary ?? '',
            description: task?.description ?? '',
            status: task?.status ?? 'todo',
            priority: task?.priority ?? 'medium',
            progress: task?.progress ?? 0,
            parentId: task?.parentId ?? null,
        });
    }
    const dirtyFields = {
        title: title !== (task?.title ?? ''),
        date: date !== (task?.startDate ?? ''),
        assignee: assignee !== (task?.assignee ?? ''),
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
                background: 'var(--th-bg)', borderRadius: 8, padding: 24, width: 480, maxHeight: '85vh',
                overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.3)', color: 'var(--th-text)',
            }, onClick: e => e.stopPropagation(), children: [_jsx("h2", { style: { marginBottom: 4, fontSize: 18 }, children: task ? 'マイルストーン編集' : 'マイルストーン作成' }), _jsx("p", { style: { fontSize: 12, color: 'var(--th-text-muted)', marginBottom: 16, margin: '4px 0 16px' }, children: "\u25C7 \u671F\u9593\u30BC\u30ED\u306E\u5230\u9054\u70B9\uFF08\u30C1\u30A7\u30C3\u30AF\u30DD\u30A4\u30F3\u30C8\uFF09" }), _jsxs("form", { onSubmit: handleSubmit, children: [_jsxs("div", { "data-field": "title", ...shakeProps(dirtyFields.title), children: [_jsx("label", { style: LABEL, children: "\u30BF\u30A4\u30C8\u30EB *" }), _jsx("input", { style: INPUT, value: title, onChange: e => setTitle(e.target.value), required: true, maxLength: 200, autoFocus: true })] }), _jsxs("div", { "data-field": "date", ...shakeProps(dirtyFields.date), children: [_jsx("label", { style: LABEL, children: "\u65E5\u4ED8" }), _jsx("input", { style: INPUT, type: "date", value: date ?? '', onChange: e => setDate(e.target.value) })] }), _jsxs("div", { "data-field": "assignee", ...shakeProps(dirtyFields.assignee), children: [_jsx("label", { style: LABEL, children: "\u62C5\u5F53\u8005" }), _jsx("input", { style: INPUT, value: assignee, onChange: e => setAssignee(e.target.value) })] }), candidates.length > 0 && (_jsxs("div", { "data-field": "predecessors", ...shakeProps(dirtyFields.predecessors), children: [_jsx("label", { style: LABEL, children: "\u5148\u884C\u30BF\u30B9\u30AF\uFF08\u8907\u6570\u9078\u629E\u53EF\uFF09" }), _jsx("input", { style: { ...INPUT, marginBottom: 6 }, placeholder: "# \u3067\u6307\u5B9A\uFF08\u4F8B: 1, 3\uFF09", value: predecessorText, onChange: e => {
                                        const text = e.target.value;
                                        setPredecessorText(text);
                                        const nums = text.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
                                        const ids = nums
                                            .map(n => candidates.find(t => t.order === n)?.id)
                                            .filter((id) => !!id);
                                        setPredecessors([...new Set(ids)]);
                                    } }), _jsx("div", { style: {
                                        border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8,
                                        maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)',
                                    }, children: candidates.map(t => (_jsxs("label", { style: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }, children: [_jsx("input", { type: "checkbox", checked: predecessors.includes(t.id), onChange: () => togglePredecessor(t.id) }), _jsxs("span", { style: { fontSize: 13 }, children: [_jsxs("span", { style: { fontFamily: 'monospace', fontSize: 11, color: '#6366f1', marginRight: 4 }, children: ["#", t.order] }), t.isMilestone && _jsx("span", { style: { marginRight: 4 }, children: "\u25C7" }), t.title] })] }, t.id))) })] })), _jsxs("div", { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }, children: [_jsx("button", { type: "button", onClick: onClose, style: {
                                        padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4,
                                        background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer',
                                    }, children: "\u30AD\u30E3\u30F3\u30BB\u30EB" }), _jsx("button", { type: "submit", style: {
                                        padding: '8px 16px', border: 'none', borderRadius: 4,
                                        background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600,
                                    }, children: "\u4FDD\u5B58" })] })] })] }) }));
}
