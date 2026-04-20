import { test, expect, type Page } from "@playwright/test";

const QUICK_ACTIONS = {
  actions: [
    {
      id: "balance",
      label: "Balance",
      icon: "💰",
      syntheticPrompt: "Show my balance",
    },
    {
      id: "bundles",
      label: "Bundles",
      icon: "📦",
      syntheticPrompt: "What bundles are available?",
    },
    {
      id: "usage",
      label: "Usage",
      icon: "📊",
      syntheticPrompt: "Check my usage",
    },
    {
      id: "support",
      label: "Support",
      icon: "🎧",
      syntheticPrompt: "I need support",
    },
    {
      id: "account",
      label: "Account",
      icon: "👤",
      syntheticPrompt: "Show my account",
    },
  ],
};

const RESPONSES = {
  balance: {
    screenType: "balance",
    screenData: {
      type: "balance",
      balance: {
        current: 42.5,
        currency: "USD",
        lastTopUp: "2026-04-10T10:00:00.000Z",
        nextBillingDate: "2026-05-01T00:00:00.000Z",
      },
    },
    replyText: "Here is your current account balance.",
    suggestions: ["What bundles are available?", "Check my usage", "I need support"],
    confidence: 0.95,
    processingSteps: [{ label: "Checking your balance", status: "done" }],
  },
  bundles: {
    screenType: "bundles",
    screenData: {
      type: "bundles",
      bundles: [
        {
          id: "b1",
          name: "Starter Pack",
          description: "Starter plan",
          price: 9.99,
          currency: "USD",
          dataGB: 5,
          minutes: 100,
          sms: 100,
          validity: "30 days",
        },
        {
          id: "b2",
          name: "Value Plus",
          description: "Best value",
          price: 19.99,
          currency: "USD",
          dataGB: 10,
          minutes: 200,
          sms: 200,
          validity: "30 days",
          popular: true,
        },
        {
          id: "b3",
          name: "Unlimited Pro",
          description: "Power users",
          price: 39.99,
          currency: "USD",
          dataGB: 100,
          minutes: -1,
          sms: -1,
          validity: "30 days",
        },
      ],
    },
    replyText: "Here are available bundles.",
    suggestions: ["Show me details for bundle b2"],
    confidence: 0.94,
    processingSteps: [{ label: "Loading bundles", status: "done" }],
  },
  usage: {
    screenType: "usage",
    screenData: {
      type: "usage",
      usage: [
        { type: "data", used: 3.7, total: 10, unit: "GB", period: "Current cycle" },
        { type: "voice", used: 45, total: 200, unit: "min", period: "Current cycle" },
        { type: "sms", used: 22, total: 100, unit: "SMS", period: "Current cycle" },
      ],
    },
    replyText: "Here is your usage.",
    suggestions: ["What bundles are available?"],
    confidence: 0.93,
    processingSteps: [{ label: "Checking usage", status: "done" }],
  },
  support: {
    screenType: "support",
    screenData: {
      type: "support",
      tickets: [
        {
          id: "TK-1024",
          status: "open",
          subject: "Slow data speed",
          createdAt: "Apr 10",
        },
      ],
      faqItems: [
        {
          question: "How do I top up?",
          answer: "Use the + Add funds button from your balance screen.",
        },
      ],
    },
    replyText: "Support details loaded.",
    suggestions: ["Create a support ticket"],
    confidence: 0.92,
    processingSteps: [{ label: "Loading support", status: "done" }],
  },
  account: {
    screenType: "account",
    screenData: {
      type: "account",
      profile: {
        name: "Alex Morgan",
        msisdn: "+1 555-0100",
        plan: "Prepaid Basic",
        status: "active",
        balance: {
          current: 42.5,
          currency: "USD",
          lastTopUp: "2026-04-10T10:00:00.000Z",
          nextBillingDate: "2026-05-01T00:00:00.000Z",
        },
        billingCycleStart: "2026-04-01T00:00:00.000Z",
        billingCycleEnd: "2026-05-01T00:00:00.000Z",
      },
      activeSubscriptions: [
        {
          subscriptionId: "sub-1",
          bundleName: "Starter Pack",
          status: "active",
          activatedAt: "2026-04-01T00:00:00.000Z",
          expiresAt: "2026-05-01T00:00:00.000Z",
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
          id: "tx-1",
          type: "topup",
          description: "Top up",
          amount: 20,
          currency: "USD",
          timestamp: "2026-04-10T10:00:00.000Z",
        },
      ],
      openTickets: [
        {
          id: "TK-1024",
          status: "open",
          subject: "Slow data speed",
          updatedAt: "2026-04-12T09:00:00.000Z",
        },
      ],
    },
    replyText: "Here is your account overview.",
    suggestions: ["Show my balance"],
    confidence: 0.91,
    processingSteps: [{ label: "Loading account", status: "done" }],
  },
  unknown: {
    screenType: "unknown",
    screenData: { type: "unknown" },
    replyText: "I did not understand that request.",
    suggestions: ["Show my balance"],
    confidence: 0.3,
    processingSteps: [{ label: "Fallback", status: "done" }],
  },
} as const;

async function setupAgentRoutes(page: Page): Promise<void> {
  await page.route("**/api/agent/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ llm: "available", mode: "normal", circuitState: "closed" }),
    });
  });

  await page.route("**/api/agent/quick-actions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(QUICK_ACTIONS),
    });
  });

  await page.route("**/api/history/sessions?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/agent/chat/stream", async (route) => {
    await route.fulfill({ status: 500, body: "stream unavailable" });
  });

  await page.route("**/api/agent/chat", async (route) => {
    const body = route.request().postDataJSON() as { prompt: string };
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
              : RESPONSES.unknown;

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

const TESTS = [
  {
    prompt: "show my balance",
    assert: async (page: Page) => {
      await expect(page.getByTestId("balance-screen")).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("$42.50")).toBeVisible();
      await expect(page.getByRole("button", { name: "+ Add funds" })).toBeVisible();
    },
  },
  {
    prompt: "what bundles are available?",
    assert: async (page: Page) => {
      await expect(page.getByText("Starter Pack")).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("heading", { name: "Value Plus" })).toBeVisible();
      await expect(page.getByText(/^Unlimited Pro$/)).toBeVisible();
    },
  },
  {
    prompt: "check my usage",
    assert: async (page: Page) => {
      await expect(page.getByText(/^data$/)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/3\.7\s*\/\s*10\s*GB/)).toBeVisible();
    },
  },
  {
    prompt: "I need help",
    assert: async (page: Page) => {
      await expect(page.getByText("Your Tickets")).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("TK-1024")).toBeVisible();
      await expect(page.getByText("Frequently Asked")).toBeVisible();
    },
  },
  {
    prompt: "show my account",
    assert: async (page: Page) => {
      await expect(page.getByText(/^Alex Morgan$/)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Active Subscriptions")).toBeVisible();
      await expect(page.getByText("Starter Pack")).toBeVisible();
      await expect(page.getByText("Recent Activity")).toBeVisible();
    },
  },
];

for (const t of TESTS) {
  test(`"${t.prompt}" renders correct screen`, async ({ page }) => {
    await setupAgentRoutes(page);
    await page.goto("/");
    await page.getByTestId("prompt-input").fill(t.prompt);
    await page.getByTestId("send-button").click();
    await t.assert(page);
  });
}
