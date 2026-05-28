import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import type { Task } from '../../types/task';

interface Props {
  task: Task;
  pos: { x: number; y: number };
  visible: boolean;
}

const OFFSET_X = 16;
const MAX_W    = 320;

export function TaskTooltip({ task, pos, visible }: Props) {
  if (!visible) return null;
  const hasSummary     = task.summary.trim().length > 0;
  const hasDescription = task.description.trim().length > 0;
  if (!hasSummary && !hasDescription) return null;

  // viewport 右端でフリップ
  const flipLeft = pos.x + OFFSET_X + MAX_W > window.innerWidth;
  const left = flipLeft ? pos.x - OFFSET_X - MAX_W : pos.x + OFFSET_X;
  const top  = pos.y + 4;

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        width: MAX_W,
        maxHeight: 360,
        overflowY: 'auto',
        background: 'var(--th-bg, #fff)',
        border: '1px solid var(--th-border, #e5e7eb)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        padding: '10px 12px',
        zIndex: 9999,
        pointerEvents: 'none',
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--th-text2, #374151)',
      }}
    >
      {/* タイトル */}
      <div style={{ fontWeight: 700, marginBottom: hasSummary || hasDescription ? 6 : 0, fontSize: 13 }}>
        {task.title}
      </div>

      {/* サマリ */}
      {hasSummary && (
        <>
          <div style={{ borderTop: '1px solid var(--th-border, #e5e7eb)', marginBottom: 6 }} />
          <div style={PROSE_STYLE}>
            <ReactMarkdown>{task.summary}</ReactMarkdown>
          </div>
        </>
      )}

      {/* 説明 */}
      {hasDescription && (
        <>
          <div style={{ borderTop: '1px solid var(--th-border, #e5e7eb)', margin: '6px 0' }} />
          <div style={PROSE_STYLE}>
            <ReactMarkdown>{task.description}</ReactMarkdown>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

const PROSE_STYLE: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.65,
  overflowWrap: 'break-word',
};
