import { test, expect } from '@playwright/test';

test('health endpoint', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  await expect(res.json()).resolves.toEqual({ ok: true });
});

test('loads SPA shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Merge/);
  await expect(page.locator('#root')).toBeVisible();
});
