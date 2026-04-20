import { test, expect, type Page } from '@playwright/test';

const PAUSE = (ms: number) => new Promise(r => setTimeout(r, ms));

const QUICK_ACTIONS = {
  actions: [
    { id: 'balance', label: 'Balance', icon: '💰', syntheticPrompt: 'Show my balance' },
    { id: 'bundles', label: 'Bundles', icon: '📦', syntheticPrompt: 'What bundles are available?' },
    { id: 'usage', label: 'Usage', icon: '📊', syntheticPrompt: 'Check my usage' },
    { id: 'support', label: 'Support', icon: '🎧', syntheticPrompt: 'I need support' },
    { id: 'account', label: 'Account', icon: '👤', syntheticPrompt: 'Show my account' },
  ],
};

const RESPONSES = {
  balance: {
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
    processingSteps: [{ label: 'Checking your balance', status: 'done' }],
  },
  bundles: {
    screenType: 'bundles',
    screenData: {
      type: 'bundles',
      bundles: [
        {
          id: 'b1',
          name: 'Starter Pack',
          description: 'Starter plan',
          price: 9.99,
          currency: 'USD',
          dataGB: 5,
          minutes: 100,
          sms: 100,
          validity: '30 days',
        },
        {
          id: 'b2',
          name: 'Value Plus',
          description: 'Best value',
          price: 19.99,
          currency: 'USD',
          dataGB: 10,
          minutes: 200,
          sms: 200,
          validity: '30 days',
          popular: true,
        },
        {
          id: 'b3',
          name: 'Unlimited Pro',
          description: 'Power users',
          price: 39.99,
          currency: 'USD',
          dataGB: 100,
          minutes: -1,
          sms: -1,
          validity: '30 days',
        },
      ],
    },
    replyText: 'Here are available bundles.',
    suggestions: ['View Value Plus details'],
    confidence: 0.94,
    processingSteps: [{ label: 'Loading bundles', status: 'done' }],
  },
  usage: {
    screenType: 'usage',
    screenData: {
      type: 'usage',
      usage: [
        { type: 'data', used: 3.7, total: 10, unit: 'GB', period: 'Current cycle' },
        { type: 'voice', used: 45, total: 200, unit: 'min', period: 'Current cycle' },
        { type: 'sms', used: 22, total: 100, unit: 'SMS', period: 'Current cycle' },
      ],
    },
    replyText: 'Here is your usage.',
    suggestions: ['What bundles are available?'],
    confidence: 0.93,
    processingSteps: [{ label: 'Checking usage', status: 'done' }],
  },
  support: {
    screenType: 'support',
    screenData: {
      type: 'support',
      tickets: [
        { id: 'TK-1024', status: 'open', subject: 'Slow data speed', createdAt: 'Apr 10' },
      ],
      faqItems: [
        {
          question: 'How do I top up?',
          answer: 'Use the + Add funds button from your balance screen.',
        },
      ],
    },
    replyText: 'Support details loaded.',
    suggestions: ['Create a support ticket'],
    confidence: 0.92,
    processingSteps: [{ label: 'Loading support', status: 'done' }],
  },
  account: {
    screenType: 'account',
    screenData: {
      type: 'account',
      profile: {
        name: 'Alex Morgan',
        msisdn: '+1 555-0100',
        plan: 'Prepaid Basic',
        status: 'active',
        balance: {
          current: 42.5,
          currency: 'USD',
          lastTopUp: '2026-04-10T10:00:00.000Z',
          nextBillingDate: '2026-05-01T00:00:00.000Z',
        },
        billingCycleStart: '2026-04-01T00:00:00.000Z',
        billingCycleEnd: '2026-05-01T00:00:00.000Z',
      },
      activeSubscriptions: [
        {
          subscriptionId: 'sub-1',
          bundleName: 'Starter Pack',
          status: 'active',
          activatedAt: '2026-04-01T00:00:00.000Z',
          expiresAt: '2026-05-01T00:00:00.000Z',
          dataUsedMb: 1024,
          dataTotalMb: 5120,
          minutesUsed: 45,
          minutesTotal: 200,
          smsUsed: 22,
          smsTotal: 100,
        },
      ],
      recentTransactions: [
        {
          id: 'tx-1',
          type: 'topup',
          description: 'Top up',
          amount: 20,
          currency: 'USD',
          timestamp: '2026-04-10T10:00:00.000Z',
        },
      ],
      openTickets: [
        {
          id: 'TK-1024',
          status: 'open',
          subject: 'Slow data speed',
          updatedAt: '2026-04-12T09:00:00.000Z',
        },
      ],
    },
    replyText: 'Here is your account overview.',
    suggestions: ['Show my balance'],
    confidence: 0.91,
    processingSteps: [{ label: 'Loading account', status: 'done' }],
  },
};

