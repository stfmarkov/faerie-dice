import { test, expect } from '@playwright/test';
import {
  closeHistory,
  closeProbability,
  expectChancesUnchanged,
  openHistory,
  openProbability,
  openSettings,
  readFaceChances,
  readRollHistory,
  rollOnce,
  selectAggregation,
  selectDie,
  selectMode,
  setCurveRolls,
  setDicePerRoll,
  setDropStrength,
  setNumberOfRolls,
} from './helpers';

test('reload restores history, weights, and settings', async ({ page }) => {
  await page.goto('/');

  await selectDie(page, 'd6');
  await selectAggregation(page, 'Advantage');
  await setDicePerRoll(page, 3);
  await openSettings(page);
  await setDropStrength(page, 40);
  await setCurveRolls(page, 5);

  await openProbability(page);
  await rollOnce(page);
  const weighted = await readFaceChances(page);
  expect([...weighted.values()].some(chance => Math.abs(chance - 100 / 6) > 0.01)).toBe(true);
  await closeProbability(page);

  await setNumberOfRolls(page, 2);
  await selectMode(page, 'Normal');

  await page.reload();

  await expect(page.locator('#die-select button[data-die-name="d6"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#mode-trigger')).toHaveText('Normal');
  await expect(page.locator('#aggregation-trigger')).toHaveText('Advantage');
  await expect(page.locator('#number-of-rolls')).toHaveValue('2');
  await expect(page.locator('#dice-per-roll')).toHaveValue('3');
  await expect(page.locator('#weighted-drop-value')).toHaveText('40%');
  await expect(page.locator('#average-curve-rolls')).toHaveValue('5');

  const history = await readRollHistory(page);
  expect(history).toHaveLength(1);
  expect(history[0]?.die).toBe('d6');

  await openProbability(page);
  expectChancesUnchanged(weighted, await readFaceChances(page));
});

test('history is capped at 100 rolls', async ({ page }) => {
  await page.goto('/');

  const rollsInput = page.locator('#number-of-rolls');
  await rollsInput.fill('100');
  await rollsInput.dispatchEvent('change');
  await expect(rollsInput).toHaveValue('100');

  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('100×');
  expect(await readRollHistory(page)).toHaveLength(100);

  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('100×');
  expect(await readRollHistory(page)).toHaveLength(100);

  await page.reload();
  expect(await readRollHistory(page)).toHaveLength(100);
});

test('clear history wipes rolls and survives reload', async ({ page }) => {
  await page.goto('/');

  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);
  expect(await readRollHistory(page)).toHaveLength(1);

  await openHistory(page);
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.getByText('No rolls yet. Roll some dice first.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear history' })).toBeDisabled();
  await closeHistory(page);

  expect(await readRollHistory(page)).toHaveLength(0);

  await page.reload();
  expect(await readRollHistory(page)).toHaveLength(0);

  await openHistory(page);
  await expect(page.getByText('No rolls yet. Roll some dice first.')).toBeVisible();
});

test('reset weights only clears the current die', async ({ page }) => {
  await page.goto('/');

  await openProbability(page);
  const d20Rolled = await rollOnce(page);
  const d20Weighted = await readFaceChances(page);
  expect(d20Weighted.get(d20Rolled)!).toBeLessThan(5);

  await selectDie(page, 'd6');
  await rollOnce(page);
  const d6Weighted = await readFaceChances(page);
  expect([...d6Weighted.values()].some(chance => Math.abs(chance - 100 / 6) > 0.01)).toBe(true);

  await page.getByRole('button', { name: 'Reset weights' }).click();
  const d6Reset = await readFaceChances(page);
  for (const chance of d6Reset.values()) {
    expect(chance).toBeCloseTo(100 / 6, 3);
  }

  await page.reload();
  await openProbability(page);
  await expect(page.locator('#die-select button[data-die-name="d6"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const d6AfterReload = await readFaceChances(page);
  for (const chance of d6AfterReload.values()) {
    expect(chance).toBeCloseTo(100 / 6, 3);
  }

  await selectDie(page, 'd20');
  expectChancesUnchanged(d20Weighted, await readFaceChances(page));
});

test('default settings restore controls without wiping history or weights', async ({ page }) => {
  await page.goto('/');

  await selectDie(page, 'd6');
  await openProbability(page);
  await rollOnce(page);
  const d6Weighted = await readFaceChances(page);
  await closeProbability(page);

  await selectMode(page, 'Average');
  await selectAggregation(page, 'Sum');
  await setNumberOfRolls(page, 4);
  await setDicePerRoll(page, 3);
  await openSettings(page);
  await setDropStrength(page, 50);
  await setCurveRolls(page, 8);
  await page.getByRole('switch', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Default settings' }).click();

  await expect(page.locator('#die-select button[data-die-name="d20"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#mode-trigger')).toHaveText('Weighted');
  await expect(page.locator('#aggregation-trigger')).toHaveText('None');
  await expect(page.locator('#number-of-rolls')).toHaveValue('1');
  await expect(page.locator('#weighted-drop-value')).toHaveText('20%');
  await expect(page.locator('#average-curve-rolls')).toHaveValue('2');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await readRollHistory(page)).toHaveLength(1);

  await page.reload();

  await expect(page.locator('#mode-trigger')).toHaveText('Weighted');
  await expect(page.locator('#aggregation-trigger')).toHaveText('None');
  await expect(page.locator('#number-of-rolls')).toHaveValue('1');
  await expect(page.locator('#weighted-drop-value')).toHaveText('20%');
  await expect(page.locator('#average-curve-rolls')).toHaveValue('2');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await readRollHistory(page)).toHaveLength(1);

  await selectDie(page, 'd6');
  await openProbability(page);
  expectChancesUnchanged(d6Weighted, await readFaceChances(page));
});
