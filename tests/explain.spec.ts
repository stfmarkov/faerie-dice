import { test, expect } from '@playwright/test';

test('how it works page explains modes and returns to the roller', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'How it works' }).click();

  await expect(page).toHaveURL(/\/explain$/);
  await expect(page).toHaveTitle("Fair dice, and two that aren't · fair(ish) dice");
  await expect(page.getByRole('heading', { name: "Fair dice, and two that aren't" })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For DMs and designers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fairish' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Average' })).toBeVisible();
  await expect(
    page.getByText('At 20% on a d20, a 5% face loses 1 percentage point.'),
  ).toBeVisible();
  await expect(page.getByText('You roll 20. Face 20 drops to 4%.')).toBeVisible();

  await page.getByRole('link', { name: 'Roller', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#roll-btn')).toBeVisible();
});
