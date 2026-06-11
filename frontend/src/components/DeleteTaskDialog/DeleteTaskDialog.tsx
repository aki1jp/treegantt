export type DeleteMode = 'subtree' | 'single';

interface Props {
  taskTitle:       string;
  descendantCount: number;
  onDelete:        (mode: DeleteMode) => void;
  onCancel:        () => void;
}

const BTN_BASE: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 6, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, textAlign: 'left', border: '1px solid var(--th-border)',
};

export function DeleteTaskDialog({ taskTitle, descendantCount, onDelete, onCancel }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--th-bg)', borderRadius: 10, padding: '28px 32px',
        width: 440, boxShadow: '0 8px 32px rgba(0,0,0,.25)', color: 'var(--th-text)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          🗑 タスクの削除
        </div>
        <div style={{ fontSize: 13, color: 'var(--th-text-muted)', marginBottom: 20 }}>
          「<strong>{taskTitle}</strong>」には子孫タスクが <strong>{descendantCount}</strong> 件あります。削除方法を選択してください。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => onDelete('subtree')}
            style={{
              ...BTN_BASE,
              background: '#ef4444', color: '#fff', border: '1px solid #dc2626',
            }}
          >
            子孫ごと削除
            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, color: 'rgba(255,255,255,.85)' }}>
              このタスクと子孫タスク {descendantCount} 件をすべて削除します
            </div>
          </button>
          <button
            onClick={() => onDelete('single')}
            style={{ ...BTN_BASE, background: 'var(--th-bg2)', color: 'var(--th-text)' }}
          >
            このタスクのみ削除
            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, color: 'var(--th-text-muted)' }}>
              子タスクは1つ上の階層へ移動します
            </div>
          </button>
        </div>

        <button
          onClick={onCancel}
          style={{
            ...BTN_BASE, textAlign: 'center', fontWeight: 400,
            background: 'transparent', color: 'var(--th-text-muted)',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
