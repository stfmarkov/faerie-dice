import { test, expect } from '@playwright/test';
import {
  closeProbability,
  expectFairishUpdate,
  openProbability,
  readFaceChances,
  rollOnce,
} from './helpers';

test('fairish roll lowers the face and boosts the opposite group', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('img', { name: 'fair(ish) dice' })).toBeVisible();
  await expect(page.locator('.brand-name')).toBeVisible();
  await expect(page.locator('#result-value')).toHaveText('—');
  await expect(page.locator('#mode-trigger')).toHaveText('Fairish');

  await openProbability(page);
  await expect(page.locator('#probability-current-roll')).toHaveText('Current roll: —');

  const sides = 20;
  const before = await readFaceChances(page);
  expect(before.size).toBe(sides);
  for (const chance of before.values()) {
    expect(chance).toBeCloseTo(100 / sides, 3);
  }

  const rolled = await rollOnce(page);
  expect(rolled).toBeGreaterThanOrEqual(1);
  expect(rolled).toBeLessThanOrEqual(sides);
  await expect(page.locator('#probability-current-roll')).toHaveText(`Current roll: ${rolled}`);

  const afterMainRoll = await readFaceChances(page);
  expectFairishUpdate(before, afterMainRoll, rolled, sides);

  const rolledFromDrawer = await rollOnce(page);
  await expect(page.locator('#probability-current-roll')).toHaveText(
    `Current roll: ${rolledFromDrawer}`,
  );
  const afterDrawerRoll = await readFaceChances(page);
  expectFairishUpdate(afterMainRoll, afterDrawerRoll, rolledFromDrawer, sides);

  await closeProbability(page);

  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: 'Roll history' });
  await expect(history).toBeVisible();
  await expect(history).toContainText(String(rolled));
  await expect(history).toContainText(String(rolledFromDrawer));
  await history.getByText('Close', { exact: true }).click();
  await expect(history).toHaveCount(0);
});
