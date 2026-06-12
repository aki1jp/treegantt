import { test, expect } from '../fixtures/app';

test.describe('タスクモーダル', () => {
  test('タスク行をダブルクリックすると編集モーダルが開く', async ({ page, request, projectId }) => {
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-modal-open' },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-modal-open');
    await expect(taskText).toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();

    await expect(page.getByText('タスク編集')).toBeVisible();
    await expect(page.locator('[data-field="title"] input')).toHaveValue('E2E-modal-open');

    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByText('タスク編集')).not.toBeVisible();
  });

  test('モーダルで開始日・終了日を設定して保存するとガントバーが表示される', async ({
    page,
    request,
    projectId,
  }) => {
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-gantt-bar' },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-gantt-bar');
    await expect(taskText).toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();
    await expect(page.getByText('タスク編集')).toBeVisible();

    await page.locator('[data-field="startDate"] input').fill('2026-06-01');
    await page.locator('[data-field="endDate"] input').fill('2026-06-30');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('タスク編集')).not.toBeVisible();

    const taskRes = await request.get(`/api/v1/projects/${projectId}/tasks`);
    const { tasks } = await taskRes.json();
    const task = tasks.find((t: { title: string }) => t.title === 'E2E-gantt-bar');

    await expect(page.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
  });

  test('モーダルでサマリと担当者を更新できる', async ({ page, request, projectId }) => {
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-modal-update' },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-modal-update');
    await expect(taskText).toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();
    await expect(page.getByText('タスク編集')).toBeVisible();

    await page.locator('[data-field="summary"] input').fill('E2Eテスト用のサマリ');
    await page.locator('[data-field="assignee"] input').fill('E2E-Tester');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('タスク編集')).not.toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();
    await expect(page.locator('[data-field="summary"] input')).toHaveValue('E2Eテスト用のサマリ');
    await expect(page.locator('[data-field="assignee"] input')).toHaveValue('E2E-Tester');
  });
});
