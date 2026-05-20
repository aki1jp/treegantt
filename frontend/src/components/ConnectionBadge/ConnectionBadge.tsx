import { useConnectionStore } from '../../store/connectionStore';

const STYLES: Record<string, { bg: string; label: string }> = {
  connected:    { bg: '#22c55e', label: '接続中' },
  connecting:   { bg: '#f59e0b', label: '接続中...' },
  disconnected: { bg: '#ef4444', label: '未接続' },
};

export function ConnectionBadge() {
  const status = useConnectionStore(s => s.status);
  const { bg, label } = STYLES[status];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 9999,
      background: bg,
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
      {label}
    </span>
  );
}
