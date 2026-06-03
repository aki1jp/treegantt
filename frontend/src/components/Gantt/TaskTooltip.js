import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
const OFFSET_X = 16;
const MAX_W = 320;
export function TaskTooltip({ task, pos, visible }) {
    if (!visible)
        return null;
    const hasSummary = task.summary.trim().length > 0;
    const hasDescription = task.description.trim().length > 0;
    if (!hasSummary && !hasDescription)
        return null;
    // viewport 右端でフリップ
    const flipLeft = pos.x + OFFSET_X + MAX_W > window.innerWidth;
    const left = flipLeft ? pos.x - OFFSET_X - MAX_W : pos.x + OFFSET_X;
    const top = pos.y + 4;
    return createPortal(_jsxs("div", { role: "tooltip", style: {
            position: 'fixed',
            left,
            top,
            width: MAX_W,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--th-bg, #fff)',
            border: '1px solid var(--th-border, #e5e7eb)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            padding: '10px 12px',
            zIndex: 9999,
            pointerEvents: 'none',
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--th-text2, #374151)',
        }, children: [_jsx("div", { style: { fontWeight: 700, marginBottom: hasSummary || hasDescription ? 6 : 0, fontSize: 13 }, children: task.title }), hasSummary && (_jsxs(_Fragment, { children: [_jsx("div", { style: { borderTop: '1px solid var(--th-border, #e5e7eb)', marginBottom: 6 } }), _jsx("div", { style: PROSE_STYLE, children: _jsx(ReactMarkdown, { children: task.summary }) })] })), hasDescription && (_jsxs(_Fragment, { children: [_jsx("div", { style: { borderTop: '1px solid var(--th-border, #e5e7eb)', margin: '6px 0' } }), _jsx("div", { style: PROSE_STYLE, children: _jsx(ReactMarkdown, { children: task.description }) })] }))] }), document.body);
}
const PROSE_STYLE = {
    fontSize: 12,
    lineHeight: 1.65,
    overflowWrap: 'break-word',
};
