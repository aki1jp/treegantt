import type { ZoomLevel, TaskStatus, TaskPriority } from '../../types/task';
import type { GanttPeriod } from '../../utils/ganttCalc';
import { useTaskStore } from '../../store/taskStore';
import { ConnectionBadge } from '../ConnectionBadge/ConnectionBadge';

interface Props {
  onAddTask: () => void;
  onImport: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

const BTN: React.CSSProperties = {
  padding: '5px 10px', border: '1px solid #ddd', borderRadius: 4,
  background: '#fff', cursor: 'pointer', fontSize: 12,
};
const PRIMARY_BTN: React.CSSProperties = {
  ...BTN, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600,
};
const SELECT: React.CSSProperties = {
  padding: '5px 6px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12,
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: '#6b7280', fontWeight: 500,
};
const FILTER_GROUP: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
};
const DIVIDER: React.CSSProperties = {
  width: 1, height: 22, background: '#e5e7eb', flexShrink: 0,
};

const STATUS_OPTIONS: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'todo', label: 'TODO' },
  { value: 'wip', label: '進行中' },
  { value: 'done', label: '完了' },
  { value: 'wait', label: '待機' },
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

function ToggleBtn({ active, label, title, onClick }: { active: boolean; label: string; title?: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        ...BTN,
        padding: '4px 7px',
        fontSize: 11,
        background: active ? '#4f46e5' : '#fff',
        color: active ? '#fff' : '#6b7280',
        border: `1px solid ${active ? '#4f46e5' : '#ddd'}`,
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
    showLightningLine, ganttHeaderLevels,
    setZoomLevel, setFilter, setGanttRange,
    setShowLightningLine, setGanttHeaderLevels,
  } = useTaskStore();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e5e7eb',
    }}>
      {/* フィルタ */}
      <div style={FILTER_GROUP}>
        <span style={LABEL}>ステータス</span>
        <select style={SELECT} value={filterStatus}
          onChange={e => setFilter({ filterStatus: e.target.value as TaskStatus | '' })}>
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
        <input style={{ ...SELECT, width: 88 }} placeholder="絞り込み" value={filterAssignee}
          onChange={e => setFilter({ filterAssignee: e.target.value })} />
      </div>

      <div style={DIVIDER} />

      {/* ズーム */}
      <div style={FILTER_GROUP}>
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
          <button style={{ ...BTN, padding: '3px 7px', fontSize: 11, color: '#6b7280' }}
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
      <div style={FILTER_GROUP}>
        <ToggleBtn
          active={showLightningLine}
          label="⚡ イナズマ"
          title="イナズマライン（実績/計画の境界）を表示"
          onClick={() => setShowLightningLine(!showLightningLine)}
        />
      </div>

      {/* 右端ボタン群 */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        <ConnectionBadge />
        <button style={BTN} onClick={onImport}>インポート</button>
        <button style={BTN} onClick={onExportJson}>JSON出力</button>
        <button style={BTN} onClick={onExportCsv}>CSV出力</button>
        <button style={PRIMARY_BTN} onClick={onAddTask}>+ タスク追加</button>
      </div>
    </div>
  );
}
