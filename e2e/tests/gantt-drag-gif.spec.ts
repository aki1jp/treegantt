import { test } from '../fixtures/app';
import fs from 'fs';
import path from 'path';

// README 用デモ GIF のフレーム生成。
// 実ブラウザでガントバーをドラッグして日付を変更する様子をコマ送りで撮影し、
// 後段の `convert`（ImageMagick）で docs/images/drag-date.gif に束ねる。
test('GIF用: バーをドラッグして開始/終了日を変更する様子を撮影', async ({ page, request, projectId }) => {
  const framesDir = path.resolve(__dirname, '../.gif-frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  let frame = 0;
  // 上部のプロジェクトタブ（テストデータ残骸）を避け、ガント＋WBS日付列に絞る
  const clip = { x: 0, y: 168, width: 1280, height: 165 };
  const shot = async () => {
    await page.screenshot({ path: path.join(framesDir, `frame-${String(frame++).padStart(3, '0')}.png`), clip });
  };

  // 表示範囲内に入る日付のタスクを作成
  const res = await request.post(`/api/v1/projects/${projectId}/tasks`, {
    data: { title: 'バーをドラッグ → 日付が変わる', startDate: '2026-06-16', endDate: '2026-06-21' },
  });
  const { task } = await res.json();
  const bar = page.locator(`[data-task-id="${task.id}"]`);
  await bar.waitFor();
  await page.waitForTimeout(300);

  await shot(); // 開始前
  await shot(); // 少し静止（GIF の頭で間を作る）

  const box = await bar.boundingBox();
  if (!box) throw new Error('bar box not found');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await shot();

  const STEPS = 8;
  const DIST = 150;
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(cx + (DIST * i) / STEPS, cy);
    await page.waitForTimeout(40);
    await shot();
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot(); // 反映後
  await shot(); // 末尾の静止
});
