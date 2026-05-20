import type { ZoomLevel, TaskStatus, TaskPriority } from '../../types/task';
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

export function Toolbar({ onAddTask, onImport, onExportJson, onExportCsv }: Props) {
  const { activeTab, zoomLevel, filterStatus, filterAssignee, filterPriority,
          setActiveTab, setZoomLevel, setFilter } = useTaskStore();

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb',
    }}>
      {/* タブ */}
      <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 6, padding: 2 }}>
        {(['todo', 'gantt'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13,
            background: activeTab === tab ? '#fff' : 'transparent',
            fontWeight: activeTab === tab ? 600 : 400,
            boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
          }}>
            {tab === 'todo' ? 'TODOリスト' : 'ガントチャート'}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />

      {/* フィルタ */}
      <select style={SELECT} value={filterStatus}
        onChange={e => setFilter({ filterStatus: e.target.value as TaskStatus | '' })}>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select style={SELECT} value={filterPriority}
        onChange={e => setFilter({ filterPriority: e.target.value })}>
        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <input style={SELECT} placeholder="担当者" value={filterAssignee}
        onChange={e => setFilter({ filterAssignee: e.target.value })} />

      {activeTab === 'gantt' && (
        <>
          <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
          <select style={SELECT} value={zoomLevel}
            onChange={e => setZoomLevel(e.target.value as ZoomLevel)}>
            <option value="day">日</option>
            <option value="week">週</option>
            <option value="month">月</option>
          </select>
        </>
      )}

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
