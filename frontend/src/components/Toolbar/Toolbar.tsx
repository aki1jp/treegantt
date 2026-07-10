import { useRef, useEffect, useState, useMemo } from 'react';
import type { ZoomLevel, TaskStatus, TaskPriority } from '../../types/task';
import type { GanttPeriod } from '../../utils/ganttCalc';
import { todayStr, getUniqueAssignees, getUniqueTaskColors } from '../../utils/ganttCalc';
import { useTaskStore } from '../../store/taskStore';
import { useTranslation } from '../../i18n/useTranslation';
import { FRONTEND_VERSION } from '../../version';
import { API_DOCS_URL } from '../../utils/api';

interface Props {
  onAddTask: () => void;
  onAddMilestone: () => void;
  onImport: () => void;
  onRestore: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onOpenResourceSettings?: () => void;
  /** クロスプロジェクト参照（§5.8）: 未指定時は「🔗 参照」ボタンを表示しない */
  onOpenRefManager?: () => void;
  backendVersion?: string;
}

const BTN: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid var(--th-input-border)', borderRadius: 4,
  background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer', fontSize: 12,
};
const PRIMARY_BTN: React.CSSProperties = {
  ...BTN, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600,
};
const SELECT: React.CSSProperties = {
  padding: '5px 6px', border: '1px solid var(--th-input-border)', borderRadius: 4,
  fontSize: 12, background: 'var(--th-input-bg)', color: 'var(--th-text2)',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: 'var(--th-text-muted)', fontWeight: 500,
};
const FILTER_GROUP: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
};
const DIVIDER: React.CSSProperties = {
  width: 1, height: 22, background: 'var(--th-border)', flexShrink: 0,
};

function MenuItem({ label, indent, href, onClick }: { label: string; indent?: boolean; href?: string; onClick: () => void }) {
  const style: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', border: 'none',
    padding: indent ? '8px 16px 8px 28px' : '10px 16px',
    background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--th-text2)',
  };
  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'var(--th-bg2)'),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = 'none'),
  };
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} style={{ ...style, textDecoration: 'none' }} {...hoverHandlers}>
        {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} style={style} {...hoverHandlers}>
      {label}
    </button>
  );
}

