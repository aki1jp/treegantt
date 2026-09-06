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
    // 候補の実高さが「開いた位置からビューポート下端までの利用可能高さ」を確実に超える量を投入する。
    // 1行あたり約24px・利用可能高さは 720px のビューポートで約590pxのため、40名なら約960pxで確実に超える。
    // （20名だと約480pxで利用可能高さに収まってしまい、listbox は内容なりの高さで止まる＝下端まで伸びない）
    const assignees = Array.from({ length: 40 }, (_, i) => `E2E-Assignee-${String(i).padStart(2, '0')}`);
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

    // 内容が入りきらないので、開いた位置からビューポート下端までいっぱいに広がる（下端の余白は僅か）
    const gapToBottom = viewportHeight - (box!.y + box!.height);
    expect(gapToBottom).toBeLessThan(24);

    // 固定240px上限だった旧実装より明確に大きい
    expect(box!.height).toBeGreaterThan(300);

    // 溢れた分はリスト内スクロールで見られる（画面外へはみ出さない）
    const overflows = await listbox.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(overflows).toBeTruthy();
  });

  test('候補が少ないときはlistboxを無理に引き伸ばさず内容なりの高さになる', async ({ page, request, projectId }) => {
    for (const assignee of ['Alice', 'Bob', 'Carol']) {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: `E2E-short-${assignee}`, assignee },
      });
      expect(res.ok()).toBeTruthy();
    }

    await page.reload();
    await page.getByLabel('担当者で絞り込み').click();

    const listbox = page.getByTestId('assignee-listbox');
    await expect(listbox).toBeVisible();

    const box = await listbox.boundingBox();
    const viewportHeight = page.viewportSize()!.height;

    // 3名分の高さしかないので下端までは伸びない
    expect(box!.height).toBeLessThan(viewportHeight / 2);
    // スクロールも発生しない
    const overflows = await listbox.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(overflows).toBeFalsy();
  });
});
