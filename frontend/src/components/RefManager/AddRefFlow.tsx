import { useEffect, useState } from 'react';
import type { Project, Task } from '../../types/task';
import { fetchAllTasks } from '../../utils/api';
import { showToast } from '../../store/toastStore';

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
      .catch((err: Error) => showToast('タスク一覧の取得に失敗しました: ' + err.message, 'error'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selectedProjectId]);

  if (projects.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--th-text-muted)' }}>参照できる他のプロジェクトがありません。</p>;
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
        <label style={LABEL}>参照先プロジェクト</label>
        <select
          aria-label="参照先プロジェクト"
          style={SELECT}
          value={selectedProjectId}
          onChange={e => { setSelectedProjectId(e.target.value); setSelectedTaskId(''); }}
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={LABEL}>参照するタスク</label>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--th-text-muted)' }}>読み込み中...</div>
        ) : (
          <select
            aria-label="参照するタスク"
            style={SELECT}
            value={selectedTaskId}
            onChange={e => setSelectedTaskId(e.target.value)}
          >
            <option value="">選択してください</option>
            {tasks.map(t => <option key={t.id} value={t.id}>#{t.seq} {t.title}</option>)}
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
          追加
        </button>
      </div>
    </div>
  );
}
