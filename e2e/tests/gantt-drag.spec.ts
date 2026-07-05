import { test, expect } from '../fixtures/app';

// ガントの既定表示範囲は「今日 - 7日」を起点に約91日分（utils/ganttCalc.ts の calcGanttRange）。
// 固定日付だと実行日によって範囲外になりバーが描画されないため、実行日からの相対日付で生成する。
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test.describe('ガントバーのドラッグ（日付変更=PATCH・クロスオリジン経路）', () => {
  test('バーを右へドラッグすると開始日が後ろにずれ、DB に反映される', async ({ page, request, projectId }) => {
    // 今日から数日先を起点にし、実行日に依存せず既定表示範囲に入るようにする
    const startDate = isoDateOffset(2);
    const endDate = isoDateOffset(7);
    const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
      data: { title: 'E2E-drag-bar', startDate, endDate },
    });
    const { task } = await res.json();

    // WS ブロードキャストでバーが描画されるのを待つ
    const bar = page.locator(`[data-task-id="${task.id}"]`);
    await expect(bar).toBeVisible();

    const box = await bar.boundingBox();
    if (!box) throw new Error('ガントバーの座標が取得できない');

    // バー中心を掴んで右へ移動（move ドラッグ）。日幅 28px なので +112px ≒ +4日
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 112, cy, { steps: 10 });
    await page.mouse.up();

    // PATCH が成功して開始日が変わることを API で確認
    // （CORS プリフライトで PATCH が弾かれると日付は変わらず、ここで失敗する）
    await expect
      .poll(async () => {
        const r = await request.get(`/api/v1/tasks/${task.id}`);
        const body = await r.json();
        return body.task.startDate as string;
      }, { timeout: 10_000 })
      .not.toBe(startDate);

    // 「更新に失敗しました」アラートが出ていないこと（出ていれば本文に残る）
    await expect(page.getByText(/更新に失敗しました/)).toHaveCount(0);
  });
});
