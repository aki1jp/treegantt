import { useRef, useState } from 'react';
import type { Task } from '../../types/task';
import { textStartX, INDENT } from '../../utils/wbsLayout';
import { isReadonlyTask } from '../../utils/refTasks';
import { buildTree, flattenTree } from '../../utils/taskTree';

type FlatRow = { task: Task; depth: number };
type ReorderOrders = { id: string; order: number; parentId?: string | null }[];

interface Params {
  flatRows: FlatRow[];
  /**
   * フィルタ・折りたたみ前の全タスク（`GanttChart` の `displayTasks` 相当）。
   * order の採番はここから「真の全兄弟集合」を求めて行う（flatRows＝可視行だけを
   * 対象にすると、非表示の兄弟の order が古いまま取り残されて表示順と矛盾する不具合になる）。
   */
  allTasks: Task[];
  onReorder: (orders: ReorderOrders) => Promise<void>;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
  /** クロスプロジェクト参照（§5.8）: 参照タスク・合成グループ行はドラッグ開始・ドロップ先の両方から除外する */
  currentProjectId?: string;
  /**
   * WBS パネル左端から title 列までの実測オフセット（列レイアウトの導出, §9.2）。
   * 列の表示 ON/OFF・リサイズに追従させるため呼び出し側（GanttChart）から受け取る。
   * 省略時は既定の「行」+「#」列ぶん（72px）にフォールバックする（同階層 sibling 間の
   * クランプなど X 座標に依存しないテスト・呼び出し向け）。
   */
  titleLeadingWidth?: number;
}

// WBS 行の並び替え・親子変更・Ctrl/Cmd コピー（GanttChart から抽出、挙動不変, D4）。
// wbsPanelRef はドラッグ時の X 座標から depth インジケーターを算出するために内部で保持し、
// 呼び出し側は WBS パネル div に ref として渡す。
export function useRowDnd({ flatRows, allTasks, onReorder, onCopyInsert, currentProjectId, titleLeadingWidth = 72 }: Params) {
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
      depth = Math.min(Math.max(0, Math.floor((mouseX - textStartX(0, titleLeadingWidth)) / INDENT)), maxDepth);
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
      // 対象親の「真の全子」（折りたたみ・フィルタで非表示の子も含む）から最大 order を取る。
      // flatRows（可視行）だけを見ると非表示の子の order を見落とし、後で表示順と矛盾しうる。
      const siblings = allTasks.filter(t => t.parentId === rowDropTarget);
      const maxSibOrder = siblings.length > 0
        ? Math.max(...siblings.map(t => t.order))
        : 0;
      if (isDragCopyRef.current) {
        void onCopyInsert(moved, rowDropTarget, null);
      } else {
        void onReorder([{ id: moved.id, order: maxSibOrder + 1, parentId: rowDropTarget }]);
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
        void onCopyInsert(moved, newParentId, copyAfterId);
      } else {
        // 上に兄弟がいない＝先頭へのドロップ: 先頭兄弟の前に挿入
        const firstSibling = flatRows.find(r => r.task.parentId === newParentId);
        void onCopyInsert(moved, newParentId, null, firstSibling?.task.id ?? null);
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

    // 可視リスト上での新しい直前/直後の隣接行を特定し、それを「真の全兄弟」を含む
    // フルリスト（全展開・フィルタなし＝行番号列と同じ基準, taskTree.ts の
    // buildRowNumberMap 相当）上での挿入位置に変換する。可視行だけを対象に連番を
    // 振り直すと、折りたたみ・フィルタで非表示の兄弟の order が古いまま取り残され、
    // 表示条件が変わった際に相対順序が矛盾する不具合になるため。
    const movedIdxInNewRows = newRows.findIndex(t => t.id === moved.id);
    const aboveNeighborId = movedIdxInNewRows > 0 ? newRows[movedIdxInNewRows - 1].id : null;
    const belowNeighborId =
      movedIdxInNewRows < newRows.length - 1 ? newRows[movedIdxInNewRows + 1].id : null;

    const fullSorted = [...allTasks].sort((a, b) => a.order - b.order);
    const { roots: fullRoots } = buildTree(fullSorted);
    const fullFlat = flattenTree(fullRoots, new Set()).map(r => r.task);
    const fullWithoutMoved = fullFlat.filter(t => t.id !== moved.id);
    let fullInsertAt = fullWithoutMoved.length;
    if (aboveNeighborId) {
      const i = fullWithoutMoved.findIndex(t => t.id === aboveNeighborId);
      fullInsertAt = i === -1 ? fullWithoutMoved.length : i + 1;
    } else if (belowNeighborId) {
      const i = fullWithoutMoved.findIndex(t => t.id === belowNeighborId);
      fullInsertAt = i === -1 ? 0 : i;
    } else {
      fullInsertAt = 0;
    }
    fullWithoutMoved.splice(fullInsertAt, 0, moved);

    // 参照タスク・合成グループ行（読み取り専用, §5.8）は reorder ペイロードから除外する。
    // これらは他プロジェクト所属／実在しない合成行のため、そのまま送ると
    // reorder API のプロジェクト境界検証に失敗する。
    const orders = fullWithoutMoved
      .filter(t => !isReadonlyTask(t, currentProjectId))
      .map((t, i) => ({
        id: t.id, order: i + 1,
        ...(t.id === moved.id && parentIdChanged ? { parentId: newParentId } : {}),
      }));
    void onReorder(orders);
    clearDrop();
  }

  return {
    wbsPanelRef,
    rowDragId, rowDropIdx, rowDropDepth, rowDropTarget,
    copiedTask, setCopiedTask,
    clearDrop, handleRowDragStart, handleRowDragOver, handleRowDrop,
  };
}
