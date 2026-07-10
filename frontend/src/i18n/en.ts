import { ja } from './ja';

// `satisfies typeof ja` により、キーの過不足があればここでビルドエラーになる
// （タイポ・訳漏れの検出。ja.ts がキー集合の正）。
export const en = {
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.close': 'Close',

  'theme.light': 'Light mode',
  'theme.dark': 'Dark mode',
  'theme.auto': 'Follow system setting',

  'locale.ja': 'JA',
  'locale.en': 'EN',

  'app.locale.switchAriaLabel': 'Switch display language',
  'app.deleteProjectConfirm': 'Delete "{name}"?',

  'apiError.notFound': 'The requested item was not found.',
  'apiError.invalidFormat': 'Invalid import format.',
  'apiError.selfRef': 'Cannot reference a task in the same project.',
  'apiError.invalidRefTask': 'Invalid reference task.',
  'apiError.invalidParent': 'Invalid parent task.',
  'apiError.milestoneCannotBeParent': 'A milestone cannot be a parent task.',
  'apiError.depCycleDetected': 'A circular dependency was detected.',
  'apiError.invalidProject': 'The task does not belong to the specified project.',
  'apiError.cycleDetected': 'A circular parent relationship was detected.',
  'apiError.invalidParentRef': 'Invalid parent reference.',
  'apiError.internalError': 'An internal server error occurred.',
} satisfies typeof ja;
