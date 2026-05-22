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
  padding: '6px 12px', border: '1px solid #ddd', borderRadius: 4,
  background: '#fff', cursor: 'pointer', fontSize: 13,
};
const PRIMARY_BTN: React.CSSProperties = {
  ...BTN, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600,
};
const SELECT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13,
};
const LABEL: React.CSSProperties = {
  fontSize: 12, color: '#6b7280', fontWeight: 500,
};
const FILTER_GROUP: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
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

export function Toolbar({ onAddTask, onImport, onExportJson, onExportCsv }: Props) {
  const { zoomLevel, filterStatus, filterAssignee, filterPriority,
          ganttStartDate, ganttPeriod,
          setZoomLevel, setFilter, setGanttRange } = useTaskStore();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb',
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
        <input style={{ ...SELECT, width: 100 }} placeholder="絞り込み" value={filterAssignee}
          onChange={e => setFilter({ filterAssignee: e.target.value })} />
      </div>

      <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />

      <div style={FILTER_GROUP}>
        <span style={LABEL}>ガント表示</span>
        <select style={SELECT} value={zoomLevel}
          onChange={e => setZoomLevel(e.target.value as ZoomLevel)}>
          <option value="day">日</option>
          <option value="week">週</option>
          <option value="month">月</option>
        </select>
      </div>

      <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />

      {/* ガント期間 */}
      <div style={FILTER_GROUP}>
        <span style={LABEL}>開始日</span>
        <input
          type="date"
          style={{ ...SELECT, fontSize: 12 }}
          value={ganttStartDate}
          onChange={e => setGanttRange(e.target.value, ganttPeriod)}
        />
        {ganttStartDate ? (
          <button style={{ ...BTN, padding: '4px 8px', fontSize: 11, color: '#6b7280' }}
            onClick={() => setGanttRange('', ganttPeriod)} title="開始日をリセット（自動）">
            ✕
          </button>
        ) : (
          <button style={{ ...BTN, padding: '4px 8px', fontSize: 11 }}
            onClick={() => setGanttRange(today, ganttPeriod)} title="今日から表示">
            今日
          </button>
        )}
      </div>

      <div style={FILTER_GROUP}>
        <span style={LABEL}>期間</span>
        <select style={SELECT} value={ganttPeriod}
          onChange={e => setGanttRange(ganttStartDate, e.target.value as GanttPeriod)}>
          {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <ConnectionBadge />
        <button style={BTN} onClick={onImport}>インポート</button>
        <button style={BTN} onClick={onExportJson}>JSON出力</button>
        <button style={BTN} onClick={onExportCsv}>CSV出力</button>
        <button style={PRIMARY_BTN} onClick={onAddTask}>+ タスク追加</button>
      </div>
    </div>
  );
}
