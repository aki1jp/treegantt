import { test, expect } from '../fixtures/app';

// ガントの既定表示範囲は「今日 - 7日」起点の約91日分（utils/ganttCalc.ts の calcGanttRange）。
// 固定日付だと実行日によって範囲外になるため、実行日からの相対日付で生成する（既存スペックと同じパターン）。
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test.describe('クロスプロジェクト参照（§5.8）', () => {
  test('参照追加→表示→跨ぎ依存→矢印→readonly の一連', async ({ page, request, projectId }) => {
    // ── 準備: 参照先プロジェクトB とそのタスク、自プロジェクトのタスクを API で作成 ──
    const refProjectName = `E2E-ref-${Date.now()}`;
    const resB = await request.post('/api/v1/projects', { data: { name: refProjectName } });
    expect(resB.ok()).toBeTruthy();
    const { project: projectB } = await resB.json();

    try {
      const resExt = await request.post(`/api/v1/projects/${projectB.id}/tasks`, {
        data: { title: 'E2E-external-task', startDate: isoDateOffset(1), endDate: isoDateOffset(3) },
      });
      const { task: externalTask } = await resExt.json();

      const resOwn = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: 'E2E-own-task', startDate: isoDateOffset(5), endDate: isoDateOffset(8) },
      });
      const { task: ownTask } = await resOwn.json();

      // プロジェクトB はページロード後に API で作成したため、App のプロジェクト一覧に
      // 含まれていない（一覧は初回ロード時に取得）。リロードして一覧に反映させる。
      await page.reload();

      const wbs = page.locator('[data-testid="wbs-panel"]');
      await expect(wbs.getByText('E2E-own-task')).toBeVisible();

      // ── 入口①: 右クリック「＋ 子追加」フライアウトの「🔗 参照を追加」 ──
      await wbs.getByText('E2E-own-task').click({ button: 'right' });
      await page.getByRole('button', { name: '＋ 子追加' }).hover();
      await page.getByRole('button', { name: '🔗 参照を追加' }).click();

      // 参照管理モーダルで プロジェクトB → タスク → 追加
      await expect(page.getByText('🔗 クロスプロジェクト参照')).toBeVisible();
      await page.getByLabel('参照先プロジェクト').selectOption(projectB.id);
      await page.getByLabel('参照するタスク').selectOption(externalTask.id);
      await page.getByRole('button', { name: '追加', exact: true }).click();

      // 一覧に参照が現れたらモーダルを閉じる
      await expect(page.getByRole('button', { name: '解除' })).toBeVisible();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();

      // ── 表示: 合成グループ行と参照タスク行（🔗 プレフィックス・末尾） ──
      await expect(wbs.getByText(`🔗 ${refProjectName}`)).toBeVisible();
      await expect(wbs.getByText('🔗 E2E-external-task')).toBeVisible();

      // ── 跨ぎ依存: 自タスクの詳細モーダルで「外部の先行タスク（参照済み）」をチェック ──
      await wbs.getByText('E2E-own-task').click({ button: 'right' });
      await page.getByRole('button', { name: '編集（詳細）' }).click();
      await expect(page.getByText('外部の先行タスク（参照済み）')).toBeVisible();
      await page.getByRole('checkbox', { name: /E2E-external-task/ }).check();
      await page.getByRole('button', { name: '保存' }).click();

      // 矢印（外部タスク → 自タスク）が描画される
      await expect(
        page.locator(`path[data-dep-from="${externalTask.id}"][data-dep-to="${ownTask.id}"]`),
      ).toBeVisible();

      // DB にも跨ぎ依存が保存されている
      await expect
        .poll(async () => {
          const r = await request.get(`/api/v1/tasks/${ownTask.id}`);
          const body = await r.json();
          return body.task.predecessors as string[];
        }, { timeout: 10_000 })
        .toContain(externalTask.id);

      // ── readonly: 参照行のタイトルをクリックしてもインライン編集にならない ──
      await wbs.getByText('🔗 E2E-external-task').click();
      await expect(wbs.locator('input')).toHaveCount(0);

      // 参照行の右クリックは専用メニュー（編集・削除は出ない）
      await wbs.getByText('🔗 E2E-external-task').click({ button: 'right' });
      await expect(page.getByRole('button', { name: '参照先プロジェクトを開く' })).toBeVisible();
      await expect(page.getByRole('button', { name: '参照を解除' })).toBeVisible();
      await expect(page.getByRole('button', { name: '編集（詳細）' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '削除' })).toHaveCount(0);
    } finally {
      await request.delete(`/api/v1/projects/${projectB.id}`);
    }
  });

  test('参照追加後に別プロジェクトへ切り替えると、切替先には参照由来の行が残らない', async ({ page, request, projectId }) => {
    // ── 準備: 参照先プロジェクトB とそのタスク、自プロジェクト(A)のタスクを API で作成 ──
    const refProjectName = `E2E-ref-switch-${Date.now()}`;
    const resB = await request.post('/api/v1/projects', { data: { name: refProjectName } });
    expect(resB.ok()).toBeTruthy();
    const { project: projectB } = await resB.json();

    try {
      const resExt = await request.post(`/api/v1/projects/${projectB.id}/tasks`, {
        data: { title: 'E2E-switch-external-task', startDate: isoDateOffset(1), endDate: isoDateOffset(3) },
      });
      const { task: externalTask } = await resExt.json();

      const resOwn = await request.post(`/api/v1/projects/${projectId}/tasks`, {
        data: { title: 'E2E-switch-own-task', startDate: isoDateOffset(5), endDate: isoDateOffset(8) },
      });
      expect(resOwn.ok()).toBeTruthy();

      // プロジェクトB はページロード後に API で作成したため、App のプロジェクト一覧に
      // 含まれていない（一覧は初回ロード時に取得）。リロードして一覧に反映させる。
      await page.reload();

      const wbs = page.locator('[data-testid="wbs-panel"]');
      await expect(wbs.getByText('E2E-switch-own-task')).toBeVisible();

      // ── プロジェクトA で参照を追加（既存テストと同じ入口・操作） ──
      await wbs.getByText('E2E-switch-own-task').click({ button: 'right' });
      await page.getByRole('button', { name: '＋ 子追加' }).hover();
      await page.getByRole('button', { name: '🔗 参照を追加' }).click();

      await expect(page.getByText('🔗 クロスプロジェクト参照')).toBeVisible();
      await page.getByLabel('参照先プロジェクト').selectOption(projectB.id);
      await page.getByLabel('参照するタスク').selectOption(externalTask.id);
      await page.getByRole('button', { name: '追加', exact: true }).click();

      await expect(page.getByRole('button', { name: '解除' })).toBeVisible();
      await page.getByRole('button', { name: '閉じる', exact: true }).click();

      // A 側には合成グループ行・参照タスク行が表示される
      await expect(wbs.getByText(`🔗 ${refProjectName}`)).toBeVisible();
      await expect(wbs.getByText('🔗 E2E-switch-external-task')).toBeVisible();

      // ── プロジェクトB（参照先）へ切り替え ──
      await page.getByRole('button', { name: refProjectName }).click();

      // 切替先の WBS には B 自身のタスクが（🔗 プレフィックス無しで）表示される
      await expect(wbs.getByText('E2E-switch-external-task', { exact: true })).toBeVisible();

      // A で追加した参照由来の合成グループ行・参照タスク行（🔗 プレフィックス）は
      // 切替先には存在しない（A のタスク一覧が後着して混入するバグの回帰確認）
      await expect(wbs.getByText(`🔗 ${refProjectName}`)).toHaveCount(0);
      await expect(wbs.getByText('🔗 E2E-switch-external-task')).toHaveCount(0);

      // A 自身のタスクも切替先には表示されない
      await expect(wbs.getByText('E2E-switch-own-task')).toHaveCount(0);
    } finally {
      await request.delete(`/api/v1/projects/${projectB.id}`);
    }
  });
});
