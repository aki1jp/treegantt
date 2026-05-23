import { useState, useEffect } from 'react';
import type { Task, TaskStatus, TaskPriority } from '../../types/task';

interface Props {
  task: Task | null;
  allTasks: Task[];
  initialParentId?: string;
  onSave: (data: Partial<Task> & { title: string }) => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'TODO', wip: 'Doing', done: 'DONE', wait: '待機',
};
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: '最高', high: '高', medium: '中', low: '低',
};

const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#555' };
const INPUT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, width: '100%',
};

export function TaskModal({ task, allTasks, initialParentId, onSave, onClose }: Props) {
  const [title, setTitle]             = useState(task?.title ?? '');
  const [summary, setSummary]         = useState(task?.summary ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus]           = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority]       = useState<TaskPriority>(task?.priority ?? 'medium');
  const [progress, setProgress]       = useState(task?.progress ?? 0);
  const [assignee, setAssignee]       = useState(task?.assignee ?? '');
  const [startDate, setStartDate]     = useState(task?.startDate ?? '');
  const [endDate, setEndDate]         = useState(task?.endDate ?? '');
  const [parentId, setParentId]       = useState<string>(task?.parentId ?? initialParentId ?? '');
  const [isMilestone, setIsMilestone]   = useState(task?.isMilestone ?? false);
  const [predecessors, setPredecessors] = useState<string[]>(task?.predecessors ?? []);
  const [predecessorText, setPredecessorText] = useState(
    (task?.predecessors ?? [])
      .map(id => allTasks.find(t => t.id === id)?.order)
      .filter((o): o is number => o !== undefined)
      .join(', ')
  );

  useEffect(() => {
    setTitle(task?.title ?? '');
    setSummary(task?.summary ?? '');
    setDescription(task?.description ?? '');
    setStatus(task?.status ?? 'todo');
    setPriority(task?.priority ?? 'medium');
    setProgress(task?.progress ?? 0);
    setAssignee(task?.assignee ?? '');
    setStartDate(task?.startDate ?? '');
    setEndDate(task?.endDate ?? '');
    setIsMilestone(task?.isMilestone ?? false);
    setParentId(task?.parentId ?? initialParentId ?? '');
    const initPreds = task?.predecessors ?? [];
    setPredecessors(initPreds);
    setPredecessorText(
      initPreds
        .map(id => allTasks.find(t => t.id === id)?.order)
        .filter((o): o is number => o !== undefined)
        .join(', ')
    );
  }, [task]);

  // Cannot select itself or its descendants as parent
  const selectableTasks = allTasks.filter(t => t.id !== task?.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      summary,
      description,
      status,
      priority,
      progress,
      assignee,
      startDate: startDate || null,
      endDate: isMilestone ? (startDate || null) : (endDate || null),
      isMilestone,
      parentId: parentId || null,
      predecessors,
    });
  }

  function togglePredecessor(id: string) {
    setPredecessors(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      setPredecessorText(
        next
          .map(pid => selectableTasks.find(t => t.id === pid)?.order)
          .filter((o): o is number => o !== undefined)
          .join(', ')
      );
      return next;
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, width: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.2)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>
          {task ? 'タスク編集' : 'タスク作成'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={FIELD}>
            <label style={LABEL}>タイトル *</label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>サマリ</label>
            <input style={INPUT} value={summary} onChange={e => setSummary(e.target.value)} maxLength={500} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>説明（Markdown可）</label>
            <textarea style={{ ...INPUT, minHeight: 80, resize: 'vertical' }}
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={FIELD}>
              <label style={LABEL}>ステータス</label>
              <select style={INPUT} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div style={FIELD}>
              <label style={LABEL}>優先度</label>
              <select style={INPUT} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={FIELD}>
            <label style={LABEL}>進捗率: {progress}%</label>
            <input type="range" min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>担当者</label>
            <input style={INPUT} value={assignee} onChange={e => setAssignee(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={FIELD}>
              <label style={LABEL}>開始日</label>
              <input style={INPUT} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={FIELD}>
              <label style={LABEL}>終了日{isMilestone ? '（マイルストーンは開始日に固定）' : ''}</label>
              <input style={INPUT} type="date" value={isMilestone ? startDate : endDate}
                disabled={isMilestone}
                onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div style={{ ...FIELD, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="isMilestone" checked={isMilestone}
              onChange={e => setIsMilestone(e.target.checked)} style={{ width: 16, height: 16 }} />
            <label htmlFor="isMilestone" style={{ ...LABEL, cursor: 'pointer' }}>
              マイルストーン（◇ 菱形で表示、期間ゼロ）
            </label>
          </div>

          {/* 親タスク */}
          <div style={FIELD}>
            <label style={LABEL}>親タスク</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...INPUT, width: 72, flexShrink: 0 }}
                type="number"
                min={1}
                placeholder="#"
                value={parentId ? (selectableTasks.find(t => t.id === parentId)?.order ?? '') : ''}
                onChange={e => {
                  const num = parseInt(e.target.value, 10);
                  const found = selectableTasks.find(t => t.order === num);
                  setParentId(found ? found.id : '');
                }}
              />
              <select style={{ ...INPUT, flex: 1 }} value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">なし（ルートタスク）</option>
                {selectableTasks.map(t => (
                  <option key={t.id} value={t.id}>
                    #{t.order} {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 先行タスク */}
          {selectableTasks.length > 0 && (
            <div style={FIELD}>
              <label style={LABEL}>先行タスク（複数選択可）</label>
              <input
                style={{ ...INPUT, marginBottom: 6 }}
                placeholder="# で指定（例: 1, 3, 5）"
                value={predecessorText}
                onChange={e => {
                  const text = e.target.value;
                  setPredecessorText(text);
                  const nums = text.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
                  const ids = nums
                    .map(n => selectableTasks.find(t => t.order === n)?.id)
                    .filter((id): id is string => !!id);
                  setPredecessors([...new Set(ids)]);
                }}
              />
              <div style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, maxHeight: 120, overflowY: 'auto' }}>
                {selectableTasks.map(t => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={predecessors.includes(t.id)}
                      onChange={() => togglePredecessor(t.id)} />
                    <span style={{ fontSize: 13 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1', marginRight: 4 }}>
                        #{t.order}
                      </span>
                      {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
              キャンセル
            </button>
            <button type="submit"
              style={{ padding: '8px 16px', border: 'none', borderRadius: 4, background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