function ToggleBtn({ active, label, title, onClick }: { active: boolean; label: string; title?: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        ...BTN,
        padding: '4px 7px',
        fontSize: 11,
        background: active ? '#4f46e5' : 'var(--th-bg)',
        color: active ? '#fff' : 'var(--th-text-muted)',
        border: `1px solid ${active ? '#4f46e5' : 'var(--th-input-border)'}`,
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

export function Toolbar({ onAddTask, onAddMilestone, onImport, onRestore, onExportJson, onExportCsv, onOpenResourceSettings, onOpenRefManager, backendVersion }: Props) {
  const {
    tasks,
    zoomLevel, filterStatus, filterAssignee, filterPriority, filterColor, filterSearch,
    ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, showResourceView, showTodayLine, showMilestones, milestoneHighlightColor, uiFontSize, uiRowHeight, ganttHeaderLevels, depArrowStyle,
    ganttBarOpen,
    setZoomLevel, setFilter, setGanttRange, resetUi,
    setShowLightningLine, setShowWeekend, setShowCriticalPath, setShowResourceView, setShowTodayLine, setShowMilestones, setMilestoneHighlightColor, setUiFontSize, setUiRowHeight, setGanttHeaderLevels,
    setDepArrowStyle, setGanttBarOpen,
  } = useTaskStore();
  const { t } = useTranslation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos,  setMenuPos]  = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  function openMenu() {
    if (!menuOpen && menuRef.current) {
      const r = menuRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setMenuOpen(v => !v);
  }

  const activeFilterCount = [
    filterStatus !== '',
    filterPriority !== '',
    filterAssignee !== '',
    filterColor !== '',
  ].filter(Boolean).length;

  // 担当者 datalist の候補。毎レンダーの再計算（tasks 全走査）を避ける
  const assigneeOptions = useMemo(() => getUniqueAssignees(tasks), [tasks]);
  // 色フィルタの選択肢（使用中の実効色）。担当者候補と同じ動的収集パターン（§9.3）
  const colorOptions = useMemo(() => getUniqueTaskColors(tasks), [tasks]);

  const today = todayStr();

  // 各種選択肢は locale に応じて再計算する必要があるため、レンダー内で構築する
  // （'TODO'/'Doing'/'DONE' は元々言語非依存の表記のため翻訳対象外）
  const statusOptions: { value: TaskStatus | '' | '!done'; label: string }[] = [
    { value: '',      label: t('toolbar.filter.all') },
    { value: 'todo',  label: 'TODO'  },
    { value: 'wip',   label: 'Doing' },
    { value: 'done',  label: 'DONE'  },
    { value: 'wait',    label: t('toolbar.status.wait') },
    { value: 'pending', label: t('toolbar.status.pending') },
    { value: '!done',   label: t('toolbar.status.notDoneOrPending') },
  ];
  const priorityOptions: { value: TaskPriority | ''; label: string }[] = [
    { value: '', label: t('toolbar.filter.all') },
    { value: 'critical', label: t('toolbar.priority.critical') },
    { value: 'high', label: t('toolbar.priority.high') },
    { value: 'medium', label: t('toolbar.priority.medium') },
    { value: 'low', label: t('toolbar.priority.low') },
  ];
  const periodOptions: { value: GanttPeriod; label: string }[] = [
    { value: '3m', label: t('toolbar.period.3m') },
    { value: '6m', label: t('toolbar.period.6m') },
    { value: '12m', label: t('toolbar.period.12m') },
    { value: '24m', label: t('toolbar.period.24m') },
  ];

  const dropdownStyle: React.CSSProperties = {
    background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  };

  const ROW: React.CSSProperties = {
    display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 6,
    padding: '0 14px', overflowX: 'auto',
  };

  return (
    <div data-testid="toolbar" style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--th-bg)', borderBottom: '1px solid var(--th-border)',
    }}>
      {/* ── 行1: 操作系（常時表示） ── */}
      <div style={{ ...ROW, height: 44 }}>
        {/* 🔍 検索ボックス */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'var(--th-text-ph)', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="search"
            placeholder={t('toolbar.searchPlaceholder')}
            aria-label={t('toolbar.searchAriaLabel')}
            value={filterSearch}
            onChange={e => setFilter({ filterSearch: e.target.value })}
            style={{
              ...SELECT, paddingLeft: 24, width: 160, fontSize: 12,
              background: filterSearch ? 'var(--th-input-bg)' : 'var(--th-bg)',
              outline: filterSearch ? '2px solid #4f46e5' : undefined,
            }}
          />
        </div>

        <div style={DIVIDER} />

        {/* タスク操作 */}
        <button style={PRIMARY_BTN} onClick={onAddTask}>{t('toolbar.addTask')}</button>
        <button style={BTN} onClick={onAddMilestone}>{t('toolbar.addMilestone')}</button>
        {onOpenRefManager && (
          <button style={BTN} onClick={onOpenRefManager} title={t('toolbar.refButtonTitle')}>{t('toolbar.refButton')}</button>
        )}

        {/* 右端: ☰ + ∧/∨ */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* ハンバーガーメニュー */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              title={t('toolbar.menuTitle')}
              aria-label={t('toolbar.menuTitle')}
              onClick={openMenu}
              style={{
                ...BTN,
                padding: '5px 9px',
                fontSize: 16,
                lineHeight: 1,
                background: menuOpen ? 'var(--th-bg2)' : 'var(--th-bg)',
              }}
            >
              ☰
            </button>

            {menuOpen && menuPos && (
              <div style={{
                position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 1000,
                ...dropdownStyle, minWidth: 160, overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {t('toolbar.menu.importSection')}
                </div>
                <MenuItem label={t('toolbar.menu.importAppend')} indent onClick={() => { onImport(); setMenuOpen(false); }} />
                <MenuItem label={t('toolbar.menu.importRestore')} indent onClick={() => { onRestore(); setMenuOpen(false); }} />

                <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />

                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {t('toolbar.menu.exportSection')}
                </div>
                <MenuItem label={t('toolbar.menu.exportJson')} indent onClick={() => { onExportJson(); setMenuOpen(false); }} />
                <MenuItem label={t('toolbar.menu.exportCsv')}  indent onClick={() => { onExportCsv(); setMenuOpen(false); }} />

                {onOpenResourceSettings && (
                  <>
                    <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
                    <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {t('toolbar.menu.settingsSection')}
                    </div>
                    <MenuItem label={t('toolbar.menu.resourceSettings')} indent onClick={() => { onOpenResourceSettings(); setMenuOpen(false); }} />
                  </>
                )}

                <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />

                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {t('toolbar.menu.docsSection')}
                </div>
                <MenuItem label={t('toolbar.menu.apiDocs')} indent href={API_DOCS_URL} onClick={() => setMenuOpen(false)} />

                <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />

                {/* バージョン表示（フロント / バックエンド） */}
                <div data-testid="app-version" style={{ padding: '6px 16px 8px', fontSize: 11, color: 'var(--th-text-dim)', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, letterSpacing: '0.05em' }}>TreeGantt</div>
                  <div>Frontend v{FRONTEND_VERSION}</div>
                  <div>Backend v{backendVersion ?? '—'}</div>
                </div>
              </div>
            )}
          </div>

          {/* ∧/∨ 折りたたみトグル */}
          <button
            aria-label={ganttBarOpen ? t('toolbar.collapseSettings') : t('toolbar.expandSettings')}
            title={ganttBarOpen ? t('toolbar.collapseSettings') : t('toolbar.expandSettings')}
            onClick={() => setGanttBarOpen(!ganttBarOpen)}
            style={{ ...BTN, padding: '4px 8px', fontSize: 10 }}
          >
            {ganttBarOpen ? '∧' : '∨'}
          </button>
        </div>
      </div>

      {/* ── 行2: フィルタ + ガント表示設定（折りたたみ可・複数行対応） ── */}
      {ganttBarOpen && (
        <div
          data-testid="toolbar-row2"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderTop: '1px solid var(--th-border)',
          }}
        >
          {/* フィルタ（インライン直列） */}
          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.statusLabel')}</span>
            <select style={SELECT} value={filterStatus} aria-label={t('toolbar.filter.statusAriaLabel')}
              onChange={e => setFilter({ filterStatus: e.target.value as TaskStatus | '' | '!done' })}>
              {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.priorityLabel')}</span>
            <select style={SELECT} value={filterPriority} aria-label={t('toolbar.filter.priorityAriaLabel')}
              onChange={e => setFilter({ filterPriority: e.target.value })}>
              {priorityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.assigneeLabel')}</span>
            <div data-testid="assignee-combobox" style={{ position: 'relative', display: 'inline-flex' }}>
              <input
                type="text"
                list="assignee-datalist"
                placeholder={t('toolbar.filter.all')}
                aria-label={t('toolbar.filter.assigneeAriaLabel')}
                value={filterAssignee}
                onChange={e => setFilter({ filterAssignee: e.target.value })}
                style={{ ...SELECT, width: 100, paddingRight: filterAssignee ? 22 : undefined }}
              />
              <datalist id="assignee-datalist">
                {assigneeOptions.map(a => <option key={a} value={a} />)}
              </datalist>
              {filterAssignee && (
                <button
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'none', padding: '0 2px',
                    fontSize: 10, lineHeight: 1, cursor: 'pointer', color: 'var(--th-text-muted)',
                  }}
                  onClick={() => setFilter({ filterAssignee: '' })}
                  title={t('toolbar.filter.assigneeClear')}
                  aria-label={t('toolbar.filter.assigneeClear')}
                >✕</button>
              )}
            </div>
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.colorLabel')}</span>
            <select style={SELECT} value={filterColor} aria-label={t('toolbar.filter.colorAriaLabel')}
              onChange={e => setFilter({ filterColor: e.target.value })}>
              <option value="">{t('toolbar.filter.all')}</option>
              <option value="*">{t('toolbar.filter.colored')}</option>
              {colorOptions.map(c => (
                <option key={c} value={c} style={{ color: c }}>{`● ${c}`}</option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              style={{ ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }}
              onClick={() => setFilter({ filterStatus: '', filterPriority: '', filterAssignee: '', filterColor: '' })}
              title={t('toolbar.filter.clearTitle')}
            >
              {t('toolbar.filter.clearLabel')}
            </button>
          )}

          <div style={DIVIDER} />

          {/* ズーム */}
          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.zoomLabel')}</span>
            <select title={t('toolbar.zoomSelectTitle')} aria-label={t('toolbar.zoomAriaLabel')} style={SELECT} value={zoomLevel}
              onChange={e => setZoomLevel(e.target.value as ZoomLevel)}>
              <option value="day">{t('toolbar.unit.day')}</option>
              <option value="week">{t('toolbar.unit.week')}</option>
              <option value="month">{t('toolbar.unit.month')}</option>
            </select>
          </div>

          <div style={DIVIDER} />

          {/* 開始日 + 期間 */}
          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.startDateLabel')}</span>
            <input type="date" style={{ ...SELECT, fontSize: 11 }} aria-label={t('toolbar.filter.startDateLabel')}
              value={ganttStartDate}
              onChange={e => setGanttRange(e.target.value, ganttPeriod)} />
            {ganttStartDate ? (
              <button style={{ ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }}
                onClick={() => setGanttRange('', ganttPeriod)} title={t('toolbar.startDateReset')} aria-label={t('toolbar.startDateReset')}>✕</button>
            ) : (
              <button style={{ ...BTN, padding: '3px 7px', fontSize: 11 }}
                onClick={() => setGanttRange(today, ganttPeriod)} title={t('toolbar.todayButtonTitle')}>{t('toolbar.todayButtonLabel')}</button>
            )}
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.periodLabel')}</span>
            <select style={SELECT} value={ganttPeriod} aria-label={t('toolbar.periodAriaLabel')}
              onChange={e => setGanttRange(ganttStartDate, e.target.value as GanttPeriod)}>
              {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={DIVIDER} />

          {/* ヘッダー表示レベル + マイル強調（ヘッダー行と同グループ） */}
          <div style={FILTER_GROUP}>
            <span style={LABEL}>{t('toolbar.filter.headerLabel')}</span>
            <ToggleBtn active={ganttHeaderLevels.year}  label={t('toolbar.unit.year')} title={t('toolbar.header.yearTitle')}
              onClick={() => setGanttHeaderLevels({ year:  !ganttHeaderLevels.year  })} />
            <ToggleBtn active={ganttHeaderLevels.month} label={t('toolbar.unit.month')} title={t('toolbar.header.monthTitle')}
              onClick={() => setGanttHeaderLevels({ month: !ganttHeaderLevels.month })} />
            <ToggleBtn active={ganttHeaderLevels.week}  label={t('toolbar.unit.week')} title={t('toolbar.header.weekTitle')}
              onClick={() => setGanttHeaderLevels({ week:  !ganttHeaderLevels.week  })} />
            <ToggleBtn active={ganttHeaderLevels.day}   label={t('toolbar.unit.day')} title={t('toolbar.header.dayTitle')}
              onClick={() => setGanttHeaderLevels({ day:   !ganttHeaderLevels.day   })} />
            <ToggleBtn
              active={showMilestones}
              label={t('toolbar.milestoneToggleLabel')}
              title={t('toolbar.milestoneToggleTitle')}
              onClick={() => setShowMilestones(!showMilestones)}
            />
            <input
              type="color"
              value={milestoneHighlightColor}
              title={t('toolbar.milestoneColorTitle')}
              aria-label={t('toolbar.milestoneColorTitle')}
              onChange={e => setMilestoneHighlightColor(e.target.value)}
              style={{ width: 22, height: 22, padding: 1, border: '1px solid var(--th-border)', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
          </div>

          <div style={DIVIDER} />

          {/* 表示トグル */}
          <ToggleBtn
            active={showTodayLine}
            label={t('toolbar.todayLine.label')}
            title={t('toolbar.todayLine.title')}
            onClick={() => setShowTodayLine(!showTodayLine)}
          />
          <ToggleBtn
            active={showLightningLine}
            label={t('toolbar.lightning.label')}
            title={t('toolbar.lightning.title')}
            onClick={() => setShowLightningLine(!showLightningLine)}
          />
          <ToggleBtn
            active={showWeekend}
            label={t('toolbar.weekend.label')}
            title={t('toolbar.weekend.title')}
            onClick={() => setShowWeekend(!showWeekend)}
          />
          <ToggleBtn
            active={showCriticalPath}
            label={t('toolbar.criticalPath.label')}
            title={t('toolbar.criticalPath.title')}
            onClick={() => setShowCriticalPath(!showCriticalPath)}
          />
          <ToggleBtn
            active={showResourceView}
            label={t('toolbar.resourceView.label')}
            title={t('toolbar.resourceView.title')}
            onClick={() => setShowResourceView(!showResourceView)}
          />

          <div style={DIVIDER} />

          {/* サイズ（文字・行高） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }}>
            <span style={{ ...LABEL, whiteSpace: 'nowrap' }}>{t('toolbar.size.label')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ ...LABEL, fontSize: 10 }}>{t('toolbar.size.fontLabel')}</span>
              {([11, 13, 15] as const).map((size, i) => {
                const sizeLabel = [t('toolbar.size.small'), t('toolbar.size.medium'), t('toolbar.size.large')][i];
                return (
                  <button
                    key={size}
                    title={sizeLabel}
                    aria-label={t('toolbar.size.fontSizeAriaLabel', { size: sizeLabel })}
                    onClick={() => setUiFontSize(size)}
                    style={{
                      ...BTN,
                      padding: '2px 6px',
                      fontSize: size - 2,
                      background: uiFontSize === size ? '#4f46e5' : 'var(--th-bg)',
                      color: uiFontSize === size ? '#fff' : 'var(--th-text-muted)',
                      border: `1px solid ${uiFontSize === size ? '#4f46e5' : 'var(--th-input-border)'}`,
                      fontWeight: uiFontSize === size ? 700 : 400,
                    }}
                  >
                    {t('toolbar.size.fontPreviewGlyph')}
                  </button>
                );
              })}
            </div>
            <div style={{ width: 1, height: 18, background: 'var(--th-border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ ...LABEL, fontSize: 10 }}>{t('toolbar.size.rowHeightLabel')}</span>
              {([28, 36, 44] as const).map((h, i) => (
                <button
                  key={h}
                  title={[t('toolbar.size.small'), t('toolbar.size.medium'), t('toolbar.size.large')][i]}
                  onClick={() => setUiRowHeight(h)}
                  style={{
                    ...BTN,
                    padding: '2px 6px',
                    fontSize: 11,
                    background: uiRowHeight === h ? '#4f46e5' : 'var(--th-bg)',
                    color: uiRowHeight === h ? '#fff' : 'var(--th-text-muted)',
                    border: `1px solid ${uiRowHeight === h ? '#4f46e5' : 'var(--th-input-border)'}`,
                    fontWeight: uiRowHeight === h ? 700 : 400,
                  }}
                >
                  {['S', 'M', 'L'][i]}
                </button>
              ))}
            </div>
          </div>

          {/* 矢印スタイル */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }}>
            <span style={{ ...LABEL, whiteSpace: 'nowrap' }}>{t('toolbar.arrow.label')}</span>
            {(['bezier', 'elbow', 'straight'] as const).map((s, i) => (
              <button
                key={s}
                title={[t('toolbar.arrow.bezierTitle'), t('toolbar.arrow.elbowTitle'), t('toolbar.arrow.straightTitle')][i]}
                onClick={() => setDepArrowStyle(s)}
                style={{
                  ...BTN,
                  padding: '2px 7px',
                  fontSize: 11,
                  background: depArrowStyle === s ? '#4f46e5' : 'var(--th-bg)',
                  color: depArrowStyle === s ? '#fff' : 'var(--th-text-muted)',
                  border: `1px solid ${depArrowStyle === s ? '#4f46e5' : 'var(--th-input-border)'}`,
                  fontWeight: depArrowStyle === s ? 700 : 400,
                }}
              >
                {[t('toolbar.arrow.curveLabel'), t('toolbar.arrow.elbowLabel'), t('toolbar.arrow.straightLabel')][i]}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button
              style={{ ...BTN, fontSize: 11, color: 'var(--th-text-muted)' }}
              title={t('toolbar.resetDefaultsTitle')}
              onClick={resetUi}
            >
              {t('toolbar.resetDefaultsLabel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
