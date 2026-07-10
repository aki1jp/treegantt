import { useState, useEffect } from 'react';
import { MarkdownBody } from '../MarkdownBody/MarkdownBody';
import type { Task, TaskStatus, TaskPriority, RefProject } from '../../types/task';
import { getUniqueAssignees, isAncestorOrDescendant, isAncestorOf, wouldCreateDepCycle } from '../../utils/ganttCalc';
import { parseDuration, formatMinutes, HARDCODED_CAPACITY_MINUTES } from '../../utils/duration';
import { isReadonlyTask } from '../../utils/refTasks';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  task: Task | null;
  allTasks: Task[];
  initialParentId?: string;
  onSave: (data: Partial<Task> & { title: string }) => void;
  onClose: () => void;
  /** 予定工数の 1d/1w 換算に使う実効キャパ（分）。既定 480 */
  capacityMinutes?: number;
  /** 1週あたりの稼働日数。既定 5 */
  workingDaysPerWeek?: number;
  /** クロスプロジェクト参照（§5.8）: 現プロジェクトID。task が他プロジェクト所属なら readOnly モード */
  currentProjectId?: string;
  /** 「外部の先行タスク（参照済み）」チェックリストの候補（現プロジェクトの参照タスク） */
  refTasks?: Task[];
  /** 参照先プロジェクトの表示名・配色（🔗 プロジェクト名 表示用） */
  refProjects?: RefProject[];
  /** readOnly モードの「参照先プロジェクトを開く」ボタン */
  onOpenRefProject?: (projectId: string) => void;
}

const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4, fontSize: 14, width: '100%',
  background: 'var(--th-input-bg)', color: 'var(--th-text)',
};

