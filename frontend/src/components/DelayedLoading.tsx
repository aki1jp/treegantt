import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';

/** 表示までの遅延（ms）。これより短い読み込みでは何も出さず、ちらつきを防ぐ（§5.8） */
export const LOADING_DELAY_MS = 250;

/** 遅延付きの読み込み表示。マウントから LOADING_DELAY_MS 経過後にだけ表示する。 */
export function DelayedLoading() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), LOADING_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      data-testid="tasks-loading"
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--th-text)' }}
    >
      {t('app.loading')}
    </div>
  );
}
