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

const BALANCE_RESPONSE = {
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
  suggestions: [
    "What bundles are available?",
    "Check my usage",
    "I need support",
  ],
  confidence: 0.95,
  processingSteps: [{ label: "Checking your balance", status: "done" }],
};

interface MockSession {
  sessionId: string;
  userId: string;
  updatedAt: string;
  messages: Array<{ role: "user" | "agent"; text: string; timestamp: number }>;
}

async function setupHistoryRoutes(page: Page): Promise<void> {
  const sessions = new Map<string, MockSession>();

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

  await page.route("**/api/agent/quick-actions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(QUICK_ACTIONS),
    });
  });

  await page.route("**/api/agent/chat/stream", async (route) => {
    await route.fulfill({ status: 500, body: "stream unavailable" });
  });

  await page.route("**/api/agent/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      prompt: string;
      userId: string;
      sessionId: string;
    };

    const now = Date.now();
    const session = sessions.get(body.sessionId) ?? {
      sessionId: body.sessionId,
      userId: body.userId,
      updatedAt: new Date(now).toISOString(),
      messages: [],
    };

    session.messages.push(
      { role: "user", text: body.prompt, timestamp: now },
      { role: "agent", text: BALANCE_RESPONSE.replyText, timestamp: now + 1 },
    );
    session.updatedAt = new Date(now).toISOString();
    sessions.set(session.sessionId, session);

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(BALANCE_RESPONSE),
    });
  });

  await page.route("**/api/history/sessions?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const userId = requestUrl.searchParams.get("userId");
    const result = Array.from(sessions.values())
      .filter((session) => !userId || session.userId === userId)
      .map((session) => ({
        sessionId: session.sessionId,
        messageCount: session.messages.length,
        updatedAt: session.updatedAt,
      }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });

  await page.route("**/api/history/session/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const sessionId = requestUrl.pathname.split("/").pop();

    if (!sessionId) {
      await route.fulfill({ status: 400, body: "Missing sessionId" });
      return;
    }

    if (route.request().method() === "DELETE") {
      sessions.delete(sessionId);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      await route.fulfill({ status: 404, body: "Session not found" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: session.sessionId,
        sessionId: session.sessionId,
        userId: session.userId,
        messages: session.messages,
        metadata: {
          createdAt: session.updatedAt,
          updatedAt: session.updatedAt,
          totalMessages: session.messages.length,
        },
      }),
    });
  });
}

async function createConversation(page: Page): Promise<void> {
  await page.getByTestId("prompt-input").fill("Check my balance");
  await page.getByTestId("send-button").click();
  await expect(page.getByTestId("balance-screen")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Conversation History", () => {
  test.beforeEach(async ({ page }) => {
    await setupHistoryRoutes(page);
    await page.goto("/");
  });

  test("should keep session available after refresh", async ({ page }) => {
    await createConversation(page);

    await page.reload();
    await page.getByTestId("history-tab").click();
    await expect(page.getByTestId("session-list")).toBeVisible();
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);

    await page
      .locator('[data-testid="session-item"] button')
      .first()
      .click();
    await expect(page.getByTestId("chat-tab")).toHaveClass(/active/);
  });

  test("should list previous sessions in history tab", async ({ page }) => {
    await createConversation(page);

    await page.getByTestId("history-tab").click();
    await expect(page.getByTestId("session-list")).toBeVisible();
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);
  });

  test("should delete session", async ({ page }) => {
    await createConversation(page);

    await page.getByTestId("history-tab").click();
    await expect(page.getByTestId("session-list")).toBeVisible();

    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);
    await page.getByTestId("delete-session-button").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(0);
  });

  test("should cancel delete session", async ({ page }) => {
    await createConversation(page);

    await page.getByTestId("history-tab").click();
    await expect(page.getByTestId("session-list")).toBeVisible();

    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);
    await page.getByTestId("delete-session-button").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);
  });

  test("should switch between chat and history tabs", async ({ page }) => {
    await expect(page.getByTestId("chat-tab")).toHaveClass(/active/);

    await page.getByTestId("history-tab").click();
    await expect(page.getByTestId("history-tab")).toHaveClass(/active/);

    await page.getByTestId("chat-tab").click();
    await expect(page.getByTestId("chat-tab")).toHaveClass(/active/);
  });
});
