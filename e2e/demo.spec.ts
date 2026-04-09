import { test, expect } from '@playwright/test';

const PAUSE = (ms: number) => new Promise(r => setTimeout(r, ms));

test.describe.serial('Demo Video', () => {
  test('full app walkthrough', async ({ page }) => {
    // ─── Scene 1: App Load & Welcome ─────────────────────
    await page.goto('/');
    await PAUSE(2000);
    await expect(page.getByText('How can I help you today?')).toBeVisible();

    // ─── Scene 2: Balance Quick Action ───────────────────
    await page.click('[data-testid="quick-action-balance"]');
    await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 10000 });
    await PAUSE(3000);

    // ─── Scene 3: Bundles Quick Action ───────────────────
    await page.click('[data-testid="quick-action-bundles"]');
    await expect(page.getByText('Starter Pack')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Value Plus')).toBeVisible();
    await PAUSE(3000);

    // ─── Scene 4: Usage Quick Action ─────────────────────
    await page.click('[data-testid="quick-action-usage"]');
    await expect(page.getByText('GB')).toBeVisible({ timeout: 10000 });
    await PAUSE(3000);

    // ─── Scene 5: Support Quick Action ───────────────────
    await page.click('[data-testid="quick-action-support"]');
    await expect(page.getByText('Your Tickets')).toBeVisible({ timeout: 10000 });
    await PAUSE(3000);

    // ─── Scene 6: Account Dashboard ──────────────────────
    await page.click('[data-testid="quick-action-account"]');
    await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 10000 });
    await PAUSE(2000);
    // Scroll to reveal full dashboard
    await page.evaluate(() => window.scrollBy(0, 400));
    await PAUSE(2000);
    await page.evaluate(() => window.scrollBy(0, 300));
    await PAUSE(2000);
    // Scroll back to top for next scene
    await page.evaluate(() => window.scrollTo(0, 0));
    await PAUSE(1000);

    // ─── Scene 7: Chat — Balance via Text (Tier 1) ───────
    await page.click('input[type="text"]');
    await page.fill('input[type="text"]', 'show my balance');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 5000 });
    await PAUSE(2000);

    // ─── Scene 8: Chat — Bundles via Novel Phrasing ──────
    await page.click('input[type="text"]');
    await page.fill('input[type="text"]', 'what deals do you have');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Starter Pack')).toBeVisible({ timeout: 15000 });
    await PAUSE(2000);

    // ─── Scene 9: Chat — Account via Text ────────────────
    await page.click('input[type="text"]');
    await page.fill('input[type="text"]', 'show my account overview');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 10000 });
    await PAUSE(2000);

    // ─── Scene 10: Dark Mode Toggle ──────────────────────
    await page.click('button[aria-label="Switch to dark mode"]');
    await PAUSE(3000);

    // ─── Scene 11: History Tab ───────────────────────────
    await page.click('[data-testid="history-tab"]');
    await expect(page.locator('[data-testid="session-item"]').first()).toBeVisible({ timeout: 5000 });
    await PAUSE(3000);
    await page.click('[data-testid="chat-tab"]');
    await PAUSE(1000);

    // ─── Scene 12: Closing Shot ──────────────────────────
    await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible();
    await PAUSE(3000);
  });
});
