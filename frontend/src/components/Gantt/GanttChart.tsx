import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import type { Task, ZoomLevel } from '../../types/task';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';
import {
  calcGanttRange, dateToX, calcTodayX, calcLightningX,
  ganttTotalWidth, ROW_HEIGHT_PX, ZOOM_CONFIG,
} from '../../utils/ganttCalc';
import { GanttBar } from './GanttBar';
import { DependencyArrow } from './DependencyArrow';
import { LightningLine } from './LightningLine';

dayjs.extend(weekOfYear);

const LABEL_WIDTH = 200;
const HEADER_HEIGHT = 32;

interface Props {
  onEditTask: (task: Task) => void;
}

function buildHeaders(min: Date, max: Date, zoom: ZoomLevel): { label: string; x: number; width: number }[] {
  const { dayWidth, headerFormat } = ZOOM_CONFIG[zoom];
  const headers: { label: string; x: number; width: number }[] = [];
  let cur = dayjs(min);
  const end = dayjs(max);

  while (cur.isBefore(end)) {
    const x = Math.round((cur.toDate().getTime() - min.getTime()) / 86400000) * dayWidth;

    if (zoom === 'day') {
      headers.push({ label: cur.format(headerFormat), x, width: dayWidth });
      cur = cur.add(1, 'day');
    } else if (zoom === 'week') {
      const weekStart = cur.startOf('week');
      const weekEnd = weekStart.add(6, 'day');
      const clampedEnd = weekEnd.isAfter(end) ? end : weekEnd;
      const days = clampedEnd.diff(cur, 'day') + 1;
      headers.push({ label: `W${cur.week()}`, x, width: days * dayWidth });
      cur = weekStart.add(1, 'week').startOf('week');
    } else {
      const monthStart = cur.startOf('month');
      const monthEnd = monthStart.endOf('month');
      const clampedEnd = monthEnd.isAfter(end) ? end : monthEnd;
      const days = clampedEnd.diff(cur, 'day') + 1;
      headers.push({ label: cur.format(headerFormat), x, width: days * dayWidth });
      cur = monthStart.add(1, 'month').startOf('month');
    }
  }
  return headers;
}

export function GanttChart({ onEditTask }: Props) {
  const { tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority, zoomLevel } = useTaskStore();
  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);

  const range = calcGanttRange(sorted);
  if (!range || sorted.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
        日付が設定されたタスクがありません
      </div>
    );
  }

  const { min, max } = range;
  const totalWidth = ganttTotalWidth(sorted, zoomLevel);
  const totalHeight = sorted.length * ROW_HEIGHT_PX;
  const todayX = calcTodayX(min, zoomLevel);
  const lightningX = calcLightningX(sorted, min, zoomLevel);
  const headers = buildHeaders(min, max, zoomLevel);

  const taskIndex = new Map(sorted.map((t, i) => [t.id, i]));

  const taskById = new Map(sorted.map(t => [t.id, t]));

  return (
    <div style={{ display: 'flex', overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 130px)' }}>
      {/* ラベル列（固定） */}
      <div style={{ minWidth: LABEL_WIDTH, flexShrink: 0, borderRight: '1px solid #e5e7eb' }}>
        <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }} />
        {sorted.map((task) => (
          <div key={task.id} style={{
            height: ROW_HEIGHT_PX, display: 'flex', alignItems: 'center',
            padding: '0 12px', fontSize: 12, borderBottom: '1px solid #f3f4f6',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: 'pointer',
          }} onClick={() => onEditTask(task)} title={task.title}>
            {task.title}
          </div>
        ))}
      </div>

      {/* ガントエリア */}
      <div style={{ overflowX: 'auto', flexGrow: 1 }}>
        <svg width={totalWidth} height={HEADER_HEIGHT + totalHeight}>
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
            </marker>
          </defs>

          {/* ヘッダー */}
          <g>
            {headers.map((h, i) => (
              <g key={i}>
                <rect x={h.x} y={0} width={h.width} height={HEADER_HEIGHT}
                  fill={i % 2 === 0 ? '#f9fafb' : '#f3f4f6'} stroke="#e5e7eb" strokeWidth={0.5} />
                <text x={h.x + 4} y={20} fontSize={10} fill="#6b7280" fontWeight={600}>{h.label}</text>
              </g>
            ))}
          </g>

          {/* 行背景（縞） */}
          <g transform={`translate(0,${HEADER_HEIGHT})`}>
            {sorted.map((_, i) => (
              <rect key={i} x={0} y={i * ROW_HEIGHT_PX} width={totalWidth} height={ROW_HEIGHT_PX}
                fill={i % 2 === 0 ? '#fff' : '#fafafa'} />
            ))}

            {/* タスクバー */}
            {sorted.map((task, i) => (
              <GanttBar key={task.id} task={task} minDate={min} zoom={zoomLevel} rowIndex={i}
                onClick={() => onEditTask(task)} />
            ))}

            {/* 依存関係矢印 */}
            {sorted.flatMap(task =>
              task.predecessors.map(predId => {
                const pred = taskById.get(predId);
                return pred ? (
                  <DependencyArrow key={`${predId}->${task.id}`}
                    fromTask={pred} toTask={task} minDate={min} zoom={zoomLevel} taskIndex={taskIndex} />
                ) : null;
              })
            )}

            {/* 今日ライン */}
            <LightningLine x={todayX} height={totalHeight} color="#E24B4A" label="今日" />

            {/* イナズマライン */}
            {lightningX !== null && (
              <LightningLine x={lightningX} height={totalHeight} color="#D4537E" label="⚡" />
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}
