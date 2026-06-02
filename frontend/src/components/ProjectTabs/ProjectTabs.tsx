import { useState, useEffect } from 'react';
import { ContextMenu } from '../Gantt/GanttContextMenu';
import type { Project } from '../../types/task';

interface Props {
  projects: Project[];
  currentProject: Project | null;
  onSelect: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectTabs({ projects, currentProject, onSelect, onDelete }: Props) {
  const [tabMenu, setTabMenu] = useState<{ project: Project; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [tabMenu]);

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {projects.map(p => (
          <div key={p.id} style={{
            borderRadius: 4,
            background: currentProject?.id === p.id ? '#4f46e5' : 'transparent',
          }}>
            <button
              onClick={() => onSelect(p)}
              onContextMenu={e => {
                e.preventDefault();
                setTabMenu({ project: p, x: e.clientX, y: e.clientY });
              }}
              style={{
                padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 13,
                background: 'transparent', color: '#fff', borderRadius: 4,
              }}
            >
              {p.name}
            </button>
          </div>
        ))}
      </div>

      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onDelete(tabMenu.project); setTabMenu(null); }}
            style={{
              display: 'block', width: '100%', padding: '8px 16px', border: 'none',
              background: 'transparent', color: '#ef4444', cursor: 'pointer',
              textAlign: 'left', fontSize: 13,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            削除
          </button>
        </ContextMenu>
      )}
    </>
  );
}
