import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/app';

// アクセシビリティ自動チェック（§9.10・§17.2）。
// 実際に起動したアプリのメイン画面（ガント表示）に対して axe を実行する。
//
// `color-contrast` ルールは除外する: 実ブラウザでは大量に検出されうる一方、
// コントラスト比の監査・是正は今回のスコープ外（§17.2 の将来課題）とし、
// フロントのユニットテスト側（jsdom は色計算が不確実なため incomplete 止まり）と
// 対象を揃えている。critical/serious（color-contrast を除く）の違反ゼロを検証する。
test.describe('アクセシビリティ自動チェック（axe-core）', () => {
  test('メイン画面（ガント表示）に critical/serious 違反がない', async ({ page, request, projectId }) => {
    // 画面に実データがある状態で検証する（タスク・マイルストーンを含む）
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-a11y-task', startDate: '2026-06-01', endDate: '2026-06-10' },
    });
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-a11y-milestone', isMilestone: true, startDate: '2026-06-15', endDate: '2026-06-15' },
    });
    await page.reload();

    await expect(page.locator('[data-testid="wbs-panel"]').getByText('E2E-a11y-task')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze();

    const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    const describe = serious
      .map(v => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}件) — ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
      .join('\n');
    expect(serious, describe).toEqual([]);
  });
});
