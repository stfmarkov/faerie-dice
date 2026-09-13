import { test, expect } from '@playwright/test';
import {
  closeHistory,
  closeProbability,
  expectFairishUpdate,
  openHistory,
  openProbability,
  openSettings,
  readAggregatedChances,
  readFaceChances,
  readRollHistory,
  rollOnce,
  selectAggregation,
  selectDie,
  selectMode,
  setModifier,
  setTarget,
} from './helpers';

test('1d20+5 reports face plus modifier', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await setModifier(page, 5);

  await openProbability(page);
  await expect(page.locator('#probability-config')).toHaveText('Current config: 1d20+5');
  await setTarget(page, 15);
  await expect(page.locator('#target-under')).toHaveText('Under 45.000%');
  await expect(page.locator('#target-over')).toHaveText('Over 55.000%');
  await closeProbability(page);

  const reported = await rollOnce(page);
  expect(reported).toBeGreaterThanOrEqual(6);
  expect(reported).toBeLessThanOrEqual(25);
  await expect(page.locator('#result-meta')).toContainText('1D20+5');

  await openHistory(page);
  const history = await readRollHistory(page);
  expect(history).toHaveLength(1);
  expect(history[0]?.value).toBe(reported);
  await closeHistory(page);
});

test('advantage adds the modifier after keep', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await selectAggregation(page, 'Advantage');
  await setModifier(page, 5);

  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);
  await expect(page.locator('#result-meta')).toContainText('2D20+5');

  const history = await readRollHistory(page);
  expect(history).toHaveLength(1);
  const faces = history[0]!.detail!.split(', ').map(Number);
  expect(faces).toHaveLength(2);
  expect(history[0]!.value).toBe(Math.max(...faces) + 5);
});

test('aggregated graph and target shift with the modifier', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await selectDie(page, 'd6');
  await selectAggregation(page, 'Sum');
  await openProbability(page);

  const unshifted = await readAggregatedChances(page);
  expect(unshifted.size).toBe(11);
  expect(unshifted.get(2)).toBeCloseTo(100 / 36, 3);
  expect(unshifted.get(7)).toBeCloseTo(600 / 36, 3);
  await closeProbability(page);

  await setModifier(page, 3);
  await openProbability(page);
  await expect(page.locator('#probability-config')).toHaveText('Current config: 2d6+3 sum');

  const shifted = await readAggregatedChances(page);
  expect(shifted.size).toBe(11);
  expect(shifted.has(2)).toBe(false);
  expect(shifted.get(5)).toBeCloseTo(unshifted.get(2)!, 3);
  expect(shifted.get(10)).toBeCloseTo(unshifted.get(7)!, 3);
  expect(shifted.get(15)).toBeCloseTo(unshifted.get(12)!, 3);

  const faces = await readFaceChances(page);
  expect(faces.size).toBe(6);
  expect(faces.get(1)).toBeCloseTo(100 / 6, 3);

  await setTarget(page, 10);
  await expect(page.locator('#target-under')).toHaveText('Under 41.667%');
  await expect(page.locator('#target-over')).toHaveText('Over 58.333%');
});

test('fairish memory still uses the landed face', async ({ page }) => {
  await page.goto('/');
  await setModifier(page, 5);
  await openProbability(page);

  const before = await readFaceChances(page);
  const reported = await rollOnce(page);
  const face = reported - 5;
  expect(face).toBeGreaterThanOrEqual(1);
  expect(face).toBeLessThanOrEqual(20);

  expectFairishUpdate(before, await readFaceChances(page), face, 20);
});

test('modifier survives reload and default settings restore it', async ({ page }) => {
  await page.goto('/');
  await setModifier(page, 4);

  await page.reload();
  await expect(page.locator('#roll-modifier')).toHaveValue('4');

  await openSettings(page);
  await page.getByRole('button', { name: 'Default settings' }).click();
  await expect(page.locator('#roll-modifier')).toHaveValue('0');
});
