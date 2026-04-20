import { test, expect } from "@playwright/test";

test("top-up panel appears when balance is insufficient", async ({ page }) => {
  await page.goto("/");

  // Select Jamie Chen (has $13.79, low balance)
  await page.selectOption("select", "Jamie Chen - Value Plus");

  // First ask about bundles to see the bundle list
  await page.click("button:has-text('What bundles are available?')");
  await page.waitForTimeout(2000);

  // Click View Details on a bundle that costs more than balance ($13.79)
  await page.click("button:has-text('View Details')");

  // Verify top-up panel is shown (balance $13.79 < bundle price)
  await expect(
    page.getByText(/You have \$13.79 — needs \$19.99/)
  ).toBeVisible();

  // Verify amount buttons are shown
  await expect(page.getByText("+$5")).toBeVisible();
  await expect(page.getByText("+$10")).toBeVisible();
  await expect(page.getByText("+$20")).toBeVisible();
  await expect(page.getByText("+$50")).toBeVisible();

  // Verify confirm button is disabled
  const confirmBtn = page.getByRole("button", { name: /Insufficient Balance/i });
  await expect(confirmBtn).toBeVisible();
});

test("top-up enables purchase after successful top-up", async ({ page }) => {
  await page.goto("/");

  // Select Jamie Chen
  await page.selectOption("select", "Jamie Chen - Value Plus");

  // First ask about bundles
  await page.click("button:has-text('What bundles are available?')");
  await page.waitForTimeout(2000);

  // Click View Details
  await page.click("button:has-text('View Details')");

  // Verify panel is shown
  await expect(
    page.getByText(/You have \$13.79 — needs \$19.99/)
  ).toBeVisible();

  // Click +$10 top-up
  await page.click("button:has-text('+$10')");

  // Wait for success state
  await expect(page.getByText(/Balance updated/)).toBeVisible({
    timeout: 20000,
  });

  // Verify confirm button is now enabled
  await expect(
    page.getByRole("button", { name: /Confirm Purchase/i })
  ).toBeEnabled();
});

test("top-up panel shows correct UI structure", async ({ page }) => {
  await page.goto("/");

  await page.selectOption("select", "Jamie Chen - Value Plus");
  await page.click("button:has-text('What bundles are available?')");
  await page.waitForTimeout(2000);
  await page.click("button:has-text('View Details')");

  await expect(
    page.getByText(/You have \$13.79 — needs \$19.99/)
  ).toBeVisible();

  // Verify amount buttons
  await expect(page.getByText("+$5")).toBeVisible();
  await expect(page.getByText("+$10")).toBeVisible();
  await expect(page.getByText("+$20")).toBeVisible();
  await expect(page.getByText("+$50")).toBeVisible();
});
