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
