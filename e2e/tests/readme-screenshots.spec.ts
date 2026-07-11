import { test, expect } from '../fixtures/app';
import path from 'path';

// README「📸 スクリーンショット」節用の依存関係・競合解決 UI キャプチャ。
// hero-screenshot.spec.ts と同様、リポジトリ管理下の docs/images/*.png を上書きするため、
// 通常の `npx playwright test` ではスキップされる（作業ツリーを汚さない・CI で無駄に実行しない）。
// 再生成: HERO_SCREENSHOT=1 npx playwright test tests/readme-screenshots.spec.ts

test.describe('依存関係画像', () => {
  // README では2カラムのサムネイルとして小さく表示されるため、gantt-chart-body の余白
  // （表示期間3ヶ月分の空白部分）が写り込みすぎないよう、通常より狭いビューポートで
  // WBS 列＋タスク3件分の描画幅にほぼ収める
  test.use({ viewport: { width: 1130, height: 460 } });

  // 撮影対象: 依存関係の矢印（曲線、既定スタイル）。出力先: docs/images/dependency.png
  test('依存関係画像: 3タスクの先行/後続チェーンをフォーカス表示して撮影 → docs/images/dependency.png', async ({
    page,
    request,
    projectId,
    projectName,
  }) => {
    test.skip(process.env.HERO_SCREENSHOT !== '1',
      'docs/images/dependency.png を上書きするため HERO_SCREENSHOT=1 の明示指定時のみ実行');

    const createTask = async (body: Record<string, unknown>): Promise<string> => {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, { data: body });
      expect(res.ok()).toBeTruthy();
      const { task } = await res.json();
      return task.id as string;
    };

    // 固定の未来日付（非決定性排除、visual-regression.spec.ts と同じ方針）で連続する3タスクを作成
    const design = await createTask({
      title: '設計', status: 'done', progress: 100,
      startDate: '2031-08-04', endDate: '2031-08-06', assignee: '田中',
    });
    const impl = await createTask({
      title: '実装', status: 'wip', progress: 40,
      startDate: '2031-08-07', endDate: '2031-08-11', assignee: '鈴木',
      predecessors: [design],
    });
    const qa = await createTask({
      title: 'テスト', status: 'todo', progress: 0,
      startDate: '2031-08-12', endDate: '2031-08-13', assignee: '佐藤',
      predecessors: [impl],
    });

    await page.reload();
    await page.getByRole('button', { name: projectName }).click();
    await expect(page.locator('[data-testid="wbs-panel"]').getByText('テスト')).toBeVisible();

    // タスクにフォーカスした構図: 日ズーム + タスク群の直前を起点に短い表示期間（最小の3ヶ月）
    await page.getByLabel('ズームレベル').selectOption('day');
    await page.getByLabel('開始日').fill('2031-08-02');
    await page.getByLabel('表示期間').selectOption('3m');

    // 依存矢印が描画されるまで待ち、レイアウト安定のため少し静止する
    await expect(page.locator(`[data-task-id="${qa}"]`)).toBeVisible();
    await page.waitForTimeout(300);

    // ホバー起因の要素が写り込まないよう、撮影直前にマウスを退避させる
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    const outPath = path.resolve(__dirname, '../../docs/images/dependency.png');
    await page.locator('[data-testid="gantt-chart-body"]').screenshot({ path: outPath });
  });
});

test.describe('競合解決画像', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // 撮影対象: ConflictDialog（同一フィールド同時編集時の競合解決UI）。出力先: docs/images/conflict.png
  test('競合解決画像: WBS編集中に他者変更→ConflictDialog表示を撮影 → docs/images/conflict.png', async ({
    page,
    request,
    projectId,
    projectName,
  }) => {
    test.skip(process.env.HERO_SCREENSHOT !== '1',
      'docs/images/conflict.png を上書きするため HERO_SCREENSHOT=1 の明示指定時のみ実行');

    const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: '担当者アサイン', assignee: '田中' },
    });
    expect(res.ok()).toBeTruthy();
    const { task } = await res.json();
    const taskId = task.id as string;

    await page.reload();
    await page.getByRole('button', { name: projectName }).click();
    const wbsPanel = page.locator('[data-testid="wbs-panel"]');
    await expect(wbsPanel.getByText('担当者アサイン')).toBeVisible();

    // WBS の担当者セルをクリックして編集モードに入る（GanttLeftRow.tsx の startEdit('assignee', ...)）
    await wbsPanel.getByText('田中', { exact: true }).click();
    const input = wbsPanel.locator('input');
    await expect(input).toBeVisible();

    // 編集中のまま、別経路（API直接呼び出し）で同じフィールドをサーバー側で変更する
    const patchRes = await request.patch(`/api/v1/tasks/${taskId}`, { data: { assignee: '鈴木' } });
    expect(patchRes.ok()).toBeTruthy();

    // WebSocket 経由でフロントの task ストアに反映されるまで待つ（編集中の input はローカル state のため
    // 反映を直接観測する術がなく、ローカル環境の WS 往復時間に十分な余裕を見て待機する）
    await page.waitForTimeout(1000);

    // 編集中の値・他者の変更後の値のいずれとも異なる第3の値で確定 → 競合判定で ConflictDialog が開く
    await input.fill('佐藤');
    await input.press('Enter');

    // ダイアログ自体（position:fixed のオーバーレイ）に絞り込む。ConflictDialog は行コンポーネント
    // （GanttLeftRow）内に直接レンダリングされるため、単純に見出しテキストを含む div でフィルタすると
    // 行全体（WBS 上の「鈴木」表示等を含む祖先 div）まで拾ってしまう。行のタイトル文言を含まない
    // （＝ダイアログ自身のサブツリーに閉じた）最初の div に絞ることで一意に判定できるようにする
    const dialogOverlay = page.locator('div')
      .filter({ hasText: '⚠️ 編集中に別のユーザーが変更しました' })
      .filter({ hasNotText: '担当者アサイン' })
      .first();
    await expect(dialogOverlay).toBeVisible({ timeout: 5000 });
    await expect(dialogOverlay.getByText('別のユーザーの変更', { exact: true })).toBeVisible();
    await expect(dialogOverlay.getByText('あなたの変更', { exact: true })).toBeVisible();
    await expect(dialogOverlay.getByText('鈴木', { exact: true })).toBeVisible();
    await expect(dialogOverlay.getByText('佐藤', { exact: true })).toBeVisible();
    await page.waitForTimeout(200);

    const outPath = path.resolve(__dirname, '../../docs/images/conflict.png');
    await page.screenshot({ path: outPath });
  });
});
