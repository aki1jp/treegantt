import dayjs from 'dayjs';
import type { Task, TaskStatus, ZoomLevel } from '../../types/task';
import { dateToX, ZOOM_CONFIG } from '../../utils/ganttCalc';

const HEADER_H = 22;

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b',
};

export interface ResourceViewProps {
  tasks: Task[];
  min: Date;
  zoomLevel: ZoomLevel;
  totalWidth: number;
  /** ガントWBS左パネルと同じ幅にして列をアライメント */
  labelWidth: number;
  rowHeight?: number;
  /** ガントパネルと横スクロールを同期するための ref */
  scrollRef: React.RefObject<HTMLDivElement>;
  onEditTask: (task: Task) => void;
}

export function ResourceView({
  tasks, min, zoomLevel, totalWidth, labelWidth,
  rowHeight = 28, scrollRef, onEditTask,
}: ResourceViewProps) {
  const { dayWidth } = ZOOM_CONFIG[zoomLevel];
  const totalDays = Math.round(totalWidth / dayWidth);

  // 担当者ごとにタスクをグループ化（startDate あり・assignee ありのみ）
  const assigneeGroups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.assignee || !t.startDate) continue;
    if (!assigneeGroups.has(t.assignee)) assigneeGroups.set(t.assignee, []);
    assigneeGroups.get(t.assignee)!.push(t);
  }
  const assignees = [...assigneeGroups.keys()].sort();

  if (assignees.length === 0) return null;

  const svgHeight = assignees.length * rowHeight;

  // 土日列のX座標
  const weekendXs: number[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dow = dayjs(min).add(i, 'day').day();
    if (dow === 0 || dow === 6) weekendXs.push(i * dayWidth);
  }

  // 今日ライン
  const todayDayOffset = Math.round((Date.now() - min.getTime()) / 86400000);
  const todayX = todayDayOffset >= 0 && todayDayOffset < totalDays
    ? todayDayOffset * dayWidth
    : -1;

  return (
    <div data-testid="workload-panel" style={{
      flexShrink: 0, display: 'flex',
      borderTop: '2px solid var(--th-border-strong)',
      background: 'var(--th-bg)',
    }}>
      {/* 左固定列: 担当者名ラベル（WBS左パネルと幅を合わせる） */}
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
          担当者別タスク
        </div>
        {assignees.map(a => (
          <div key={a} style={{
            height: rowHeight, display: 'flex', alignItems: 'center',
            padding: '0 8px', fontSize: 12, color: 'var(--th-text2)',
            borderBottom: '1px solid var(--th-border)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            flexShrink: 0,
          }}>
            {a}
          </div>
        ))}
      </div>

      {/* 右スクロール領域（横スクロール位置をガントと同期） */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'hidden', overflowY: 'hidden' }}>
        <div style={{ width: totalWidth, display: 'flex', flexDirection: 'column' }}>
          {/* 日付ヘッダー行（ガントの列と 1:1 対応） */}
          <div style={{
            height: HEADER_H, position: 'relative', flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }}>
            {Array.from({ length: totalDays }, (_, i) => {
              const d = dayjs(min).add(i, 'day');
              const dow = d.day();
              const isSat = dow === 6;
              const isSun = dow === 0;
              return (
                <div key={i} style={{
                  position: 'absolute', left: i * dayWidth, width: dayWidth, height: HEADER_H,
                  background: isSat ? 'rgba(59,130,246,0.18)' : isSun ? 'rgba(239,68,68,0.18)' : 'transparent',
                  borderRight: '1px solid var(--th-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9,
                  color: isSat ? '#3b82f6' : isSun ? '#ef4444' : 'var(--th-text-muted)',
                  boxSizing: 'border-box', overflow: 'hidden',
                }}>
                  {dayWidth >= 14 ? d.date() : ''}
                </div>
              );
            })}
          </div>

          {/* SVG タスクバー */}
          <svg width={totalWidth} height={svgHeight} style={{ display: 'block', flexShrink: 0 }}>
            {/* 縞背景 */}
            {assignees.map((_, ai) => (
              <rect key={ai}
                x={0} y={ai * rowHeight} width={totalWidth} height={rowHeight}
                fill={ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)'}
              />
            ))}

            {/* 土日背景 */}
            {weekendXs.map((x, i) => (
              <rect key={i} x={x} y={0} width={dayWidth} height={svgHeight}
                fill="rgba(148,163,184,0.18)" />
            ))}

            {/* 今日ライン */}
            {todayX >= 0 && (
              <line
                x1={todayX} y1={0} x2={todayX} y2={svgHeight}
                stroke="#f97316" strokeWidth={1.5} strokeDasharray="3,2"
              />
            )}

            {/* 担当者ごとのタスクバー */}
            {assignees.map((a, ai) => {
              const rowTasks = assigneeGroups.get(a) ?? [];
              const barH = rowHeight - 8;
              const barY = ai * rowHeight;
              return rowTasks.map(t => {
                const barEndDate = t.isMilestone
                  ? t.startDate!
                  : (t.endDate ?? t.startDate!);
                const x = dateToX(t.startDate!, min, zoomLevel);
                const endX = dateToX(barEndDate, min, zoomLevel) + dayWidth;
                const w = Math.max(endX - x, dayWidth);
                const color = STATUS_COLOR[t.status];
                const clipId = `rv-clip-${t.id}`;
                const fontSize = Math.max(10, Math.min(12, barH - 4));
                return (
                  <g key={t.id}>
                    <clipPath id={clipId}>
                      <rect x={x + 1} y={barY + 4} width={Math.max(w - 2, 0)} height={barH} />
                    </clipPath>
                    {/* バー本体 */}
                    <rect
                      x={x} y={barY + 4} width={w} height={barH} rx={3}
                      fill={color + '44'} stroke={color} strokeWidth={1}
                      onClick={() => onEditTask(t)}
                      style={{ cursor: 'pointer' }}
                    />
                    {/* 進捗オーバーレイ */}
                    {t.progress > 0 && (
                      <rect
                        x={x} y={barY + 4}
                        width={Math.round(w * t.progress / 100)} height={barH} rx={3}
                        fill={color + '99'} style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {/* タイトルテキスト */}
                    <text
                      x={x + 4} y={barY + rowHeight / 2 + 4}
                      fontSize={fontSize} fill={color} fontWeight={600}
                      clipPath={`url(#${clipId})`}
                      style={{ pointerEvents: 'none' }}
                    >
                      {t.title}
                    </text>
                  </g>
                );
              });
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
