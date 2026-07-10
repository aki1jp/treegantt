import { useState, useRef, useEffect } from 'react';
import { clampMenuPos } from '../../utils/menuPos';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  x: number;
  y: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

const MENU_BTN: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 14px', border: 'none',
  background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--th-text2)',
};
const onBtnEnter = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--th-bg2)'; };
const onBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'none'; };

/**
 * 「＋ 追加」トリガにホバーすると右側に「子タスク」「子マイルストーン」（＋クロスプロジェクト
 * 参照の「🔗 参照を追加」, §5.8）のフライアウト子メニューを開く。
 * onAddTask/onAddMilestone/onAddRef は呼び出し側で対象 ID をバインドし、メニュー close まで
 * 済ませて渡す（onAddRef は参照追加フローを開くだけで、右クリック対象の parentId は使わない）。
 */
export function AddChildMenuItem({
  onAddTask, onAddMilestone, onAddRef,
}: { onAddTask: () => void; onAddMilestone: () => void; onAddRef?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setOpen(false)}>
      <button style={{ ...MENU_BTN, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        onMouseEnter={(e) => { setOpen(true); onBtnEnter(e); }} onMouseLeave={onBtnLeave}>
        <span>{t('contextMenu.addChild')}</span>
        <span style={{ marginLeft: 12, color: 'var(--th-text-muted)' }}>▶</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', left: '100%', top: 0,
          background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 10000, minWidth: 150,
        }}>
          <button style={MENU_BTN} onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}
            onClick={onAddTask}>{t('contextMenu.addChildTask')}</button>
          <button style={MENU_BTN} onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}
            onClick={onAddMilestone}>{t('contextMenu.addChildMilestone')}</button>
          {onAddRef && (
            <button style={MENU_BTN} onMouseEnter={onBtnEnter} onMouseLeave={onBtnLeave}
              onClick={onAddRef}>{t('contextMenu.addRefLink')}</button>
          )}
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ x, y, onMouseDown, onClick, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos(clampMenuPos(x, y, width, height));
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos?.top ?? y,
        left: pos?.left ?? x,
        visibility: pos ? 'visible' : 'hidden',
        background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 9999, minWidth: 160,
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
