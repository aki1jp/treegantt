import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { ja } from '../../i18n/ja';
import { en } from '../../i18n/en';

// クラスコンポーネント（React フックが使えない）向けに non-hook で locale を参照する。
// useTranslation.ts の locale/dict 構造と同じもの（同ファイルの export はしない方針のため
// ここでは ja/en を直接束ねる）。
const dictionaries = { ja, en } as const;

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

    const locale = useTaskStore.getState().locale;
    const dict = dictionaries[locale];

    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--th-bg, #fff)', color: 'var(--th-text, #111)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        zIndex: 99999,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{dict['errorBoundary.title']}</div>
        <div style={{ fontSize: 13, color: 'var(--th-text-muted, #666)' }}>
          {dict['errorBoundary.message']}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 20px', fontSize: 14, borderRadius: 6, border: '1px solid var(--th-border, #ccc)',
            background: 'var(--th-accent, #4f46e5)', color: '#fff', cursor: 'pointer',
          }}
        >
          {dict['errorBoundary.reloadButton']}
        </button>
      </div>
    );
  }
}
