import { test, expect } from '../fixtures/app';

// ガントの既定表示範囲は実行日基準のため、相対日付でタスクを生成する（既存スペックと同じ）
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test.describe('プロジェクト切替中の旧タスク非表示（§5.8）', () => {
  test('切替中は旧タスクが🔗参照として現れず、読み込み表示→新タスク表示になる', async ({ page, request, projectId }) => {
    const nameB = `E2E-switch-${Date.now()}`;
    const resB = await request.post('/api/v1/projects', { data: { name: nameB } });
    expect(resB.ok()).toBeTruthy();
    const { project: projectB } = await resB.json();

    try {
      await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: 'E2E-old-task', startDate: isoDateOffset(1), endDate: isoDateOffset(3) },
      });
      await request.post(`/api/v1/projects/${projectB.id}/tasks`, {
        data: { title: 'E2E-new-task', startDate: isoDateOffset(2), endDate: isoDateOffset(4) },
      });

      // プロジェクト一覧は初回ロード時取得のためリロードして B を反映
      await page.reload();
      const wbs = page.locator('[data-testid="wbs-panel"]');
      await expect(wbs.getByText('E2E-old-task')).toBeVisible();

      // B のタスク取得だけを約1秒遅延させる
      await page.route(`**/api/v1/projects/${projectB.id}/tasks?*`, async (route) => {
        await new Promise(r => setTimeout(r, 1000));
        await route.continue();
      });

      // 切替中に 🔗 付き行が一度でも現れたら検出する（DOM 変化を監視）
      await page.evaluate(() => {
        (window as unknown as { __sawRef: boolean }).__sawRef = false;
        new MutationObserver(() => {
          const panel = document.querySelector('[data-testid="wbs-panel"]');
          if (panel && panel.textContent?.includes('🔗')) {
            (window as unknown as { __sawRef: boolean }).__sawRef = true;
          }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      });

      await page.getByRole('button', { name: nameB }).click();

      // 遅延の途中で読み込み表示が出る（旧タスクは残らない）
      await expect(page.getByTestId('tasks-loading')).toBeVisible();
      await expect(page.getByText('E2E-old-task')).toHaveCount(0);

      // 遅延解除後に新プロジェクトのタスクが表示され、読み込み表示は消える
      await expect(wbs.getByText('E2E-new-task')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('tasks-loading')).toHaveCount(0);

      expect(await page.evaluate(() => (window as unknown as { __sawRef: boolean }).__sawRef)).toBe(false);
      await expect(wbs.getByText('🔗')).toHaveCount(0);
    } finally {
      await request.delete(`/api/v1/projects/${projectB.id}`);
    }
  });
});
