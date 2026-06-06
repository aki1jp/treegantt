import type { Task, ZoomLevel } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG } from '../../utils/ganttCalc';

interface Props {
  fromTask: Task;
  toTask: Task;
  minDate: Date;
  zoom: ZoomLevel;
  taskIndex: Map<string, number>;
  rowHeight?: number;
}

export function DependencyArrow({ fromTask, toTask, minDate, zoom, taskIndex, rowHeight = ROW_HEIGHT_PX }: Props) {
  if (!fromTask.endDate || !toTask.startDate) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const fromRow = taskIndex.get(fromTask.id);
  const toRow   = taskIndex.get(toTask.id);
  if (fromRow === undefined || toRow === undefined) return null;

  const x1 = dateToX(fromTask.endDate, minDate, zoom) + dayWidth;
  const y1 = fromRow * rowHeight + rowHeight / 2;
  const x2 = dateToX(toTask.startDate, minDate, zoom);
  const y2 = toRow * rowHeight + rowHeight / 2;

  const cx1 = x1 + 30;
  const cx2 = x2 - 30;

  const d = `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`;
  return (
    <g>
      {/* 可視の矢印線（ポインタイベント無効） */}
      <path d={d} stroke="#378ADD" strokeWidth={1.5} fill="none" markerEnd="url(#arrowhead)" pointerEvents="none" />
      {/* 右クリック検知用の透明太パス */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth={12}
        fill="none"
        style={{ cursor: 'context-menu' }}
        data-dep-from={fromTask.id}
        data-dep-to={toTask.id}
      />
    </g>
  );
}
