import dayjs from 'dayjs';
import type { Task, ZoomLevel } from '../../types/task';
import { ZOOM_CONFIG } from '../../utils/ganttCalc';
import { calcWorkloadMatrix, workloadBuckets, workloadColor } from '../../utils/workloadCalc';

const HEADER_H  = 22;
const LEGEND_H  = 18;
const CELL_H    = 28;

const LEGEND_ITEMS = [
  { n: '1', c: workloadColor(1) },
  { n: '2', c: workloadColor(2) },
  { n: '3', c: workloadColor(3) },
  { n: '4+', c: workloadColor(4) },
];

export interface ResourceViewProps {
  tasks: Task[];
  min: Date;
  zoomLevel: ZoomLevel;
  totalWidth: number;
  labelWidth: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  onEditTask: (task: Task) => void;
}

export function ResourceView({
  tasks, min, zoomLevel, totalWidth, labelWidth, scrollRef,
}: ResourceViewProps) {
  const { dayWidth } = ZOOM_CONFIG[zoomLevel];
  const totalDays = Math.max(1, Math.round(totalWidth / dayWidth));
  const max = dayjs(min).add(totalDays - 1, 'day').toDate();

  // 担当者×日付の負荷を共有ユーティリティで一本化（done除外・両日付必須・土日キャパ0）
  const { assignees, days, matrix, dayTasks } = calcWorkloadMatrix(tasks, min, max);
  if (assignees.length === 0) return null;

  // ズームに応じた期間バケット（day=日, week=週, month=月）
  const buckets = workloadBuckets(days, zoomLevel);

  const isWeekendDay = (idx: number): boolean => {
    const dow = dayjs(days[idx]).day();
    return dow === 0 || dow === 6;
  };

  return (
    <div data-testid="workload-panel" style={{
      flexShrink: 0, display: 'flex',
      borderTop: '2px solid var(--th-border-strong)',
      background: 'var(--th-bg)',
    }}>
      {/* 左固定列: タイトル＋凡例＋担当者名 */}
      <div style={{
        flexShrink: 0, width: labelWidth,
        borderRight: '2px solid var(--th-border-strong)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: HEADER_H, display: 'flex', alignItems: 'center',
          padding: '0 8px', fontSize: 10, fontWeight: 700,
          color: 'var(--th-text-muted)', background: 'var(--th-bg2)',
          borderBottom: '1px solid var(--th-border)', flexShrink: 0,
        }}>
          リソースビュー（担当者別負荷）
        </div>
        {/* 色凡例 */}
        <div style={{
          height: LEGEND_H, display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 8px', fontSize: 9, color: 'var(--th-text-muted)',
          background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontWeight: 700 }}>凡例</span>
          {LEGEND_ITEMS.map(l => (
            <span key={l.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <span style={{
                width: 10, height: 10, background: l.c,
                border: '1px solid rgba(0,0,0,0.2)', display: 'inline-block',
              }} />
              {l.n}
            </span>
          ))}
        </div>
        {assignees.map((a, ai) => (
          <div key={a} style={{
            height: CELL_H, display: 'flex', alignItems: 'center',
            padding: '0 8px', fontSize: 12, color: 'var(--th-text2)',
            borderBottom: '1px solid var(--th-border)', flexShrink: 0,
            background: ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {a}
          </div>
        ))}
      </div>

      {/* 右スクロール領域 */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'hidden', overflowY: 'hidden' }}>
        <div style={{ width: totalWidth, display: 'flex', flexDirection: 'column' }}>
          {/* 日付ヘッダー（バケット単位） */}
          <div style={{
            height: HEADER_H, position: 'relative', flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }}>
            {buckets.map((b, bi) => {
              const weekend = b.span === 1 && isWeekendDay(b.startIdx);
              const dow = dayjs(days[b.startIdx]).day();
              const left = b.startIdx * dayWidth;
              const width = b.span * dayWidth;
              return (
                <div key={bi} style={{
                  position: 'absolute', left, width, height: HEADER_H,
                  background: weekend
                    ? (dow === 6 ? 'rgba(59,130,246,0.18)' : 'rgba(239,68,68,0.18)')
                    : 'transparent',
                  borderRight: '1px solid var(--th-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9,
                  color: weekend ? (dow === 6 ? '#3b82f6' : '#ef4444') : 'var(--th-text-muted)',
                  boxSizing: 'border-box', overflow: 'hidden',
                }}>
                  {width >= 14 ? b.label : ''}
                </div>
              );
            })}
          </div>
          {/* 凡例行ぶんのスペーサ（左列と高さを揃える） */}
          <div style={{
            height: LEGEND_H, flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }} />

          {/* 担当者ごとに 1 行: 各バケットに色＋ピーク負荷 */}
          {assignees.map((a, ai) => (
            <div key={a} style={{
              height: CELL_H, position: 'relative', flexShrink: 0,
              background: ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)',
              borderBottom: '1px solid var(--th-border)',
            }}>
              {buckets.map((b, bi) => {
                // バケット期間内の同時進行数のピーク（最大）
                const peak = b.dayIdxs.reduce((m, i) => Math.max(m, matrix[ai][i]), 0);
                const titles = [...new Set(b.dayIdxs.flatMap(i => dayTasks[ai][i]))];
                const weekend = b.span === 1 && isWeekendDay(b.startIdx);
                const dow = dayjs(days[b.startIdx]).day();
                const loadBg = workloadColor(peak);
                const weekendBg = weekend
                  ? (dow === 6 ? 'rgba(59,130,246,0.10)' : 'rgba(239,68,68,0.10)')
                  : undefined;
                const bg = peak > 0 ? loadBg : (weekendBg ?? 'transparent');
                const left = b.startIdx * dayWidth;
                const width = b.span * dayWidth;
                return (
                  <div key={bi} style={{
                    position: 'absolute', left, width, height: CELL_H,
                    background: bg,
                    borderRight: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: Math.min(11, width - 4),
                    fontWeight: 700,
                    color: peak > 0 ? 'rgba(0,0,0,0.65)' : 'transparent',
                    boxSizing: 'border-box',
                  }}
                    title={peak > 0
                      ? `${a} ${b.label}: ${peak}件${titles.length ? `\n${titles.join('\n')}` : ''}`
                      : undefined}
                  >
                    {width >= 10 && peak > 0 ? peak : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
