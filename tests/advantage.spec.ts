import { test, expect } from '@playwright/test';
import {
  closeHistory,
  openHistory,
  readRollHistory,
  selectAggregation,
} from './helpers';

test('advantage keeps the higher face on each roll', async ({ page }) => {
  await page.goto('/');

  await selectAggregation(page, 'Advantage');

  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);

  await openHistory(page);
  const history = await readRollHistory(page);
  expect(history).toHaveLength(2);

  for (const [index, entry] of history.entries()) {
    expect(entry.detail, `roll ${index + 1} should list both faces`).toBeTruthy();
    const faces = entry.detail!.split(', ').map(Number);
    expect(faces, `roll ${index + 1} should use two dice`).toHaveLength(2);
    expect(
      entry.value,
      `roll ${index + 1} should keep max(${faces.join(', ')})`,
    ).toBe(Math.max(...faces));
  }

  await closeHistory(page);
});
