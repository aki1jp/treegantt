import { useEffect, useRef } from 'react';
import type { ZoomLevel } from '../../types/task';
import type { LightningPoint } from '../../utils/ganttCalc';
import { calcNowX } from '../../utils/ganttCalc';
import { useTranslation } from '../../i18n/useTranslation';

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
  const { t, locale } = useTranslation();
  const timeLocale = locale === 'en' ? 'en-US' : 'ja-JP';
  const lineRef = useRef<SVGLineElement>(null);
  const labelRef = useRef<SVGTextElement>(null);
  const timeRef = useRef<SVGTextElement>(null);

  // インターバル更新: React の再レンダリングを起こさず DOM を直接書き換える
  useEffect(() => {
    function update() {
      const now = new Date();
      const x = calcNowX(min, zoomLevel, now);
      const timeLabel = now.toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' });
      lineRef.current?.setAttribute('x1', String(x));
      lineRef.current?.setAttribute('x2', String(x));
      labelRef.current?.setAttribute('x', String(x + 4));
      timeRef.current?.setAttribute('x', String(x + 4));
      if (timeRef.current) timeRef.current.textContent = timeLabel;
    }
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [min, zoomLevel, timeLocale]);

  const initialNow = new Date();
  const initialX = calcNowX(min, zoomLevel, initialNow);
  const initialTime = initialNow.toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' });

  return (
    <g>
      <line ref={lineRef} x1={initialX} y1={0} x2={initialX} y2={height} stroke="#E24B4A" strokeWidth={2} strokeDasharray="4 3" />
      <text ref={labelRef} x={initialX + 4} y={12} fontSize={10} fill="#E24B4A" fontWeight={600}>{t('ganttChart.todayLabel')}</text>
      <text ref={timeRef} x={initialX + 4} y={24} fontSize={9} fill="#E24B4A">{initialTime}</text>
    </g>
  );
}
