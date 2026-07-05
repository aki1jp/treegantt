import { useRef, useState } from 'react';
import type { Task } from '../../types/task';
import { textStartX, INDENT } from '../../utils/wbsLayout';

type FlatRow = { task: Task; depth: number };
type ReorderOrders = { id: string; order: number; parentId?: string | null }[];

interface Params {
  flatRows: FlatRow[];
  onReorder: (orders: ReorderOrders) => Promise<void>;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
}

// WBS 行の並び替え・親子変更・Ctrl/Cmd コピー（GanttChart から抽出、挙動不変, D4）。
// wbsPanelRef はドラッグ時の X 座標から depth インジケーターを算出するために内部で保持し、
// 呼び出し側は WBS パネル div に ref として渡す。
export function useRowDnd({ flatRows, onReorder, onCopyInsert }: Params) {
  const wbsPanelRef = useRef<HTMLDivElement>(null);
  const [rowDragId,    setRowDragId]    = useState<string | null>(null);
  const [rowDropIdx,   setRowDropIdx]   = useState<number | null>(null);
  const [rowDropDepth, setRowDropDepth] = useState<number | null>(null);
  const [rowDropTarget, setRowDropTarget] = useState<string | null>(null);
  const isDragCopyRef = useRef(false);
  const [copiedTask,   setCopiedTask]   = useState<Task | null>(null);

  function clearDrop() {
    setRowDragId(null);
    setRowDropIdx(null);
    setRowDropDepth(null);
    setRowDropTarget(null);
    isDragCopyRef.current = false;
  }

  function handleRowDragStart(e: React.DragEvent, taskId: string) {
    const tag = document.activeElement?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      e.preventDefault();
      return;
    }
    // 'all' を明示設定しないと Chrome が 'uninitialized' を 'none' 扱いし早期 dragEnd を発火する
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'all';
    setRowDragId(taskId);
  }

  function handleRowDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const isCopy = e.ctrlKey || e.metaKey;
    isDragCopyRef.current = isCopy;
    if (e.dataTransfer) e.dataTransfer.dropEffect = isCopy ? 'copy' : 'move';

    // ── Y位置で子採用ゾーンか判定（行の下端70%）──
    const rowRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const relY = e.clientY - rowRect.top;
    const isAdoptZone = rowRect.height > 0 && relY / rowRect.height > 0.3;

    const candidate = flatRows[idx];
    if (isAdoptZone && candidate?.task.id !== rowDragId && !candidate?.task.isMilestone) {
      setRowDropTarget(candidate.task.id);
      setRowDropIdx(null);
      setRowDropDepth(null);
      return;
    }

    // ── バー挿入モード ──
    setRowDropTarget(null);
    const rowAbove = idx > 0 ? flatRows[idx - 1] : null;
    const rowBelow = flatRows[idx];

    let depth: number;
    if (!rowAbove || rowAbove.depth === rowBelow.depth) {
      // 同階層同士: 深さ固定（X軸不要）
      depth = rowBelow.depth;
    } else {
      // 親子の境目: X軸で深さを選択
      const panelLeft = wbsPanelRef.current?.getBoundingClientRect().left ?? 0;
      const mouseX = e.clientX - panelLeft;
      const maxDepth = rowBelow.depth <= rowAbove.depth ? rowAbove.depth : rowAbove.depth + 1;
      depth = Math.min(Math.max(0, Math.floor((mouseX - textStartX(0)) / INDENT)), maxDepth);
    }

    setRowDropIdx(idx);
    setRowDropDepth(depth);
  }

  function handleRowDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    if (!rowDragId) return;
    const dragIdx = flatRows.findIndex(r => r.task.id === rowDragId);
    if (dragIdx === -1) { clearDrop(); return; }

    // ── 共通: parentId 計算 ──
    const moved = flatRows[dragIdx].task;
    const d = rowDropDepth ?? 0;
    const targetParentId: string | null = (() => {
      if (d === 0) return null;
      for (let i = dropIdx - 1; i >= 0; i--) {
        if (flatRows[i].task.id === rowDragId) continue;
        if (flatRows[i].depth === d - 1) return flatRows[i].task.id;
        if (flatRows[i].depth < d - 1) break;
      }
      return null;
    })();

    // ── 子採用モード ──
    if (rowDropTarget) {
      const siblings = flatRows.filter(r => r.task.parentId === rowDropTarget);
      const maxSibOrder = siblings.length > 0
        ? Math.max(...siblings.map(r => r.task.order))
        : 0;
      if (isDragCopyRef.current) {
        onCopyInsert(moved, rowDropTarget, null);
      } else {
        onReorder([{ id: moved.id, order: maxSibOrder + 1, parentId: rowDropTarget }]);
      }
      clearDrop();
      return;
    }

    // ── バー挿入モード ──
    if (dragIdx === dropIdx) { clearDrop(); return; }

    const newParentId: string | null =
      moved.isMilestone || targetParentId === moved.id ? moved.parentId : targetParentId;

    if (isDragCopyRef.current) {
      // コピーはソース行が残るため移動用の dragIdx 補正を使わない。
      // ドロップ位置から上方向に走査し、同一親の直上の兄弟を afterTaskId とする
      // （直上のフラット行は別タスクの子孫でありうるため不可）
      let copyAfterId: string | null = null;
      for (let i = dropIdx - 1; i >= 0; i--) {
        if (flatRows[i].task.parentId === newParentId) { copyAfterId = flatRows[i].task.id; break; }
      }
      if (copyAfterId) {
        onCopyInsert(moved, newParentId, copyAfterId);
      } else {
        // 上に兄弟がいない＝先頭へのドロップ: 先頭兄弟の前に挿入
        const firstSibling = flatRows.find(r => r.task.parentId === newParentId);
        onCopyInsert(moved, newParentId, null, firstSibling?.task.id ?? null);
      }
      clearDrop();
      return;
    }

    const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
    const parentIdChanged = newParentId !== moved.parentId;
    const newRows = [...flatRows.map(r => r.task)];
    const [removed] = newRows.splice(dragIdx, 1);
    newRows.splice(insertAt, 0, removed);

    if (insertAt === dragIdx && !parentIdChanged) { clearDrop(); return; }

    const orders = newRows.map((t, i) => ({
      id: t.id, order: i + 1,
      ...(t.id === moved.id && parentIdChanged ? { parentId: newParentId } : {}),
    }));
    onReorder(orders);
    clearDrop();
  }

  return {
    wbsPanelRef,
    rowDragId, rowDropIdx, rowDropDepth, rowDropTarget,
    copiedTask, setCopiedTask,
    clearDrop, handleRowDragStart, handleRowDragOver, handleRowDrop,
  };
}
