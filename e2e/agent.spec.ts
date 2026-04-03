import { test, expect } from '@playwright/test';

const TESTS = [
  {
    prompt: 'show my balance',
    assert: async (page) => {
      await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('$42.50')).toBeVisible();
    },
  },
  {
    prompt: 'what bundles are available?',
    assert: async (page) => {
      await expect(page.getByText('Starter Pack')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Value Plus')).toBeVisible();
      await expect(page.getByText('Unlimited Pro')).toBeVisible();
    },
  },
  {
    prompt: 'check my usage',
    assert: async (page) => {
      await expect(page.getByText('data')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('3.7')).toBeVisible();
      await expect(page.getByText('GB')).toBeVisible();
    },
  },
  {
    prompt: 'I need help',
    assert: async (page) => {
      await expect(page.getByText('Your Tickets')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('TK-1024')).toBeVisible();
      await expect(page.getByText('Frequently Asked')).toBeVisible();
    },
  },
];

for (const t of TESTS) {
  test(`"${t.prompt}" renders correct screen`, async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="text"]', t.prompt);
    await page.click('button[type="submit"]');
    await t.assert(page);
  });
}
