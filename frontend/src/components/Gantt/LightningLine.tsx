import { useState, useEffect } from 'react';
import type { ZoomLevel } from '../../types/task';
import type { LightningPoint } from '../../utils/ganttCalc';
import { calcNowX } from '../../utils/ganttCalc';

interface Props {
  points: LightningPoint[];
  color?: string;
}

// イナズマライン: 各タスクの進捗率X座標をつなぐジグザグ折れ線
export function LightningLine({ points, color = '#7c3aed' }: Props) {
  if (points.length < 2) return null;
  const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
  return (
    <polyline
      points={pointsStr}
      stroke={color}
      strokeWidth={2}
      fill="none"
      strokeLinejoin="miter"
      opacity={0.85}
    />
  );
}

// 今日ライン（縦の単純な破線）
interface TodayLineProps {
  min: Date;
  zoomLevel: ZoomLevel;
  height: number;
}

export function TodayLine({ min, zoomLevel, height }: TodayLineProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const x = calcNowX(min, zoomLevel, now);
  const timeLabel = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={height} stroke="#E24B4A" strokeWidth={2} strokeDasharray="4 3" />
      <text x={x + 4} y={12} fontSize={10} fill="#E24B4A" fontWeight={600}>今日</text>
      <text x={x + 4} y={24} fontSize={9} fill="#E24B4A">{timeLabel}</text>
    </g>
  );
}
