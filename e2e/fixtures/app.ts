import { test as base, expect } from '@playwright/test';

type AppFixtures = {
  projectId: string;
  projectName: string;
};

export const test = base.extend<AppFixtures>({
  // プロジェクト作成・ナビゲーション・クリーンアップを担う
  projectName: async ({ request, page }, use) => {
    const name = `E2E-${Date.now()}`;
    const res = await request.post('/api/v1/projects', { data: { name } });
    expect(res.ok()).toBeTruthy();
    const { project } = await res.json();

    await page.goto('/');
    await page.getByRole('button', { name }).click();

    await use(name);

    await request.delete(`/api/v1/projects/${project.id}`);
  },

  // projectName に依存し、ID のみを提供する
  projectId: async ({ request, projectName }, use) => {
    const res = await request.get('/api/v1/projects');
    const { projects } = await res.json();
    const found = (projects as { id: string; name: string }[]).find(p => p.name === projectName)!;
    await use(found.id);
  },
});

export { expect };
