import { test, expect } from '@playwright/test';

test('feedback page is reachable from the roller and explain', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Feedback' }).click();

  await expect(page).toHaveURL(/\/feedback$/);
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.locator('#feedback-form')).toBeVisible();
  await expect(page.locator('#feedback-home')).toBeHidden();
  expect(await page.content()).not.toContain('X-Feedback-Key');

  await page.getByRole('link', { name: 'Roller', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#roll-btn')).toBeVisible();

  await page.goto('/explain');
  await page.getByRole('link', { name: 'Feedback' }).click();
  await expect(page).toHaveURL(/\/feedback$/);
});

test('empty feedback submit asks for every field', async ({ page }) => {
  await page.goto('/feedback');
  await page.locator('#feedback-submit').click();
  await expect(page.getByRole('status')).toHaveText('Fill in every field, including a rating.');
  await expect(page.locator('#feedback-form')).toBeVisible();
});

test('feedback posts JSON to our server without the secret header', async ({ page }) => {
  let posted: { headers: Record<string, string>; body: unknown } | null = null;

  await page.route('**/feedback', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    posted = {
      headers: route.request().headers(),
      body: route.request().postDataJSON(),
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/feedback');
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('What happened').fill('Loved the new screen.');
  await page.getByRole('radio', { name: '5' }).check();
  await page.locator('#feedback-submit').click();

  await expect(page.getByRole('status')).toContainText('Landed');
  await expect(page.locator('#feedback-form')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Back to the roller' })).toBeVisible();
  await expect(page.locator('#feedback-home')).toBeVisible();

  expect(posted).not.toBeNull();
  expect(posted!.headers['x-feedback-key']).toBeUndefined();
  expect(posted!.headers['content-type']).toContain('application/json');
  expect(posted!.body).toEqual({
    name: 'Ada',
    email: 'ada@example.com',
    message: 'Loved the new screen.',
    rating: 5,
  });
});

test('send error stays on the form', async ({ page }) => {
  await page.route('**/feedback', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'feedback is not configured' }),
    });
  });

  await page.goto('/feedback');
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('What happened').fill('Loved the new screen.');
  await page.getByRole('radio', { name: '5' }).check();
  await page.locator('#feedback-submit').click();

  await expect(page.getByRole('status')).toHaveText('feedback is not configured');
  await expect(page.locator('#feedback-form')).toBeVisible();
  await expect(page.locator('#feedback-submit')).toBeEnabled();
  await expect(page.locator('#feedback-home')).toBeHidden();
});
