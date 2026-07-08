import { test, expect } from '../fixtures/app';

// ビジュアルリグレッションテスト（§17.2）。Playwright のスクリーンショット比較（`toHaveScreenshot`）で、
// 描画中心のアプリ（ガントバー・マイルストーン・依存矢印・WBS）の意図しない見た目変化を検出する。
//
// hero-screenshot.spec.ts（README 用ヒーロー画像、HERO_SCREENSHOT=1 明示指定時のみ実行）とは異なり、
// 本ファイルは通常の `npx playwright test` で常に実行され、CI でも push/PR ごとに自動チェックされる。
//
// 非決定性の排除（§17.2 参照）:
// - タスクの日付は `new Date()` 由来の相対日付ではなく固定の未来日付（2031年）の文字列リテラルを使う。
// - ガントの表示範囲・ズームレベルはツールバー操作で明示的に固定する（既定の自動計算に依存しない）。
// - 今日ライン（showTodayLine）は実行日に応じて位置が変わるため OFF にする。
// - アニメーション/トランジションは playwright.config.ts の reducedMotion / toHaveScreenshot.animations で抑止する。

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('ビジュアルリグレッション', () => {
  test('ガントメイン表示（親子タスク・依存矢印・マイルストーン混在）', async ({
    page,
    request,
    projectId,
    projectName,
  }) => {
    const createTask = async (body: Record<string, unknown>): Promise<string> => {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, { data: body });
      expect(res.ok()).toBeTruthy();
      const { task } = await res.json();
      return task.id as string;
    };

    const phase = await createTask({ title: '設計フェーズ' });
    const design = await createTask({
      parentId: phase, title: '画面設計', status: 'done', progress: 100,
      startDate: '2031-06-02', endDate: '2031-06-13', assignee: '田中',
    });
    const impl = await createTask({
      parentId: phase, title: '実装', status: 'wip', progress: 50,
      startDate: '2031-06-16', endDate: '2031-06-27', assignee: '鈴木',
      predecessors: [design],
    });
    const qa = await createTask({
      title: 'テスト', status: 'todo', progress: 0,
      startDate: '2031-06-30', endDate: '2031-07-11', assignee: '佐藤',
      predecessors: [impl],
    });
    await createTask({
      title: 'リリース', isMilestone: true,
      startDate: '2031-07-14', endDate: '2031-07-14',
      predecessors: [qa],
    });

    // 表示範囲・ズームレベルを明示的に固定する（自動計算に依存しない）
    await page.reload();
    await page.getByRole('button', { name: projectName }).click();
    await expect(page.locator('[data-testid="wbs-panel"]').getByText('リリース')).toBeVisible();

    await page.getByLabel('ズームレベル').selectOption('week');
    await page.getByLabel('開始日').fill('2031-05-26');
    await page.getByLabel('表示期間').selectOption('3m');

    // 今日ラインは実行日で位置が変わるため OFF にする（既定 ON。新規ブラウザコンテキストのため状態は既知）
    await page.getByTitle('今日の日付ラインを表示').click();

    // マイルストーンの菱形・依存矢印が描画されるまで待ち、レイアウト安定のため少し静止する
    await expect(page.locator(`[data-task-id="${impl}"]`)).toBeVisible();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="gantt-chart-body"]')).toHaveScreenshot(
      'gantt-main.png',
    );
  });

  test('ツールバー（フィルタ・表示設定を展開した状態）', async ({ page, projectName: _ }) => {
    await expect(page.locator('[data-testid="toolbar-row2"]')).toBeVisible();
    await page.waitForTimeout(100);

    await expect(page.locator('[data-testid="toolbar"]')).toHaveScreenshot('toolbar.png');
  });

  test('TaskModal（主要フィールドを埋めた編集画面）', async ({ page, request, projectId }) => {
    const predRes = await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-vr-predecessor', startDate: '2031-08-01', endDate: '2031-08-03' },
    });
    const { task: predTask } = await predRes.json();

    await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: {
        title: 'ビジュアル回帰確認用タスク',
        summary: 'モーダル表示のビジュアル回帰確認用',
        assignee: '山田太郎',
        status: 'wip',
        priority: 'high',
        progress: 40,
        startDate: '2031-08-04',
        endDate: '2031-08-15',
        predecessors: [predTask.id],
      },
    });

    const taskText = page.locator('[data-testid="wbs-panel"]').getByText('ビジュアル回帰確認用タスク');
    await expect(taskText).toBeVisible();

    await taskText.click({ button: 'right' });
    await page.getByRole('button', { name: /編集（詳細）/ }).click();
    await expect(page.getByText('タスク編集')).toBeVisible();
    await expect(page.locator('[data-field="title"] input')).toHaveValue('ビジュアル回帰確認用タスク');

    await expect(page.locator('[data-testid="task-modal-panel"]')).toHaveScreenshot(
      'task-modal.png',
    );
  });
});
