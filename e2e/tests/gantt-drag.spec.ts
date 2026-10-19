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

  test('親のサマリーバーをドラッグすると子孫の日付が一括でずれ、日付なしの子は変わらない', async ({ page, request, projectId }) => {
    const post = async (data: Record<string, unknown>) => {
      const res = await request.post(`/api/v1/projects/${projectId}/tasks`, { data });
      expect(res.ok()).toBeTruthy();
      return (await res.json()).task as { id: string };
    };
    const parent = await post({ title: 'E2E-shift-parent' });
    const child = await post({ title: 'E2E-shift-child', parentId: parent.id, startDate: isoDateOffset(2), endDate: isoDateOffset(5) });
    const grand = await post({ title: 'E2E-shift-grand', parentId: child.id, startDate: isoDateOffset(3), endDate: isoDateOffset(4) });
    const undated = await post({ title: 'E2E-shift-undated', parentId: parent.id });

    const handle = page.locator(`[data-task-id="${parent.id}"] rect[data-parent-move="true"]`);
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error('親バーの座標が取得できない');

    // 日幅 28px なので +84px = +3日
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 84, cy, { steps: 10 });
    await page.mouse.up();

    const get = async (id: string) => (await (await request.get(`/api/v1/tasks/${id}`)).json()).task;
    await expect.poll(async () => (await get(child.id)).startDate, { timeout: 10_000 }).toBe(isoDateOffset(5));
    expect((await get(child.id)).endDate).toBe(isoDateOffset(8));
    expect((await get(grand.id)).startDate).toBe(isoDateOffset(6));
    expect((await get(grand.id)).endDate).toBe(isoDateOffset(7));
    const u = await get(undated.id);
    expect(u.startDate ?? null).toBeNull();
    expect(u.endDate ?? null).toBeNull();
    await expect(page.getByText(/更新に失敗しました/)).toHaveCount(0);
  });
});
