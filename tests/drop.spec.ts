import { test, expect } from '@playwright/test';
import {
  closeHistory,
  closeProbability,
  openHistory,
  openProbability,
  readAggregatedChances,
  readRollHistory,
  selectAggregation,
  selectDie,
  selectMode,
  setDicePerRoll,
  setNumberOfRolls,
} from './helpers';

function parseDropFaces(detail: string): number[] {
  return detail.replace(/^drop (?:lowest|highest) of /, '').split(', ').map(Number);
}

function keptSum(faces: number[], dropHighest: boolean): number {
  const dropped = dropHighest ? Math.max(...faces) : Math.min(...faces);
  const index = faces.indexOf(dropped);
  return faces.reduce((sum, face, faceIndex) => (
    faceIndex === index ? sum : sum + face
  ), 0);
}

test('drop lowest sums the pool after discarding the low die', async ({ page }) => {
  await page.goto('/');

  await selectDie(page, 'd6');
  await selectAggregation(page, 'Drop lowest');
  await expect(page.locator('#dice-per-roll-block')).toBeVisible();
  await expect(page.locator('#drop-count-block')).toHaveCount(0);

  await setDicePerRoll(page, 4);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);

  await openHistory(page);
  const history = await readRollHistory(page);
  expect(history).toHaveLength(1);
  const faces = parseDropFaces(history[0].detail!);
  expect(faces).toHaveLength(4);
  expect(history[0].value).toBe(keptSum(faces, false));
  await closeHistory(page);

  await setNumberOfRolls(page, 2);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText('2×');
});

test('drop highest sums the pool after discarding the high die', async ({ page }) => {
  await page.goto('/');

  await selectDie(page, 'd6');
  await selectAggregation(page, 'Drop highest');
  await setDicePerRoll(page, 4);
  await page.locator('#roll-btn').click();
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);

  await openHistory(page);
  const history = await readRollHistory(page);
  expect(history).toHaveLength(1);
  const faces = parseDropFaces(history[0].detail!);
  expect(faces).toHaveLength(4);
  expect(history[0].value).toBe(keptSum(faces, true));
  await closeHistory(page);
});

test('4d6 drop lowest matches the ability-score curve', async ({ page }) => {
  await page.goto('/');

  await selectMode(page, 'Fair');
  await selectDie(page, 'd6');
  await selectAggregation(page, 'Drop lowest');
  await setDicePerRoll(page, 4);
  await openProbability(page);

  await expect(page.locator('#aggregated-distribution-label')).toHaveText('Drop lowest distribution');
  const chances = await readAggregatedChances(page);
  expect(chances.size).toBe(16);
  expect(chances.get(3)!).toBeCloseTo(100 / 1296, 3);
  expect(chances.get(18)!).toBeCloseTo(2100 / 1296, 3);
  expect(chances.get(13)!).toBeCloseTo(17200 / 1296, 3);
});

test('2d20 drop lowest matches advantage', async ({ page }) => {
  await page.goto('/');

  await selectMode(page, 'Fair');
  await selectAggregation(page, 'Advantage');
  await openProbability(page);
  const advantage = await readAggregatedChances(page);
  await closeProbability(page);

  await selectAggregation(page, 'Drop lowest');
  await expect(page.locator('#dice-per-roll')).toHaveValue('2');
  await openProbability(page);
  const dropped = await readAggregatedChances(page);

  expect(dropped.size).toBe(advantage.size);
  for (const [value, chance] of advantage) {
    expect(dropped.get(value)!, `face ${value}`).toBeCloseTo(chance, 3);
  }
});

test('drop lowest settings survive reload', async ({ page }) => {
  await page.goto('/');

  await selectDie(page, 'd6');
  await selectAggregation(page, 'Drop lowest');
  await setDicePerRoll(page, 4);

  await page.reload();

  await expect(page.locator('#aggregation-trigger')).toHaveText('Drop lowest');
  await expect(page.locator('#dice-per-roll')).toHaveValue('4');
});
