import { useState, useRef, useEffect } from 'react';
import type { ZoomLevel, TaskStatus, TaskPriority } from '../../types/task';
import type { GanttPeriod } from '../../utils/ganttCalc';
import type { ThemeMode } from '../../utils/theme';
import { useTaskStore } from '../../store/taskStore';

interface Props {
  onAddTask: () => void;
  onImport: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
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

const STATUS_OPTIONS: { value: TaskStatus | '' | '!done'; label: string }[] = [
  { value: '',      label: 'すべて'  },
  { value: 'todo',  label: 'TODO'   },
  { value: 'wip',   label: 'Doing'  },
  { value: 'done',  label: 'DONE'   },
  { value: 'wait',  label: '待機'   },
  { value: '!done', label: 'DONE以外' },
];
const PRIORITY_OPTIONS: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'critical', label: '最高' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];
const PERIOD_OPTIONS: { value: GanttPeriod; label: string }[] = [
  { value: '2w', label: '2週間' },
  { value: '1m', label: '1ヶ月' },
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
];

const THEME_OPTIONS: { value: ThemeMode; label: string; title: string }[] = [
  { value: 'light',  label: '☀',  title: 'ライトモード' },
  { value: 'dark',   label: '🌙', title: 'ダークモード' },
  { value: 'auto',   label: '🖥', title: 'システム設定に従う' },
];

