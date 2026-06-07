import type { Task, ZoomLevel } from '../../types/task';
import { dateToX, ROW_HEIGHT_PX, ZOOM_CONFIG, todayStr } from '../../utils/ganttCalc';
import { STATUS_COLOR } from '../../utils/taskColors';

interface Props {
  task: Task;
  minDate: Date;
  zoom: ZoomLevel;
  rowIndex: number;
  isCritical?: boolean;
  isParent?: boolean;
  effectiveProgress?: number;
  dragPreview?: { startDate: string; endDate: string } | null;
  rowHeight?: number;
  onMoveStart: (e: React.MouseEvent, taskId: string) => void;
  onResizeLeftStart: (e: React.MouseEvent, taskId: string) => void;
  onResizeRightStart: (e: React.MouseEvent, taskId: string) => void;
  onClick: () => void;
}


const TODAY = todayStr();
const HANDLE_W = 6;
const MIN_BAR_FOR_TEXT = 12; // px未満はテキスト非表示

function titleTextMode(
  barWidth: number,
  availableInner: number,
  titleLen: number,
  fontSize: number,
): 'inside' | 'outside' | 'none' {
  if (barWidth < MIN_BAR_FOR_TEXT) return 'none';
  const estimated = titleLen * fontSize * 0.6;
  return availableInner >= estimated + 4 ? 'inside' : 'outside';
}

export function GanttBar({
  task, minDate, zoom, rowIndex, isCritical, isParent = false, effectiveProgress, dragPreview, rowHeight = ROW_HEIGHT_PX,
  onMoveStart, onResizeLeftStart, onResizeRightStart,
  onClick,
}: Props) {
  const effectiveStart = dragPreview?.startDate ?? task.startDate;
  const effectiveEnd   = dragPreview?.endDate   ?? task.endDate;

  if (!effectiveStart) return null;

  const { dayWidth } = ZOOM_CONFIG[zoom];
  const color = STATUS_COLOR[task.status];
  const isOverdue = task.endDate !== null && task.endDate < TODAY && task.status !== 'done' && task.status !== 'pending';
  const centerY = rowIndex * rowHeight + rowHeight / 2;
  const barHeight = rowHeight - 12;
  const barFontSize = Math.max(11, Math.min(15, Math.round(barHeight * 0.58)));

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
          filter={isCritical && !isOverdue ? 'url(#critical-glow)' : undefined}
          onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); onMoveStart(e, task.id); }}
        />
        <text x={cx + r + 5} y={centerY + 4} fontSize={barFontSize} fill={isCritical ? '#6366f1' : color} fontWeight={600}>
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
  const progressWidth = Math.round(width * task.progress / 100);

  // ── 親タスク：サマリーバー（上部横バー＋左右下向き三角） ────
  if (isParent) {
    const topH = Math.round(barHeight * 0.42);
    const legW = topH + 2;
    const barColor = isCritical ? '#6366f1' : color;
    const textY = y + Math.round(topH * 0.55 + (barFontSize - 1) * 0.35);
    const displayProgress = effectiveProgress ?? task.progress;
    const parentProgressWidth = Math.round(width * displayProgress / 100);

    return (
      <g data-task-id={task.id} onClick={onClick} style={{ cursor: 'pointer' }}>
        {/* 上部横バー */}
        <rect x={x} y={y} width={width} height={topH} rx={2}
          fill={barColor + 'cc'} stroke={barColor} strokeWidth={1}
          filter={isCritical ? 'url(#critical-glow)' : undefined} />
        {/* 進捗オーバーレイ */}
        {displayProgress > 0 && (
          <rect x={x} y={y} width={parentProgressWidth} height={topH} rx={2}
            fill={barColor} style={{ pointerEvents: 'none' }} />
        )}
        {/* 左下向き三角（左辺垂直・右辺斜め） */}
        <polygon
          points={`${x},${y + topH} ${x + legW},${y + topH} ${x},${y + barHeight}`}
          fill={barColor + 'cc'} style={{ pointerEvents: 'none' }}
        />
        {/* 右下向き三角（右辺垂直・左辺斜め） */}
        <polygon
          points={`${x + width - legW},${y + topH} ${x + width},${y + topH} ${x + width},${y + barHeight}`}
          fill={barColor + 'cc'} style={{ pointerEvents: 'none' }}
        />
        {/* タイトル */}
        {(() => {
          const availInner = Math.max(width - legW * 2, 0);
          const mode = titleTextMode(width, availInner, task.title.length, barFontSize - 1);
          if (mode === 'none') return null;
          if (mode === 'outside') return (
            <text x={x + width + 4} y={textY}
              fontSize={barFontSize - 1} fill={barColor} fontWeight={700}
              style={{ pointerEvents: 'none' }}>
              {task.title}
            </text>
          );
          const textFill = (displayProgress > 0 && parentProgressWidth > legW + 2) ? '#fff' : barColor;
          return (<>
            <text x={x + legW + 2} y={textY}
              fontSize={barFontSize - 1} fill={textFill} fontWeight={700}
              clipPath={`url(#clip-${task.id})`} style={{ pointerEvents: 'none' }}>
              {task.title}
            </text>
            <clipPath id={`clip-${task.id}`}>
              <rect x={x + legW} y={y} width={availInner} height={topH} />
            </clipPath>
          </>);
        })()}
      </g>
    );
  }

  return (
    <g data-task-id={task.id}>
      {/* バー背景 */}
      <rect
        x={x} y={y} width={width} height={barHeight} rx={3}
        fill={isOverdue ? '#fca5a5' : isCritical ? '#fef08a' : color + '44'}
        stroke={isOverdue ? '#ef4444' : isCritical ? '#6366f1' : color}
        strokeWidth={isCritical && !isOverdue ? 2.5 : 1}
        filter={isCritical && !isOverdue ? 'url(#critical-glow)' : undefined}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      />
      {/* 進捗バー */}
      {task.progress > 0 && (
        <rect x={x} y={y} width={progressWidth} height={barHeight} rx={3}
          fill={color + 'aa'} style={{ pointerEvents: 'none' }} />
      )}
      {/* タイトル */}
      {(() => {
        const textY = y + barHeight / 2 + 4;
        const availInner = Math.max(width - HANDLE_W * 2, 0);
        const mode = titleTextMode(width, availInner, task.title.length, barFontSize);
        if (mode === 'none') return null;
        if (mode === 'outside') return (
          <text x={x + width + 4} y={textY} fontSize={barFontSize} fill={color} fontWeight={600}
            style={{ pointerEvents: 'none' }}>
            {task.title}
          </text>
        );
        const textFill = (task.progress > 0 && progressWidth > HANDLE_W + 2) ? '#fff' : color;
        return (<>
          <text x={x + HANDLE_W + 2} y={textY} fontSize={barFontSize} fill={textFill} fontWeight={600}
            clipPath={`url(#clip-${task.id})`} style={{ pointerEvents: 'none' }}>
            {task.title}
          </text>
          <clipPath id={`clip-${task.id}`}>
            <rect x={x + HANDLE_W} y={y} width={availInner} height={barHeight} />
          </clipPath>
        </>);
      })()}

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
