import { useToastStore, type ToastType } from '../../store/toastStore';

const TOAST_COLORS: Record<ToastType, { bg: string; fg: string }> = {
  error:   { bg: '#dc2626', fg: '#ffffff' },
  success: { bg: '#16a34a', fg: '#ffffff' },
  info:    { bg: '#4f46e5', fg: '#ffffff' },
};

// トースト通知（§9.9）。右下固定・種別ごとの自動消滅（ストア側）・手動クローズ。
// テーマ（light/dark）に依らず固定の濃色背景＋白文字で表示するオーバーレイ要素。
export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const removeToast = useToastStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 360,
      }}
    >
      {toasts.map(t => {
        const colors = TOAST_COLORS[t.type];
        return (
          <div
            key={t.id}
            data-testid="toast"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              minWidth: 240, padding: '10px 14px', borderRadius: 8,
              background: colors.bg, color: colors.fg,
              boxShadow: '0 4px 16px rgba(0,0,0,.25)', fontSize: 13,
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              aria-label="閉じる"
              style={{
                background: 'transparent', border: 'none', color: colors.fg,
                cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2, flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
