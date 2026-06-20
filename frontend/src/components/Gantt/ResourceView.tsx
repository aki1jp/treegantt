import { useRef } from 'react';
import dayjs from 'dayjs';
import type { Task, ZoomLevel } from '../../types/task';
import { ZOOM_CONFIG } from '../../utils/ganttCalc';
import { calcUtilizationMatrix, workloadBuckets, utilizationColor } from '../../utils/workloadCalc';
import { formatMinutes, HARDCODED_CAPACITY_MINUTES, HARDCODED_WORKING_DAYS } from '../../utils/duration';

const HEADER_H  = 22;
const LEGEND_H  = 18;
const CELL_H    = 30;
// 担当者が多くてもガント本体を覆わないよう、行表示領域はこの行数ぶんでキャップし縦スクロール。
const MAX_VISIBLE_ROWS = 6;

const LEGEND_ITEMS = [
  { label: '〜80% 余裕',   c: utilizationColor(0.5) },
  { label: '〜100% 適正',  c: utilizationColor(0.95) },
  { label: '〜120% 注意',  c: utilizationColor(1.1) },
  { label: '>120% 過負荷', c: utilizationColor(1.5) },
];

export interface ResourceViewProps {
  tasks: Task[];
  min: Date;
  zoomLevel: ZoomLevel;
  totalWidth: number;
  labelWidth: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  onEditTask: (task: Task) => void;
  /** 実効キャパシティ（分/稼働日）。1d 換算・稼働率の分母 */
  capacityMinutesPerDay?: number;
  /** 実効稼働日（0=日…6=土） */
  workingDays?: number[];
}

