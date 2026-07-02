import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--th-bg, #fff)', color: 'var(--th-text, #111)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        zIndex: 99999,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>予期しないエラーが発生しました</div>
        <div style={{ fontSize: 13, color: 'var(--th-text-muted, #666)' }}>
          お手数ですが、再読み込みしてください。
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 20px', fontSize: 14, borderRadius: 6, border: '1px solid var(--th-border, #ccc)',
            background: 'var(--th-accent, #4f46e5)', color: '#fff', cursor: 'pointer',
          }}
        >
          再読み込み
        </button>
      </div>
    );
  }
}
