import { useState, useEffect, useRef, useMemo } from 'react';
import { ContextMenu } from '../Gantt/GanttContextMenu';
import type { Project } from '../../types/task';

const LS_ORDER_KEY = 'treegantt-project-order';
const DROPDOWN_BTN_W = 84;
const GAP = 4;

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

function estimateTabWidth(name: string): number {
  return Math.min(160, name.length * 8) + 48;
}

export function ProjectTabs({ projects, currentProject, onSelect, onDelete, onRename, onUpdateColor, taskCounts }: Props) {
  const [order, setOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER_KEY) ?? '[]'); }
    catch { return []; }
  });
  const [dragId, setDragId]           = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(9999);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ project: Project; x: number; y: number } | null>(null);
  const [hover, setHover]     = useState<string | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLDivElement>(null);

  // コンテキストメニューを外側クリックで閉じる
  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [tabMenu]);

  // オーバーフロードロップダウンを外側クリックで閉じる
  useEffect(() => {
    if (!overflowOpen) return;
    const close = () => setOverflowOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [overflowOpen]);

  // ResizeObserver でコンテナ幅を監視
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // localStorage の順序を適用したプロジェクト配列
  const sortedProjects = useMemo(() => {
    const inOrder = order
      .map(id => projects.find(p => p.id === id))
      .filter(Boolean) as Project[];
    const rest = projects.filter(p => !order.includes(p.id));
    return [...inOrder, ...rest];
  }, [projects, order]);

  // 幅推定によって visible / overflow に分割
  const { visibleProjects, overflowProjects } = useMemo(() => {
    let acc = 0;
    for (let i = 0; i < sortedProjects.length; i++) {
      const w      = estimateTabWidth(sortedProjects[i].name);
      const gap    = i > 0 ? GAP : 0;
      const isLast = i === sortedProjects.length - 1;
      const reserve = isLast ? 0 : DROPDOWN_BTN_W + GAP;
      if (acc + gap + w + reserve > containerWidth) {
        return {
          visibleProjects:  sortedProjects.slice(0, i),
          overflowProjects: sortedProjects.slice(i),
        };
      }
      acc += gap + w;
    }
    return { visibleProjects: sortedProjects, overflowProjects: [] };
  }, [sortedProjects, containerWidth]);

  function saveOrder(newOrder: string[]) {
    setOrder(newOrder);
    localStorage.setItem(LS_ORDER_KEY, JSON.stringify(newOrder));
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const isLeftHalf = e.clientX < rect.left + rect.width / 2;
    if (isLeftHalf) {
      setDropBeforeId(id);
    } else {
      const idx  = sortedProjects.findIndex(p => p.id === id);
      const next = sortedProjects[idx + 1]?.id ?? null;
      setDropBeforeId(next);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!dragId) return;
    const ids     = sortedProjects.map(p => p.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx   = dropBeforeId !== null ? ids.indexOf(dropBeforeId) : ids.length;
    if (fromIdx === -1) { setDragId(null); setDropBeforeId(null); return; }

    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    const insertAt = Math.max(0, Math.min(toIdx > fromIdx ? toIdx - 1 : toIdx, newIds.length));
    newIds.splice(insertAt, 0, dragId);

    saveOrder(newIds);
    setDragId(null);
    setDropBeforeId(null);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropBeforeId(null);
  }

  const activeInOverflow = overflowProjects.some(p => p.id === currentProject?.id);

  function renderTab(p: Project) {
    const isActive     = currentProject?.id === p.id;
    const isHover      = hover === p.id && !isActive;
    const isDragging   = dragId === p.id;
    const isDropTarget = dropBeforeId === p.id;

    return (
      <div
        key={p.id}
        draggable
        onDragStart={e => handleDragStart(e, p.id)}
        onDragOver={e => handleDragOver(e, p.id)}
        onDrop={e => { e.stopPropagation(); handleDrop(e); }}
        onDragEnd={handleDragEnd}
        style={{
          position: 'relative', borderRadius: 4, flexShrink: 0,
          opacity: isDragging ? 0.4 : 1,
          background: p.color
            ? isActive
              ? `linear-gradient(rgba(255,255,255,0.2),rgba(255,255,255,0.2)),${p.color}`
              : isHover
                ? `linear-gradient(rgba(255,255,255,0.12),rgba(255,255,255,0.12)),${p.color}`
                : p.color
            : isActive
              ? 'rgba(255,255,255,0.15)'
              : isHover ? 'rgba(255,255,255,0.08)' : 'transparent',
          borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
          display: 'flex', alignItems: 'center', overflow: 'hidden',
        }}
      >
        {isDropTarget && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 2, background: '#fff', borderRadius: 1, zIndex: 1,
          }} />
        )}
        <button
          title={p.name}
          onClick={() => onSelect(p)}
          onContextMenu={e => { e.preventDefault(); setTabMenu({ project: p, x: e.clientX, y: e.clientY }); }}
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
          {taskCounts !== undefined && (
            <span style={{
              fontSize: 10, lineHeight: '14px', padding: '0 5px',
              background: 'rgba(255,255,255,0.25)', borderRadius: 8, flexShrink: 0,
            }}>
              {taskCounts[p.id] ?? 0}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* 可視タブ + ドロップダウンボタン */}
      <div
        ref={containerRef}
        style={{ display: 'flex', gap: GAP, flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}
        onDragOver={e => { if (dragId) { e.preventDefault(); setDropBeforeId(null); } }}
        onDrop={handleDrop}
      >
        {visibleProjects.map(p => renderTab(p))}

        {overflowProjects.length > 0 && (
          <div ref={overflowBtnRef} style={{ flexShrink: 0 }}>
            <button
              data-testid="overflow-btn"
              onClick={() => setOverflowOpen(v => !v)}
              style={{
                padding: '4px 8px', border: 'none', cursor: 'pointer', fontSize: 12,
                background: activeInOverflow ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: '#fff', borderRadius: 4, whiteSpace: 'nowrap',
                borderBottom: activeInOverflow ? '2px solid #fff' : '2px solid transparent',
                fontWeight: activeInOverflow ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {activeInOverflow
                ? <><span>{currentProject!.name}</span><span style={{ opacity: 0.7 }}>▾</span></>
                : <span>▾ +{overflowProjects.length}件</span>
              }
            </button>
          </div>
        )}
      </div>

      {/* オーバーフロードロップダウン */}
      {overflowOpen && overflowBtnRef.current && (
        <div
          data-testid="overflow-dropdown"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top:  overflowBtnRef.current.getBoundingClientRect().bottom + 4,
            left: overflowBtnRef.current.getBoundingClientRect().left,
            background: 'var(--th-bg)', border: '1px solid var(--th-border)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 1001, minWidth: 140, overflow: 'hidden',
          }}
        >
          {overflowProjects.map(p => {
            const isActive = currentProject?.id === p.id;
            return (
              <button
                key={p.id}
                title={p.name}
                onClick={() => { onSelect(p); setOverflowOpen(false); }}
                onContextMenu={e => {
                  e.preventDefault();
                  setTabMenu({ project: p, x: e.clientX, y: e.clientY });
                  setOverflowOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                  padding: '8px 14px', border: 'none',
                  background: isActive ? 'var(--th-bg2)' : 'transparent',
                  cursor: 'pointer', fontSize: 13,
                  color: isActive ? 'var(--th-text)' : 'var(--th-text2)',
                  fontWeight: isActive ? 700 : 400,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-bg2)')}
                onMouseLeave={e => (e.currentTarget.style.background = isActive ? 'var(--th-bg2)' : 'transparent')}
              >
                {p.color && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    background: p.color, flexShrink: 0,
                  }} />
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {taskCounts !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--th-text-muted)', flexShrink: 0 }}>
                    ({taskCounts[p.id] ?? 0})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* コンテキストメニュー */}
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
                        width: 18, height: 18, borderRadius: '50%',
                        border: tabMenu.project.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
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
