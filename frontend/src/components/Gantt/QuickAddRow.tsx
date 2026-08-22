import { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useTranslation } from '../../i18n/useTranslation';
import { wbsColWidth, type WbsColSizes } from '../../utils/wbsLayout';

type Col = { key: string };

// WBS 最終行のクイック追加インライン入力（GanttChart/WbsPanel から抽出、挙動不変, D4）。
// セルは列定義（cols＝visibleLeftCols）から map で描画する（列レイアウトの導出, §9.2）。
// これにより「行」列の追加や列の表示 ON/OFF・リサイズに、固定配列の直書きなしで追従する。
export function QuickAddRow({ onAdd, cols, sizes }: { onAdd: (title: string) => Promise<void>; cols: Col[]; sizes: WbsColSizes }) {
  const { uiRowHeight, uiFontSize } = useTaskStore();
  const { t } = useTranslation();
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
    <div data-testid="wbs-quick-add-row" style={{
      display: 'flex', background: 'var(--th-bg2)',
      height: uiRowHeight, boxSizing: 'border-box',
      borderTop: '1px dashed var(--th-border)',
    }}>
      {cols.map(col => {
        const w = wbsColWidth(col.key, sizes);
        if (col.key !== 'title') return <div key={col.key} style={{ ...CELL, width: w }} />;
        return (
          <div key={col.key} style={{ ...CELL, width: w }}>
            {editing ? (
              <input ref={inputRef}
                style={{ width: '100%', padding: '2px 4px', border: '1px solid #4f46e5', borderRadius: 3, fontSize: uiFontSize, outline: 'none' }}
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={submit}
                onKeyDown={e => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') { setTitle(''); setEditing(false); }
                }}
              />
            ) : (
              <span onClick={() => setEditing(true)}
                style={{ color: 'var(--th-text-dim)', cursor: 'text', fontSize: uiFontSize, userSelect: 'none' }}>
                {t('wbs.quickAdd.placeholder')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
