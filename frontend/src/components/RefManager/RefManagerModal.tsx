import type { Project, Task, TaskRef, RefProject } from '../../types/task';
import { AddRefFlow } from './AddRefFlow';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  projects: Project[];
  currentProjectId: string;
  refs: TaskRef[];
  refTasks: Task[];
  refProjects: RefProject[];
  onAdd: (refTaskId: string) => Promise<void>;
  onRemove: (refTaskId: string) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}

const BTN: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--th-input-border)', borderRadius: 4,
  background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer', fontSize: 12,
};

// 参照管理モーダル（ツールバー「🔗 参照」・コンテキストメニュー「🔗 参照を追加」の共通入口, §5.8）。
// 現参照の一覧・解除・再読み込み・追加フロー（AddRefFlow）を提供する。
export function RefManagerModal({
  projects, currentProjectId, refs, refTasks, refProjects, onAdd, onRemove, onRefresh, onClose,
}: Props) {
  const { t } = useTranslation();
  const otherProjects = projects.filter(p => p.id !== currentProjectId);
  const taskById = new Map(refTasks.map(t => [t.id, t]));
  const projectById = new Map(refProjects.map(p => [p.id, p]));

  return (
    <div onMouseDown={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onMouseDown={e => e.stopPropagation()} style={{
        background: 'var(--th-bg)', color: 'var(--th-text)', borderRadius: 8,
        padding: 20, width: 420, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('refManager.heading')}</div>
          <button aria-label={t('contextMenu.refreshRefs')} title={t('contextMenu.refreshRefs')} onClick={onRefresh} style={{ ...BTN, padding: '3px 8px' }}>
            🔄
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' }}>{t('refManager.currentRefsLabel')}</div>
          {refs.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--th-text-muted)' }}>{t('refManager.noRefs')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {refs.map(r => {
                const task = taskById.get(r.refTaskId);
                const project = task ? projectById.get(task.projectId) : undefined;
                return (
                  <div key={r.refTaskId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '4px 8px', border: '1px solid var(--th-border)', borderRadius: 4,
                    fontSize: 13,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔗 {project?.name ?? '?'} #{task?.seq ?? '?'} {task?.title ?? r.refTaskId}
                    </span>
                    <button onClick={() => onRemove(r.refTaskId)} style={{ ...BTN, flexShrink: 0, padding: '3px 8px', fontSize: 11 }}>
                      {t('refManager.removeButton')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--th-text-dim)' }}>
            {t('refManager.removeNote')}
          </p>
        </div>

        <div style={{ height: 1, background: 'var(--th-border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' }}>{t('refManager.addSectionLabel')}</div>
          <AddRefFlow projects={otherProjects} onAdd={onAdd} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
