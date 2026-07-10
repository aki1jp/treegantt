import { useState } from 'react';
import { parseDuration, formatMinutes } from '../../utils/duration';
import { useDowLabels } from '../../i18n/dow';

export interface ResourceSettingsModalProps {
  title: string;
  /** プロジェクト用: 「アプリ既定を継承」トグルを表示する */
  inheritable?: boolean;
  /** 初期キャパ（分）。inheritable で null=継承 */
  initialCapacityMinutes: number | null;
  /** 初期稼働日。inheritable で null=継承 */
  initialWorkingDays: number[] | null;
  /** 継承時/未設定時に表示する既定値（アプリ既定など） */
  fallbackCapacityMinutes: number;
  fallbackWorkingDays: number[];
  onSave: (patch: { capacityMinutesPerDay: number | null; workingDays: number[] | null }) => void;
  onClose: () => void;
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--th-text-muted)' };
const INPUT: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--th-input-border)', borderRadius: 4, fontSize: 14, width: 120,
  background: 'var(--th-input-bg)', color: 'var(--th-text)',
};

export function ResourceSettingsModal({
  title, inheritable = false,
  initialCapacityMinutes, initialWorkingDays,
  fallbackCapacityMinutes, fallbackWorkingDays,
  onSave, onClose,
}: ResourceSettingsModalProps) {
  const dowLabels = useDowLabels();
  const [inherit, setInherit] = useState(
    inheritable && initialCapacityMinutes == null && initialWorkingDays == null,
  );
  const [capacityText, setCapacityText] = useState(
    formatMinutes(initialCapacityMinutes ?? fallbackCapacityMinutes),
  );
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    new Set(initialWorkingDays ?? fallbackWorkingDays),
  );

  function toggleDay(d: number) {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inheritable && inherit) {
      onSave({ capacityMinutesPerDay: null, workingDays: null });
      return;
    }
    const cap = parseDuration(capacityText, {
      capacityMinutes: fallbackCapacityMinutes,
      workingDaysPerWeek: selectedDays.size || 5,
    }) ?? fallbackCapacityMinutes;
    const workingDays = [...selectedDays].sort((a, b) => a - b);
    onSave({ capacityMinutesPerDay: cap, workingDays });
  }

  const disabled = inheritable && inherit;

  return (
    <div onMouseDown={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form onMouseDown={e => e.stopPropagation()} onSubmit={handleSubmit} style={{
        background: 'var(--th-bg)', color: 'var(--th-text)', borderRadius: 8,
        padding: 20, minWidth: 320, boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>

        {inheritable && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={inherit} onChange={e => setInherit(e.target.checked)} />
            アプリ既定を継承
          </label>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: disabled ? 0.5 : 1 }}>
          <label style={LABEL}>1日のキャパシティ（時:分）</label>
          <input style={INPUT} value={capacityText} disabled={disabled}
            placeholder="例: 8:00, 7:45"
            onChange={e => setCapacityText(e.target.value)} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: disabled ? 0.5 : 1 }}>
          <label style={LABEL}>稼働日</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {dowLabels.map((lbl, d) => (
              <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                <input type="checkbox" checked={selectedDays.has(d)} disabled={disabled}
                  onChange={() => toggleDay(d)} />
                {lbl}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--th-border)', background: 'var(--th-bg2)', color: 'var(--th-text)', cursor: 'pointer' }}>
            キャンセル
          </button>
          <button type="submit"
            style={{ padding: '6px 14px', borderRadius: 4, border: 'none', background: 'var(--th-accent)', color: '#fff', cursor: 'pointer' }}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
