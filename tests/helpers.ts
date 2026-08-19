import { expect, type Page } from '@playwright/test';

/** Face → chance %, parsed from `#weights li[title="N: X.XXX%"]`. */
export async function readFaceChances(page: Page): Promise<Map<number, number>> {
  const titles = await page.locator('#weights li').evaluateAll(items =>
    items.map(item => item.getAttribute('title') ?? ''),
  );

  const chances = new Map<number, number>();
  for (const title of titles) {
    const match = title.match(/^(\d+):\s*([\d.]+)%$/);
    expect(match, `unexpected weight title: ${title}`).toBeTruthy();
    chances.set(Number(match![1]), Number(match![2]));
  }
  return chances;
}

export async function openProbability(page: Page) {
  const drawer = page.getByRole('complementary', { name: 'Face weights' });
  if ((await drawer.getAttribute('data-open')) !== 'true') {
    await page.getByRole('button', { name: 'Probability', exact: true }).click();
  }
  await expect(drawer).toHaveAttribute('data-open', 'true');
}

export async function closeProbability(page: Page) {
  const drawer = page.getByRole('complementary', { name: 'Face weights' });
  if ((await drawer.getAttribute('data-open')) === 'true') {
    await page.getByRole('button', { name: 'Close probability engine' }).click();
  }
  await expect(drawer).toHaveAttribute('data-open', 'false');
}

export async function rollOnce(page: Page): Promise<number> {
  // Prefer the probability-drawer Roll when that panel is open — the drawer
  // overlays the main tray and intercepts clicks on #roll-btn.
  const drawerOpen =
    (await page.getByRole('complementary', { name: 'Face weights' }).getAttribute('data-open')) ===
    'true';
  if (drawerOpen) {
    await page.getByLabel('Face weights').getByRole('button', { name: 'Roll' }).click();
  } else {
    await page.locator('#roll-btn').click();
  }
  await expect(page.locator('#result-value')).toHaveText(/^\d+$/);
  return Number(await page.locator('#result-value').textContent());
}

export async function selectMode(page: Page, mode: 'Normal' | 'Weighted' | 'Average') {
  await page.getByRole('button', { name: /Mode/ }).click();
  await page.getByRole('option', { name: mode }).click();
  await expect(page.locator('#mode-trigger')).toHaveText(mode);
}

export async function selectAggregation(
  page: Page,
  aggregation: 'None' | 'Advantage' | 'Disadvantage' | 'Sum',
) {
  await page.getByRole('button', { name: /Aggregation/ }).click();
  await page.getByRole('option', { name: aggregation, exact: true }).click();
  await expect(page.locator('#aggregation-trigger')).toHaveText(aggregation);
}

export type HistoryRoll = {
  die: string;
  value: number;
  detail?: string;
};

function parseHistorySequence(sequence: string): HistoryRoll[] {
  const pattern = /(\w+):(\d+)(?: \(([^)]+)\))?/g;
  return [...sequence.matchAll(pattern)].map((match) => {
    const entry: HistoryRoll = { die: match[1], value: Number(match[2]) };
    if (match[3]) {
      entry.detail = match[3];
    }
    return entry;
  });
}

export async function readRollHistory(page: Page): Promise<HistoryRoll[]> {
  const dialog = page.getByRole('dialog', { name: 'Roll history' });
  const wasOpen = (await dialog.count()) > 0;
  if (!wasOpen) {
    await openHistory(page);
  }

  try {
    if (await dialog.locator('.history-empty').count()) {
      return [];
    }
    const text = (await dialog.locator('.history-sequence').first().textContent())?.trim() ?? '';
    return parseHistorySequence(text);
  } finally {
    if (!wasOpen) {
      await closeHistory(page);
    }
  }
}

export async function setNumberOfRolls(page: Page, count: number) {
  const input = page.locator('#number-of-rolls');
  let current = Number(await input.inputValue());

  while (current < count) {
    await page.getByRole('button', { name: 'Increase rolls' }).click();
    current = Number(await input.inputValue());
  }
  while (current > count) {
    await page.getByRole('button', { name: 'Decrease rolls' }).click();
    current = Number(await input.inputValue());
  }

  await expect(input).toHaveValue(String(count));
}

