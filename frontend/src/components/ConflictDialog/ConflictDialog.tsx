import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n/useTranslation';

const FIELD_KEY: Record<string, TranslationKey> = {
  title:       'conflictDialog.field.title',
  status:      'conflictDialog.field.status',
  priority:    'conflictDialog.field.priority',
  progress:    'conflictDialog.field.progress',
  assignee:    'conflictDialog.field.assignee',
  startDate:   'conflictDialog.field.startDate',
  endDate:     'conflictDialog.field.endDate',
  summary:     'conflictDialog.field.summary',
  description: 'conflictDialog.field.description',
  parentId:    'conflictDialog.field.parentId',
};

interface Props {
  field:      string;
  theirVal:   string;
  myVal:      string;
  onResolve:  (useTheirs: boolean) => void;
}

export function ConflictDialog({ field, theirVal, myVal, onResolve }: Props) {
  const { t } = useTranslation();
  const fieldKey = FIELD_KEY[field];
  const label = fieldKey ? t(fieldKey) : field;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--th-bg)', borderRadius: 10, padding: '28px 32px',
        width: 420, boxShadow: '0 8px 32px rgba(0,0,0,.25)', color: 'var(--th-text)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          {t('conflictDialog.heading')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--th-text-muted)', marginBottom: 20 }}>
          {t('conflictDialog.fieldPrefix')}<strong>{label}</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: 'var(--th-conflict-their-bg)',
            border: '1px solid var(--th-conflict-their-border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--th-conflict-their-label)', fontWeight: 600, marginBottom: 4 }}>
              {t('conflictDialog.theirChangeLabel')}
            </div>
            <div style={{ fontSize: 14 }}>{theirVal || t('conflictDialog.empty')}</div>
          </div>

          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: 'var(--th-conflict-mine-bg)',
            border: '1px solid var(--th-conflict-mine-border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--th-conflict-mine-label)', fontWeight: 600, marginBottom: 4 }}>
              {t('conflictDialog.myChangeLabel')}
            </div>
            <div style={{ fontSize: 14 }}>{myVal || t('conflictDialog.empty')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => onResolve(true)} style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid var(--th-border)',
            background: 'var(--th-bg)', color: 'var(--th-text2)', cursor: 'pointer', fontSize: 13,
          }}>
            {t('conflictDialog.useTheirsButton')}
          </button>
          <button onClick={() => onResolve(false)} style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: '#4f46e5', color: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
          }}>
            {t('conflictDialog.useMineButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
