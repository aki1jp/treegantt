import { useEffect, useState } from 'react';
import type { Project, Task } from '../../types/task';
import { fetchAllTasks } from '../../utils/api';
import { showToast } from '../../store/toastStore';
import { useTranslation } from '../../i18n/useTranslation';
import { dictionaries } from '../../i18n/apiError';
import { useTaskStore } from '../../store/taskStore';

interface Props {
  /** 参照先候補プロジェクト一覧（呼び出し側で現プロジェクトを除外して渡す） */
  projects: Project[];
  onAdd: (refTaskId: string) => Promise<void>;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const SELECT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4, fontSize: 13, width: '100%',
  background: 'var(--th-input-bg)', color: 'var(--th-text)',
};

// クロスプロジェクト参照の追加フロー（プロジェクト選択→タスク選択→追加, §5.8）。
// 右クリックメニュー「🔗 参照を追加」・ツールバー「🔗 参照」の RefManagerModal 両入口から共通利用する。
export function AddRefFlow({ projects, onAdd }: Props) {
  const { t } = useTranslation();
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) { setTasks([]); return; }
    let alive = true;
    setLoading(true);
    fetchAllTasks(selectedProjectId)
      .then(d => { if (alive) setTasks(d.tasks); })
      .catch((err: Error) => {
        // 空 dep 相当のクロージャで t/locale を固定しないよう、catch 実行時点の最新 locale を読み直す
        const currentLocale = useTaskStore.getState().locale;
        const msg = dictionaries[currentLocale]['refManager.toast.fetchTasksFailed'].replaceAll('{message}', err.message);
        showToast(msg, 'error');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selectedProjectId]);

  if (projects.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--th-text-muted)' }}>{t('refManager.noOtherProjects')}</p>;
  }

  async function handleAdd() {
    if (!selectedTaskId) return;
    setAdding(true);
    try {
      await onAdd(selectedTaskId);
      setSelectedTaskId('');
    } catch {
      // 失敗トーストは呼び出し側（useProjectRefs.add）が表示済み。選択は保持して再試行できるようにする
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={LABEL}>{t('refManager.targetProjectLabel')}</label>
        <select
          aria-label={t('refManager.targetProjectLabel')}
          style={SELECT}
          value={selectedProjectId}
          onChange={e => { setSelectedProjectId(e.target.value); setSelectedTaskId(''); }}
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={LABEL}>{t('refManager.targetTaskLabel')}</label>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--th-text-muted)' }}>{t('refManager.loadingTasks')}</div>
        ) : (
          <select
            aria-label={t('refManager.targetTaskLabel')}
            style={SELECT}
            value={selectedTaskId}
            onChange={e => setSelectedTaskId(e.target.value)}
          >
            <option value="">{t('refManager.selectPlaceholder')}</option>
            {tasks.map(task => <option key={task.id} value={task.id}>#{task.seq} {task.title}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleAdd}
          disabled={!selectedTaskId || adding}
          style={{
            padding: '6px 14px', borderRadius: 4, border: 'none',
            background: (!selectedTaskId || adding) ? 'var(--th-border)' : '#4f46e5',
            color: '#fff', cursor: (!selectedTaskId || adding) ? 'default' : 'pointer', fontSize: 13,
          }}
        >
          {t('refManager.addButton')}
        </button>
      </div>
    </div>
  );
}
