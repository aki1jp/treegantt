import { test, expect } from '../fixtures/app';

// 担当者フィルタ候補のピン留め（§9.3 pinnedAssignees）
test.describe('担当者フィルタ ピン留め', () => {
  test('ピン留めした担当者が候補リスト先頭に来て、リロード後も保持される', async ({ page, request, projectId }) => {
    // 名前昇順では最後になる Zoe をピン留めしても先頭に来ることを確認する
    for (const assignee of ['Alice', 'Bob', 'Zoe']) {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: `E2E-pin-${assignee}`, assignee },
      });
      expect(res.ok()).toBeTruthy();
    }

    await page.reload();

    const input = page.getByLabel('担当者で絞り込み');
    await input.click();

    const listbox = page.getByTestId('assignee-listbox');
    await expect(listbox).toBeVisible();

    const zoeOption = page.getByTestId('assignee-option').filter({ hasText: 'Zoe' });
    await expect(zoeOption).toBeVisible();
    await zoeOption.getByTestId('assignee-pin-toggle').click();

    // ピントグルを押してもリストは開いたままで、先頭が Zoe になる
    await expect(listbox).toBeVisible();
    await expect(page.getByTestId('assignee-option').first()).toContainText('Zoe');

    // リロード後も先頭に残る（pinnedAssignees が treegantt-ui に永続化されているため）
    await page.reload();
    await page.getByLabel('担当者で絞り込み').click();
    await expect(page.getByTestId('assignee-listbox')).toBeVisible();
    await expect(page.getByTestId('assignee-option').first()).toContainText('Zoe');
  });

  test('担当者候補が多いとき、listboxがビューポート下端近くまで伸びる（固定240px上限の撤廃）', async ({ page, request, projectId }) => {
    // 担当者20名分のタスクを投入し、候補リストが240pxの固定上限では収まらない量にする
    const assignees = Array.from({ length: 20 }, (_, i) => `E2E-Assignee-${String(i).padStart(2, '0')}`);
    for (const assignee of assignees) {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: `E2E-height-${assignee}`, assignee },
      });
      expect(res.ok()).toBeTruthy();
    }

    await page.reload();

    const input = page.getByLabel('担当者で絞り込み');
    await input.click();

    const listbox = page.getByTestId('assignee-listbox');
    await expect(listbox).toBeVisible();

    const box = await listbox.boundingBox();
    expect(box).not.toBeNull();

    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const viewportHeight = viewportSize!.height;

    // 開いた位置からビューポート下端までいっぱいに広がっている（下端の余白は僅か）
    const gapToBottom = viewportHeight - (box!.y + box!.height);
    expect(gapToBottom).toBeLessThan(24);

    // 固定240px上限だった旧実装より明確に大きい
    expect(box!.height).toBeGreaterThan(300);
  });
});
