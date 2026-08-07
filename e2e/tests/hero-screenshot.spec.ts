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
//
// シードの日付は実行日基準の相対で組む。固定日付にすると時間の経過とともに全タスクが期限超過
// （バーが薄赤）になり、今日ラインも右端へ外れて「全部遅延したプロジェクト」の絵になるため。
// 週の区切りが崩れないよう「今週の月曜の4週間前」を起点にし、そこからの日数オフセットで指定する
// （起点+32 が今週の金曜＝進行中フェーズの終端に来るよう配置）。
const BASE = (() => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 28); // 今週の月曜 - 28日
  return d;
})();
function day(offset: number): string {
  const d = new Date(BASE);
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

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
      startDate: day(0), endDate: day(4), assignee: '田中',
    });
    const hearing = await createTask({
      parentId: phase1, title: '要件ヒアリング', status: 'done', progress: 100,
      startDate: day(7), endDate: day(11), assignee: '田中',
    });

    // フェーズ2: 設計（進行中）
    const phase2 = await createTask({ title: '設計' });
    const uiDesign = await createTask({
      parentId: phase2, title: '画面設計', status: 'wip', progress: 60,
      startDate: day(14), endDate: day(25), assignee: '鈴木',
      predecessors: [hearing],
    });
    const dbDesign = await createTask({
      parentId: phase2, title: 'DB設計', status: 'wip', progress: 40,
      startDate: day(14), endDate: day(32), assignee: '佐藤',
      predecessors: [hearing],
    });

    // フェーズ3: 開発（未着手）
    const phase3 = await createTask({ title: '開発' });
    const feImpl = await createTask({
      parentId: phase3, title: 'フロントエンド実装', status: 'todo', progress: 0,
      startDate: day(35), endDate: day(53), assignee: '鈴木',
      predecessors: [uiDesign],
    });
    const apiImpl = await createTask({
      parentId: phase3, title: 'API実装', status: 'todo', progress: 0,
      startDate: day(35), endDate: day(60), assignee: '佐藤',
      predecessors: [dbDesign],
    });
    const integrationTest = await createTask({
      parentId: phase3, title: '結合テスト', status: 'todo', progress: 0,
      startDate: day(63), endDate: day(67), assignee: '田中',
      predecessors: [feImpl, apiImpl],
    });

    // マイルストーン: リリース判定
    await createTask({
      title: 'リリース判定', isMilestone: true,
      startDate: day(70), endDate: day(70),
      predecessors: [integrationTest],
    });

    // フェーズ4: 運用（未着手）
    const phase4 = await createTask({ title: '運用' });
    await createTask({
      parentId: phase4, title: '監視設定', status: 'pending', progress: 0,
      startDate: day(71), endDate: day(74), assignee: '佐藤',
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'ECサイトリニューアル' }).click();

    // ズームを「週」にして91日分のデフォルト表示期間を1画面に収める
    await page.getByLabel('ズームレベル').selectOption('week');

    // マイルストーンのバー（菱形）が描画されるまで待ち、レイアウト安定のため少し静止する
    await page.locator('svg').first().waitFor();
    await expect(page.getByText('リリース判定').first()).toBeVisible();
    await page.waitForTimeout(500);

    // 今日ライン（showTodayLine、既定 ON）は実行日に応じて位置が変わり、シードデータの
    // タスクバーと重なって見た目が崩れることがあるため、ヒーロー画像では OFF にする
    // （visual-regression.spec.ts は日付を2031年に離すことで同じ問題を回避しているが、
    // ヒーロー画像は近未来の実在感のある日付を保ちたいため、明示的にトグルで対応する）。
    await page.getByRole('button', { name: '今日バー' }).click();

    // ホバー起因の要素（TaskTooltip・依存リンク用コネクタドット等）が写り込まないよう、
    // 撮影直前にマウスを何もない安全な位置（左上余白）へ退避させ、ホバー解除の反映を待つ
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    const outPath = path.resolve(__dirname, '../../docs/images/overview.png');
    await page.screenshot({ path: outPath });
  } finally {
    await request.delete(`/api/v1/projects/${projectId}`);
  }
});
