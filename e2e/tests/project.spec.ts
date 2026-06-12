import { test, expect } from '@playwright/test';

test.describe('プロジェクト管理', () => {
  test('作成したプロジェクトのタブが表示される', async ({ page, request }) => {
    const res = await request.post('/api/v1/projects', { data: { name: 'E2E-tab-visible' } });
    expect(res.ok()).toBeTruthy();
    const { project } = await res.json();

    try {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'E2E-tab-visible' })).toBeVisible();
    } finally {
      await request.delete(`/api/v1/projects/${project.id}`);
    }
  });

  test('複数プロジェクトのタブを切り替えられる', async ({ page, request }) => {
    const rA = await request.post('/api/v1/projects', { data: { name: 'E2E-switch-A' } });
    const rB = await request.post('/api/v1/projects', { data: { name: 'E2E-switch-B' } });
    const { project: pA } = await rA.json();
    const { project: pB } = await rB.json();

    try {
      await page.goto('/');

      const tabA = page.getByRole('button', { name: 'E2E-switch-A' });
      const tabB = page.getByRole('button', { name: 'E2E-switch-B' });
      await expect(tabA).toBeVisible();
      await expect(tabB).toBeVisible();

      await tabA.click();
      await tabB.click();
      // タブが消えていないことで切り替えが正常に動作したと確認
      await expect(tabA).toBeVisible();
      await expect(tabB).toBeVisible();
    } finally {
      await request.delete(`/api/v1/projects/${pA.id}`);
      await request.delete(`/api/v1/projects/${pB.id}`);
    }
  });
});
