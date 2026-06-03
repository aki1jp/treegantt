import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const FIELD_LABEL = {
    title: 'タイトル',
    status: 'ステータス',
    priority: '優先度',
    progress: '進捗',
    assignee: '担当者',
    startDate: '開始日',
    endDate: '終了日',
    summary: 'サマリ',
    description: '説明',
    parentId: '親タスク',
};
export function ConflictDialog({ field, theirVal, myVal, onResolve }) {
    const label = FIELD_LABEL[field] ?? field;
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }, children: _jsxs("div", { style: {
                background: 'var(--th-bg)', borderRadius: 10, padding: '28px 32px',
                width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.25)', color: 'var(--th-text)',
            }, children: [_jsx("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 8 }, children: "\u26A0\uFE0F \u7DE8\u96C6\u4E2D\u306B\u5225\u306E\u30E6\u30FC\u30B6\u30FC\u304C\u5909\u66F4\u3057\u307E\u3057\u305F" }), _jsxs("div", { style: { fontSize: 13, color: 'var(--th-text-muted)', marginBottom: 20 }, children: ["\u30D5\u30A3\u30FC\u30EB\u30C9: ", _jsx("strong", { children: label })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }, children: [_jsxs("div", { style: {
                                padding: '10px 14px', borderRadius: 6,
                                background: 'var(--th-conflict-their-bg)',
                                border: '1px solid var(--th-conflict-their-border)',
                            }, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--th-conflict-their-label)', fontWeight: 600, marginBottom: 4 }, children: "\u5225\u306E\u30E6\u30FC\u30B6\u30FC\u306E\u5909\u66F4" }), _jsx("div", { style: { fontSize: 14 }, children: theirVal || '（空）' })] }), _jsxs("div", { style: {
                                padding: '10px 14px', borderRadius: 6,
                                background: 'var(--th-conflict-mine-bg)',
                                border: '1px solid var(--th-conflict-mine-border)',
                            }, children: [_jsx("div", { style: { fontSize: 11, color: 'var(--th-conflict-mine-label)', fontWeight: 600, marginBottom: 4 }, children: "\u3042\u306A\u305F\u306E\u5909\u66F4" }), _jsx("div", { style: { fontSize: 14 }, children: myVal || '（空）' })] })] }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' }, children: [_jsx("button", { onClick: () => onResolve(true), style: {
                                padding: '8px 16px', borderRadius: 6, border: '1px solid var(--th-border)',
                                background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer', fontSize: 13,
                            }, children: "\u5225\u306E\u30E6\u30FC\u30B6\u30FC\u306E\u5909\u66F4\u3092\u4F7F\u3046" }), _jsx("button", { onClick: () => onResolve(false), style: {
                                padding: '8px 16px', borderRadius: 6, border: 'none',
                                background: '#4f46e5', color: '#fff', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600,
                            }, children: "\u81EA\u5206\u306E\u5909\u66F4\u3092\u9069\u7528\u3059\u308B" })] })] }) }));
}
