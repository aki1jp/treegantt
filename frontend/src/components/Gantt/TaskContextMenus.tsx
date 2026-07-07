import type { Task } from '../../types/task';
import { ContextMenu, AddChildMenuItem } from './GanttContextMenu';
import { ExpandCollapseButtons } from './ExpandCollapseButtons';
import { isReadonlyTask, isRefGroupId } from '../../utils/refTasks';

// ── 色パレット ───────────────────────────────────────
const COLOR_PALETTE: (string | null)[] = [
  null,
  '#000000', '#6b7280', '#ffffff',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
];

// ── コンテキストメニュー共通スタイル ─────────────────
const MENU_BTN: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 14px', border: 'none',
  background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--th-text2)',
};
const onMenuEnter = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--th-bg2)'; };
const onMenuLeave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'none'; };

export interface TaskCtxMenu { x: number; y: number; taskId: string }
export interface DepCtxMenu { x: number; y: number; fromTaskId: string; toTaskId: string }

interface Props {
  // メニュー状態（GanttChart が保持し、close コールバックで畳む）
  barCtxMenu: TaskCtxMenu | null;
  rowCtxMenu: TaskCtxMenu | null;
  depCtxMenu: DepCtxMenu | null;
  titleHeaderCtxMenu: { x: number; y: number } | null;
  closeBarCtxMenu: () => void;
  closeRowCtxMenu: () => void;
  closeDepCtxMenu: () => void;
  closeTitleHeaderCtxMenu: () => void;
  // データ
  taskById: Map<string, Task>;
  tasks: Task[];
  copiedTask: Task | null;
  setCopiedTask: (task: Task | null) => void;
  // 操作コールバック
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onInlineUpdate: (id: string, patch: Partial<Task>) => void;
  onAddSubTask: (parentId: string) => void;
  onAddSubMilestone?: (parentId: string) => void;
  onCopyInsert: (source: Task, parentId: string | null, afterTaskId: string | null, beforeTaskId?: string | null) => Promise<void>;
  // 展開/折りたたみ
  collapseAll: () => void;
  expandToDepth: (depth: number) => void;
  expandAll: () => void;
  // クロスプロジェクト参照（§5.8）: 参照タスク・合成グループ行の専用メニュー
  currentProjectId?: string;
  onOpenRefProject?: (projectId: string) => void;
  onRemoveRef?: (refTaskId: string) => void;
  onRefreshRefs?: () => void;
}

