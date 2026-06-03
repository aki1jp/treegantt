import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState } from 'react';
import { todayStr } from '../../utils/ganttCalc';
import { useTaskStore } from '../../store/taskStore';
const BTN = {
    padding: '5px 10px', border: '1px solid var(--th-input-border)', borderRadius: 4,
    background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer', fontSize: 12,
};
const PRIMARY_BTN = {
    ...BTN, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600,
};
const SELECT = {
    padding: '5px 6px', border: '1px solid var(--th-input-border)', borderRadius: 4,
    fontSize: 12, background: 'var(--th-input-bg)', color: 'var(--th-text2)',
};
const LABEL = {
    fontSize: 11, color: 'var(--th-text-muted)', fontWeight: 500,
};
const FILTER_GROUP = {
    display: 'flex', alignItems: 'center', gap: 4,
};
const DIVIDER = {
    width: 1, height: 22, background: 'var(--th-border)', flexShrink: 0,
};
const STATUS_OPTIONS = [
    { value: '', label: 'すべて' },
    { value: 'todo', label: 'TODO' },
    { value: 'wip', label: 'Doing' },
    { value: 'done', label: 'DONE' },
    { value: 'wait', label: '待機' },
    { value: 'pending', label: '保留' },
    { value: '!done', label: 'DONE/保留以外' },
];
const PRIORITY_OPTIONS = [
    { value: '', label: 'すべて' },
    { value: 'critical', label: '最高' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
];
const PERIOD_OPTIONS = [
    { value: '2w', label: '2週間' },
    { value: '1m', label: '1ヶ月' },
    { value: '3m', label: '3ヶ月' },
    { value: '6m', label: '6ヶ月' },
];
function MenuItem({ label, indent, onClick }) {
    return (_jsx("button", { onClick: onClick, style: {
            display: 'block', width: '100%', textAlign: 'left', border: 'none',
            padding: indent ? '8px 16px 8px 28px' : '10px 16px',
            background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--th-text2)',
        }, onMouseEnter: e => (e.currentTarget.style.background = 'var(--th-bg2)'), onMouseLeave: e => (e.currentTarget.style.background = 'none'), children: label }));
}
function ToggleBtn({ active, label, title, onClick }) {
    return (_jsx("button", { title: title, onClick: onClick, style: {
            ...BTN,
            padding: '4px 7px',
            fontSize: 11,
            background: active ? '#4f46e5' : 'var(--th-bg)',
            color: active ? '#fff' : 'var(--th-text-muted)',
            border: `1px solid ${active ? '#4f46e5' : 'var(--th-input-border)'}`,
            fontWeight: active ? 700 : 400,
        }, children: label }));
}
export function Toolbar({ onAddTask, onAddMilestone, onImport, onRestore, onExportJson, onExportCsv }) {
    const { zoomLevel, filterStatus, filterAssignee, filterPriority, filterSearch, ganttStartDate, ganttPeriod, showLightningLine, showWeekend, showCriticalPath, showResourceView, uiFontSize, uiRowHeight, ganttHeaderLevels, ganttBarOpen, setZoomLevel, setFilter, setGanttRange, resetUi, setShowLightningLine, setShowWeekend, setShowCriticalPath, setShowResourceView, setUiFontSize, setUiRowHeight, setGanttHeaderLevels, setGanttBarOpen, } = useTaskStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const menuRef = useRef(null);
    useEffect(() => {
        function onOutside(e) {
            if (menuRef.current && !menuRef.current.contains(e.target))
                setMenuOpen(false);
        }
        if (menuOpen)
            document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, [menuOpen]);
    function openMenu() {
        if (!menuOpen && menuRef.current) {
            const r = menuRef.current.getBoundingClientRect();
            setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }
        setMenuOpen(v => !v);
    }
    const activeFilterCount = [
        filterStatus !== '',
        filterPriority !== '',
        filterAssignee !== '',
    ].filter(Boolean).length;
    const today = todayStr();
    const dropdownStyle = {
        background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    };
    const ROW = {
        display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 6,
        padding: '0 14px', overflowX: 'auto',
    };
    return (_jsxs("div", { style: {
            display: 'flex', flexDirection: 'column',
            background: 'var(--th-bg)', borderBottom: '1px solid var(--th-border)',
        }, children: [_jsxs("div", { style: { ...ROW, height: 44 }, children: [_jsxs("div", { style: { position: 'relative', flexShrink: 0 }, children: [_jsx("span", { style: {
                                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                    fontSize: 12, color: 'var(--th-text-ph)', pointerEvents: 'none',
                                }, children: "\uD83D\uDD0D" }), _jsx("input", { type: "search", placeholder: "\u30BF\u30B9\u30AF\u691C\u7D22...", value: filterSearch, onChange: e => setFilter({ filterSearch: e.target.value }), style: {
                                    ...SELECT, paddingLeft: 24, width: 160, fontSize: 12,
                                    background: filterSearch ? 'var(--th-input-bg)' : 'var(--th-bg)',
                                    outline: filterSearch ? '2px solid #4f46e5' : undefined,
                                } })] }), _jsx("div", { style: DIVIDER }), _jsx("button", { style: PRIMARY_BTN, onClick: onAddTask, children: "+ \u30BF\u30B9\u30AF\u8FFD\u52A0" }), _jsx("button", { style: BTN, onClick: onAddMilestone, children: "\u25C7 \u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3" }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }, children: [_jsxs("div", { style: { position: 'relative' }, ref: menuRef, children: [_jsx("button", { title: "\u30E1\u30CB\u30E5\u30FC", onClick: openMenu, style: {
                                            ...BTN,
                                            padding: '5px 9px',
                                            fontSize: 16,
                                            lineHeight: 1,
                                            background: menuOpen ? 'var(--th-bg2)' : 'var(--th-bg)',
                                        }, children: "\u2630" }), menuOpen && menuPos && (_jsxs("div", { style: {
                                            position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 1000,
                                            ...dropdownStyle, minWidth: 160, overflow: 'hidden',
                                        }, children: [_jsx("div", { style: { padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }, children: "\uD83D\uDCE5 \u30A4\u30F3\u30DD\u30FC\u30C8" }), _jsx(MenuItem, { label: "\u8FFD\u8A18\uFF08\u65E2\u5B58\u3092\u4FDD\u6301\uFF09", indent: true, onClick: () => { onImport(); setMenuOpen(false); } }), _jsx(MenuItem, { label: "\u30EC\u30B9\u30C8\u30A2\uFF08\u65E2\u5B58\u3092\u524A\u9664\uFF09", indent: true, onClick: () => { onRestore(); setMenuOpen(false); } }), _jsx("div", { style: { height: 1, background: 'var(--th-border)', margin: '2px 0' } }), _jsx("div", { style: { padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }, children: "\uD83D\uDCE4 \u30A8\u30AF\u30B9\u30DD\u30FC\u30C8" }), _jsx(MenuItem, { label: "JSON \u51FA\u529B", indent: true, onClick: () => { onExportJson(); setMenuOpen(false); } }), _jsx(MenuItem, { label: "CSV \u51FA\u529B", indent: true, onClick: () => { onExportCsv(); setMenuOpen(false); } })] }))] }), _jsx("button", { "aria-label": ganttBarOpen ? 'ガント設定を閉じる' : 'ガント設定を開く', title: ganttBarOpen ? 'ガント設定を閉じる' : 'ガント設定を開く', onClick: () => setGanttBarOpen(!ganttBarOpen), style: { ...BTN, padding: '4px 8px', fontSize: 10 }, children: ganttBarOpen ? '∧' : '∨' })] })] }), ganttBarOpen && (_jsxs("div", { "data-testid": "toolbar-row2", style: {
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderTop: '1px solid var(--th-border)',
                }, children: [_jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u30B9\u30C6\u30FC\u30BF\u30B9" }), _jsx("select", { style: SELECT, value: filterStatus, onChange: e => setFilter({ filterStatus: e.target.value }), children: STATUS_OPTIONS.map(o => _jsx("option", { value: o.value, children: o.label }, o.value)) })] }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u512A\u5148\u5EA6" }), _jsx("select", { style: SELECT, value: filterPriority, onChange: e => setFilter({ filterPriority: e.target.value }), children: PRIORITY_OPTIONS.map(o => _jsx("option", { value: o.value, children: o.label }, o.value)) })] }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u62C5\u5F53\u8005" }), _jsx("input", { style: { ...SELECT, width: 100 }, placeholder: "\u90E8\u5206\u4E00\u81F4", value: filterAssignee, onChange: e => setFilter({ filterAssignee: e.target.value }) })] }), activeFilterCount > 0 && (_jsx("button", { style: { ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }, onClick: () => setFilter({ filterStatus: '', filterPriority: '', filterAssignee: '' }), title: "\u30D5\u30A3\u30EB\u30BF\u3092\u30AF\u30EA\u30A2", children: "\u2715 \u30AF\u30EA\u30A2" })), _jsx("div", { style: DIVIDER }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u30BA\u30FC\u30E0" }), _jsxs("select", { title: "\u30BA\u30FC\u30E0\u30EC\u30D9\u30EB\u3092\u9078\u629E", style: SELECT, value: zoomLevel, onChange: e => setZoomLevel(e.target.value), children: [_jsx("option", { value: "day", children: "\u65E5" }), _jsx("option", { value: "week", children: "\u9031" }), _jsx("option", { value: "month", children: "\u6708" })] })] }), _jsx("div", { style: DIVIDER }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u958B\u59CB\u65E5" }), _jsx("input", { type: "date", style: { ...SELECT, fontSize: 11 }, value: ganttStartDate, onChange: e => setGanttRange(e.target.value, ganttPeriod) }), ganttStartDate ? (_jsx("button", { style: { ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }, onClick: () => setGanttRange('', ganttPeriod), title: "\u958B\u59CB\u65E5\u3092\u30EA\u30BB\u30C3\u30C8\uFF08\u81EA\u52D5\uFF09", children: "\u2715" })) : (_jsx("button", { style: { ...BTN, padding: '3px 7px', fontSize: 11 }, onClick: () => setGanttRange(today, ganttPeriod), title: "\u4ECA\u65E5\u304B\u3089\u8868\u793A", children: "\u4ECA\u65E5" }))] }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u671F\u9593" }), _jsx("select", { style: SELECT, value: ganttPeriod, onChange: e => setGanttRange(ganttStartDate, e.target.value), children: PERIOD_OPTIONS.map(o => _jsx("option", { value: o.value, children: o.label }, o.value)) })] }), _jsx("div", { style: DIVIDER }), _jsxs("div", { style: FILTER_GROUP, children: [_jsx("span", { style: LABEL, children: "\u30D8\u30C3\u30C0\u30FC" }), _jsx(ToggleBtn, { active: ganttHeaderLevels.year, label: "\u5E74", title: "\u5E74\u30D8\u30C3\u30C0\u30FC\u3092\u8868\u793A", onClick: () => setGanttHeaderLevels({ year: !ganttHeaderLevels.year }) }), _jsx(ToggleBtn, { active: ganttHeaderLevels.month, label: "\u6708", title: "\u6708\u30D8\u30C3\u30C0\u30FC\u3092\u8868\u793A", onClick: () => setGanttHeaderLevels({ month: !ganttHeaderLevels.month }) }), _jsx(ToggleBtn, { active: ganttHeaderLevels.week, label: "\u9031", title: "\u9031\u30D8\u30C3\u30C0\u30FC\u3092\u8868\u793A", onClick: () => setGanttHeaderLevels({ week: !ganttHeaderLevels.week }) }), _jsx(ToggleBtn, { active: ganttHeaderLevels.day, label: "\u65E5", title: "\u65E5\u30D8\u30C3\u30C0\u30FC\u3092\u8868\u793A", onClick: () => setGanttHeaderLevels({ day: !ganttHeaderLevels.day }) })] }), _jsx("div", { style: DIVIDER }), _jsx(ToggleBtn, { active: showLightningLine, label: "\u26A1 \u30A4\u30CA\u30BA\u30DE", title: "\u30A4\u30CA\u30BA\u30DE\u30E9\u30A4\u30F3\uFF08\u5B9F\u7E3E/\u8A08\u753B\u306E\u5883\u754C\uFF09\u3092\u8868\u793A", onClick: () => setShowLightningLine(!showLightningLine) }), _jsx(ToggleBtn, { active: showWeekend, label: "\u571F\u65E5", title: "\u571F\u65E5\uFF08\u9031\u672B\uFF09\u306E\u80CC\u666F\u3092\u5F37\u8ABF\u8868\u793A", onClick: () => setShowWeekend(!showWeekend) }), _jsx(ToggleBtn, { active: showCriticalPath, label: "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u30D1\u30B9", title: "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u30D1\u30B9\u3092\u30CF\u30A4\u30E9\u30A4\u30C8\u8868\u793A", onClick: () => setShowCriticalPath(!showCriticalPath) }), _jsx(ToggleBtn, { active: showResourceView, label: "\u30EA\u30BD\u30FC\u30B9\u30D3\u30E5\u30FC", title: "\u62C5\u5F53\u8005\u5225\u30B9\u30A4\u30E0\u30EC\u30FC\u30F3\u3092\u8868\u793A", onClick: () => setShowResourceView(!showResourceView) }), _jsx("div", { style: DIVIDER }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8,
                            padding: '3px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }, children: [_jsx("span", { style: { ...LABEL, whiteSpace: 'nowrap' }, children: "\u30B5\u30A4\u30BA" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 3 }, children: [_jsx("span", { style: { ...LABEL, fontSize: 10 }, children: "\u6587\u5B57" }), [11, 13, 15].map((size, i) => (_jsx("button", { title: ['小', '中', '大'][i], onClick: () => setUiFontSize(size), style: {
                                            ...BTN,
                                            padding: '2px 6px',
                                            fontSize: size - 2,
                                            background: uiFontSize === size ? '#4f46e5' : 'var(--th-bg)',
                                            color: uiFontSize === size ? '#fff' : 'var(--th-text-muted)',
                                            border: `1px solid ${uiFontSize === size ? '#4f46e5' : 'var(--th-input-border)'}`,
                                            fontWeight: uiFontSize === size ? 700 : 400,
                                        }, children: "\u3042" }, size)))] }), _jsx("div", { style: { width: 1, height: 18, background: 'var(--th-border)' } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 3 }, children: [_jsx("span", { style: { ...LABEL, fontSize: 10 }, children: "\u884C\u9AD8" }), [28, 36, 44].map((h, i) => (_jsx("button", { title: ['小', '中', '大'][i], onClick: () => setUiRowHeight(h), style: {
                                            ...BTN,
                                            padding: '2px 6px',
                                            fontSize: 11,
                                            background: uiRowHeight === h ? '#4f46e5' : 'var(--th-bg)',
                                            color: uiRowHeight === h ? '#fff' : 'var(--th-text-muted)',
                                            border: `1px solid ${uiRowHeight === h ? '#4f46e5' : 'var(--th-input-border)'}`,
                                            fontWeight: uiRowHeight === h ? 700 : 400,
                                        }, children: ['S', 'M', 'L'][i] }, h)))] })] }), _jsx("div", { style: { marginLeft: 'auto', flexShrink: 0 }, children: _jsx("button", { style: { ...BTN, fontSize: 11, color: 'var(--th-text-muted)' }, title: "\u8868\u793A\u8A2D\u5B9A\u3092\u30C7\u30D5\u30A9\u30EB\u30C8\u306B\u623B\u3059", onClick: resetUi, children: "\u30C7\u30D5\u30A9\u30EB\u30C8" }) })] }))] }));
}
