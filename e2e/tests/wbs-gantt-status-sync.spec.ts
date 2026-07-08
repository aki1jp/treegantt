import { test, expect } from '../fixtures/app';

// ユーザー報告の再現確認: 「完了/保留以外」フィルタ中に WBS 上でタスクを完了へ変更すると、
// WBS からは消えるがガント側のバーが残って行の対応がズレる、という報告の実ブラウザでの検証。
test.describe('WBS/ガント同期: ステータス変更でのフィルタ除外（実ブラウザ）', () => {
  test('フィルタ「DONE/保留以外」中に完了へ変更すると WBS・ガント双方から同時に消える', async ({
    page,
    request,
    projectId,
  }) => {
    const titles = ['E2E-sync-todo', 'E2E-sync-wip', 'E2E-sync-target'];
    let targetId = '';
    for (const title of titles) {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title, startDate: '2026-06-01', endDate: '2026-06-10' },
      });
      const { task } = await res.json();
      if (title === 'E2E-sync-target') targetId = task.id;
    }
    // wip タスクを進行中に、対象はまず todo のまま
    const wbsPanel = page.locator('[data-testid="wbs-panel"]');
    await expect(wbsPanel.getByText('E2E-sync-target')).toBeVisible({ timeout: 10_000 });

    // フィルタを「DONE/保留以外」にする
    await page.getByLabel('ステータスで絞り込み').selectOption('!done');
    await expect(wbsPanel.getByText('E2E-sync-target')).toBeVisible();
    await expect(page.locator(`[data-task-id="${targetId}"]`)).toBeVisible();

    // 対象行のステータスバッジをクリックして編集モードに入り、完了に変更する
    const row = wbsPanel.locator('[draggable]').filter({ hasText: 'E2E-sync-target' });
    await row.getByText('TODO', { exact: true }).click();
    await row.locator('select').selectOption('done');

    // WBS から消える
    await expect(wbsPanel.getByText('E2E-sync-target')).toHaveCount(0);
    // ガント側のバーも同時に消えている（ズレて残らない）こと
    await expect(page.locator(`[data-task-id="${targetId}"]`)).toHaveCount(0);

    // WBS 行数とガントのバー数（可視分）が一致していること
    const wbsRowCount = await wbsPanel.locator('[draggable]').count();
    const barCount = await page.locator('[data-testid="gantt-panel"] svg > g[data-task-id]').count();
    expect(barCount).toBe(wbsRowCount);
  });
});
