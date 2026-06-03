import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { calcNowX } from '../../utils/ganttCalc';
// イナズマライン: 各タスクの進捗率X座標をつなぐジグザグ折れ線
export function LightningLine({ points, color = '#7c3aed' }) {
    if (points.length < 2)
        return null;
    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
    return (_jsx("polyline", { points: pointsStr, stroke: color, strokeWidth: 2, fill: "none", strokeLinejoin: "miter", opacity: 0.85 }));
}
export function TodayLine({ min, zoomLevel, height }) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id);
    }, []);
    const x = calcNowX(min, zoomLevel, now);
    const timeLabel = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return (_jsxs("g", { children: [_jsx("line", { x1: x, y1: 0, x2: x, y2: height, stroke: "#E24B4A", strokeWidth: 2, strokeDasharray: "4 3" }), _jsx("text", { x: x + 4, y: 12, fontSize: 10, fill: "#E24B4A", fontWeight: 600, children: "\u4ECA\u65E5" }), _jsx("text", { x: x + 4, y: 24, fontSize: 9, fill: "#E24B4A", children: timeLabel })] }));
}