// バー/行/依存矢印/タイトル列見出しの右クリックメニュー群（GanttChart から抽出、挙動不変, D4）。
export function TaskContextMenus({
  barCtxMenu, rowCtxMenu, depCtxMenu, titleHeaderCtxMenu,
  closeBarCtxMenu, closeRowCtxMenu, closeDepCtxMenu, closeTitleHeaderCtxMenu,
  taskById, tasks, copiedTask, setCopiedTask,
  onEditTask, onDeleteTask, onInlineUpdate, onAddSubTask, onAddSubMilestone, onCopyInsert,
  collapseAll, expandToDepth, expandAll,
  currentProjectId, onOpenRefProject, onRemoveRef, onRefreshRefs,
}: Props) {
  return (
    <>
      {/* コンテキストメニュー（position: fixed なのでどこに置いても動作する） */}
      {[
        barCtxMenu && { menu: barCtxMenu, close: closeBarCtxMenu },
        rowCtxMenu && { menu: rowCtxMenu, close: closeRowCtxMenu },
      ].map((entry, i) => {
        if (!entry) return null;
        const { menu, close } = entry;
        const task = taskById.get(menu.taskId);
        if (!task) return null;

        // ── 参照タスク・合成グループ行: 専用メニュー（§5.8） ──
        const isGroup = isRefGroupId(task.id);
        if (isGroup || isReadonlyTask(task, currentProjectId)) {
          return (
            <ContextMenu key={i} x={menu.x} y={menu.y}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { onOpenRefProject?.(task.projectId); close(); }}
                style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
                参照先プロジェクトを開く
              </button>
              {!isGroup && (
                <button onClick={() => { onRemoveRef?.(task.id); close(); }}
                  style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
                  参照を解除
                </button>
              )}
              <button onClick={() => { onRefreshRefs?.(); close(); }}
                style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
                参照を再読み込み
              </button>
            </ContextMenu>
          );
        }

        return (
          <ContextMenu key={i} x={menu.x} y={menu.y}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {!task.isMilestone && (
              <>
                <AddChildMenuItem
                  onAddTask={() => { onAddSubTask(task.id); close(); }}
                  onAddMilestone={() => { onAddSubMilestone?.(task.id); close(); }}
                />
                <div style={{ height: 1, background: 'var(--th-border)' }} />
              </>
            )}
            <button onClick={() => { onEditTask(task); close(); }}
              style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
              編集（詳細）
            </button>
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            {/* 色パレット */}
            <div style={{ padding: '6px 10px' }}>
              {([
                { label: '文字色', field: 'titleColor' as const },
                { label: '背景色', field: 'titleBgColor' as const },
              ] as { label: string; field: 'titleColor' | 'titleBgColor' }[]).map(({ label, field }) => (
                <div key={field} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--th-text-dim)', marginBottom: 3 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {COLOR_PALETTE.map((c, ci) => (
                      <button
                        key={ci}
                        title={c ?? 'リセット'}
                        aria-label={c ?? 'リセット'}
                        onClick={() => { onInlineUpdate(task.id, { [field]: c }); close(); }}
                        style={{
                          width: 18, height: 18, borderRadius: '50%', border: '1px solid #9ca3af',
                          background: c ?? '#ffffff', cursor: 'pointer', padding: 0, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: '#9ca3af', lineHeight: 1,
                        }}
                      >
                        {c === null ? '✕' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            <button onClick={() => { setCopiedTask(task); close(); }}
              style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
              コピー
            </button>
            {copiedTask && (
              <button onClick={() => { onCopyInsert(copiedTask, task.parentId, null, task.id); close(); }}
                style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
                上に挿入
              </button>
            )}
            <div style={{ height: 1, background: 'var(--th-border)' }} />
            <button onClick={() => { onDeleteTask(task.id); close(); }}
              style={{ ...MENU_BTN, color: '#ef4444' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={onMenuLeave}>
              削除
            </button>
          </ContextMenu>
        );
      })}

      {/* 依存矢印右クリック: 依存を解除 */}
      {depCtxMenu && (
        <ContextMenu x={depCtxMenu.x} y={depCtxMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '4px 14px 2px', fontSize: 11, color: 'var(--th-text-muted)' }}>依存関係</div>
          <button
            onClick={() => {
              const target = taskById.get(depCtxMenu.toTaskId);
              if (target) {
                onInlineUpdate(depCtxMenu.toTaskId, { predecessors: target.predecessors.filter(p => p !== depCtxMenu.fromTaskId) });
              }
              closeDepCtxMenu();
            }}
            style={{ ...MENU_BTN, color: '#ef4444' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={onMenuLeave}
          >
            依存を解除
          </button>
        </ContextMenu>
      )}

      {/* タイトル列ヘッダー右クリック: 全タスク色一括リセット */}
      {titleHeaderCtxMenu && (
        <ContextMenu x={titleHeaderCtxMenu.x} y={titleHeaderCtxMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ padding: '6px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--th-text-dim)', marginBottom: 4 }}>展開 / 折りたたみ</div>
            <ExpandCollapseButtons
              variant="boxed"
              collapseAll={collapseAll}
              expandToDepth={expandToDepth}
              expandAll={expandAll}
              onSelect={(action) => { action(); closeTitleHeaderCtxMenu(); }}
            />
          </div>
          <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
          <button
            onClick={async () => {
              const colored = tasks.filter(t => t.titleColor !== null || t.titleBgColor !== null);
              await Promise.all(colored.map(t => onInlineUpdate(t.id, { titleColor: null, titleBgColor: null })));
              closeTitleHeaderCtxMenu();
            }}
            style={MENU_BTN} onMouseEnter={onMenuEnter} onMouseLeave={onMenuLeave}>
            全タスクの色をリセット
          </button>
        </ContextMenu>
      )}
    </>
  );
}
