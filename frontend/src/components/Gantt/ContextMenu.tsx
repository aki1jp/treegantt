import { useState, useRef, useEffect } from 'react';
import { clampMenuPos } from '../../utils/menuPos';

interface Props {
  x: number;
  y: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
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
