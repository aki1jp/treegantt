import { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useTranslation } from '../../i18n/useTranslation';

interface Props {
  /** filterAssignee（現在の入力テキスト） */
  value: string;
  /** getUniqueAssignees(tasks) の結果（昇順ソート済み） */
  options: string[];
  /** setFilter({ filterAssignee: v }) を呼ぶ */
  onChange: (v: string) => void;
  /** 現プロジェクトID。未指定ならピン UI を出さずフラットな候補リストにする（§9.3） */
  currentProjectId?: string;
}

const SELECT: React.CSSProperties = {
  padding: '5px 6px', border: '1px solid var(--th-input-border)', borderRadius: 4,
  fontSize: 12, background: 'var(--th-input-bg)', color: 'var(--th-text2)',
};

const dropdownStyle: React.CSSProperties = {
  background: 'var(--th-bg)', border: '1px solid var(--th-border)', borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
};

// 画面下端に残す余白
const LISTBOX_BOTTOM_MARGIN = 8;

/**
 * listbox の表示位置と高さを算出する（§9.3：開いた位置からビューポート下端までの
 * 利用可能な高さいっぱい、それでも足りない分はリスト内スクロール）。
 * 下限を固定値で底上げすると、ビューポートが極端に低い（余白が下限未満の）ときに
 * listbox がビューポート外へはみ出すため、0 未満にだけクランプする。
 */
function computeListboxPos(wrapper: HTMLDivElement) {
  const r = wrapper.getBoundingClientRect();
  const top = r.bottom + 4;
  const maxHeight = Math.max(0, window.innerHeight - top - LISTBOX_BOTTOM_MARGIN);
  return { top, left: r.left, maxHeight };
}

/**
 * 担当者フィルタの候補ポップアップ（§9.3 pinnedAssignees / §9.10）。
 * ネイティブ <datalist> ではなく自前 listbox で描画し、ピン留めした担当者を
 * 「ピン留めセクション → 区切り → その他」の順で常に先頭表示する。
 */