export async function setDicePerRoll(page: Page, count: number) {
  const input = page.locator('#dice-per-roll');
  let current = Number(await input.inputValue());

  while (current < count) {
    await page.getByRole('button', { name: 'Increase dice per roll' }).click();
    current = Number(await input.inputValue());
  }
  while (current > count) {
    await page.getByRole('button', { name: 'Decrease dice per roll' }).click();
    current = Number(await input.inputValue());
  }

  await expect(input).toHaveValue(String(count));
}

export async function openHistory(page: Page) {
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('dialog', { name: 'Roll history' })).toBeVisible();
}

export async function closeHistory(page: Page) {
  const history = page.getByRole('dialog', { name: 'Roll history' });
  await history.getByText('Close', { exact: true }).click();
  await expect(history).toHaveCount(0);
}

export async function openSettings(page: Page) {
  const drawer = page.getByRole('complementary', { name: 'Settings' });
  if ((await drawer.getAttribute('data-open')) !== 'true') {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  await expect(drawer).toHaveAttribute('data-open', 'true');
}

export async function selectDie(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator(`#die-select button[data-die-name="${name}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

export async function setDropStrength(page: Page, percent: number) {
  await page.locator('#weighted-drop-slider').fill(String(percent));
  await expect(page.locator('#weighted-drop-value')).toHaveText(`${percent}%`);
}

export async function setCurveRolls(page: Page, count: number) {
  const input = page.locator('#average-curve-rolls');
  let current = Number(await input.inputValue());

  while (current < count) {
    await page.getByRole('button', { name: 'Increase curve rolls' }).click();
    current = Number(await input.inputValue());
  }
  while (current > count) {
    await page.getByRole('button', { name: 'Decrease curve rolls' }).click();
    current = Number(await input.inputValue());
  }

  await expect(input).toHaveValue(String(count));
}

/** Count entries in the History "All dice" sequence (`d20:3, d20:7, …`). */
export async function historyEntryCount(page: Page): Promise<number> {
  const sequence = page
    .getByRole('dialog', { name: 'Roll history' })
    .locator('.history-sequence')
    .first();
  const text = (await sequence.textContent())?.trim() ?? '';
  if (!text) {
    return 0;
  }
  return text.split(', ').length;
}

export function expectChancesUnchanged(
  before: Map<number, number>,
  after: Map<number, number>,
) {
  expect(after.size).toBe(before.size);
  for (const [face, prev] of before) {
    expect(after.get(face)!, `face ${face} should stay frozen`).toBeCloseTo(prev, 3);
  }
}

/** Bell / pyramid: rises to a peak, then falls. Extremes are the rarest neighbors. */
export function expectPyramidDistribution(chances: Map<number, number>, sides: number) {
  expect(chances.size).toBe(sides);
  expect(chances.get(2)!, 'second face should beat the first').toBeGreaterThan(
    chances.get(1)!,
  );
  expect(chances.get(sides)!, 'last face should be below second-to-last').toBeLessThan(
    chances.get(sides - 1)!,
  );

  const values = Array.from({ length: sides }, (_, i) => chances.get(i + 1)!);
  const peakIndex = values.indexOf(Math.max(...values));

  for (let i = 0; i < peakIndex; i++) {
    expect(
      values[i + 1],
      `face ${i + 2} should be >= face ${i + 1} on the rising slope`,
    ).toBeGreaterThanOrEqual(values[i]);
  }
  for (let i = peakIndex; i < sides - 1; i++) {
    expect(
      values[i + 1],
      `face ${i + 2} should be <= face ${i + 1} on the falling slope`,
    ).toBeLessThanOrEqual(values[i]);
  }
}

export function isHigh(value: number, sides: number): boolean {
  return value > sides / 2;
}

export function expectWeightedUpdate(
  before: Map<number, number>,
  after: Map<number, number>,
  rolled: number,
  sides: number,
) {
  expect(after.get(rolled)!, `rolled face ${rolled} should drop`).toBeLessThan(
    before.get(rolled)!,
  );

  for (let face = 1; face <= sides; face++) {
    const prev = before.get(face)!;
    const next = after.get(face)!;

    if (face === rolled) {
      continue;
    }

    if (isHigh(face, sides) === isHigh(rolled, sides)) {
      expect(next, `same-group face ${face} should stay put`).toBeCloseTo(prev, 3);
    } else {
      expect(next, `opposite-group face ${face} should rise`).toBeGreaterThan(prev);
    }
  }
}
