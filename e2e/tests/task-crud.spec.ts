import { test, expect } from '../fixtures/app';

test.describe('タスクCRUD', () => {
  test('タスク追加ボタンでモーダルが開きタスクが作成される', async ({ page, projectId: _ }) => {
    await page.getByRole('button', { name: /\+ タスク追加/ }).click();

    await expect(page.getByText('タスク作成')).toBeVisible();

    await page.locator('[data-field="title"] input').fill('E2E-created-task');
    await page.getByRole('button', { name: '保存' }).click();

    await expect(page.getByText('タスク作成')).not.toBeVisible();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-created-task'),
    ).toBeVisible();
  });

  test('タスクのタイトルをインライン編集できる', async ({ page, request, projectId }) => {
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-before-edit' },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-before-edit');
    await expect(taskText).toBeVisible();

    await taskText.click();

    const titleInput = page.locator('[data-testid="wbs-panel"] input').first();
    await expect(titleInput).toBeVisible();

    await titleInput.fill('E2E-after-edit');
    await titleInput.press('Enter');

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-after-edit'),
    ).toBeVisible();
  });

  test('コンテキストメニューからタスクを削除できる', async ({ page, request, projectId }) => {
    // 子タスクを持つ親を作成してカスタム削除ダイアログを表示させる
    // （子なしタスクは native confirm ダイアログで削除されるため）
    const parentRes = await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-to-delete' },
    });
    const { task: parentTask } = await parentRes.json();
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-child-of-delete', parentId: parentTask.id },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-to-delete');
    await expect(taskText).toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: '削除' }).click();

    await expect(page.getByText(/タスクの削除/)).toBeVisible();

    await page.getByRole('button', { name: /このタスクのみ削除/ }).click();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-to-delete'),
    ).not.toBeVisible();
  });

  test('子タスクを追加できる', async ({ page, request, projectId }) => {
    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-parent' },
    });

    const parentText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-parent');
    await expect(parentText).toBeVisible();

    await parentText.click({ button: 'right' });
    // 「＋ 子追加」にホバーするとフライアウトが開き「タスク」「マイルストーン」を選べる
    await page.getByRole('button', { name: '＋ 子追加' }).hover();
    await page.getByRole('button', { name: 'タスク', exact: true }).click();

    await expect(page.getByText('タスク作成')).toBeVisible();
    await page.locator('[data-field="title"] input').fill('E2E-child');
    await page.getByRole('button', { name: '保存' }).click();

    await expect(
      page.locator('[data-testid="wbs-panel"]').getByText('E2E-child'),
    ).toBeVisible();
  });
});
