import dayjs from 'dayjs';
import type { Task, ZoomLevel } from '../../types/task';
import { ZOOM_CONFIG } from '../../utils/ganttCalc';
import { workloadColor } from '../../utils/workloadCalc';

const HEADER_H  = 22;
const CELL_H    = 28;

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
  const totalDays = Math.round(totalWidth / dayWidth);

  // 担当者ごとにタスクをグループ化
  const assigneeGroups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.assignee || !t.startDate) continue;
    if (!assigneeGroups.has(t.assignee)) assigneeGroups.set(t.assignee, []);
    assigneeGroups.get(t.assignee)!.push(t);
  }
  const assignees = [...assigneeGroups.keys()].sort();

  if (assignees.length === 0) return null;

  // 各日の文字列（YYYY-MM-DD）
  const dayStrings = Array.from({ length: totalDays }, (_, i) =>
    dayjs(min).add(i, 'day').format('YYYY-MM-DD')
  );

  return (
    <div data-testid="workload-panel" style={{
      flexShrink: 0, display: 'flex',
      borderTop: '2px solid var(--th-border-strong)',
      background: 'var(--th-bg)',
    }}>
      {/* 左固定列: 担当者名 */}
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
          {/* 日付ヘッダー */}
          <div style={{
            height: HEADER_H, position: 'relative', flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }}>
            {dayStrings.map((_, i) => {
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

          {/* 担当者ごとに 1 行: 各日セルに色＋タスク数 */}
          {assignees.map((a, ai) => {
            const rowTasks = assigneeGroups.get(a) ?? [];
            return (
              <div key={a} style={{
                height: CELL_H, position: 'relative', flexShrink: 0,
                background: ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)',
                borderBottom: '1px solid var(--th-border)',
              }}>
                {dayStrings.map((dayStr, di) => {
                  const dow = dayjs(min).add(di, 'day').day();
                  const isSat = dow === 6;
                  const isSun = dow === 0;
                  const count = rowTasks.filter(t =>
                    t.startDate! <= dayStr && (t.endDate ?? t.startDate!) >= dayStr
                  ).length;
                  const loadBg = workloadColor(count);
                  const weekendBg = isSat
                    ? 'rgba(59,130,246,0.10)'
                    : isSun ? 'rgba(239,68,68,0.10)' : undefined;
                  // 負荷色が透明でない場合は負荷色優先、ない場合は土日薄色
                  const bg = count > 0 ? loadBg : (weekendBg ?? 'transparent');
                  return (
                    <div key={di} style={{
                      position: 'absolute', left: di * dayWidth, width: dayWidth, height: CELL_H,
                      background: bg,
                      borderRight: '1px solid rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: Math.min(11, dayWidth - 4),
                      fontWeight: 700,
                      color: count > 0 ? 'rgba(0,0,0,0.65)' : 'transparent',
                      boxSizing: 'border-box',
                    }}
                      title={count > 0 ? `${a} ${dayStr}: ${count}件` : undefined}
                    >
                      {dayWidth >= 10 && count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
