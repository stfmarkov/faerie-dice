import { test, expect } from '@playwright/test';
import {
  closeHistory,
  openHistory,
  readRollHistory,
  selectAggregation,
  setDicePerRoll,
  setNumberOfRolls,
} from './helpers';

test('sum uses dice per roll and records each roll', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#dice-per-roll-block')).toBeHidden();

  await selectAggregation(page, 'Sum');
  await expect(page.locator('#dice-per-roll-block')).toBeVisible();

  await setDicePerRoll(page, 3);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);

  await openHistory(page);
  const firstHistory = await readRollHistory(page);
  expect(firstHistory).toHaveLength(1);
  const firstFaces = firstHistory[0].detail!.replace(/^sum of /, '').split(', ').map(Number);
  expect(firstFaces).toHaveLength(3);
  expect(firstHistory[0].value).toBe(firstFaces.reduce((sum, face) => sum + face, 0));
  await closeHistory(page);

  await setNumberOfRolls(page, 2);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('2×');

  await openHistory(page);
  const history = await readRollHistory(page);
  expect(history).toHaveLength(3);
  for (const entry of history.slice(1)) {
    const faces = entry.detail!.replace(/^sum of /, '').split(', ').map(Number);
    expect(faces).toHaveLength(3);
    expect(entry.value).toBe(faces.reduce((sum, face) => sum + face, 0));
  }
  await closeHistory(page);

  await selectAggregation(page, 'None');
  await expect(page.locator('#dice-per-roll-block')).toBeHidden();
});
