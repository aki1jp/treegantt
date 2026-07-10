import { useTranslation } from '../../i18n/useTranslation';

// 展開/折りたたみ操作ボタン群（⊟/1/2/3/⊞）。
// WbsPanel（タイトル列見出し）と TaskContextMenus（タイトル列見出し右クリック）の
// 2箇所で重複定義されていたものを共通化（挙動不変の抽出、D4）。
interface Props {
  variant: 'compact' | 'boxed';
  collapseAll: () => void;
  expandToDepth: (depth: number) => void;
  expandAll: () => void;
  onSelect: (action: () => void, e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function ExpandCollapseButtons({ variant, collapseAll, expandToDepth, expandAll, onSelect }: Props) {
  const { t } = useTranslation();
  const items = [
    { label: '⊟', title: t('wbs.expandCollapse.collapseAll'), action: collapseAll },
    { label: '1',  title: t('wbs.expandCollapse.toDepth', { depth: 1 }), action: () => expandToDepth(1) },
    { label: '2',  title: t('wbs.expandCollapse.toDepth', { depth: 2 }), action: () => expandToDepth(2) },
    { label: '3',  title: t('wbs.expandCollapse.toDepth', { depth: 3 }), action: () => expandToDepth(3) },
    { label: '⊞', title: t('wbs.expandCollapse.expandAll'), action: expandAll },
  ];

  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
        {items.map(({ label, title, action }) => (
          <button key={label} title={title} aria-label={title}
            onClick={e => onSelect(action, e)}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--th-text-dim)', padding: '1px 3px', borderRadius: 2,
              lineHeight: 1, fontWeight: 600, fontFamily: 'monospace' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--th-text-dim)'; }}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {items.map(({ label, title, action }) => (
        <button key={label} title={title} aria-label={title}
          onClick={e => onSelect(action, e)}
          style={{
            flex: 1, padding: '4px 0', border: '1px solid var(--th-border)',
            background: 'var(--th-bg2)', cursor: 'pointer', fontSize: 12,
            color: 'var(--th-text2)', borderRadius: 3, fontFamily: 'monospace', fontWeight: 600,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; e.currentTarget.style.borderColor = '#a5b4fc'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--th-bg2)'; e.currentTarget.style.color = 'var(--th-text2)'; e.currentTarget.style.borderColor = 'var(--th-border)'; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
