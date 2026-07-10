import { ApiError } from '../utils/api';
import { ja } from './ja';
import { en } from './en';
import type { TranslationKey } from './useTranslation';

const dictionaries = { ja, en } as const;

// api/src の各 routes/*.ts が返す既知のエラー code → 辞書キーの対応表。
// api/src/app.ts の集約エラーハンドラが未設定 code を 'INTERNAL_ERROR' に正規化する。
const CODE_KEY_MAP: Record<string, TranslationKey> = {
  NOT_FOUND: 'apiError.notFound',
  INVALID_FORMAT: 'apiError.invalidFormat',
  SELF_REF: 'apiError.selfRef',
  INVALID_REF_TASK: 'apiError.invalidRefTask',
  INVALID_PARENT: 'apiError.invalidParent',
  MILESTONE_CANNOT_BE_PARENT: 'apiError.milestoneCannotBeParent',
  DEP_CYCLE_DETECTED: 'apiError.depCycleDetected',
  INVALID_PROJECT: 'apiError.invalidProject',
  CYCLE_DETECTED: 'apiError.cycleDetected',
  INVALID_PARENT_REF: 'apiError.invalidParentRef',
  INTERNAL_ERROR: 'apiError.internalError',
};

/**
 * API エラーを表示用メッセージへ変換する。既知の ApiError.code は翻訳し、
 * 未マッピングの code / ApiError 以外は元のメッセージへフォールバックする。
 */
export function apiErrorMessage(err: unknown, locale: 'ja' | 'en'): string {
  if (err instanceof ApiError && err.code) {
    const key = CODE_KEY_MAP[err.code];
    if (key) return dictionaries[locale][key];
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
