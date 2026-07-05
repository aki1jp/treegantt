import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../../store/taskStore';

// WBS 最終行のクイック追加インライン入力（GanttChart/WbsPanel から抽出、挙動不変, D4）。
export function QuickAddRow({ onAdd, titleWidth, assigneeWidth, dateColWidth }: { onAdd: (title: string) => Promise<void>; titleWidth: number; assigneeWidth: number; dateColWidth: number }) {
  const { uiRowHeight, uiFontSize } = useTaskStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  async function submit() {
    const t = title.trim();
    if (t) { await onAdd(t); setTitle(''); }
    setEditing(false);
  }

  const CELL: React.CSSProperties = {
    height: uiRowHeight, display: 'flex', alignItems: 'center',
    padding: '0 6px', fontSize: uiFontSize, overflow: 'hidden', boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'flex', background: 'var(--th-bg2)',
      height: uiRowHeight, boxSizing: 'border-box',
      borderTop: '1px dashed var(--th-border)',
    }}>
      <div style={{ ...CELL, width: 36 }} />
      <div style={{ ...CELL, width: titleWidth }}>
        {editing ? (
          <input ref={inputRef}
            style={{ width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3, fontSize: uiFontSize, outline: 'none' }}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={submit}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setTitle(''); setEditing(false); }
            }}
          />
        ) : (
          <span onClick={() => setEditing(true)}
            style={{ color: 'var(--th-text-dim)', cursor: 'text', fontSize: uiFontSize, userSelect: 'none' }}>
            ＋ タスクを追加…
          </span>
        )}
      </div>
      {[66, 56, 76, assigneeWidth, dateColWidth, dateColWidth, 50].map((w, i) => <div key={i} style={{ ...CELL, width: w }} />)}
    </div>
  );
}
