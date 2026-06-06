import { useState, useEffect } from 'react';
import { ContextMenu } from '../Gantt/GanttContextMenu';
import type { Project } from '../../types/task';

const COLOR_PRESETS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

const BTN_BASE: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 16px', border: 'none',
  background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13,
};

interface Props {
  projects: Project[];
  currentProject: Project | null;
  onSelect: (project: Project) => void;
  onDelete: (project: Project) => void;
  onRename: (project: Project) => void;
  onUpdateColor?: (project: Project, color: string | null) => void;
  taskCounts?: Record<string, number>;
}

export function ProjectTabs({ projects, currentProject, onSelect, onDelete, onRename, onUpdateColor, taskCounts }: Props) {
  const [tabMenu, setTabMenu] = useState<{ project: Project; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [tabMenu]);

  return (
    <>
      <div style={{ display: 'flex', gap: 4 }}>
        {projects.map(p => {
          const isActive = currentProject?.id === p.id;
          const isHover  = hover === p.id && !isActive;
          return (
            <div
              key={p.id}
              style={{
                borderRadius: 4,
                background: isActive
                  ? 'rgba(255,255,255,0.15)'
                  : isHover ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              {/* カラーバー（Plan C） */}
              {p.color && (
                <div
                  data-color-bar
                  style={{ width: 4, alignSelf: 'stretch', background: p.color, flexShrink: 0 }}
                />
              )}
              <button
                title={p.name}
                onClick={() => onSelect(p)}
                onContextMenu={e => {
                  e.preventDefault();
                  setTabMenu({ project: p, x: e.clientX, y: e.clientY });
                }}
                onMouseEnter={() => setHover(p.id)}
                onMouseLeave={() => setHover(null)}
                style={{
                  padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 13,
                  background: 'transparent', color: '#fff', borderRadius: 4,
                  fontWeight: isActive ? 700 : 400,
                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {/* タスク件数バッジ（Plan B） */}
                {taskCounts !== undefined && (
                  <span style={{
                    fontSize: 10, lineHeight: '14px', padding: '0 5px',
                    background: 'rgba(255,255,255,0.25)', borderRadius: 8,
                    flexShrink: 0,
                  }}>
                    {taskCounts[p.id] ?? 0}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onRename(tabMenu.project); setTabMenu(null); }}
            style={{ ...BTN_BASE, color: 'var(--th-text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            名前を変更
          </button>

          {/* 色を変更（Plan C） */}
          {onUpdateColor && (
            <>
              <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
              <div style={{ padding: '6px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--th-text-dim)', marginBottom: 4 }}>色を変更</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      title={c}
                      onClick={() => { onUpdateColor(tabMenu.project, c); setTabMenu(null); }}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', border: tabMenu.project.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                        background: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                      }}
                    />
                  ))}
                  <button
                    title="なし"
                    onClick={() => { onUpdateColor(tabMenu.project, null); setTabMenu(null); }}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: '1px solid #9ca3af',
                      background: 'linear-gradient(to top right, #fff 43%, #9ca3af 43%, #9ca3af 57%, #fff 57%)',
                      cursor: 'pointer', padding: 0, flexShrink: 0,
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
          <button
            onClick={() => { onDelete(tabMenu.project); setTabMenu(null); }}
            style={{ ...BTN_BASE, color: '#ef4444' }}
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
