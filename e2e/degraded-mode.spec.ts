import { test, expect, type Page } from '@playwright/test';

const QUICK_ACTIONS = {
  actions: [
    { id: 'balance', label: 'Balance', icon: '💰', syntheticPrompt: 'Show my balance' },
    { id: 'bundles', label: 'Bundles', icon: '📦', syntheticPrompt: 'What bundles are available?' },
    { id: 'usage', label: 'Usage', icon: '📊', syntheticPrompt: 'Check my usage' },
    { id: 'support', label: 'Support', icon: '🎧', syntheticPrompt: 'I need support' },
    { id: 'account', label: 'Account', icon: '👤', syntheticPrompt: 'Show my account' },
  ],
};

const BALANCE_RESPONSE = {
  screenType: 'balance',
  screenData: {
    type: 'balance',
    balance: {
      current: 42.5,
      currency: 'USD',
      lastTopUp: '2026-04-10T10:00:00.000Z',
      nextBillingDate: '2026-05-01T00:00:00.000Z',
    },
  },
  replyText: 'Here is your current account balance.',
  suggestions: ['What bundles are available?', 'Check my usage', 'I need support'],
  confidence: 0.95,
  processingSteps: [
    { label: 'Checking your balance', status: 'done' },
  ],
};

async function setupSharedRoutes(page: Page): Promise<void> {
  await page.route('**/api/history/sessions?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/agent/quick-actions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(QUICK_ACTIONS),
    });
  });

  // Force stream failure so orchestrator falls back to the non-streaming endpoint.
  await page.route('**/api/agent/chat/stream', async (route) => {
    await route.fulfill({ status: 500, body: 'stream unavailable' });
  });

  await page.route('**/api/agent/chat', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(BALANCE_RESPONSE),
    });
  });
}

test.describe('Degraded mode UX', () => {
  test('shows degraded banner, hides input, and keeps quick actions functional', async ({ page }) => {
    await setupSharedRoutes(page);

    await page.route('**/api/agent/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ llm: 'unavailable', mode: 'degraded', circuitState: 'open' }),
      });
    });

    await page.goto('/');

    await expect(page.getByTestId('degraded-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('textbox', { name: 'Type your message' })).toHaveCount(0);

    await expect(page.getByTestId('quick-actions')).toBeVisible();
    await page.getByTestId('quick-action-balance').click();

    await expect(page.getByText('$42.50')).toBeVisible({ timeout: 15000 });
  });

  test('restores text input when status returns to normal', async ({ page }) => {
    await setupSharedRoutes(page);

    let degraded = true;
    await page.route('**/api/agent/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          degraded
            ? { llm: 'unavailable', mode: 'degraded', circuitState: 'open' }
            : { llm: 'available', mode: 'normal', circuitState: 'closed' },
        ),
      });
    });

    await page.goto('/');
    await expect(page.getByTestId('degraded-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('textbox', { name: 'Type your message' })).toHaveCount(0);

    degraded = false;
    await page.reload();

    await expect(page.getByTestId('degraded-banner')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Type your message' })).toBeVisible();
  });
});
