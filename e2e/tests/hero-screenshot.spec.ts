import { test, expect } from '@playwright/test';
import path from 'path';

// README 冒頭のヒーロー画像（docs/images/overview.png）用キャプチャ。
// ツリー数階層・依存数本・進捗まちまち・マイルストーン1つ程度の見栄えの良いシードデータを
// API 経由で投入し、ガントチャートの全体像を1枚のスクリーンショットとして保存する。
// gantt-drag-gif.spec.ts と同様に、専用の一時プロジェクトを作成しテスト後に削除する。
//
// リポジトリ管理下の docs/images/overview.png を上書きするため、通常の `npx playwright test`
// ではスキップされる（作業ツリーを汚さない・CI で無駄に実行しない）。
// 再生成: HERO_SCREENSHOT=1 npx playwright test tests/hero-screenshot.spec.ts
test.use({ viewport: { width: 1440, height: 860 } });

test('ヒーロー画像用: 見栄えの良いシードデータでガント全体像を撮影', async ({ page, request }) => {
  test.skip(process.env.HERO_SCREENSHOT !== '1',
    'docs/images/overview.png を上書きするため HERO_SCREENSHOT=1 の明示指定時のみ実行');

  const projectRes = await request.post('/api/v1/projects', { data: { name: 'ECサイトリニューアル' } });
  expect(projectRes.ok()).toBeTruthy();
  const { project } = await projectRes.json();
  const projectId = project.id as string;

  const createTask = async (body: Record<string, unknown>): Promise<string> => {
    const res = await request.post(`/api/v1/projects/${projectId}/tasks`, { data: body });
    expect(res.ok()).toBeTruthy();
    const { task } = await res.json();
    return task.id as string;
  };

  try {
    // フェーズ1: 要件定義（完了済み）— 親は日付・進捗を指定せず子から自動集計させる
    const phase1 = await createTask({ title: '要件定義' });
    await createTask({
      parentId: phase1, title: '現状分析', status: 'done', progress: 100,
      startDate: '2026-07-06', endDate: '2026-07-10', assignee: '田中',
    });
    const hearing = await createTask({
      parentId: phase1, title: '要件ヒアリング', status: 'done', progress: 100,
      startDate: '2026-07-13', endDate: '2026-07-17', assignee: '田中',
    });

    // フェーズ2: 設計（進行中）
    const phase2 = await createTask({ title: '設計' });
    const uiDesign = await createTask({
      parentId: phase2, title: '画面設計', status: 'wip', progress: 60,
      startDate: '2026-07-20', endDate: '2026-07-31', assignee: '鈴木',
      predecessors: [hearing],
    });
    const dbDesign = await createTask({
      parentId: phase2, title: 'DB設計', status: 'wip', progress: 40,
      startDate: '2026-07-20', endDate: '2026-08-07', assignee: '佐藤',
      predecessors: [hearing],
    });

    // フェーズ3: 開発（未着手）
    const phase3 = await createTask({ title: '開発' });
    const feImpl = await createTask({
      parentId: phase3, title: 'フロントエンド実装', status: 'todo', progress: 0,
      startDate: '2026-08-10', endDate: '2026-08-28', assignee: '鈴木',
      predecessors: [uiDesign],
    });
    const apiImpl = await createTask({
      parentId: phase3, title: 'API実装', status: 'todo', progress: 0,
      startDate: '2026-08-10', endDate: '2026-09-04', assignee: '佐藤',
      predecessors: [dbDesign],
    });
    const integrationTest = await createTask({
      parentId: phase3, title: '結合テスト', status: 'todo', progress: 0,
      startDate: '2026-09-07', endDate: '2026-09-11', assignee: '田中',
      predecessors: [feImpl, apiImpl],
    });

    // マイルストーン: リリース判定
    await createTask({
      title: 'リリース判定', isMilestone: true,
      startDate: '2026-09-14', endDate: '2026-09-14',
      predecessors: [integrationTest],
    });

    // フェーズ4: 運用（未着手）
    const phase4 = await createTask({ title: '運用' });
    await createTask({
      parentId: phase4, title: '監視設定', status: 'pending', progress: 0,
      startDate: '2026-09-15', endDate: '2026-09-18', assignee: '佐藤',
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'ECサイトリニューアル' }).click();

    // ズームを「週」にして91日分のデフォルト表示期間を1画面に収める
    await page.getByLabel('ズームレベル').selectOption('week');

    // マイルストーンのバー（菱形）が描画されるまで待ち、レイアウト安定のため少し静止する
    await page.locator('svg').first().waitFor();
    await expect(page.getByText('リリース判定').first()).toBeVisible();
    await page.waitForTimeout(500);

    const outPath = path.resolve(__dirname, '../../docs/images/overview.png');
    await page.screenshot({ path: outPath });
  } finally {
    await request.delete(`/api/v1/projects/${projectId}`);
  }
});
