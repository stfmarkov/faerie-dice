import { test, expect } from '@playwright/test';
import {
  closeProbability,
  expectChancesUnchanged,
  openProbability,
  readFaceChances,
  rollOnce,
  selectMode,
} from './helpers';

test('fair roll keeps probabilities frozen and records history', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#mode-trigger')).toHaveText('Fairish');
  await selectMode(page, 'Fair');

  const sides = 20;
  await openProbability(page);
  const before = await readFaceChances(page);
  expect(before.size).toBe(sides);
  for (const chance of before.values()) {
    expect(chance).toBeCloseTo(100 / sides, 3);
  }
  await closeProbability(page);

  const rolled = await rollOnce(page);
  expect(rolled).toBeGreaterThanOrEqual(1);
  expect(rolled).toBeLessThanOrEqual(sides);

  await openProbability(page);
  const after = await readFaceChances(page);
  expectChancesUnchanged(before, after);

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: 'Roll history' });
  await expect(history).toBeVisible();
  await expect(history).toContainText(String(rolled));
  await history.getByText('Close', { exact: true }).click();
  await expect(history).toHaveCount(0);

  await closeProbability(page);
});
