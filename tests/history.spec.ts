import { test, expect } from '@playwright/test';
import {
  closeHistory,
  historyEntryCount,
  openHistory,
  setNumberOfRolls,
} from './helpers';

test('history accumulates 5 rolls then 15 after a second batch', async ({ page }) => {
  await page.goto('/');

  await setNumberOfRolls(page, 5);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('5×');

  await openHistory(page);
  expect(await historyEntryCount(page)).toBe(5);
  await closeHistory(page);

  await setNumberOfRolls(page, 10);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('10×');

  await openHistory(page);
  expect(await historyEntryCount(page)).toBe(15);
  await closeHistory(page);
});
