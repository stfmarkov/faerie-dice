import { test, expect } from '@playwright/test';
import {
  openProbability,
  selectAggregation,
  selectDie,
  selectMode,
  setTarget,
} from './helpers';

test('target stays empty until a number is entered, then shows under and over', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await openProbability(page);

  await expect(page.locator('#target-number')).toHaveValue('');
  await expect(page.locator('#target-chance')).toBeHidden();

  await page.getByRole('button', { name: 'Increase target' }).click();
  await expect(page.locator('#target-number')).toHaveValue('1');
  await expect(page.locator('#target-under')).toHaveText('Under 0.000%');
  await expect(page.locator('#target-over')).toHaveText('Over 100.000%');

  await setTarget(page, 15);

  await expect(page.locator('#target-under')).toHaveText('Under 70.000%');
  await expect(page.locator('#target-over')).toHaveText('Over 30.000%');
  await expect(page.locator('#aggregated-graph')).toBeHidden();

  const tones = await page.locator('#weights li').evaluateAll(items =>
    items.map(item => item.className),
  );
  for (const className of tones) {
    expect(className).not.toContain('weight-low');
    expect(className).not.toContain('weight-high');
  }
});

test('aggregated graph paints under red and over green, with both chances', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await selectAggregation(page, 'Advantage');
  await openProbability(page);
  await setTarget(page, 15);

  await expect(page.locator('#target-under')).toHaveText('Under 49.000%');
  await expect(page.locator('#target-over')).toHaveText('Over 51.000%');

  const bars = page.locator('#aggregated-distribution li');
  await expect(bars).toHaveCount(20);
  for (let value = 1; value <= 14; value++) {
    await expect(bars.nth(value - 1)).toHaveClass(/weight-low/);
    await expect(bars.nth(value - 1)).not.toHaveClass(/weight-high/);
  }
  for (let value = 15; value <= 20; value++) {
    await expect(bars.nth(value - 1)).toHaveClass(/weight-high/);
    await expect(bars.nth(value - 1)).not.toHaveClass(/weight-low/);
  }
});

test('sum target splits 2d6 around seven', async ({ page }) => {
  await page.goto('/');
  await selectMode(page, 'Fair');
  await selectDie(page, 'd6');
  await selectAggregation(page, 'Sum');
  await openProbability(page);
  await setTarget(page, 7);

  await expect(page.locator('#target-under')).toHaveText('Under 41.667%');
  await expect(page.locator('#target-over')).toHaveText('Over 58.333%');

  const bars = page.locator('#aggregated-distribution li');
  await expect(bars).toHaveCount(11);
  for (let index = 0; index < 5; index++) {
    await expect(bars.nth(index)).toHaveClass(/weight-low/);
  }
  for (let index = 5; index < 11; index++) {
    await expect(bars.nth(index)).toHaveClass(/weight-high/);
  }
});