const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export function ResourceView({
  tasks, min, zoomLevel, totalWidth, labelWidth, scrollRef,
  capacityMinutesPerDay = HARDCODED_CAPACITY_MINUTES,
  workingDays = HARDCODED_WORKING_DAYS,
}: ResourceViewProps) {
  const leftBodyRef  = useRef<HTMLDivElement>(null);
  const rightBodyRef = useRef<HTMLDivElement>(null);

  const { dayWidth } = ZOOM_CONFIG[zoomLevel];
  const totalDays = Math.max(1, Math.round(totalWidth / dayWidth));
  const max = dayjs(min).add(totalDays - 1, 'day').toDate();

  const { assignees, days, utilization, demand, dayTasks, totalMinutes, peakUtil } =
    calcUtilizationMatrix(tasks, min, max, { capacityMinutesPerDay, workingDays });
  if (assignees.length === 0) return null;

  const buckets = workloadBuckets(days, zoomLevel);
  const workingSet = new Set(workingDays);
  const isNonWorking = (idx: number): boolean => !workingSet.has(dayjs(days[idx]).day());

  // 行表示領域の高さ（上限キャップ）。超過分は縦スクロール。
  const bodyHeight = Math.min(assignees.length, MAX_VISIBLE_ROWS) * CELL_H;

  // 左右の行領域の縦スクロールを同期する
  const syncFromLeft = () => {
    if (rightBodyRef.current && leftBodyRef.current) {
      rightBodyRef.current.scrollTop = leftBodyRef.current.scrollTop;
    }
  };
  const onRightWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (leftBodyRef.current) {
      leftBodyRef.current.scrollTop += e.deltaY; // 左を動かすと onScroll で右も同期
    }
  };

  return (
    <div data-testid="workload-panel" style={{
      flexShrink: 0, display: 'flex',
      borderTop: '2px solid var(--th-border-strong)',
      background: 'var(--th-bg)',
    }}>
      {/* 左固定列: タイトル＋凡例＋担当者（サマリ付き・縦スクロール） */}
      <div style={{
        flexShrink: 0, width: labelWidth,
        borderRight: '2px solid var(--th-border-strong)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: HEADER_H, display: 'flex', alignItems: 'center',
          padding: '0 8px', fontSize: 10, fontWeight: 700,
          color: 'var(--th-text-muted)', background: 'var(--th-bg2)',
          borderBottom: '1px solid var(--th-border)', flexShrink: 0,
        }}>
          リソースビュー（担当者別負荷）
        </div>
        {/* 色凡例 */}
        <div style={{
          height: LEGEND_H, display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 8px', fontSize: 8, color: 'var(--th-text-muted)',
          background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontWeight: 700 }}>凡例</span>
          {LEGEND_ITEMS.map(l => (
            <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 9, height: 9, background: l.c, border: '1px solid rgba(0,0,0,0.2)', display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>
        {/* 担当者ラベル（縦スクロール領域。可視スクロールバー） */}
        <div data-testid="workload-rows" ref={leftBodyRef} onScroll={syncFromLeft} style={{
          height: bodyHeight, overflowY: 'auto', overflowX: 'hidden', flexShrink: 0,
        }}>
          {assignees.map((a, ai) => (
            <div key={a} style={{
              height: CELL_H, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '0 8px',
              borderBottom: '1px solid var(--th-border)',
              background: ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)',
              overflow: 'hidden', boxSizing: 'border-box',
            }}>
              <div style={{
                fontSize: 12, color: 'var(--th-text2)', lineHeight: 1.1,
                whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
              }}>{a}</div>
              <div style={{ fontSize: 8, color: 'var(--th-text-muted)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                合計 {totalMinutes[ai] > 0 ? formatMinutes(totalMinutes[ai]) : '—'} / ピーク {pct(peakUtil[ai])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右スクロール領域（横はガント同期） */}
      <div ref={scrollRef} style={{ flex: 1, overflowX: 'hidden', overflowY: 'hidden' }}>
        <div style={{ width: totalWidth, display: 'flex', flexDirection: 'column' }}>
          {/* 日付ヘッダー（バケット単位・固定） */}
          <div style={{
            height: HEADER_H, position: 'relative', flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }}>
            {buckets.map((b, bi) => {
              const nonWork = b.span === 1 && isNonWorking(b.startIdx);
              const left = b.startIdx * dayWidth;
              const width = b.span * dayWidth;
              return (
                <div key={bi} style={{
                  position: 'absolute', left, width, height: HEADER_H,
                  background: nonWork ? 'rgba(120,120,120,0.12)' : 'transparent',
                  borderRight: '1px solid var(--th-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: 'var(--th-text-muted)',
                  boxSizing: 'border-box', overflow: 'hidden',
                }}>
                  {width >= 14 ? b.label : ''}
                </div>
              );
            })}
          </div>
          {/* 凡例行ぶんのスペーサ（左列と高さを揃える・固定） */}
          <div style={{
            height: LEGEND_H, flexShrink: 0,
            background: 'var(--th-bg2)', borderBottom: '1px solid var(--th-border)',
          }} />

          {/* セル行（縦スクロール領域。左と同期、ホイールで操作） */}
          <div ref={rightBodyRef} onWheel={onRightWheel} style={{
            height: bodyHeight, overflowY: 'hidden', flexShrink: 0,
          }}>
            {assignees.map((a, ai) => (
              <div key={a} style={{
                height: CELL_H, position: 'relative',
                background: ai % 2 === 0 ? 'var(--th-bg)' : 'var(--th-bg-alt)',
                borderBottom: '1px solid var(--th-border)', boxSizing: 'border-box',
              }}>
                {buckets.map((b, bi) => {
                  // バケット期間内の稼働率ピーク（最大）
                  let peak = 0;
                  let peakDemand = 0;
                  for (const i of b.dayIdxs) {
                    if (utilization[ai][i] > peak) { peak = utilization[ai][i]; peakDemand = demand[ai][i]; }
                  }
                  const titles = [...new Set(b.dayIdxs.flatMap(i => dayTasks[ai][i]))];
                  const nonWork = b.span === 1 && isNonWorking(b.startIdx);
                  const bg = peak > 0 ? utilizationColor(peak) : (nonWork ? 'rgba(120,120,120,0.06)' : 'transparent');
                  const left = b.startIdx * dayWidth;
                  const width = b.span * dayWidth;
                  return (
                    <div key={bi} style={{
                      position: 'absolute', left, width, height: CELL_H,
                      background: bg,
                      borderRight: '1px solid rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: Math.min(10, width - 2),
                      fontWeight: 700, color: 'rgba(0,0,0,0.65)',
                      boxSizing: 'border-box',
                    }}
                      title={peak > 0
                        ? `${a} ${b.label}: 稼働率 ${pct(peak)}（需要 ${formatMinutes(Math.round(peakDemand))}）${titles.length ? `\n${titles.join('\n')}` : ''}`
                        : undefined}
                    >
                      {width >= 18 && peak > 0 ? pct(peak) : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
