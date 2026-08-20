import { test, expect } from '@playwright/test';
import {
  expectFairishUpdate,
  isHigh,
  openProbability,
  readFaceChances,
  readRollHistory,
  rollOnce,
  selectAggregation,
  setNumberOfRolls,
} from './helpers';

const SIDES = 20;

function parseFaces(detail: string, aggregation: 'advantage' | 'disadvantage' | 'sum'): number[] {
  const text = aggregation === 'sum' ? detail.replace(/^sum of /, '') : detail;
  return text.split(', ').map(Number);
}

function changedFaceCount(
  before: Map<number, number>,
  after: Map<number, number>,
): number {
  let changed = 0;
  for (const [face, prev] of before) {
    if (Math.abs(after.get(face)! - prev) > 0.001) {
      changed += 1;
    }
  }
  return changed;
}

test('fairish advantage records both faces and drops chance only for the kept one', async ({ page }) => {
  await page.goto('/');
  await selectAggregation(page, 'Advantage');
  await openProbability(page);

  const before = await readFaceChances(page);
  const reported = await rollOnce(page);
  const after = await readFaceChances(page);

  const history = await readRollHistory(page);
  const entry = history[history.length - 1];
  const faces = parseFaces(entry.detail!, 'advantage');
  expect(faces).toHaveLength(2);
  expect(entry.value).toBe(Math.max(...faces));
  expect(reported).toBe(entry.value);

  expectFairishUpdate(before, after, entry.value, SIDES);
  for (const face of faces) {
    if (face !== entry.value) {
      expect(
        after.get(face)!,
        `unused face ${face} should not drop`,
      ).toBeGreaterThanOrEqual(before.get(face)! - 0.001);
    }
  }
});

test('fairish disadvantage records both faces and drops chance only for the kept one', async ({ page }) => {
  await page.goto('/');
  await selectAggregation(page, 'Disadvantage');
  await openProbability(page);

  const before = await readFaceChances(page);
  const reported = await rollOnce(page);
  const after = await readFaceChances(page);

  const history = await readRollHistory(page);
  const entry = history[history.length - 1];
  const faces = parseFaces(entry.detail!, 'disadvantage');
  expect(faces).toHaveLength(2);
  expect(entry.value).toBe(Math.min(...faces));
  expect(reported).toBe(entry.value);

  expectFairishUpdate(before, after, entry.value, SIDES);
  for (const face of faces) {
    if (face !== entry.value) {
      expect(
        after.get(face)!,
        `unused face ${face} should not drop`,
      ).toBeGreaterThanOrEqual(before.get(face)! - 0.001);
    }
  }
});

test('fairish sum drops chance for every landed face', async ({ page }) => {
  await page.goto('/');
  await selectAggregation(page, 'Sum');
  await openProbability(page);

  const before = await readFaceChances(page);
  await rollOnce(page);
  const after = await readFaceChances(page);

  const history = await readRollHistory(page);
  const entry = history[history.length - 1];
  const faces = parseFaces(entry.detail!, 'sum');
  expect(faces).toHaveLength(2);

  const unique = [...new Set(faces)];
  if (unique.length === 1) {
    expect(after.get(unique[0])!).toBeCloseTo(before.get(unique[0])! - 2, 2);
    return;
  }

  // One remembered face from a fair d20 moves 11 faces (the drop + opposite group).
  // Two remembered faces move more than that.
  expect(changedFaceCount(before, after)).toBeGreaterThan(11);

  if (isHigh(faces[0], SIDES) === isHigh(faces[1], SIDES)) {
    expect(after.get(faces[0])!).toBeLessThan(before.get(faces[0])!);
    expect(after.get(faces[1])!).toBeLessThan(before.get(faces[1])!);
  }
});

test('fairish none drops chance for every landed face', async ({ page }) => {
  await page.goto('/');
  await setNumberOfRolls(page, 2);
  await openProbability(page);

  const before = await readFaceChances(page);
  await page.getByLabel('Face weights').getByRole('button', { name: 'Roll' }).click();
  await expect(page.locator('#result-value')).toHaveText('2×');
  const after = await readFaceChances(page);

  const history = await readRollHistory(page);
  expect(history).toHaveLength(2);
  const faces = history.map(entry => entry.value);

  const unique = [...new Set(faces)];
  if (unique.length === 1) {
    expect(after.get(unique[0])!).toBeCloseTo(before.get(unique[0])! - 2, 2);
    return;
  }

  expect(changedFaceCount(before, after)).toBeGreaterThan(11);
});
