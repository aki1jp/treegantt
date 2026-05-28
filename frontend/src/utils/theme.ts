export type ThemeMode = 'light' | 'dark' | 'auto';

const LIGHT: Record<string, string> = {
  '--th-bg':            '#ffffff',
  '--th-bg2':           '#f9fafb',
  '--th-bg3':           '#f3f4f6',
  '--th-bg-alt':        '#fafafa',
  '--th-bg-parent':     '#eef2ff',
  '--th-border':        '#e5e7eb',
  '--th-border-strong': '#6366f1',
  '--th-text':          '#111827',
  '--th-text2':         '#374151',
  '--th-text-muted':    '#6b7280',
  '--th-text-dim':      '#9ca3af',
  '--th-text-ph':       '#d1d5db',
  '--th-text-parent':   '#3730a3',
  '--th-input-bg':      '#ffffff',
  '--th-input-border':  '#dddddd',
  // 競合ダイアログ: 「別のユーザーの変更」ブロック（アンバー系）
  '--th-conflict-their-bg':     '#fef3c7',
  '--th-conflict-their-border': '#fbbf24',
  '--th-conflict-their-label':  '#92400e',
  // 競合ダイアログ: 「あなたの変更」ブロック（ブルー系）
  '--th-conflict-mine-bg':      '#eff6ff',
  '--th-conflict-mine-border':  '#93c5fd',
  '--th-conflict-mine-label':   '#1e40af',
};

const DARK: Record<string, string> = {
  '--th-bg':            '#1f2937',
  '--th-bg2':           '#111827',
  '--th-bg3':           '#0f172a',
  '--th-bg-alt':        '#1a2535',
  '--th-bg-parent':     '#1e284a',
  '--th-border':        '#374151',
  '--th-border-strong': '#818cf8',
  '--th-text':          '#f9fafb',
  '--th-text2':         '#e5e7eb',
  '--th-text-muted':    '#9ca3af',
  '--th-text-dim':      '#6b7280',
  '--th-text-ph':       '#4b5563',
  '--th-text-parent':   '#a5b4fc',
  '--th-input-bg':      '#1f2937',
  '--th-input-border':  '#4b5563',
  // 競合ダイアログ: 「別のユーザーの変更」ブロック（アンバー系・ダーク）
  // ラベル #fcd34d on bg #451a03 → コントラスト比 9.98:1
  '--th-conflict-their-bg':     '#451a03',
  '--th-conflict-their-border': '#d97706',
  '--th-conflict-their-label':  '#fcd34d',
  // 競合ダイアログ: 「あなたの変更」ブロック（ブルー系・ダーク）
  // ラベル #93c5fd on bg #1e3a5f → コントラスト比 6.62:1
  '--th-conflict-mine-bg':      '#1e3a5f',
  '--th-conflict-mine-border':  '#3b82f6',
  '--th-conflict-mine-label':   '#93c5fd',
};

export function resolveTheme(mode: ThemeMode, systemDark: boolean): 'light' | 'dark' {
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

export function applyThemeVars(resolved: 'light' | 'dark'): void {
  const vars = resolved === 'dark' ? DARK : LIGHT;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}
