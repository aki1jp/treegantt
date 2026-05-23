import type { Task, ZoomLevel, TaskStatus } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG } from '../../utils/ganttCalc';

interface Props {
  task: Task;
  minDate: Date;
  zoom: ZoomLevel;
  rowIndex: number;
  isCritical?: boolean;
  dragPreview?: { startDate: string; endDate: string } | null;
  fontSize?: number;
  rowHeight?: number;
  onMoveStart: (e: React.MouseEvent, taskId: string) => void;
  onResizeLeftStart: (e: React.MouseEvent, taskId: string) => void;
  onResizeRightStart: (e: React.MouseEvent, taskId: string) => void;
  onClick: () => void;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#6b7280', wip: '#3b82f6', done: '#22c55e', wait: '#f59e0b',
};

const TODAY = new Date().toISOString().slice(0, 10);
const HANDLE_W = 6;

export function GanttBar({
  task, minDate, zoom, rowIndex, isCritical, dragPreview, fontSize = 11, rowHeight = ROW_HEIGHT_PX,
  onMoveStart, onResizeLeftStart, onResizeRightStart, onClick,
}: Props) {
  const effectiveStart = dragPreview?.startDate ?? task.startDate;
  const effectiveEnd   = dragPreview?.endDate   ?? task.endDate;

  if (!effectiveStart) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const color = STATUS_COLOR[task.status];
  const isOverdue = task.endDate !== null && task.endDate < TODAY && task.status !== 'done';
  const centerY = rowIndex * rowHeight + rowHeight / 2;

  // ── マイルストーン描画 ──────────────────────────────
  if (task.isMilestone) {
    const cx = dateToX(effectiveStart, minDate, zoom) + dayWidth / 2;
    const r  = (rowHeight - 14) / 2;
    const pts = `${cx},${centerY - r} ${cx + r},${centerY} ${cx},${centerY + r} ${cx - r},${centerY}`;
    return (
      <g data-task-id={task.id} style={{ cursor: dragPreview ? 'grabbing' : 'move' }}>
        <polygon
          points={pts}
          fill={isOverdue ? '#fca5a5' : isCritical ? '#fef08a' : color + 'cc'}
          stroke={isOverdue ? '#ef4444' : isCritical ? '#6366f1' : color}
          strokeWidth={isOverdue ? 2.5 : isCritical ? 2 : 1.5}
          onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); onMoveStart(e, task.id); }}
        />
        <text x={cx + r + 5} y={centerY + 4} fontSize={fontSize} fill={isCritical ? '#6366f1' : color} fontWeight={600}>
          {task.title}
        </text>
        <rect
          x={cx - r - 4} y={centerY - r - 4} width={r * 2 + 8} height={r * 2 + 8}
          fill="transparent" onClick={onClick} style={{ cursor: 'pointer' }}
        />
      </g>
    );
  }

  // ── 通常バー描画 ────────────────────────────────────
  if (!effectiveEnd) return null;

  const x = dateToX(effectiveStart, minDate, zoom);
  const endX = dateToX(effectiveEnd, minDate, zoom) + dayWidth;
  const width = Math.max(endX - x, dayWidth);
  const y = rowIndex * rowHeight + 6;
  const barHeight = rowHeight - 12;
  const progressWidth = Math.round(width * task.progress / 100);

  return (
    <g data-task-id={task.id}>
      {/* バー背景 */}
      <rect
        x={x} y={y} width={width} height={barHeight} rx={3}
        fill={isOverdue ? '#fca5a5' : isCritical ? '#fef08a' : color + '44'}
        stroke={isOverdue ? '#ef4444' : isCritical ? '#6366f1' : color}
        strokeWidth={isCritical && !isOverdue ? 2.5 : 1}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      />
      {/* 進捗バー */}
      {task.progress > 0 && (
        <rect x={x} y={y} width={progressWidth} height={barHeight} rx={3}
          fill={color + 'aa'} style={{ pointerEvents: 'none' }} />
      )}
      {/* タイトル */}
      <text x={x + HANDLE_W + 2} y={y + barHeight / 2 + 4} fontSize={fontSize} fill={color} fontWeight={600}
        clipPath={`url(#clip-${task.id})`} style={{ pointerEvents: 'none' }}>
        {task.title}
      </text>
      <clipPath id={`clip-${task.id}`}>
        <rect x={x + HANDLE_W} y={y} width={Math.max(width - HANDLE_W * 2, 0)} height={barHeight} />
      </clipPath>

      {/* 移動ゾーン（中央） */}
      <rect
        x={x + HANDLE_W} y={y}
        width={Math.max(width - HANDLE_W * 2, 0)} height={barHeight}
        fill="transparent"
        style={{ cursor: dragPreview ? 'grabbing' : 'move' }}
        onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); onMoveStart(e, task.id); }}
      />
      {/* 左リサイズハンドル */}
      <rect
        x={x} y={y} width={HANDLE_W} height={barHeight}
        fill={isOverdue ? '#dc2626' : isCritical ? '#6366f1aa' : color + '88'} rx={3}
        style={{ cursor: 'ew-resize' }}
        onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); onResizeLeftStart(e, task.id); }}
      />
      {/* 右リサイズハンドル */}
      <rect
        x={x + width - HANDLE_W} y={y} width={HANDLE_W} height={barHeight}
        fill={isOverdue ? '#dc2626' : isCritical ? '#6366f1aa' : color + '88'} rx={3}
        style={{ cursor: 'ew-resize' }}
        onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); onResizeRightStart(e, task.id); }}
      />
    </g>
  );
}