export function TaskModal({
  task, allTasks, initialParentId, onSave, onClose,
  capacityMinutes = HARDCODED_CAPACITY_MINUTES, workingDaysPerWeek = 5,
  currentProjectId, refTasks = [], refProjects = [], onOpenRefProject,
}: Props) {
  const { t } = useTranslation();
  const ESTIMATE_HELP = t('taskModal.estimateHelp');
  const STATUS_LABELS: Record<TaskStatus, string> = {
    todo: 'TODO', wip: 'Doing', done: 'DONE', wait: t('toolbar.status.wait'), pending: t('toolbar.status.pending'),
  };
  const PRIORITY_LABELS: Record<TaskPriority, string> = {
    critical: t('toolbar.priority.critical'), high: t('toolbar.priority.high'),
    medium: t('toolbar.priority.medium'), low: t('toolbar.priority.low'),
  };

  // クロスプロジェクト参照（§5.8）: 参照タスク自身を開いた場合は readOnly モード
  const isReadOnly = task ? isReadonlyTask(task, currentProjectId) : false;
  const [shaking, setShaking] = useState(false);
  const [title, setTitle]             = useState(task?.title ?? '');
  const [summary, setSummary]         = useState(task?.summary ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [descTab, setDescTab]         = useState<'edit' | 'preview'>('edit');
  const [status, setStatus]           = useState<TaskStatus>(task?.status ?? 'todo');
  const [priority, setPriority]       = useState<TaskPriority>(task?.priority ?? 'medium');
  const [progress, setProgress]       = useState(task?.progress ?? 0);
  const [assignee, setAssignee]       = useState(task?.assignee ?? '');
  const [estimateText, setEstimateText] = useState(formatMinutes(task?.estimateMinutes ?? null));
  const [startDate, setStartDate]     = useState(task?.startDate ?? '');
  const [endDate, setEndDate]         = useState(task?.endDate ?? '');
  const [parentId, setParentId]       = useState<string>(task?.parentId ?? initialParentId ?? '');
  const [predecessors, setPredecessors] = useState<string[]>(task?.predecessors ?? []);
  const [predecessorText, setPredecessorText] = useState(
    (task?.predecessors ?? [])
      .map(id => allTasks.find(t => t.id === id)?.seq)
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
    setEstimateText(formatMinutes(task?.estimateMinutes ?? null));
    setStartDate(task?.startDate ?? '');
    setEndDate(task?.endDate ?? '');
    setParentId(task?.parentId ?? initialParentId ?? '');
    const initPreds = task?.predecessors ?? [];
    setPredecessors(initPreds);
    setPredecessorText(
      initPreds
        .map(id => allTasks.find(t => t.id === id)?.seq)
        .filter((o): o is number => o !== undefined)
        .join(', ')
    );
  }, [task]);

  const selectableTasks = allTasks.filter(t => t.id !== task?.id);
  const taskById = new Map(allTasks.map(t => [t.id, t]));
  const predecessorCandidates = task
    ? allTasks.filter(t =>
        t.id !== task.id &&
        !isAncestorOrDescendant(t.id, task.id, taskById) &&
        !wouldCreateDepCycle(t.id, task.id, taskById)
      )
    : allTasks;
  const parentCandidates = selectableTasks.filter(t =>
    !t.isMilestone &&
    !(task && isAncestorOf(task.id, t.id, taskById))
  );
  const hasChildren = task ? allTasks.some(t => t.parentId === task.id) : false;

  // 外部の先行タスク（参照済み, §5.8）: 循環判定は現プロジェクト＋参照タスクを統合した taskById で行う
  const mergedTaskById = new Map([...allTasks, ...refTasks].map(t => [t.id, t]));
  const refProjectById = new Map(refProjects.map(p => [p.id, p]));
  const refCandidates = task
    ? refTasks.filter(t => !wouldCreateDepCycle(t.id, task.id, mergedTaskById))
    : refTasks;

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
      estimateMinutes: parseDuration(estimateText, { capacityMinutes, workingDaysPerWeek }),
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
          .map(pid => allTasks.find(t => t.id === pid)?.seq)
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
    estimateMinutes: parseDuration(estimateText, { capacityMinutes, workingDaysPerWeek }) !== (task?.estimateMinutes ?? null),
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
      <div data-testid="task-modal-panel" style={{
        background: 'var(--th-bg)', borderRadius: 8, padding: 24, width: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.3)', color: 'var(--th-text)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>
          {task ? t('taskModal.editTitle') : t('taskModal.createTitle')}
        </h2>

        <form onSubmit={handleSubmit}>
          <div data-field="title" {...shakeProps(dirtyFields.title)}>
            <label style={LABEL}>{t('taskModal.titleLabel')} *</label>
            <input style={INPUT} aria-label={t('taskModal.titleLabel')} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} disabled={isReadOnly} />
          </div>

          <div data-field="summary" {...shakeProps(dirtyFields.summary)}>
            <label style={LABEL}>{t('taskModal.summaryLabel')}</label>
            <input style={INPUT} aria-label={t('taskModal.summaryLabel')} value={summary} onChange={e => setSummary(e.target.value)} maxLength={500} disabled={isReadOnly} />
          </div>

          <div data-field="description" {...shakeProps(dirtyFields.description)}>
            {/* タブヘッダー */}
            <div role="tablist" aria-label={t('taskModal.descTab.tablistAriaLabel')} style={{ display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--th-input-border)', marginBottom: 0 }}>
              <label style={{ ...LABEL, marginBottom: 0, marginRight: 12 }}>{t('taskModal.descriptionLabel')}</label>
              {(['edit', 'preview'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-label={tab === 'edit' ? t('taskModal.descTab.edit') : t('taskModal.descTab.preview')}
                  onClick={() => setDescTab(tab)}
                  style={{
                    padding: '4px 12px', border: 'none', borderBottom: descTab === tab ? '2px solid #4f46e5' : '2px solid transparent',
                    background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: descTab === tab ? 700 : 400,
                    color: descTab === tab ? '#4f46e5' : 'var(--th-text-muted)', marginBottom: -1,
                  }}
                >
                  {tab === 'edit' ? t('taskModal.descTab.edit') : t('taskModal.descTab.preview')}
                </button>
              ))}
            </div>

            {/* 編集タブ */}
            {descTab === 'edit' && (
              <textarea
                aria-label={t('taskModal.descriptionLabel')}
                style={{ ...INPUT, minHeight: 80, resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isReadOnly}
              />
            )}

            {/* プレビュータブ */}
            {descTab === 'preview' && (
              <div style={{
                ...INPUT, minHeight: 80, overflowY: 'auto',
                fontSize: 13, lineHeight: 1.7,
              }}>
                {description.trim() ? (
                  <MarkdownBody>{description}</MarkdownBody>
                ) : (
                  <span style={{ color: 'var(--th-text-ph)', fontStyle: 'italic' }}>{t('taskModal.descTab.empty')}</span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div data-field="status" {...shakeProps(dirtyFields.status)}>
              <label style={LABEL}>{t('taskModal.statusLabel')}</label>
              <select style={INPUT} aria-label={t('taskModal.statusLabel')} value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={isReadOnly}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div data-field="priority" {...shakeProps(dirtyFields.priority)}>
              <label style={LABEL}>{t('taskModal.priorityLabel')}</label>
              <select style={INPUT} aria-label={t('taskModal.priorityLabel')} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} disabled={isReadOnly}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div data-field="progress" {...shakeProps(dirtyFields.progress)}>
            <label style={LABEL}>{t('taskModal.progressLabel', { progress })}</label>
            <input type="range" aria-label={t('taskModal.progressAriaLabel')} min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%' }} disabled={isReadOnly} />
          </div>

          <div data-field="assignee" {...shakeProps(dirtyFields.assignee)}>
            <label style={LABEL}>{t('taskModal.assigneeLabel')}</label>
            <input style={INPUT} aria-label={t('taskModal.assigneeLabel')} value={assignee} list="assignee-opts-modal"
              onChange={e => setAssignee(e.target.value)} disabled={isReadOnly} />
            <datalist id="assignee-opts-modal">
              {getUniqueAssignees(allTasks).map(a => <option key={a} value={a} />)}
            </datalist>
          </div>

          <div data-field="estimateMinutes" {...shakeProps(dirtyFields.estimateMinutes)}>
            <label style={LABEL}>
              {t('taskModal.estimateLabel')}
              <span title={ESTIMATE_HELP} style={{
                marginLeft: 6, cursor: 'help', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: 7, fontSize: 10,
                border: '1px solid var(--th-text-muted)', color: 'var(--th-text-muted)',
              }}>?</span>
            </label>
            <input style={INPUT} value={estimateText}
              placeholder={t('taskModal.estimatePlaceholder')}
              onChange={e => setEstimateText(e.target.value)} disabled={isReadOnly} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div data-field="startDate" {...shakeProps(dirtyFields.startDate)}>
              <label style={LABEL}>
                {t('taskModal.startDateLabel')}{hasChildren && <span style={{ fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }}>{t('taskModal.autoSuffix')}</span>}
              </label>
              <input style={{ ...INPUT, opacity: hasChildren ? 0.5 : 1 }} type="date" aria-label={t('taskModal.startDateLabel')} value={startDate}
                disabled={hasChildren || isReadOnly}
                onChange={e => setStartDate(e.target.value)}
                title={hasChildren ? t('taskModal.autoDateTitle') : undefined} />
            </div>
            <div data-field="endDate" {...shakeProps(dirtyFields.endDate)}>
              <label style={LABEL}>
                {t('taskModal.endDateLabel')}{hasChildren && <span style={{ fontSize: 10, color: 'var(--th-text-muted)', marginLeft: 4 }}>{t('taskModal.autoSuffix')}</span>}
              </label>
              <input style={{ ...INPUT, opacity: hasChildren ? 0.5 : 1 }} type="date" aria-label={t('taskModal.endDateLabel')} value={endDate}
                disabled={hasChildren || isReadOnly}
                onChange={e => setEndDate(e.target.value)}
                title={hasChildren ? t('taskModal.autoDateTitle') : undefined} />
            </div>
          </div>

          {/* 親タスク（マイルストーンは親になれない） */}
          <div data-field="parentId" {...shakeProps(dirtyFields.parentId)}>
            <label style={LABEL}>{t('taskModal.parentTaskLabel')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...INPUT, width: 72, flexShrink: 0 }}
                type="number"
                min={1}
                placeholder="#"
                value={parentId ? (parentCandidates.find(t => t.id === parentId)?.seq ?? '') : ''}
                onChange={e => {
                  const num = parseInt(e.target.value, 10);
                  const found = parentCandidates.find(t => t.seq === num);
                  setParentId(found ? found.id : '');
                }}
                disabled={isReadOnly}
              />
              <select style={{ ...INPUT, flex: 1 }} aria-label={t('taskModal.parentTaskLabel')} value={parentId} onChange={e => setParentId(e.target.value)} disabled={isReadOnly}>
                <option value="">{t('taskModal.parentTaskNone')}</option>
                {parentCandidates.map(t => (
                  <option key={t.id} value={t.id}>
                    #{t.seq} {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 先行タスク */}
          {predecessorCandidates.length > 0 && (
            <div data-field="predecessors" {...shakeProps(dirtyFields.predecessors)}>
              <label style={LABEL}>{t('taskModal.predecessorsLabel')}</label>
              <input
                style={{ ...INPUT, marginBottom: 6 }}
                placeholder={t('taskModal.predecessorsPlaceholder')}
                value={predecessorText}
                onChange={e => {
                  const text = e.target.value;
                  setPredecessorText(text);
                  const nums = text.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
                  const ids = nums
                    .map(n => predecessorCandidates.find(t => t.seq === n)?.id)
                    .filter((id): id is string => !!id);
                  setPredecessors([...new Set(ids)]);
                }}
                disabled={isReadOnly}
              />
              <div style={{ border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8, maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)' }}>
                {predecessorCandidates.map(t => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={predecessors.includes(t.id)}
                      onChange={() => togglePredecessor(t.id)} disabled={isReadOnly} />
                    <span style={{ fontSize: 13 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1', marginRight: 4 }}>
                        #{t.seq}
                      </span>
                      {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 外部の先行タスク（参照済み, §5.8）: 既存の #seq 入力とは別枠のチェックリスト */}
          {refCandidates.length > 0 && (
            <div data-field="externalPredecessors" style={FIELD}>
              <label style={LABEL}>{t('taskModal.externalPredecessorsLabel')}</label>
              <div style={{ border: '1px solid var(--th-input-border)', borderRadius: 4, padding: 8, maxHeight: 120, overflowY: 'auto', background: 'var(--th-input-bg)' }}>
                {refCandidates.map(t => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" checked={predecessors.includes(t.id)}
                      onChange={() => togglePredecessor(t.id)} disabled={isReadOnly} />
                    <span style={{ fontSize: 13 }}>
                      🔗 {refProjectById.get(t.projectId)?.name ?? '?'}
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6366f1', margin: '0 4px' }}>
                        #{t.seq}
                      </span>
                      {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            {isReadOnly ? (
              <>
                <button type="button" onClick={onClose}
                  style={{ padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4, background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer' }}>
                  {t('common.close')}
                </button>
                <button type="button" onClick={() => task && onOpenRefProject?.(task.projectId)}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: 4, background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {t('taskModal.openRefProject')}
                </button>
              </>
            ) : (<>
            <button type="button" onClick={onClose}
              style={{ padding: '8px 16px', border: '1px solid var(--th-input-border)', borderRadius: 4, background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
            <button type="submit"
              style={{ padding: '8px 16px', border: 'none', borderRadius: 4, background: '#4f46e5', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {t('common.save')}
            </button>
            </>)}
          </div>
        </form>
      </div>
    </div>
  );
}
