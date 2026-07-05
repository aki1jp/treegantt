import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '../../types/task';
import { addDays, xToDateStr } from '../../utils/ganttCalc';

// 作成ドラッグの開始閾値（px）。mousedown 位置からこの距離以上動いて初めて
// 作成対象になる。クリックの手ぶれによる日付の誤作成を防ぐ（§9.4）。
export const CREATE_DRAG_THRESHOLD_PX = 4;

export type DragType = 'move' | 'resize-left' | 'resize-right' | 'create';
export interface DragState {
  taskId: string;
  type: DragType;
  startClientX: number;
  origStart: string;
  origEnd: string;
  anchorRelX?: number;  // create ドラッグ用：クリック時の絶対 relX
}
export interface DragPreview {
  taskId: string;
  startDate: string;
  endDate: string;
}

interface Params {
  dayWidth: number;
  min: Date;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  childCountRef: { current: Map<string, number> };
  taskByIdRef: { current: Map<string, Task> };
  linkDragStateRef: { current: unknown | null };
  ganttPanelRef: { current: HTMLDivElement | null };
}

// バー移動・左右リサイズ・作成ドラッグの状態・イベントハンドラ（GanttChart から抽出、挙動不変, D4）。
export function useBarDrag({ dayWidth, min, onInlineUpdate, childCountRef, taskByIdRef, linkDragStateRef, ganttPanelRef }: Params) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const dragStateRef  = useRef<DragState | null>(null);
  // 作成ドラッグが開始閾値（CREATE_DRAG_THRESHOLD_PX）を超えたか。超えるまでプレビューを作らない。
  const createArmedRef = useRef(false);

  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);
  useEffect(() => { dragStateRef.current  = dragState;   }, [dragState]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const delta = Math.round((e.clientX - dragState.startClientX) / dayWidth);
    let newStart = dragState.origStart;
    let newEnd   = dragState.origEnd;

    if (dragState.type === 'move') {
      newStart = addDays(dragState.origStart, delta);
      newEnd   = addDays(dragState.origEnd,   delta);
    } else if (dragState.type === 'resize-right') {
      newEnd = addDays(dragState.origEnd, delta);
      if (newEnd < newStart) newEnd = newStart;
    } else if (dragState.type === 'resize-left') {
      newStart = addDays(dragState.origStart, delta);
      if (newStart > newEnd) newStart = newEnd;
    } else if (dragState.type === 'create') {
      // 開始閾値を超えるまではプレビューを作らない（クリックの手ぶれによる誤作成防止）。
      // 一度超えたら以降は閾値内に戻っても追従する（スティッキー）。
      if (!createArmedRef.current && Math.abs(e.clientX - dragState.startClientX) < CREATE_DRAG_THRESHOLD_PX) return;
      createArmedRef.current = true;
      const cursorRelX = Math.max(0, (dragState.anchorRelX ?? 0) + (e.clientX - dragState.startClientX));
      const currentDate = xToDateStr(cursorRelX, min, dayWidth);
      newStart = currentDate <= dragState.origStart ? currentDate : dragState.origStart;
      newEnd   = currentDate >= dragState.origStart ? currentDate : dragState.origStart;
    }

    setDragPreview({ taskId: dragState.taskId, startDate: newStart, endDate: newEnd });
  }, [dragState, dayWidth, min]);

  const handleMouseUp = useCallback(() => {
    const preview = dragPreviewRef.current;
    if (dragState) {
      if (dragState.type === 'create') {
        if (preview) {
          onInlineUpdate(preview.taskId, { startDate: preview.startDate, endDate: preview.endDate });
        }
      } else if (preview && (preview.startDate !== dragState.origStart || preview.endDate !== dragState.origEnd)) {
        // 移動・リサイズ（通常バーのみ。マイルストーン/親はドラッグ入口を持たない）
        onInlineUpdate(preview.taskId, { startDate: preview.startDate, endDate: preview.endDate });
      }
    }
    createArmedRef.current = false;
    setDragState(null);
    setDragPreview(null);
  }, [dragState, onInlineUpdate]);

  useEffect(() => {
    if (!dragState) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  const startDrag = useCallback((e: React.MouseEvent, taskId: string, type: DragType) => {
    if (e.button !== 0) return;
    if (linkDragStateRef.current) return; // リンクドラッグ中は move/resize を無効化
    if ((childCountRef.current.get(taskId) ?? 0) > 0) return; // 親バーは移動・リサイズ不可
    e.preventDefault();
    const task = taskByIdRef.current.get(taskId);
    if (!task?.startDate) return;
    setDragState({
      taskId, type,
      startClientX: e.clientX,
      origStart: task.startDate,
      origEnd: task.endDate ?? task.startDate,
    });
  }, [linkDragStateRef, childCountRef, taskByIdRef]);
  const handleBarMoveStart        = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'move'),         [startDrag]);
  const handleBarResizeLeftStart  = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'resize-left'),  [startDrag]);
  const handleBarResizeRightStart = useCallback((e: React.MouseEvent, id: string) => startDrag(e, id, 'resize-right'), [startDrag]);

  function startCreateDrag(e: React.MouseEvent, taskId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    const scrollLeft = ganttPanelRef.current?.scrollLeft ?? 0;
    const panelRect  = ganttPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;
    const relX = e.clientX - panelRect.left + scrollLeft;
    const anchorDate = xToDateStr(relX, min, dayWidth);
    createArmedRef.current = false; // 閾値判定をリセット
    setDragState({ taskId, type: 'create', startClientX: e.clientX, anchorRelX: relX, origStart: anchorDate, origEnd: anchorDate });
  }

  // Escape キーでのキャンセル用（GanttChart 側の共通ハンドラから呼ばれる）
  const cancelDrag = useCallback(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    createArmedRef.current = false;
    setDragState(null);
    setDragPreview(null);
  }, []);

  return {
    dragState, dragPreview, dragStateRef,
    handleBarMoveStart, handleBarResizeLeftStart, handleBarResizeRightStart,
    startCreateDrag, cancelDrag,
  };
}
