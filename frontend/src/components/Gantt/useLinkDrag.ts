import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../../types/task';
import { isAncestorOrDescendant, wouldCreateDepCycle } from '../../utils/ganttCalc';

// ── リンクドラッグ状態（先行・後続タスク設定） ──────
export interface LinkDragState {
  fromTaskId: string;
  startSvgX: number; startSvgY: number;
  currentX: number;  currentY: number;
  targetTaskId: string | null;
}

type FlatRow = { task: Task; depth: number };
type ParentSpan = { startDate: string | null; endDate: string | null };

interface Params {
  svgRef: { current: SVGSVGElement | null };
  uiRowHeight: number;
  flatRowsRef: { current: FlatRow[] };
  taskByIdRef: { current: Map<string, Task> };
  childCountRef: { current: Map<string, number> };
  parentSpanMapRef: { current: Map<string, ParentSpan> };
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
}

// 依存リンクドラッグ（バー右端コネクタドット→別バーへドロップして先行/後続を設定）の
// 状態・イベントハンドラ（GanttChart から抽出、挙動不変, D4）。
export function useLinkDrag({ svgRef, uiRowHeight, flatRowsRef, taskByIdRef, childCountRef, parentSpanMapRef, onInlineUpdate }: Params) {
  const [linkDragState, setLinkDragState] = useState<LinkDragState | null>(null);
  const linkDragStateRef = useRef<LinkDragState | null>(null);
  useEffect(() => { linkDragStateRef.current = linkDragState; }, [linkDragState]);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);

  function startLinkDrag(e: React.MouseEvent, taskId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - svgRect.left;
    const svgY = e.clientY - svgRect.top;
    setLinkDragState({ fromTaskId: taskId, startSvgX: svgX, startSvgY: svgY, currentX: svgX, currentY: svgY, targetTaskId: null });
  }

  const handleLinkMouseMove = useCallback((e: MouseEvent) => {
    if (!linkDragStateRef.current) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - svgRect.left;
    const svgY = e.clientY - svgRect.top;
    const rowIdx = Math.floor(svgY / uiRowHeight);
    const candidate = flatRowsRef.current[rowIdx];
    const fromId = linkDragStateRef.current.fromTaskId;
    let targetTaskId: string | null = null;
    if (candidate && candidate.task.id !== fromId) {
      const tgt = candidate.task;
      const tbr = taskByIdRef.current;
      // 親タスクは表示スパンの開始日を実効開始日とみなす（DB 日付未設定でも接続可）
      const tgtStart = (childCountRef.current.get(tgt.id) ?? 0) > 0
        ? (parentSpanMapRef.current.get(tgt.id)?.startDate ?? tgt.startDate)
        : tgt.startDate;
      // マイルストーンは後続（終点）にのみ接続可。先行（始点＝コネクタドット）にはなれない（§9.4）
      if (
        tgtStart &&
        !tgt.predecessors.includes(fromId) &&
        !isAncestorOrDescendant(fromId, tgt.id, tbr) &&
        !wouldCreateDepCycle(fromId, tgt.id, tbr)
      ) {
        targetTaskId = tgt.id;
      }
    }
    setLinkDragState(prev => prev ? { ...prev, currentX: svgX, currentY: svgY, targetTaskId } : null);
  }, [uiRowHeight, svgRef, flatRowsRef, taskByIdRef, childCountRef, parentSpanMapRef]);

  const handleLinkMouseUp = useCallback(() => {
    const ld = linkDragStateRef.current;
    if (ld?.targetTaskId && ld.targetTaskId !== ld.fromTaskId) {
      // fromTaskId = 先行タスク（右端ドットからドラッグ開始）、targetTaskId = 後続タスク（ドロップ先）
      // 親子階層チェック + 循環チェック
      if (
        !isAncestorOrDescendant(ld.fromTaskId, ld.targetTaskId, taskByIdRef.current) &&
        !wouldCreateDepCycle(ld.fromTaskId, ld.targetTaskId, taskByIdRef.current)
      ) {
        const target = taskByIdRef.current.get(ld.targetTaskId);
        if (target && !target.predecessors.includes(ld.fromTaskId)) {
          onInlineUpdate(ld.targetTaskId, { predecessors: [...target.predecessors, ld.fromTaskId] });
        }
      }
    }
    setLinkDragState(null);
    setHoveredBarId(null);
  }, [onInlineUpdate, taskByIdRef]);

  const isLinkDragging = linkDragState !== null;
  useEffect(() => {
    if (!isLinkDragging) return;
    window.addEventListener('mousemove', handleLinkMouseMove);
    window.addEventListener('mouseup', handleLinkMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleLinkMouseMove);
      window.removeEventListener('mouseup', handleLinkMouseUp);
    };
  }, [isLinkDragging, handleLinkMouseMove, handleLinkMouseUp]);

  // Escape キーでのキャンセル用（GanttChart 側の共通ハンドラから呼ばれる）
  const cancelLinkDrag = useCallback(() => {
    if (!linkDragStateRef.current) return;
    linkDragStateRef.current = null;
    setLinkDragState(null);
  }, []);

  return { linkDragState, linkDragStateRef, hoveredBarId, setHoveredBarId, startLinkDrag, cancelLinkDrag };
}
