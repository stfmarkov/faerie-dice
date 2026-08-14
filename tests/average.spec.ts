import { test, expect } from '@playwright/test';
import {
  closeProbability,
  expectChancesUnchanged,
  expectPyramidDistribution,
  openProbability,
  readFaceChances,
  rollOnce,
  selectMode,
} from './helpers';

test('average mode shows a pyramid curve that stays fixed after rolls', async ({ page }) => {
  await page.goto('/');

  await selectMode(page, 'Average');

  const sides = 20;
  await openProbability(page);
  const before = await readFaceChances(page);
  expectPyramidDistribution(before, sides);

  const rolled = await rollOnce(page);
  expect(rolled).toBeGreaterThanOrEqual(1);
  expect(rolled).toBeLessThanOrEqual(sides);

  const after = await readFaceChances(page);
  expectPyramidDistribution(after, sides);
  expectChancesUnchanged(before, after);

  await closeProbability(page);
});
