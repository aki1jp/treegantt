import type { Task, ZoomLevel } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG } from '../../utils/ganttCalc';

interface Props {
  fromTask: Task;
  toTask: Task;
  minDate: Date;
  zoom: ZoomLevel;
  taskIndex: Map<string, number>;
}

export function DependencyArrow({ fromTask, toTask, minDate, zoom, taskIndex }: Props) {
  if (!fromTask.endDate || !toTask.startDate) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const fromRow = taskIndex.get(fromTask.id) ?? 0;
  const toRow   = taskIndex.get(toTask.id) ?? 0;

  const x1 = dateToX(fromTask.endDate, minDate, zoom) + dayWidth;
  const y1 = fromRow * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;
  const x2 = dateToX(toTask.startDate, minDate, zoom);
  const y2 = toRow * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;

  const cx1 = x1 + 30;
  const cx2 = x2 - 30;

  return (
    <path
      d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
      stroke="#378ADD"
      strokeWidth={1.5}
      fill="none"
      markerEnd="url(#arrowhead)"
    />
  );
}
