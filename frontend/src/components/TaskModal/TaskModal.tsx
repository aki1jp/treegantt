import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
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
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4, fontSize: 14, width: '100%',
  background: 'var(--th-input-bg)', color: 'var(--th-text)',
};

export function TaskModal({ task, allTasks, initialParentId, onSave, onClose }: Props) {
  const [shaking, setShaking] = useState(false);
  const [title, setTitle]             = useState(task?.title ?? '');
  const [summary, setSummary]         = useState(task?.summary ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [descTab, setDescTab]         = useState<'edit' | 'preview'>('edit');
  const [status, setStatus]           = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority]       = useState<TaskPriority>(task?.priority ?? 'medium');
  const [progress, setProgress]       = useState(task?.progress ?? 0);
  const [assignee, setAssignee]       = useState(task?.assignee ?? '');
  const [startDate, setStartDate]     = useState(task?.startDate ?? '');
  const [endDate, setEndDate]         = useState(task?.endDate ?? '');
  const [parentId, setParentId]       = useState<string>(task?.parentId ?? initialParentId ?? '');
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
    setDescTab('edit');
    setStatus(task?.status ?? 'todo');
    setPriority(task?.priority ?? 'medium');
    setProgress(task?.progress ?? 0);
    setAssignee(task?.assignee ?? '');
    setStartDate(task?.startDate ?? '');
    setEndDate(task?.endDate ?? '');
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

  const selectableTasks = allTasks.filter(t => t.id !== task?.id);
  const parentCandidates = selectableTasks.filter(t => !t.isMilestone);
  const hasChildren = task ? allTasks.some(t => t.parentId === task.id) : false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let sd = startDate || null;
    let ed = endDate || null;
    if (sd && ed && ed < sd) { [sd, ed] = [ed, sd]; }
    onSave({
      title: title.trim(),
      summary,
      description,
      status,
      priority,
      progress,
      assignee,
      startDate: sd,
      endDate: ed,
      isMilestone: false,
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

  const dirtyFields = {
    title:        title        !== (task?.title        ?? ''),
    summary:      summary      !== (task?.summary      ?? ''),
    description:  description  !== (task?.description  ?? ''),
    status:       status       !== (task?.status       ?? 'todo'),
    priority:     priority     !== (task?.priority     ?? 'medium'),
    progress:     progress     !== (task?.progress     ?? 0),
    assignee:     assignee     !== (task?.assignee     ?? ''),
    startDate:    startDate    !== (task?.startDate    ?? ''),
    endDate:      endDate      !== (task?.endDate      ?? ''),
    parentId:     parentId     !== (task?.parentId ?? initialParentId ?? ''),
    predecessors: JSON.stringify([...predecessors].sort()) !== JSON.stringify([...(task?.predecessors ?? [])].sort()),
  };
  const isDirty = Object.values(dirtyFields).some(Boolean);

  function handleBackdropClick() {
    if (isDirty) {
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } else {
      onClose();
    }
  }

  function shakeProps(dirty: boolean) {
    return dirty && shaking
      ? { 'data-shaking': true, style: { ...FIELD, animation: 'field-shake 0.45s ease' } }
      : { style: FIELD };
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={handleBackdropClick}>
      <div style={{
        background: 'var(--th-bg)', borderRadius: 8, padding: 24, width: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.3)', color: 'var(--th-text)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>
          {task ? 'タスク編集' : 'タスク作成'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div data-field="title" {...shakeProps(dirtyFields.title)}>
            <label style={LABEL}>タイトル *</label>
            <input style={INPUT} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />
          </div>

          <div data-field="summary" {...shakeProps(dirtyFields.summary)}>
            <label style={LABEL}>サマリ</label>
            <input style={INPUT} value={summary} onChange={e => setSummary(e.target.value)} maxLength={500} />
          </div>

          <div data-field="description" {...shakeProps(dirtyFields.description)}>
            {/* タブヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--th-input-border)', marginBottom: 0 }}>
              <label style={{ ...LABEL, marginBottom: 0, marginRight: 12 }}>説明</label>
              {(['edit', 'preview'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-label={tab === 'edit' ? '編集' : 'プレビュー'}
                  onClick={() => setDescTab(tab)}
                  style={{
                    padding: '4px 12px', border: 'none', borderBottom: descTab === tab ? '2px solid #4f46e5' : '2px solid transparent',
                    background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: descTab === tab ? 700 : 400,
                    color: descTab === tab ? '#4f46e5' : 'var(--th-text-muted)', marginBottom: -1,
                  }}
                >
                  {tab === 'edit' ? '編集' : 'プレビュー'}
                </button>
              ))}
            </div>

            {/* 編集タブ */}
            {descTab === 'edit' && (
              <textarea
                aria-label="説明"
                style={{ ...INPUT, minHeight: 80, resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            )}

            {/* プレビュータブ */}
            {descTab === 'preview' && (
              <div style={{
                ...INPUT, minHeight: 80, overflowY: 'auto',
                fontSize: 13, lineHeight: 1.7,
              }}>
                {description.trim() ? (
                  <ReactMarkdown>{description}</ReactMarkdown>
                ) : (
                  <span style={{ color: 'var(--th-text-ph)', fontStyle: 'italic' }}>説明がありません</span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div data-field="status" {...shakeProps(dirtyFields.status)}>
              <label style={LABEL}>ステータス</label>
              <select style={INPUT} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div data-field="priority" {...shakeProps(dirtyFields.priority)}>
              <label style={LABEL}>優先度</label>
              <select style={INPUT} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div data-field="progress" {...shakeProps(dirtyFields.progress)}>
            <label style={LABEL}>進捗率: {progress}%</label>
            <input type="range" min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%' }} />
          </div>

          <div data-field="assignee" {...shakeProps(dirtyFields.assignee)}>
            <label style={LABEL}>担当者</label>
            <input style={INPUT} value={assignee} onChange={e => setAssignee(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div data-field="startDate" {...shakeProps(dirtyFields.startDate)}>
              <label style={LABEL}>
                開始日{hasChildren && <span style={{ fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }}>(自動)</span>}
              </label>
              <input style={{ ...INPUT, opacity: hasChildren ? 0.5 : 1 }} type="date" value={startDate}
                disabled={hasChildren}
                onChange={e => setStartDate(e.target.value)}
                title={hasChildren ? '子タスクの日付から自動計算されます' : undefined} />
            </div>
            <div data-field="endDate" {...shakeProps(dirtyFields.endDate)}>
              <label style={LABEL}>
                終了日{hasChildren && <span style={{ fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }}>(自動)</span>}
              </label>
              <input style={{ ...INPUT, opacity: hasChildren ? 0.5 : 1 }} type="date" value={endDate}
                disabled={hasChildren}
                onChange={e => setEndDate(e.target.value)}
                title={hasChildren ? '子タスクの日付から自動計算されます' : undefined} />
            </div>
          </div>

          {/* 親タスク（マイルストーンは親になれない） */}
          <div data-field="parentId" {...shakeProps(dirtyFields.parentId)}>
            <label style={LABEL}>親タスク</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...INPUT, width: 72, flexShrink: 0 }}
                type="number"
                min={1}
                placeholder="#"
                value={parentId ? (parentCandidates.find(t => t.id === parentId)?.order ?? '') : ''}
                onChange={e => {
                  const num = parseInt(e.target.value, 10);
                  const found = parentCandidates.find(t => t.order === num);
                  setParentId(found ? found.id : '');
                }}
              />
              <select style={{ ...INPUT, flex: 1 }} value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">なし（ルートタスク）</option>
                {parentCandidates.map(t => (
                  <option key={t.id} value={t.id}>
                    #{t.order} {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 先行タスク */}
          {selectableTasks.length > 0 && (
            <div data-field="predecessors" {...shakeProps(dirtyFields.predecessors)}>
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
              <div style={{ border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8, maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)' }}>
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
              style={{ padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4, background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer' }}>
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