interface MockSession {
  sessionId: string;
  userId: string;
  updatedAt: string;
  messages: Array<{ role: 'user' | 'agent'; text: string; timestamp: number }>;
}

async function setupDemoRoutes(page: Page): Promise<void> {
  const sessions = new Map<string, MockSession>();

  await page.route('**/api/agent/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ llm: 'available', mode: 'normal', circuitState: 'closed' }),
    });
  });

  await page.route('**/api/agent/quick-actions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(QUICK_ACTIONS),
    });
  });

  await page.route('**/api/agent/chat/stream', async (route) => {
    await route.fulfill({ status: 500, body: 'stream unavailable' });
  });

  await page.route('**/api/agent/chat', async (route) => {
    const body = route.request().postDataJSON() as {
      prompt: string;
      sessionId: string;
      userId: string;
    };

    const prompt = body.prompt.toLowerCase();
    const response = /balance/.test(prompt)
      ? RESPONSES.balance
      : /(bundles|deals)/.test(prompt)
        ? RESPONSES.bundles
        : /usage/.test(prompt)
          ? RESPONSES.usage
          : /(help|support)/.test(prompt)
            ? RESPONSES.support
            : /account/.test(prompt)
              ? RESPONSES.account
              : RESPONSES.balance;

    const now = Date.now();
    const session = sessions.get(body.sessionId) ?? {
      sessionId: body.sessionId,
      userId: body.userId,
      updatedAt: new Date(now).toISOString(),
      messages: [],
    };
    session.messages.push(
      { role: 'user', text: body.prompt, timestamp: now },
      { role: 'agent', text: response.replyText, timestamp: now + 1 },
    );
    session.updatedAt = new Date(now).toISOString();
    sessions.set(session.sessionId, session);

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  await page.route('**/api/history/sessions?*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const userId = requestUrl.searchParams.get('userId');
    const result = Array.from(sessions.values())
      .filter((session) => !userId || session.userId === userId)
      .map((session) => ({
        sessionId: session.sessionId,
        messageCount: session.messages.length,
        updatedAt: session.updatedAt,
      }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
}

test.describe.serial('Demo Video', () => {
  test('full app walkthrough', async ({ page }) => {
    test.setTimeout(120000);
    await setupDemoRoutes(page);

    // ─── Scene 1: App Load & Welcome ─────────────────────
    await page.goto('/');
    await PAUSE(2000);
    await expect(page.getByText('How can I help you today?')).toBeVisible();

    // ─── Scene 2: Balance Quick Action ───────────────────
    await page.click('[data-testid="quick-action-balance"]');
    await expect(page.getByTestId('balance-screen')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '+ Add funds' })).toBeVisible();
    await PAUSE(3000);

    // ─── Scene 3: Bundles Quick Action ───────────────────
    await page.click('[data-testid="quick-action-bundles"]');
    await expect(page.getByText('Starter Pack')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Value Plus' })).toBeVisible();
    await PAUSE(3000);

    // ─── Scene 4: Usage Quick Action ─────────────────────
    await page.click('[data-testid="quick-action-usage"]');
    await expect(page.getByText(/^data$/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/3\.7\s*\/\s*10\s*GB/)).toBeVisible();
    await PAUSE(3000);

    // ─── Scene 5: Support Quick Action ───────────────────
    await page.click('[data-testid="quick-action-support"]');
    await expect(page.getByText('Your Tickets')).toBeVisible({ timeout: 10000 });
    await PAUSE(3000);

    // ─── Scene 6: Account Dashboard ──────────────────────
    await page.click('[data-testid="quick-action-account"]');
    await expect(page.getByText(/^Alex Morgan$/)).toBeVisible({ timeout: 10000 });
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
    await expect(page.getByTestId('balance-screen')).toBeVisible({ timeout: 5000 });
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
    await expect(page.getByText(/^Alex Morgan$/)).toBeVisible({ timeout: 10000 });
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
