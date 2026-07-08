/**
 * a11y 自動チェック共通ヘルパー（§9.10）。
 * `jest-axe` 相当のカスタムマッチャは導入せず、`axe-core` を直接呼び出す軽量な方式を採る。
 *
 * ユニット/コンポーネントテストは DOM 断片（フラグメント）を render するだけで、
 * 実アプリのようなページ全体の構造（<html lang>・ランドマーク・<title> 等）を持たない。
 * そのためページ全体を前提とするルールは対象外にし、コンポーネント単体の a11y 違反
 * （未ラベルのフォーム要素・不正な ARIA 構造等）の検出に絞る。
 */
import axe, { type AxeResults, type Result } from 'axe-core';

const FRAGMENT_TEST_EXCLUDED_RULES = [
  'region',
  'landmark-one-main',
  'page-has-heading-one',
  'html-has-lang',
  'html-lang-valid',
  'landmark-unique',
  'bypass',
  'document-title',
  'meta-viewport',
  'skip-link',
] as const;

export async function runAxe(container: Element): Promise<AxeResults> {
  return axe.run(container, {
    rules: Object.fromEntries(FRAGMENT_TEST_EXCLUDED_RULES.map(id => [id, { enabled: false }])),
  });
}

/** critical/serious のみを違反として扱う（moderate/minor は許容リストの対象、§9.10）。 */
export function seriousOrCritical(results: AxeResults): Result[] {
  return results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

export function describeViolations(violations: Result[]): string {
  if (violations.length === 0) return '(violations: none)';
  return violations
    .map(v => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}件) — ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
    .join('\n');
}