export function AssigneeFilter({ value, options, onChange, currentProjectId }: Props) {
  const { t } = useTranslation();
  const pinnedAssignees = useTaskStore(s => s.pinnedAssignees);
  const toggleAssigneePin = useTaskStore(s => s.toggleAssigneePin);

  const [open, setOpen] = useState(false);
  // 候補行はピン留めトグルで並び替わる（ピン留めセクション先頭へ移動）ため、
  // インデックスではなく名前で「現在アクティブな候補」を保持する。
  // インデックス保持だと並び替え後に別候補を指してしまう。
  const [activeName, setActiveName] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる（Toolbar.tsx のハンバーガーメニューと同じパターン）
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  // 開いている間のウィンドウリサイズに追従して listbox の高さを再計算する
  useEffect(() => {
    function onResize() {
      if (wrapperRef.current) setPos(computeListboxPos(wrapperRef.current));
    }
    if (open) window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  function openList() {
    if (!open && wrapperRef.current) setPos(computeListboxPos(wrapperRef.current));
    setActiveName(null);
    setOpen(true);
  }

  const flat = !currentProjectId;
  const pinnedSet = flat ? new Set<string>() : new Set(pinnedAssignees[currentProjectId!] ?? []);
  const filteredPinned = flat ? [] : options.filter(name => pinnedSet.has(name) && name.includes(value));
  const filteredOthers = options.filter(name => (flat || !pinnedSet.has(name)) && name.includes(value));
  const combined = [...filteredPinned, ...filteredOthers];
  const showPinnedHeader = !flat && filteredPinned.length > 0;
  const showOthersHeader = showPinnedHeader && filteredOthers.length > 0;
  const noMatch = combined.length === 0;
  const activeIndex = activeName !== null ? combined.indexOf(activeName) : -1;

  // 担当者名ではなく DOM 順のインデックスから id を作る：名前に空白が含まれると
  // （例「山田 太郎」）id 属性値が不正（HTML の id は空白を含められない）になり、
  // aria-activedescendant の参照が壊れるため。
  function optionId(index: number) {
    return `assignee-option-${index}`;
  }

  function selectOption(name: string) {
    onChange(name);
    setOpen(false);
  }

  function moveActive(delta: number) {
    if (combined.length === 0) return;
    const nextIndex = Math.max(0, Math.min(combined.length - 1, activeIndex + delta));
    setActiveName(combined[nextIndex]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { openList(); return; }
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openList(); return; }
      moveActive(-1);
    } else if (e.key === 'Enter') {
      if (open && activeName) {
        e.preventDefault();
        selectOption(activeName);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  function renderOption(name: string, index: number) {
    const isPinnedName = pinnedSet.has(name);
    const active = index === activeIndex;
    return (
      <div
        key={name}
        id={optionId(index)}
        data-testid="assignee-option"
        role="option"
        aria-selected={value === name}
        onMouseEnter={() => setActiveName(name)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
          background: active ? 'var(--th-bg2)' : 'transparent',
        }}
      >
        <button
          type="button"
          data-testid="assignee-option-select"
          onClick={() => selectOption(name)}
          style={{
            flex: 1, textAlign: 'left', border: 'none', background: 'none',
            padding: '5px 8px', fontSize: 12, cursor: 'pointer', color: 'var(--th-text2)',
          }}
        >
          {name}
        </button>
        {!flat && (
          <button
            type="button"
            data-testid="assignee-pin-toggle"
            aria-label={isPinnedName ? t('toolbar.filter.assigneeUnpin') : t('toolbar.filter.assigneePin')}
            title={isPinnedName ? t('toolbar.filter.assigneeUnpin') : t('toolbar.filter.assigneePin')}
            onClick={(e) => { e.stopPropagation(); toggleAssigneePin(currentProjectId!, name); }}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
              padding: '4px 8px', borderRadius: 4,
              color: isPinnedName ? '#4f46e5' : 'var(--th-text-ph)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e0e7ff'; e.currentTarget.style.color = '#4f46e5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = isPinnedName ? '#4f46e5' : 'var(--th-text-ph)'; }}
          >
            {isPinnedName ? '★' : '☆'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="assignee-combobox" ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? 'assignee-listbox' : undefined}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder={t('toolbar.filter.all')}
        aria-label={t('toolbar.filter.assigneeAriaLabel')}
        title={t('toolbar.filter.assigneeOpenList')}
        value={value}
        onChange={e => { onChange(e.target.value); openList(); }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={handleKeyDown}
        style={{ ...SELECT, width: 100, paddingRight: value ? 22 : undefined }}
      />
      {value && (
        <button
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'none', padding: '0 2px',
            fontSize: 10, lineHeight: 1, cursor: 'pointer', color: 'var(--th-text-muted)',
          }}
          onClick={() => onChange('')}
          title={t('toolbar.filter.assigneeClear')}
          aria-label={t('toolbar.filter.assigneeClear')}
        >✕</button>
      )}

      {open && pos && (
        <div
          id="assignee-listbox"
          data-testid="assignee-listbox"
          role="listbox"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
            minWidth: 180, maxHeight: pos.maxHeight, overflowY: 'auto',
            ...dropdownStyle,
          }}
        >
          {showPinnedHeader && (
            <>
              <div
                data-testid="assignee-pinned-section"
                style={{ padding: '6px 8px 2px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}
              >
                {t('toolbar.filter.assigneePinnedSection')}
              </div>
              {filteredPinned.map((name, i) => renderOption(name, i))}
              {showOthersHeader && (
                <>
                  <div style={{ height: 1, background: 'var(--th-border)', margin: '2px 0' }} />
                  <div
                    data-testid="assignee-others-section"
                    style={{ padding: '6px 8px 2px', fontSize: 11, color: 'var(--th-text-dim)', fontWeight: 600, letterSpacing: '0.05em' }}
                  >
                    {t('toolbar.filter.assigneeOthersSection')}
                  </div>
                </>
              )}
            </>
          )}
          {filteredOthers.map((name, i) => renderOption(name, (showPinnedHeader ? filteredPinned.length : 0) + i))}
          {noMatch && (
            <div data-testid="assignee-no-match" style={{ padding: '6px 8px', fontSize: 12, color: 'var(--th-text-muted)' }}>
              {t('toolbar.filter.assigneeNoMatch')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
