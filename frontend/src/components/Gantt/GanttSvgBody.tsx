import type { Task } from '../../types/task';
import type { ZoomLevel } from '../../types/task';
import { dateToX, type LightningPoint } from '../../utils/ganttCalc';
import { milestoneColorOf } from '../../utils/taskColors';
import { canCreateOnRow, isReadonlyTask } from '../../utils/refTasks';
import { GanttBar } from './GanttBar';
import { LightningLine, TodayLine } from './LightningLine';
import type { DragState, DragPreview } from './useBarDrag';
import type { LinkDragState } from './useLinkDrag';

type FlatRow = { task: Task; depth: number };
type ParentSpan = { startDate: string | null; endDate: string | null };
type MilestoneItem = { x: number; title: string; color: string; lane: number };

interface Props {
  svgRef: React.RefObject<SVGSVGElement>;
  totalWidth: number;
  totalHeight: number;
  uiRowHeight: number;
  min: Date;
  zoomLevel: ZoomLevel;
  dayWidth: number;
  /** クロスプロジェクト参照（§5.8）: 現プロジェクトID。未指定時は readonly ガード無効。 */
  currentProjectId?: string;
  // 行・派生データ
  flatRows: FlatRow[];
  vStart: number;
  vEnd: number;
  childCount: Map<string, number>;
  collapsed: Set<string>;
  progressMap: Map<string, number>;
  parentSpanMap: Map<string, ParentSpan>;
  taskById: Map<string, Task>;
  taskIndex: Map<string, number>;
  effStartDate: (t: Task) => string | null;
  effEndDate: (t: Task) => string | null;
  criticalSet: Set<string>;
  collapsedCriticalParents: Set<string>;
  weekendXs: number[];
  milestoneItems: MilestoneItem[];
  milestoneHighlightColor: string;
  // 表示トグル・ライン
  showTodayLine: boolean;
  showLightningLine: boolean;
  lightningPoints: LightningPoint[] | null;
  dependencyArrows: React.ReactNode;
  // ドラッグ状態・ハンドラ
  dragState: DragState | null;
  dragPreview: DragPreview | null;
  linkDragState: LinkDragState | null;
  canStartLink: boolean;
  hoveredBarId: string | null;
  setHoveredBarId: (id: string | null) => void;
  startCreateDrag: (e: React.MouseEvent, taskId: string) => void;
  startLinkDrag: (e: React.MouseEvent, taskId: string) => void;
  handleBarMoveStart: (e: React.MouseEvent, id: string) => void;
  handleBarResizeLeftStart: (e: React.MouseEvent, id: string) => void;
  handleBarResizeRightStart: (e: React.MouseEvent, id: string) => void;
  handleBarClick: (task: Task) => void;
}