function MenuItem({ label, indent, onClick }: { label: string; indent?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', border: 'none',
        padding: indent ? '8px 16px 8px 28px' : '10px 16px',
        background: 'none', fontSize: 13, cursor: 'pointer', color: 'var(--th-text2)',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--th-bg2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
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

export function Toolbar({ onAddTask, onImport, onExportJson, onExportCsv }: Props) {
  const {
    zoomLevel, filterStatus, filterAssignee, filterPriority,
    ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, uiFontSize, uiRowHeight, ganttHeaderLevels,
    theme,
    setZoomLevel, setFilter, setGanttRange,
    setShowLightningLine, setShowWeekend, setShowCriticalPath, setUiFontSize, setUiRowHeight, setGanttHeaderLevels,
    setTheme,
  } = useTaskStore();

  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [filterPos,  setFilterPos]  = useState<{ top: number; left: number } | null>(null);
  const [menuPos,    setMenuPos]    = useState<{ top: number; right: number } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (menuRef.current   && !menuRef.current.contains(e.target as Node))   setMenuOpen(false);
    }
    if (filterOpen || menuOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [filterOpen, menuOpen]);

  function openFilter() {
    if (!filterOpen && filterRef.current) {
      const r = filterRef.current.getBoundingClientRect();
      setFilterPos({ top: r.bottom + 4, left: r.left });
    }
    setFilterOpen(v => !v);
  }

  function openMenu() {
    if (!menuOpen && menuRef.current) {
      const r = menuRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setMenuOpen(v => !v);
  }

  const activeCount = [
    filterStatus !== '',
    filterPriority !== '',
    filterAssignee !== '',
  ].filter(Boolean).length;

  const today = new Date().toISOString().slice(0, 10);

  const dropdownStyle: React.CSSProperties = {
    background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 6,
      padding: '8px 14px', background: 'var(--th-bg)', borderBottom: '1px solid var(--th-border)',
      overflowX: 'auto', minHeight: 44,
    }}>
      {/* フィルタ（まとめドロップダウン） */}
      <div style={{ position: 'relative' }} ref={filterRef}>
        <button
          style={{
            ...BTN,
            background: activeCount > 0 ? '#ede9fe' : 'var(--th-bg)',
            color: activeCount > 0 ? '#4f46e5' : 'var(--th-text2)',
            border: `1px solid ${activeCount > 0 ? '#a5b4fc' : 'var(--th-input-border)'}`,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
          onClick={openFilter}
        >
          フィルタ
          {activeCount > 0 && (
            <span style={{
              background: '#4f46e5', color: '#fff', borderRadius: '50%',
              width: 16, height: 16, fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{activeCount}</span>
          )}
        </button>

        {filterOpen && filterPos && (
          <div style={{
            position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 1000,
            ...dropdownStyle, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
            minWidth: 220,
          }}>
            <div style={FILTER_GROUP}>
              <span style={{ ...LABEL, width: 46 }}>ステータス</span>
              <select style={SELECT} value={filterStatus}
                onChange={e => setFilter({ filterStatus: e.target.value as TaskStatus | '' | '!done' })}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={FILTER_GROUP}>
              <span style={{ ...LABEL, width: 46 }}>優先度</span>
              <select style={SELECT} value={filterPriority}
                onChange={e => setFilter({ filterPriority: e.target.value })}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={FILTER_GROUP}>
              <span style={{ ...LABEL, width: 46 }}>担当者</span>
              <input style={{ ...SELECT, width: 120 }} placeholder="部分一致" value={filterAssignee}
                onChange={e => setFilter({ filterAssignee: e.target.value })} />
            </div>
            {activeCount > 0 && (
              <button
                style={{ ...BTN, fontSize: 11, color: 'var(--th-text-muted)', alignSelf: 'flex-end' }}
                onClick={() => setFilter({ filterStatus: '', filterPriority: '', filterAssignee: '' })}
              >
                クリア
              </button>
            )}
          </div>
        )}
      </div>

      <div style={DIVIDER} />

      {/* 左側: タスク操作 */}
      <button style={PRIMARY_BTN} onClick={onAddTask}>+ タスク追加</button>

      {/* ── ここから右側: ガントチャート操作 ── */}

      {/* ズーム */}
      <div style={{ ...FILTER_GROUP, marginLeft: 'auto' }}>
        <span style={LABEL}>ズーム</span>
        <select style={SELECT} value={zoomLevel}
          onChange={e => setZoomLevel(e.target.value as ZoomLevel)}>
          <option value="day">日</option>
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </div>

      <div style={DIVIDER} />

      {/* ガント期間 */}
      <div style={FILTER_GROUP}>
        <span style={LABEL}>開始日</span>
        <input type="date" style={{ ...SELECT, fontSize: 11 }}
          value={ganttStartDate}
          onChange={e => setGanttRange(e.target.value, ganttPeriod)} />
        {ganttStartDate ? (
          <button style={{ ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }}
            onClick={() => setGanttRange('', ganttPeriod)} title="開始日をリセット（自動）">✕</button>
        ) : (
          <button style={{ ...BTN, padding: '3px 7px', fontSize: 11 }}
            onClick={() => setGanttRange(today, ganttPeriod)} title="今日から表示">今日</button>
        )}
      </div>

      <div style={FILTER_GROUP}>
        <span style={LABEL}>期間</span>
        <select style={SELECT} value={ganttPeriod}
          onChange={e => setGanttRange(ganttStartDate, e.target.value as GanttPeriod)}>
          {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={DIVIDER} />

      {/* ヘッダー表示レベル */}
      <div style={FILTER_GROUP}>
        <span style={LABEL}>ヘッダー</span>
        <ToggleBtn active={ganttHeaderLevels.year}  label="年" title="年ヘッダーを表示"
          onClick={() => setGanttHeaderLevels({ year:  !ganttHeaderLevels.year  })} />
        <ToggleBtn active={ganttHeaderLevels.month} label="月" title="月ヘッダーを表示"
          onClick={() => setGanttHeaderLevels({ month: !ganttHeaderLevels.month })} />
        <ToggleBtn active={ganttHeaderLevels.week}  label="週" title="週ヘッダーを表示"
          onClick={() => setGanttHeaderLevels({ week:  !ganttHeaderLevels.week  })} />
        <ToggleBtn active={ganttHeaderLevels.day}   label="日" title="日ヘッダーを表示"
          onClick={() => setGanttHeaderLevels({ day:   !ganttHeaderLevels.day   })} />
      </div>

      <div style={DIVIDER} />

      {/* イナズマライン */}
      <ToggleBtn
        active={showLightningLine}
        label="⚡ イナズマ"
        title="イナズマライン（実績/計画の境界）を表示"
        onClick={() => setShowLightningLine(!showLightningLine)}
      />
      <ToggleBtn
        active={showWeekend}
        label="土日"
        title="土日（週末）の背景を強調表示"
        onClick={() => setShowWeekend(!showWeekend)}
      />
      <ToggleBtn
        active={showCriticalPath}
        label="クリティカルパス"
        title="クリティカルパスをハイライト表示"
        onClick={() => setShowCriticalPath(!showCriticalPath)}
      />

      <div style={DIVIDER} />

      {/* サイズ（文字・行高） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '4px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }}>
        <span style={{ ...LABEL, whiteSpace: 'nowrap' }}>サイズ</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ ...LABEL, fontSize: 10 }}>文字</span>
          {([11, 13, 15] as const).map((size, i) => (
            <button
              key={size}
              title={['小', '中', '大'][i]}
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
              あ
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--th-border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ ...LABEL, fontSize: 10 }}>行高</span>
          {([28, 36, 44] as const).map((h, i) => (
            <button
              key={h}
              title={['小', '中', '大'][i]}
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

      <div style={DIVIDER} />

      {/* テーマ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {THEME_OPTIONS.map(opt => (
          <button
            key={opt.value}
            title={opt.title}
            onClick={() => setTheme(opt.value)}
            style={{
              ...BTN,
              padding: '4px 8px',
              fontSize: 14,
              background: theme === opt.value ? '#4f46e5' : 'var(--th-bg)',
              color: theme === opt.value ? '#fff' : 'var(--th-text-muted)',
              border: `1px solid ${theme === opt.value ? '#4f46e5' : 'var(--th-input-border)'}`,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={DIVIDER} />

      {/* ハンバーガーメニュー（インポート / エクスポート） */}
      <div style={{ position: 'relative', flexShrink: 0 }} ref={menuRef}>
        <button
          title="メニュー"
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
            <MenuItem label="📥 インポート" onClick={() => { onImport(); setMenuOpen(false); }} />

            <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />

            <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
              📤 エクスポート
            </div>
            <MenuItem label="JSON 出力" indent onClick={() => { onExportJson(); setMenuOpen(false); }} />
            <MenuItem label="CSV 出力"  indent onClick={() => { onExportCsv(); setMenuOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}
