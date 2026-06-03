import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { ContextMenu } from '../Gantt/GanttContextMenu';
export function ProjectTabs({ projects, currentProject, onSelect, onDelete, onRename }) {
    const [tabMenu, setTabMenu] = useState(null);
    useEffect(() => {
        if (!tabMenu)
            return;
        const close = () => setTabMenu(null);
        window.addEventListener('mousedown', close);
        return () => window.removeEventListener('mousedown', close);
    }, [tabMenu]);
    return (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: 'flex', gap: 8 }, children: projects.map(p => (_jsx("div", { style: {
                        borderRadius: 4,
                        background: currentProject?.id === p.id ? '#4f46e5' : 'transparent',
                    }, children: _jsx("button", { onClick: () => onSelect(p), onContextMenu: e => {
                            e.preventDefault();
                            setTabMenu({ project: p, x: e.clientX, y: e.clientY });
                        }, style: {
                            padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 13,
                            background: 'transparent', color: '#fff', borderRadius: 4,
                        }, children: p.name }) }, p.id))) }), tabMenu && (_jsxs(ContextMenu, { x: tabMenu.x, y: tabMenu.y, onMouseDown: e => e.stopPropagation(), onClick: e => e.stopPropagation(), children: [_jsx("button", { onClick: () => { onRename(tabMenu.project); setTabMenu(null); }, style: {
                            display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                            background: 'transparent', color: 'var(--th-text)', cursor: 'pointer',
                            textAlign: 'left', fontSize: 13,
                        }, onMouseEnter: e => (e.currentTarget.style.background = 'var(--th-hover)'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: "\u540D\u524D\u3092\u5909\u66F4" }), _jsx("button", { onClick: () => { onDelete(tabMenu.project); setTabMenu(null); }, style: {
                            display: 'block', width: '100%', padding: '8px 16px', border: 'none',
                            background: 'transparent', color: '#ef4444', cursor: 'pointer',
                            textAlign: 'left', fontSize: 13,
                        }, onMouseEnter: e => (e.currentTarget.style.background = 'var(--th-hover)'), onMouseLeave: e => (e.currentTarget.style.background = 'transparent'), children: "\u524A\u9664" })] }))] }));
}
