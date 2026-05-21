import { useState } from 'react';
import type { Task } from '../../types/task';
import { TaskRow } from './TaskRow';
import { useTaskStore } from '../../store/taskStore';
import { sortAndFilter } from '../../utils/sort';

interface Props {
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
}

interface TreeNode {
  task: Task;
  depth: number;
  children: TreeNode[];
}

function buildTree(tasks: Task[]): { nodes: TreeNode[]; childCount: Map<string, number> } {
  const childCount = new Map<string, number>();
  const nodeMap = new Map<string, TreeNode>();

  for (const task of tasks) {
    nodeMap.set(task.id, { task, depth: 0, children: [] });
    if (task.parentId) {
      childCount.set(task.parentId, (childCount.get(task.parentId) ?? 0) + 1);
    }
  }

  const roots: TreeNode[] = [];
  for (const task of tasks) {
    const node = nodeMap.get(task.id)!;
    if (task.parentId && nodeMap.has(task.parentId)) {
      const parent = nodeMap.get(task.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { nodes: roots, childCount };
}

function flattenTree(nodes: TreeNode[], collapsed: Set<string>): { task: Task; depth: number }[] {
  const result: { task: Task; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ task: node.task, depth: node.depth });
    if (!collapsed.has(node.task.id) && node.children.length > 0) {
      result.push(...flattenTree(node.children, collapsed));
    }
  }
  return result;
}

const SORT_HEADERS: { key: keyof Task | ''; label: string; width?: string }[] = [
  { key: 'title',     label: 'タイトル',   width: '30%' },
  { key: 'status',    label: 'ステータス', width: '10%' },
  { key: 'priority',  label: '優先度',     width: '8%'  },
  { key: 'progress',  label: '進捗',       width: '12%' },
  { key: 'assignee',  label: '担当者',     width: '12%' },
  { key: 'startDate', label: '開始日',     width: '10%' },
  { key: 'endDate',   label: '終了日',     width: '10%' },
  { key: '',          label: '',           width: '8%'  },
];

const TH: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
  color: '#6b7280', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', userSelect: 'none',
};

export function TodoList({ onEditTask, onDeleteTask, onInlineUpdate }: Props) {
  const { tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority, setSortKey } = useTaskStore();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sorted = sortAndFilter(tasks, sortKey, sortDir, filterStatus, filterAssignee, filterPriority);
  const { nodes: treeRoots, childCount } = buildTree(sorted);
  const flat = flattenTree(treeRoots, collapsed);

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {SORT_HEADERS.map((h, i) => <col key={i} style={{ width: h.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {SORT_HEADERS.map(({ key, label }) => (
              <th key={key} style={{ ...TH, cursor: key ? 'pointer' : 'default' }}
                onClick={() => key && setSortKey(key)}>
                {label}{sortKey === key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flat.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                タスクがありません
              </td>
            </tr>
          ) : (
            flat.map(({ task, depth }) => (
              <TaskRow
                key={task.id}
                task={task}
                depth={depth}
                hasChildren={(childCount.get(task.id) ?? 0) > 0}
                isCollapsed={collapsed.has(task.id)}
                onToggleCollapse={() => toggleCollapse(task.id)}
                onInlineUpdate={onInlineUpdate}
                onOpenModal={() => onEditTask(task)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
