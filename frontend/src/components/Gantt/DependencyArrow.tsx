import type { Task, ZoomLevel } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG } from '../../utils/ganttCalc';
import type { DepArrowStyle } from '../../utils/ganttCalc';

interface Props {
  fromTask: Task;
  toTask: Task;
  minDate: Date;
  zoom: ZoomLevel;
  taskIndex: Map<string, number>;
  rowHeight?: number;
  isCritical?: boolean;
  style?: DepArrowStyle;
}

function buildPath(x1: number, y1: number, x2: number, y2: number, style: DepArrowStyle): string {
  if (style === 'straight') {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  if (style === 'elbow') {
    const OFFSET = 16;
    if (x2 - x1 >= OFFSET * 2) {
      // 横距離が十分ある場合: 中点で折り返す L 字形
      const midX = (x1 + x2) / 2;
      return `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
    } else {
      // 横距離が小さい・同位置・逆方向の場合: OFFSET で迂回する S 字形
      const midY = (y1 + y2) / 2;
      return `M${x1},${y1} L${x1 + OFFSET},${y1} L${x1 + OFFSET},${midY} L${x2 - OFFSET},${midY} L${x2 - OFFSET},${y2} L${x2},${y2}`;
    }
  }
  return `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`;
}

export function DependencyArrow({ fromTask, toTask, minDate, zoom, taskIndex, rowHeight = ROW_HEIGHT_PX, isCritical = false, style = 'bezier' }: Props) {
  if (!fromTask.endDate || !toTask.startDate) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const fromRow = taskIndex.get(fromTask.id);
  const toRow   = taskIndex.get(toTask.id);
  if (fromRow === undefined || toRow === undefined) return null;

  const x1 = dateToX(fromTask.endDate, minDate, zoom) + dayWidth;
  const y1 = fromRow * rowHeight + rowHeight / 2;
  const x2 = dateToX(toTask.startDate, minDate, zoom);
  const y2 = toRow * rowHeight + rowHeight / 2;

  const d = buildPath(x1, y1, x2, y2, style);

  const stroke      = isCritical ? '#6366f1' : '#378ADD';
  const strokeWidth = isCritical ? 2.5 : 1.5;
  const markerEnd   = isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)';
  const filter      = isCritical ? 'url(#critical-glow)' : undefined;

  return (
    <g>
      {/* 可視の矢印線（ポインタイベント無効） */}
      <path d={d} stroke={stroke} strokeWidth={strokeWidth} fill="none"
        markerEnd={markerEnd} filter={filter} pointerEvents="none" />
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
