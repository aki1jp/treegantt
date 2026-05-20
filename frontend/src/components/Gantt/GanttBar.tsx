import type { Task, ZoomLevel, TaskStatus } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG } from '../../utils/ganttCalc';

interface Props {
  task: Task;
  minDate: Date;
  zoom: ZoomLevel;
  rowIndex: number;
  onClick: () => void;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b',
};

export function GanttBar({ task, minDate, zoom, rowIndex, onClick }: Props) {
  if (!task.startDate || !task.endDate) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const x = dateToX(task.startDate, minDate, zoom);
  const endX = dateToX(task.endDate, minDate, zoom) + dayWidth;
  const width = Math.max(endX - x, dayWidth);
  const y = rowIndex * ROW_HEIGHT_PX + 6;
  const barHeight = ROW_HEIGHT_PX - 12;
  const color = STATUS_COLOR[task.status];

  const progressWidth = Math.round(width * task.progress / 100);

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* バー背景 */}
      <rect x={x} y={y} width={width} height={barHeight} rx={3} fill={color + '44'} stroke={color} strokeWidth={1} />
      {/* 進捗バー */}
      {task.progress > 0 && (
        <rect x={x} y={y} width={progressWidth} height={barHeight} rx={3} fill={color + 'aa'} />
      )}
      {/* タイトル */}
      <text x={x + 4} y={y + barHeight / 2 + 4} fontSize={11} fill={color} fontWeight={600}
        clipPath={`url(#clip-${task.id})`}>
        {task.title}
      </text>
      <clipPath id={`clip-${task.id}`}>
        <rect x={x} y={y} width={width} height={barHeight} />
      </clipPath>
    </g>
  );
}
