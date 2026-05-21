const FIELD_LABEL: Record<string, string> = {
  title:       'タイトル',
  status:      'ステータス',
  priority:    '優先度',
  progress:    '進捗',
  assignee:    '担当者',
  startDate:   '開始日',
  endDate:     '終了日',
  summary:     'サマリ',
  description: '説明',
  parentId:    '親タスク',
};

interface Props {
  field:      string;
  theirVal:   string;
  myVal:      string;
  onResolve:  (useTheirs: boolean) => void;
}

export function ConflictDialog({ field, theirVal, myVal, onResolve }: Props) {
  const label = FIELD_LABEL[field] ?? field;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: '28px 32px',
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.18)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          ⚠️ 編集中に別のユーザーが変更しました
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
          フィールド: <strong>{label}</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: '#fef3c7', border: '1px solid #fbbf24',
          }}>
            <div style={{ fontSize: 11, color: '#92400e', fontWeight: 600, marginBottom: 4 }}>
              別のユーザーの変更
            </div>
            <div style={{ fontSize: 14 }}>{theirVal || '（空）'}</div>
          </div>

          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: '#eff6ff', border: '1px solid #93c5fd',
          }}>
            <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>
              あなたの変更
            </div>
            <div style={{ fontSize: 14 }}>{myVal || '（空）'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => onResolve(true)} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
            background: '#fff', cursor: 'pointer', fontSize: 13,
          }}>
            別のユーザーの変更を使う
          </button>
          <button onClick={() => onResolve(false)} style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: '#4f46e5', color: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
          }}>
            自分の変更を適用する
          </button>
        </div>
      </div>
    </div>
  );
}
