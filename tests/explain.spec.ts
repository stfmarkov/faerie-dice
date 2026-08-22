import { test, expect } from '@playwright/test';

test('how it works page explains modes and returns to the roller', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'How it works' }).click();

  await expect(page).toHaveURL(/\/explain$/);
  await expect(page.getByRole('heading', { name: 'How the dice actually work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fairish' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Average' })).toBeVisible();

  await page.getByRole('link', { name: 'Roller', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#roll-btn')).toBeVisible();
});