// ガント右パネルの SVG 本体（縞背景・土日/マイルストーン列・タスクバー・依存矢印・
// コネクタドット・今日ライン・イナズマライン）。GanttChart から抽出（挙動不変, D4）。
export function GanttSvgBody({
  svgRef, totalWidth, totalHeight, uiRowHeight, min, zoomLevel, dayWidth, currentProjectId,
  flatRows, vStart, vEnd, childCount, collapsed, progressMap, parentSpanMap,
  taskById, taskIndex, effStartDate, effEndDate, criticalSet, collapsedCriticalParents,
  weekendXs, milestoneItems, milestoneHighlightColor,
  showTodayLine, showLightningLine, lightningPoints, dependencyArrows,
  dragState, dragPreview, linkDragState, canStartLink, hoveredBarId, setHoveredBarId,
  startCreateDrag, startLinkDrag,
  handleBarMoveStart, handleBarResizeLeftStart, handleBarResizeRightStart, handleBarClick,
}: Props) {
  return (
    <svg ref={svgRef} width={totalWidth} height={Math.max(totalHeight, 1)} style={{ display: 'block' }}
      onMouseMove={e => {
        if (dragState || linkDragState) return;
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;
        const rowIdx = Math.floor((e.clientY - svgRect.top) / uiRowHeight);
        setHoveredBarId(flatRows[rowIdx]?.task.id ?? null);
      }}
      onMouseLeave={() => setHoveredBarId(null)}
    >
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#378ADD" />
        </marker>
        <marker id="arrowhead-critical" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#6366f1" />
        </marker>
        <filter id="critical-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.65" />
        </filter>
      </defs>

      {/* 縞背景（仮想化: 可視範囲のみ・Y座標は絶対インデックス） */}
      {flatRows.slice(vStart, vEnd).map(({ task, depth }, sliceIdx) => {
        const i = vStart + sliceIdx;
        const isParent    = (childCount.get(task.id) ?? 0) > 0;
        const isRootParent = depth === 0 && isParent;
        const canCreate   = canCreateOnRow(task, isParent, currentProjectId);
        return (
          <rect key={task.id} x={0} y={i * uiRowHeight} width={totalWidth} height={uiRowHeight}
            style={{ fill: task.titleBgColor ?? (isRootParent ? 'var(--th-bg-parent)' : (i % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)')), cursor: canCreate ? 'crosshair' : undefined }}
            onMouseDown={canCreate ? (e) => startCreateDrag(e, task.id) : undefined}
          />
        );
      })}

      {/* QuickAddRow に対応する背景（WBSとの視覚的整合） */}
      <rect
        x={0}
        y={flatRows.length * uiRowHeight}
        width={totalWidth}
        height={uiRowHeight}
        style={{ fill: 'var(--th-bg2)' }}
      />

      {/* 土日背景 */}
      {weekendXs.map((x, i) => (
        <rect key={i} x={x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
          fill="rgba(148,163,184,0.18)" pointerEvents="none" />
      ))}

      {/* マイルストーン列背景 */}
      {milestoneItems.map((m, i) => (
        <rect key={i} x={m.x} y={0} width={dayWidth} height={Math.max(totalHeight, 1)}
          fill={m.color + '33'} pointerEvents="none" />
      ))}

      {/* タスクバー（仮想化: 可視範囲のみ・rowIndex は絶対インデックス） */}
      {flatRows.slice(vStart, vEnd).map(({ task }, sliceIdx) => {
        const i = vStart + sliceIdx;
        const preview = dragPreview?.taskId === task.id ? dragPreview : null;
        const isParent = (childCount.get(task.id) ?? 0) > 0;
        return (
          <GanttBar
            key={task.id}
            task={task}
            minDate={min}
            zoom={zoomLevel}
            rowIndex={i}
            isCritical={criticalSet.has(task.id) || collapsedCriticalParents.has(task.id)}
            dragPreview={preview}
            rowHeight={uiRowHeight}
            isParent={isParent}
            isCollapsed={collapsed.has(task.id)}
            effectiveProgress={isParent ? progressMap.get(task.id) : undefined}
            displayStart={isParent ? (parentSpanMap.get(task.id)?.startDate ?? null) : undefined}
            displayEnd={isParent   ? (parentSpanMap.get(task.id)?.endDate   ?? null) : undefined}
            milestoneColor={task.isMilestone ? milestoneColorOf(task.titleColor, milestoneHighlightColor) : undefined}
            readOnly={isReadonlyTask(task, currentProjectId)}
            onMoveStart={handleBarMoveStart}
            onResizeLeftStart={handleBarResizeLeftStart}
            onResizeRightStart={handleBarResizeRightStart}
            onClick={handleBarClick}
          />
        );
      })}

      {/* 依存関係矢印（折りたたみ時は可視祖先へリダイレクト） */}
      {dependencyArrows}

      {/* ホバー中バーの右端コネクタドット（リンクドラッグ開始点） */}
      {canStartLink && hoveredBarId && (() => {
        const hTask = taskById.get(hoveredBarId);
        const hEnd = hTask ? effEndDate(hTask) : null;
        if (!hTask || hTask.isMilestone || !hEnd) return null;
        const cx = dateToX(hEnd, min, zoomLevel) + dayWidth + 6;
        const cy = (taskIndex.get(hTask.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
        return (
          <circle
            data-connector-dot
            cx={cx} cy={cy} r={6}
            fill="#378ADD" stroke="white" strokeWidth={1.5}
            style={{ cursor: 'crosshair' }}
            onMouseDown={e => { if (e.button !== 0) return; e.stopPropagation(); startLinkDrag(e, hoveredBarId); }}
          />
        );
      })()}

      {/* リンクドラッグ中：ターゲットバー左端ドット */}
      {linkDragState?.targetTaskId && (() => {
        const tgt = taskById.get(linkDragState.targetTaskId!);
        const tgtStart = tgt ? effStartDate(tgt) : null;
        if (!tgt || !tgtStart) return null;
        const cx = dateToX(tgtStart, min, zoomLevel) - 6;
        const cy = (taskIndex.get(tgt.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
        return <circle data-link-target-dot cx={cx} cy={cy} r={6} fill="#378ADD" stroke="white" strokeWidth={1.5} pointerEvents="none" />;
      })()}

      {/* リンクドラッグ中のプレビュー破線（fromTask の右端 → マウス位置） */}
      {linkDragState && (() => {
        const fromTask = taskById.get(linkDragState.fromTaskId);
        const fromEnd = fromTask ? effEndDate(fromTask) : null;
        if (!fromTask || !fromEnd) return null;
        const x1 = dateToX(fromEnd, min, zoomLevel) + dayWidth + 6;
        const y1 = (taskIndex.get(fromTask.id) ?? 0) * uiRowHeight + uiRowHeight / 2;
        return (
          <line
            x1={x1} y1={y1}
            x2={linkDragState.currentX} y2={linkDragState.currentY}
            stroke="#378ADD" strokeWidth={2} strokeDasharray="5,3"
            pointerEvents="none"
          />
        );
      })()}

      {/* 今日ライン */}
      {showTodayLine && (
        <TodayLine
          min={min}
          zoomLevel={zoomLevel}
          height={Math.max(totalHeight, 1)}
        />
      )}

      {/* イナズマライン */}
      {showLightningLine && lightningPoints && (
        <LightningLine points={lightningPoints} color="#7c3aed" />
      )}
    </svg>
  );
}
