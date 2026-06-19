import { useRef, useEffect, useState } from 'react';
import type { ZoomLevel, TaskStatus, TaskPriority } from '../../types/task';
import type { GanttPeriod } from '../../utils/ganttCalc';
import { todayStr, getUniqueAssignees } from '../../utils/ganttCalc';
import { useTaskStore } from '../../store/taskStore';
import { FRONTEND_VERSION } from '../../version';

interface Props {
  onAddTask: () => void;
  onAddMilestone: () => void;
  onImport: () => void;
  onRestore: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onOpenResourceSettings?: () => void;
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


const STATUS_OPTIONS: { value: TaskStatus | '' | '!done'; label: string }[] = [
  { value: '',      label: 'すべて'  },
  { value: 'todo',  label: 'TODO'   },
  { value: 'wip',   label: 'Doing'  },
  { value: 'done',  label: 'DONE'   },
  { value: 'wait',    label: '待機'       },
  { value: 'pending', label: '保留'       },
  { value: '!done',   label: 'DONE/保留以外' },
];
const PRIORITY_OPTIONS: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'critical', label: '最高' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];
const PERIOD_OPTIONS: { value: GanttPeriod; label: string }[] = [
  { value: '3m', label: '3ヶ月' },
  { value: '6m', label: '6ヶ月' },
  { value: '12m', label: '12ヶ月' },
  { value: '24m', label: '24ヶ月' },
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

export function Toolbar({ onAddTask, onAddMilestone, onImport, onRestore, onExportJson, onExportCsv, onOpenResourceSettings, backendVersion }: Props) {
  const {
    tasks,
    zoomLevel, filterStatus, filterAssignee, filterPriority, filterSearch,
    ganttStartDate, ganttPeriod,
    showLightningLine, showWeekend, showCriticalPath, showResourceView, showTodayLine, showMilestones, milestoneHighlightColor, uiFontSize, uiRowHeight, ganttHeaderLevels, depArrowStyle,
    ganttBarOpen,
    setZoomLevel, setFilter, setGanttRange, resetUi,
    setShowLightningLine, setShowWeekend, setShowCriticalPath, setShowResourceView, setShowTodayLine, setShowMilestones, setMilestoneHighlightColor, setUiFontSize, setUiRowHeight, setGanttHeaderLevels,
    setDepArrowStyle, setGanttBarOpen,
  } = useTaskStore();

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
  ].filter(Boolean).length;

  const today = todayStr();

  const dropdownStyle: React.CSSProperties = {
    background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  };

  const ROW: React.CSSProperties = {
    display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 6,
    padding: '0 14px', overflowX: 'auto',
  };

  return (
    <div style={{
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
            placeholder="タスク検索..."
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
        <button style={PRIMARY_BTN} onClick={onAddTask}>+ タスク追加</button>
        <button style={BTN} onClick={onAddMilestone}>◇ マイルストーン</button>

        {/* 右端: ☰ + ∧/∨ */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* ハンバーガーメニュー */}
          <div style={{ position: 'relative' }} ref={menuRef}>
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
                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  📥 インポート
                </div>
                <MenuItem label="追記（既存を保持）" indent onClick={() => { onImport(); setMenuOpen(false); }} />
                <MenuItem label="レストア（既存を削除）" indent onClick={() => { onRestore(); setMenuOpen(false); }} />

                <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />

                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  📤 エクスポート
                </div>
                <MenuItem label="JSON 出力" indent onClick={() => { onExportJson(); setMenuOpen(false); }} />
                <MenuItem label="CSV 出力"  indent onClick={() => { onExportCsv(); setMenuOpen(false); }} />

                {onOpenResourceSettings && (
                  <>
                    <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
                    <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}>
                      ⚙ 設定
                    </div>
                    <MenuItem label="リソース設定" indent onClick={() => { onOpenResourceSettings(); setMenuOpen(false); }} />
                  </>
                )}

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
            aria-label={ganttBarOpen ? 'ガント設定を閉じる' : 'ガント設定を開く'}
            title={ganttBarOpen ? 'ガント設定を閉じる' : 'ガント設定を開く'}
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
            <span style={LABEL}>ステータス</span>
            <select style={SELECT} value={filterStatus}
              onChange={e => setFilter({ filterStatus: e.target.value as TaskStatus | '' | '!done' })}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>優先度</span>
            <select style={SELECT} value={filterPriority}
              onChange={e => setFilter({ filterPriority: e.target.value })}>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={FILTER_GROUP}>
            <span style={LABEL}>担当者</span>
            <div data-testid="assignee-combobox" style={{ position: 'relative', display: 'inline-flex' }}>
              <input
                type="text"
                list="assignee-datalist"
                placeholder="すべて"
                value={filterAssignee}
                onChange={e => setFilter({ filterAssignee: e.target.value })}
                style={{ ...SELECT, width: 100, paddingRight: filterAssignee ? 22 : undefined }}
              />
              <datalist id="assignee-datalist">
                {getUniqueAssignees(tasks).map(a => <option key={a} value={a} />)}
              </datalist>
              {filterAssignee && (
                <button
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'none', padding: '0 2px',
                    fontSize: 10, lineHeight: 1, cursor: 'pointer', color: 'var(--th-text-muted)',
                  }}
                  onClick={() => setFilter({ filterAssignee: '' })}
                  title="担当者フィルターをクリア"
                >✕</button>
              )}
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              style={{ ...BTN, padding: '3px 7px', fontSize: 11, color: 'var(--th-text-muted)' }}
              onClick={() => setFilter({ filterStatus: '', filterPriority: '', filterAssignee: '' })}
              title="フィルタをクリア"
            >
              ✕ クリア
            </button>
          )}

          <div style={DIVIDER} />

          {/* ズーム */}
          <div style={FILTER_GROUP}>
            <span style={LABEL}>ズーム</span>
            <select title="ズームレベルを選択" style={SELECT} value={zoomLevel}
              onChange={e => setZoomLevel(e.target.value as ZoomLevel)}>
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
            </select>
          </div>

          <div style={DIVIDER} />

          {/* 開始日 + 期間 */}
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

          {/* ヘッダー表示レベル + マイル強調（ヘッダー行と同グループ） */}
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
            <ToggleBtn
              active={showMilestones}
              label="マイル"
              title="マイルストーンをヘッダーに表示"
              onClick={() => setShowMilestones(!showMilestones)}
            />
            <input
              type="color"
              value={milestoneHighlightColor}
              title="マイルストーン強調色"
              onChange={e => setMilestoneHighlightColor(e.target.value)}
              style={{ width: 22, height: 22, padding: 1, border: '1px solid var(--th-border)', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
          </div>

          <div style={DIVIDER} />

          {/* 表示トグル */}
          <ToggleBtn
            active={showTodayLine}
            label="今日バー"
            title="今日の日付ラインを表示"
            onClick={() => setShowTodayLine(!showTodayLine)}
          />
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
          <ToggleBtn
            active={showResourceView}
            label="リソースビュー"
            title="担当者別スイムレーンを表示"
            onClick={() => setShowResourceView(!showResourceView)}
          />

          <div style={DIVIDER} />

          {/* サイズ（文字・行高） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }}>
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

          {/* 矢印スタイル */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 8px', border: '1px solid var(--th-border)', borderRadius: 6, background: 'var(--th-bg2)' }}>
            <span style={{ ...LABEL, whiteSpace: 'nowrap' }}>矢印</span>
            {(['bezier', 'elbow', 'straight'] as const).map((s, i) => (
              <button
                key={s}
                title={['ベジエ曲線', '直角折れ線', '直線'][i]}
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
                {['曲線', '直角', '直線'][i]}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button
              style={{ ...BTN, fontSize: 11, color: 'var(--th-text-muted)' }}
              title="表示設定をデフォルトに戻す"
              onClick={resetUi}
            >
              デフォルト
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
