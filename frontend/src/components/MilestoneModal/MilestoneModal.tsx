import { useState, useEffect } from 'react';
import type { Task } from '../../types/task';

interface Props {
  task: Task | null;
  allTasks: Task[];
  onSave: (data: Partial<Task> & { title: string }) => void;
  onClose: () => void;
}

const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4,
  fontSize: 14, width: '100%', background: 'var(--th-input-bg)', color: 'var(--th-text)',
};

export function MilestoneModal({ task, allTasks, onSave, onClose }: Props) {
  const [title, setTitle]       = useState(task?.title    ?? '');
  const [date, setDate]         = useState(task?.startDate ?? '');
  const [assignee, setAssignee] = useState(task?.assignee  ?? '');
  const [predecessors, setPredecessors] = useState<string[]>(task?.predecessors ?? []);
  const [predecessorText, setPredecessorText] = useState(
    (task?.predecessors ?? [])
      .map(id => allTasks.find(t => t.id === id)?.order)
      .filter((o): o is number => o !== undefined)
      .join(', ')
  );

  useEffect(() => {
    setTitle(task?.title     ?? '');
    setDate(task?.startDate  ?? '');
    setAssignee(task?.assignee ?? '');
    const initPreds = task?.predecessors ?? [];
    setPredecessors(initPreds);
    setPredecessorText(
      initPreds
        .map(id => allTasks.find(t => t.id === id)?.order)
        .filter((o): o is number => o !== undefined)
        .join(', ')
    );
  }, [task]);

  const candidates = allTasks.filter(t => t.id !== task?.id);

  function togglePredecessor(id: string) {
    setPredecessors(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      setPredecessorText(
        next
          .map(pid => candidates.find(t => t.id === pid)?.order)
          .filter((o): o is number => o !== undefined)
          .join(', ')
      );
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title:       title.trim(),
      assignee,
      startDate:   date || null,
      endDate:     date || null,
      isMilestone: true,
      predecessors,
      summary:     task?.summary     ?? '',
      description: task?.description ?? '',
      status:      task?.status      ?? 'todo',
      priority:    task?.priority    ?? 'medium',
      progress:    task?.progress    ?? 0,
      parentId:    task?.parentId    ?? null,
    });
  }

  const isDirty =
    title !== (task?.title ?? '') ||
    date !== (task?.startDate ?? '') ||
    assignee !== (task?.assignee ?? '') ||
    JSON.stringify([...predecessors].sort()) !== JSON.stringify([...(task?.predecessors ?? [])].sort());

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={() => { if (!isDirty) onClose(); }}>
      <div style={{
        background: 'var(--th-bg)', borderRadius: 8, padding: 24, width: 480, maxHeight: '85vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.3)', color: 'var(--th-text)',
      }} onClick={e => e.stopPropagation()}>

        <h2 style={{ marginBottom: 4, fontSize: 18 }}>
          {task ? 'マイルストーン編集' : 'マイルストーン作成'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--th-text-muted)', marginBottom: 16, margin: '4px 0 16px' }}>
          ◇ 期間ゼロの到達点（チェックポイント）
        </p>

        <form onSubmit={handleSubmit}>
          <div style={FIELD}>
            <label style={LABEL}>タイトル *</label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)}
              required maxLength={200} autoFocus />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>日付</label>
            <input style={INPUT} type="date" value={date ?? ''}
              onChange={e => setDate(e.target.value)} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>担当者</label>
            <input style={INPUT} value={assignee} onChange={e => setAssignee(e.target.value)} />
          </div>

          {candidates.length > 0 && (
            <div style={FIELD}>
              <label style={LABEL}>先行タスク（複数選択可）</label>
              <input
                style={{ ...INPUT, marginBottom: 6 }}
                placeholder="# で指定（例: 1, 3）"
                value={predecessorText}
                onChange={e => {
                  const text = e.target.value;
                  setPredecessorText(text);
                  const nums = text.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
                  const ids = nums
                    .map(n => candidates.find(t => t.order === n)?.id)
                    .filter((id): id is string => !!id);
                  setPredecessors([...new Set(ids)]);
                }}
              />
              <div style={{
                border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8,
                maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)',
              }}>
                {candidates.map(t => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={predecessors.includes(t.id)}
                      onChange={() => togglePredecessor(t.id)} />
                    <span style={{ fontSize: 13 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1', marginRight: 4 }}>
                        #{t.order}
                      </span>
                      {t.isMilestone && <span style={{ marginRight: 4 }}>◇</span>}
                      {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4,
              background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer',
            }}>
              キャンセル
            </button>
            <button type="submit" style={{
              padding: '8px 16px', border: 'none', borderRadius: 4,
              background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600,
            }}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
