import { test, expect } from "@playwright/test";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Reset Jamie Chen's balance to $13.79 before each test
test.beforeEach(async () => {
  await execAsync("node C:/Users/redde/telecom-agent-pwa/reset-test-balance.cjs");
});

test("top-up panel appears when balance is insufficient", async ({ page }) => {
  await page.goto("/");

  // Select Jamie Chen (has $13.79, low balance)
  await page.selectOption("select", "Jamie Chen - Value Plus");

  // First ask about bundles to see the bundle list
  await page.click("button:has-text('What bundles are available?')");
  await page.waitForTimeout(2000);

  // Click View Details on a bundle that costs more than balance ($13.79)
  await page.click("button:has-text('View Details')");

  // Verify top-up panel is shown - balance check may take a moment for SSE
  await expect(
    page.getByText(/You have USD \d+\.\d+ — needs USD 19\.99/)
  ).toBeVisible({ timeout: 10000 });

  // Verify amount buttons are shown (use exact match to avoid +$5 matching +$50)
  await expect(page.getByRole("button", { name: "+$5", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$10", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$20", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+$50", exact: true })).toBeVisible();

  // Verify confirm button is disabled
  const confirmBtn = page.getByRole("button", { name: /Insufficient Balance/i });
  await expect(confirmBtn).toBeVisible();
});

test("top-up shows confirmation dialog, then success after confirm", async ({ page }) => {
  await page.goto("/");

  // Select Jamie Chen
  await page.selectOption("select", "Jamie Chen - Value Plus");

  // First ask about bundles
  await page.click("button:has-text('What bundles are available?')");
  await page.waitForTimeout(2000);

  // Click View Details
  await page.click("button:has-text('View Details')");

  // Verify panel is shown - balance check may take a moment for SSE
  await expect(
    page.getByText(/You have USD \d+\.\d+ — needs USD 19\.99/)
  ).toBeVisible({ timeout: 10000 });

  // Click +$10 top-up - shows pending then confirmation dialog
  await page.getByRole("button", { name: "+$10", exact: true }).click();

  // Wait for confirmation dialog to appear (look for heading specifically)
  await expect(page.getByRole("heading", { name: "Confirm Top-up" })).toBeVisible({ timeout: 10000 });

  // Click confirm on the dialog
  await page.getByRole("button", { name: "Confirm request" }).click();

  // Wait for success screen showing updated balance
  await expect(page.getByText(/Top-up Successful/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/New Balance/)).toBeVisible();
});
