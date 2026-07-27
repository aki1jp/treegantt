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

  // 回帰テスト: @fastify/compress の threshold(1024バイト)を超えるレスポンスで、
  // async handler 内の reply.send() の return/await 漏れによりボディが空になり
  // 「Failed to execute 'json' on 'Response': Unexpected end of JSON input」で保存に失敗していたバグの再現確認。
  // 1024バイト超のSQL文＋日本語混じりの説明文を保存し、エラートーストが出ずモーダルが正常に閉じることを確認する。
  test('1024バイトを超える説明文を保存してもエラートーストが出ずモーダルが閉じる', async ({ page, projectId: _ }) => {
    const baseSql =
      "SELECT id, title, description FROM tasks WHERE project_id = '00000000-0000-0000-0000-000000000000' " +
      "AND status IN ('in_progress', 'blocked') ORDER BY created_at DESC; " +
      '-- 緊急対応：本番環境で発生した長文descriptionの保存に関する調査用クエリログ。担当者へ即時共有すること。\n';
    let longDescription = '';
    while (new TextEncoder().encode(longDescription).length <= 1024) {
      longDescription += baseSql;
    }

    await page.getByRole('button', { name: /\+ タスク追加/ }).click();
    await expect(page.getByText('タスク作成')).toBeVisible();

    await page.locator('[data-field="title"] input').fill('E2E-long-description');
    await page.locator('[data-field="description"] textarea').fill(longDescription);

    await page.getByRole('button', { name: '保存' }).click();

    // エラートーストが表示されないこと（旧バグでは「保存に失敗しました」がここで出ていた）
    await expect(page.locator('[data-testid="toast"]')).not.toBeVisible();
    // モーダルが正常に閉じること
    await expect(page.getByText('タスク作成')).not.toBeVisible();

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('E2E-long-description');
    await expect(taskText).toBeVisible();

    // レスポンスボディが破損していないこと（保存内容が欠落せず往復すること）を確認する
    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();
    await expect(page.getByText('タスク編集')).toBeVisible();
    await expect(page.locator('[data-field="description"] textarea')).toHaveValue(longDescription);

    await page.getByRole('button', { name: 'キャンセル' }).click();
  });
});
