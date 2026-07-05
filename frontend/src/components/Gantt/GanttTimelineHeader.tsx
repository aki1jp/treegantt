import type { HeaderRow } from '../../utils/ganttCalc';
import { HEADER_ROW_H } from './ganttChartConstants';

type MilestoneItem = { x: number; title: string; color: string; lane: number };

interface Props {
  ganttHeaderRef: React.RefObject<HTMLDivElement>;
  headerRows: HeaderRow[];
  totalWidth: number;
  milestoneXSet: Set<number>;
  milestoneColorByX: Map<number, string>;
  milestoneHighlightColor: string;
  milestoneItems: MilestoneItem[];
  milestoneHeaderH: number;
  milestoneLaneH: number;
  dayWidth: number;
}

// ガントヘッダー（マルチレベル・sticky・マイルストーン◆マーカー行）。
// GanttChart から抽出（挙動不変, D4）。
export function GanttTimelineHeader({
  ganttHeaderRef, headerRows, totalWidth,
  milestoneXSet, milestoneColorByX, milestoneHighlightColor,
  milestoneItems, milestoneHeaderH, milestoneLaneH, dayWidth,
}: Props) {
  return (
    <div data-testid="gantt-header" ref={ganttHeaderRef} style={{
      position: 'sticky', top: 0, zIndex: 20,
      borderBottom: '2px solid var(--th-border)', background: 'var(--th-bg2)',
      minHeight: HEADER_ROW_H,
    }}>
      {headerRows.map((row, ri) => (
        <div key={row.level} data-level={row.level} style={{
          width: totalWidth, position: 'relative',
          height: HEADER_ROW_H, boxSizing: 'border-box',
          background: 'var(--th-bg2)',
          borderTop: ri > 0 ? '1px solid var(--th-border)' : undefined,
        }}>
          {row.cells.map((cell, ci) => {
            const isSat = (row.level === 'day' || row.level === 'dow') && cell.dow === 6;
            const isSun = (row.level === 'day' || row.level === 'dow') && cell.dow === 0;
            // マイルストーン強調は日（day）・曜日（dow）行のセルのみ。
            // week/month/year セルは週頭・月初・年初の x が一致しても色づけない。
            const isMilestoneDate = (row.level === 'day' || row.level === 'dow')
              && milestoneXSet.has(cell.x);
            const bg = isMilestoneDate
              ? (milestoneColorByX.get(cell.x) ?? milestoneHighlightColor) + '55'
              : isSat
                ? 'rgba(59,130,246,0.18)'
                : isSun
                  ? 'rgba(239,68,68,0.18)'
                  : ci % 2 === 0 ? 'var(--th-bg2)' : 'var(--th-bg3)';
            return (
              <div
                key={ci}
                data-dow={row.level === 'dow' ? cell.dow : undefined}
                style={{
                  position: 'absolute', left: cell.x, width: cell.width, height: HEADER_ROW_H,
                  background: bg,
                  borderRight: '1px solid var(--th-border)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: (row.level === 'day' || row.level === 'dow') ? 'center' : undefined,
                  paddingLeft: (row.level === 'day' || row.level === 'dow') ? 0 : 4,
                  fontSize: 10,
                  fontWeight: row.level === 'year' ? 800 : 600,
                  color: row.level === 'dow'
                    ? (isSat ? '#3b82f6' : isSun ? '#ef4444' : 'var(--th-text-muted)')
                    : row.level === 'year' ? 'var(--th-text2)' : 'var(--th-text-muted)',
                  boxSizing: 'border-box', overflow: 'hidden',
                }}
              >
                {cell.label}
              </div>
            );
          })}
        </div>
      ))}
      {/* マイルストーンヘッダー行（多段レーン対応） */}
      {milestoneItems.length > 0 && (
        <div data-milestone-marker style={{
          position: 'relative', width: totalWidth, height: milestoneHeaderH,
          boxSizing: 'border-box',
          borderTop: '1px solid var(--th-border)',
          background: 'var(--th-bg2)', overflow: 'hidden',
        }}>
          {milestoneItems.map((m, i) => (
            <div key={i} style={{
              position: 'absolute', left: m.x + dayWidth / 2,
              display: 'flex', alignItems: 'center', gap: 2,
              fontSize: 11, fontWeight: 600, color: m.color,
              whiteSpace: 'nowrap',
              top: m.lane * milestoneLaneH + 2,
              height: milestoneLaneH - 2,
            }}>
              <span style={{ transform: 'translateX(-50%)' }}>◆</span>
              {m.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
