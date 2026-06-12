import { test, expect } from '../fixtures/app';

test.describe('ガントチャート描画', () => {
  test('ガントパネルと日付ヘッダーが表示される', async ({ page, projectId: _ }) => {
    await expect(page.locator('[data-testid="gantt-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="gantt-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="wbs-panel"]')).toBeVisible();
  });

  test('開始日・終了日を持つタスクのガントバーが SVG に描画される', async ({
    page,
    request,
    projectId,
  }) => {
    const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: {
        title: 'E2E-bar-render',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      },
    });
    const { task } = await res.json();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-bar-render'),
    ).toBeVisible();

    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
  });

  test('多数のタスクがあっても仮想化によって DOM ノード数が抑えられる', async ({
    page,
    request,
    projectId,
    projectName,
  }) => {
    await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        request.post(`/api/v1/projects/${projectId}/tasks`, {
          data: { title: `E2E-virt-${String(i + 1).padStart(3, '0')}` },
        }),
      ),
    );

    // WS タイミングに依存しないよう、リロードで全タスクを一括取得する
    await page.reload();
    await page.getByRole('button', { name: projectName }).click();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-virt-001'),
    ).toBeVisible({ timeout: 10_000 });

    const wbsRows = page.locator('[data-testid="wbs-panel"] > div > div');
    const count = await wbsRows.count();
    expect(count).toBeLessThan(80);
    expect(count).toBeGreaterThan(0);
  });

  test('WBS にホイールスクロールするとガントパネルも連動してスクロールする', async ({
    page,
    request,
    projectId,
    projectName,
  }) => {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        request.post(`/api/v1/projects/${projectId}/tasks`, {
          data: { title: `E2E-scroll-${String(i + 1).padStart(2, '0')}` },
        }),
      ),
    );

    // リロードで全タスクを一括取得し、仮想化ウィンドウ外タスクの待機問題を回避する
    await page.reload();
    await page.getByRole('button', { name: projectName }).click();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-scroll-01'),
    ).toBeVisible({ timeout: 10_000 });

    const wbsPanel = page.locator('[data-testid="wbs-panel"]');
    const ganttPanel = page.locator('[data-testid="gantt-panel"]');

    const wbsBox = await wbsPanel.boundingBox();
    if (wbsBox) {
      await page.mouse.move(wbsBox.x + 100, wbsBox.y + 200);
      await page.mouse.wheel(0, 400);
    }

    // RAF スロットルが解決するまで待つ
    await page.waitForTimeout(200);

    const ganttScrollTop = await ganttPanel.evaluate((el) => el.scrollTop);
    expect(ganttScrollTop).toBeGreaterThan(0);
  });
});
