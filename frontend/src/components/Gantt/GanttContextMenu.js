import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { clampMenuPos } from '../../utils/menuPos';
export function ContextMenu({ x, y, onMouseDown, onClick, children }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    useEffect(() => {
        if (!ref.current)
            return;
        const { width, height } = ref.current.getBoundingClientRect();
        setPos(clampMenuPos(x, y, width, height));
    }, [x, y]);
    return (_jsx("div", { ref: ref, style: {
            position: 'fixed',
            top: pos?.top ?? y,
            left: pos?.left ?? x,
            visibility: pos ? 'visible' : 'hidden',
            background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 9999, minWidth: 160,
        }, onMouseDown: onMouseDown, onClick: onClick, children: children }));
}
