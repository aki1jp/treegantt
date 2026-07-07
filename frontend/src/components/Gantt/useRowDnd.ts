import { useRef, useState } from 'react';
import type { Task } from '../../types/task';
import { textStartX, INDENT } from '../../utils/wbsLayout';
import { isReadonlyTask } from '../../utils/refTasks';

type FlatRow = { task: Task; depth: number };
type ReorderOrders = { id: string; order: number; parentId?: string | null }[];

interface Params {
  flatRows: FlatRow[];
  onReorder: (orders: ReorderOrders) => Promise<void>;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
  /** クロスプロジェクト参照（§5.8）: 参照タスク・合成グループ行はドラッグ開始・ドロップ先の両方から除外する */
  currentProjectId?: string;
}

// WBS 行の並び替え・親子変更・Ctrl/Cmd コピー（GanttChart から抽出、挙動不変, D4）。
// wbsPanelRef はドラッグ時の X 座標から depth インジケーターを算出するために内部で保持し、
// 呼び出し側は WBS パネル div に ref として渡す。
export function useRowDnd({ flatRows, onReorder, onCopyInsert, currentProjectId }: Params) {
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
    // 参照タスク・合成グループ行（読み取り専用, §5.8）はドラッグ開始できない
    const task = flatRows.find(r => r.task.id === taskId)?.task;
    if (task && isReadonlyTask(task, currentProjectId)) {
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
    const candidateReadonly = !!candidate && isReadonlyTask(candidate.task, currentProjectId);
    if (isAdoptZone && candidate?.task.id !== rowDragId && !candidate?.task.isMilestone && !candidateReadonly) {
      setRowDropTarget(candidate.task.id);
      setRowDropIdx(null);
      setRowDropDepth(null);
      return;
    }

    // ── バー挿入モード ──
    setRowDropTarget(null);
    const rowAbove = idx > 0 ? flatRows[idx - 1] : null;
    const rowBelow = flatRows[idx];

    // 挿入位置の前後が両方とも読み取り専用（参照セクション内部）なら挿入先として認めない。
    // 前が自プロジェクトのタスク（境目＝参照セクション直前への挿入）は許可する。
    const aboveReadonly = !rowAbove || isReadonlyTask(rowAbove.task, currentProjectId);
    const belowReadonly = !rowBelow || isReadonlyTask(rowBelow.task, currentProjectId);
    if (aboveReadonly && belowReadonly) {
      setRowDropIdx(null);
      setRowDropDepth(null);
      return;
    }

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

    // 挿入位置の前後が両方とも読み取り専用（参照セクション内部）なら不可。
    // rowDropDepth の null は handleRowDragOver 側の視覚状態のみに作用し `?? 0` で
    // 既定値へフォールバックしてしまうため、実際のドロップ実行時にも dropIdx から
    // 直接再判定する（状態経由のガードだけでは防げない, §5.8）。
    {
      const rowAbove = dropIdx > 0 ? flatRows[dropIdx - 1] : null;
      const rowBelow = flatRows[dropIdx] ?? null;
      const aboveReadonly = !rowAbove || isReadonlyTask(rowAbove.task, currentProjectId);
      const belowReadonly = !rowBelow || isReadonlyTask(rowBelow.task, currentProjectId);
      if (aboveReadonly && belowReadonly) { clearDrop(); return; }
    }

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

    // 参照タスク・合成グループ行（読み取り専用, §5.8）は reorder ペイロードから除外する。
    // これらは他プロジェクト所属／実在しない合成行のため、そのまま送ると
    // reorder API のプロジェクト境界検証に失敗する。除外後に order を採番し直す
    // （常に自プロジェクトのタスクのみを対象にした従来の挙動と同じ連番になる）。
    const orders = newRows
      .filter(t => !isReadonlyTask(t, currentProjectId))
      .map((t, i) => ({
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
