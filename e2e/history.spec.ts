import { test, expect } from '@playwright/test';

test.describe('Conversation History', () => {
  test('should save conversation and restore after refresh', async ({ page }) => {
    await page.goto('/');

    // Send a message
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');

    // Wait for response (balance screen should appear)
    await page.waitForSelector('[data-testid="balance-screen"]', { timeout: 10000 });

    // Refresh page
    await page.reload();

    // Verify conversation restored (check for user message in history)
    await page.waitForSelector('[data-testid="chat-bubble"]:has-text("Check my balance")', { timeout: 10000 });
  });

  test('should list previous sessions in history tab', async ({ page }) => {
    await page.goto('/');

    // Create a conversation
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]', { timeout: 10000 });

    // Go to history tab
    await page.click('[data-testid="history-tab"]');

    // Verify session is listed
    await page.waitForSelector('[data-testid="session-list"]', { timeout: 5000 });
    const sessionCount = await page.locator('[data-testid="session-item"]').count();
    expect(sessionCount).toBeGreaterThan(0);
  });

  test('should delete session', async ({ page }) => {
    await page.goto('/');

    // Create a conversation
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]', { timeout: 10000 });

    // Go to history tab
    await page.click('[data-testid="history-tab"]');
    await page.waitForSelector('[data-testid="session-list"]', { timeout: 5000 });

    // Count sessions before delete
    const sessionCountBefore = await page.locator('[data-testid="session-item"]').count();

    // Click delete button
    await page.click('[data-testid="delete-session-button"]');
    
    // Click confirm "Yes" button
    await page.click('button:has-text("Yes")');

    // Verify session removed
    await page.waitForTimeout(500);
    const sessionCountAfter = await page.locator('[data-testid="session-item"]').count();
    expect(sessionCountAfter).toBe(sessionCountBefore - 1);
  });

  test('should cancel delete session', async ({ page }) => {
    await page.goto('/');

    // Create a conversation
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]', { timeout: 10000 });

    // Go to history tab
    await page.click('[data-testid="history-tab"]');
    await page.waitForSelector('[data-testid="session-list"]', { timeout: 5000 });

    // Count sessions before delete attempt
    const sessionCountBefore = await page.locator('[data-testid="session-item"]').count();

    // Click delete button
    await page.click('[data-testid="delete-session-button"]');
    
    // Click cancel "No" button
    await page.click('button:has-text("No")');

    // Verify session still exists
    await page.waitForTimeout(500);
    const sessionCountAfter = await page.locator('[data-testid="session-item"]').count();
    expect(sessionCountAfter).toBe(sessionCountBefore);
  });

  test('should switch between chat and history tabs', async ({ page }) => {
    await page.goto('/');

    // Verify chat tab is active by default
    await expect(page.locator('[data-testid="chat-tab"]')).toHaveClass(/active/);

    // Click history tab
    await page.click('[data-testid="history-tab"]');
    await expect(page.locator('[data-testid="history-tab"]')).toHaveClass(/active/);

    // Click chat tab again
    await page.click('[data-testid="chat-tab"]');
    await expect(page.locator('[data-testid="chat-tab"]')).toHaveClass(/active/);
  });
});
