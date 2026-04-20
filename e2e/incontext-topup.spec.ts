import { test, expect, type Page } from "@playwright/test";

const LOW_BALANCE = {
  current: 13.79,
  currency: "USD",
  lastTopUp: "2026-04-10T10:00:00.000Z",
  nextBillingDate: "2026-05-01T00:00:00.000Z",
};

const UPDATED_BALANCE = {
  ...LOW_BALANCE,
  current: 23.79,
};

const FEATURED_BUNDLE = {
  id: "b2",
  name: "Data Plus 10GB",
  description: "Great value bundle",
  price: 19.99,
  currency: "USD",
  dataGB: 10,
  minutes: 200,
  sms: 200,
  validity: "30 days",
  popular: true,
};

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

async function setupTopUpRoutes(page: Page): Promise<void> {
  await page.route("**/api/agent/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        llm: "available",
        mode: "normal",
        circuitState: "closed",
      }),
    });
  });

  await page.route("**/api/history/sessions?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/agent/quick-actions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(QUICK_ACTIONS),
    });
  });

  // Force orchestrator to use non-streaming path for deterministic assertions.
  await page.route("**/api/agent/chat/stream", async (route) => {
    await route.fulfill({ status: 500, body: "stream unavailable" });
  });

  await page.route("**/api/agent/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      prompt: string;
      confirmationAction?: { token: string; decision: "confirm" | "cancel" };
    };

    if (body.confirmationAction?.decision === "confirm") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          screenType: "confirmation",
          screenData: {
            type: "confirmation",
            title: "Top-up Successful",
            status: "success",
            message: "Your account has been credited successfully.",
            details: { amount: "USD 10.00" },
            updatedBalance: UPDATED_BALANCE,
            actionType: "top_up",
          },
          replyText: "Top-up completed.",
          suggestions: ["What bundles are available?", "Show my balance"],
          confidence: 0.98,
          processingSteps: [{ label: "Applying top-up", status: "done" }],
        }),
      });
      return;
    }

    if (/what bundles are available\??/i.test(body.prompt)) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          screenType: "bundles",
          screenData: {
            type: "bundles",
            bundles: [
              FEATURED_BUNDLE,
              {
                id: "b1",
                name: "Starter 5GB",
                description: "Everyday data",
                price: 9.99,
                currency: "USD",
                dataGB: 5,
                minutes: 100,
                sms: 100,
                validity: "30 days",
              },
            ],
          },
          replyText: "Here are your available bundles.",
          suggestions: ["Show me details for bundle b2"],
          confidence: 0.95,
          processingSteps: [{ label: "Loading bundles", status: "done" }],
        }),
      });
      return;
    }

    if (/show me details for bundle/i.test(body.prompt)) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          screenType: "bundleDetail",
          screenData: {
            type: "bundleDetail",
            bundle: FEATURED_BUNDLE,
            currentBalance: LOW_BALANCE,
          },
          replyText: "Here are the bundle details.",
          suggestions: ["top up $10"],
          confidence: 0.97,
          processingSteps: [{ label: "Loading bundle details", status: "done" }],
        }),
      });
      return;
    }

    if (/top up \$10/i.test(body.prompt)) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          screenType: "confirmation",
          screenData: {
            type: "confirmation",
            title: "Confirm Top-up",
            status: "pending",
            message: "Please confirm your top-up request.",
            details: { amount: "USD 10.00" },
            requiresUserConfirmation: true,
            confirmationToken: "tok-topup-10",
            actionType: "top_up",
          },
          replyText: "Please confirm to continue.",
          suggestions: ["Confirm request", "Cancel request"],
          confidence: 0.96,
          processingSteps: [{ label: "Preparing confirmation", status: "done" }],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        screenType: "unknown",
        screenData: { type: "unknown" },
        replyText: "Unhandled prompt in test stub.",
        suggestions: ["What bundles are available?"],
        confidence: 0.2,
        processingSteps: [{ label: "Fallback", status: "done" }],
      }),
    });
  });
}

async function navigateToInsufficientBundleDetail(page: Page): Promise<void> {
  await page.goto("/");
  await page.selectOption("select", "Jamie Chen - Value Plus");

  await page.getByTestId("quick-action-bundles").click();
  const featuredDetailsButton = page.getByRole("button", {
    name: "View details for Data Plus 10GB",
  });
  await expect(featuredDetailsButton).toBeVisible({
    timeout: 10000,
  });

  await featuredDetailsButton.click();
  await expect(page.getByText(/You have USD 13\.79 — needs USD 19\.99/)).toBeVisible({
    timeout: 10000,
  });
}

test.beforeEach(async ({ page }) => {
  await setupTopUpRoutes(page);
});

test("top-up panel appears when balance is insufficient", async ({ page }) => {
  await navigateToInsufficientBundleDetail(page);

  await expect(page.getByRole("button", { name: "+$5", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$10", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$20", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$50", exact: true })).toBeVisible();

  const confirmBtn = page.getByRole("button", {
    name: /Insufficient Balance/i,
  });
  await expect(confirmBtn).toBeVisible();
  await expect(confirmBtn).toBeDisabled();
});

test("top-up shows confirmation dialog, then success after confirm", async ({ page }) => {
  await navigateToInsufficientBundleDetail(page);

  await page.getByRole("button", { name: "+$10", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Confirm Top-up" })).toBeVisible({
    timeout: 10000,
  });

  await page.getByLabel("Confirm request").click();

  await expect(page.getByRole("heading", { name: "Top-up Successful" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/Updated Balance/)).toBeVisible();
  await expect(page.getByText(/USD 23\.79/)).toBeVisible();
});
