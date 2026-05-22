import { useConnectionStore } from '../../store/connectionStore';

// WiFiアイコン（接続中）
function WifiIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
      <circle cx="7" cy="10.5" r="1.5" fill="currentColor" />
      <path d="M3.8 7.5a4.5 4.5 0 016.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M1.2 5a8 8 0 0111.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// WiFi✕アイコン（未接続）
function WifiOffIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden="true">
      <circle cx="7" cy="10.5" r="1.5" fill="currentColor" opacity="0.5" />
      <path d="M3.8 7.5a4.5 4.5 0 016.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M1.2 5a8 8 0 0111.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <line x1="2" y1="1" x2="12" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// スピナーアイコン（接続中...）
function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
      style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray="14 8" strokeLinecap="round" />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

const STYLES: Record<string, { bg: string; label: string; Icon: () => JSX.Element }> = {
  connected:    { bg: '#16a34a', label: '接続中',   Icon: WifiIcon    },
  connecting:   { bg: '#d97706', label: '接続中...', Icon: SpinnerIcon },
  disconnected: { bg: '#dc2626', label: '未接続',   Icon: WifiOffIcon },
};

export function ConnectionBadge() {
  const status = useConnectionStore(s => s.status);
  const { bg, label, Icon } = STYLES[status];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 9999,
      background: bg,
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
    }}>
      <Icon />
      {label}
    </span>
  );
}
