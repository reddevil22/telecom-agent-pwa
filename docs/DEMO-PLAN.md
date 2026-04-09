# Demo Video Plan — Telecom Agent PWA

## Overview

A scripted Playwright test that records a full demo video of the Telecom Agent PWA, showcasing all features end-to-end. The test runs in **headed mode** with a **mobile viewport** (390×844, iPhone 14 Pro) to emphasize the PWA/mobile experience. Each "scene" includes deliberate pauses to let the viewer see the UI before interactions happen.

**Output**: A single `demo.webm` video file in `test-results/demo/`.

---

## Prerequisites

1. Backend running on `http://localhost:3001` (`cd backend && npm run start:dev`)
2. Frontend dev server running on `http://localhost:5173` (`npm run dev`)
3. Fresh database (delete `backend/data/telecom.db` and restart backend if needed) — ensures clean seed data with $50 balance
4. Playwright installed: `npm install -D @playwright/test && npx playwright install chromium`

---

## Playwright Config for Demo

Create `playwright.demo.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,            // 2 min — generous for demo pacing
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,            // headed so the browser window is visible
    viewport: { width: 390, height: 844 },   // iPhone 14 Pro
    video: 'on',                // record every test
    launchOptions: {
      slowMo: 150,              // slow down interactions for visibility
    },
  },
  projects: [
    {
      name: 'demo',
      testMatch: 'demo.spec.ts',
      use: {
        video: {
          mode: 'on',
          size: { width: 390, height: 844 },
        },
      },
    },
  ],
});
```

Run with:
```bash
npx playwright test --config=playwright.demo.config.ts demo.spec.ts
```

Video saved to `test-results/demo/demo-demo/` as `video.webm`.

---

## Demo Script (demo.spec.ts)

### Scene 1: App Load & Welcome (0:00 – 0:08)

**What the viewer sees**: The app loads with the "Telecom Agent" header, warm coral branding, and the welcome screen with "How can I help you today?" and the quick-action buttons.

```
1. Navigate to /
2. Wait 2s — let landing state settle
3. Screenshot moment: welcome screen visible
```

### Scene 2: Quick-Action — Balance (0:08 – 0:18)

**What the viewer sees**: Click the Balance quick-action button. The processing indicator briefly appears, then the Balance screen renders showing $50.00 with the account status.

```
1. Click [data-testid="quick-action-balance"]
2. Wait for "Current Balance" text (≤10s)
3. Pause 3s — viewer reads balance ($50.00)
```

### Scene 3: Quick-Action — Bundles (0:18 – 0:30)

**What the viewer sees**: Click the Bundles quick-action. The Bundles screen renders showing 5 bundles: Starter Pack ($9.99), Value Plus ($19.99), Unlimited Pro ($39.99), Weekend Pass ($4.99), Travel Roaming ($14.99). The "popular" badge on Value Plus is visible.

```
1. Click [data-testid="quick-action-bundles"]
2. Wait for "Starter Pack" text (≤10s)
3. Pause 3s — viewer sees bundle catalog
```

### Scene 4: Quick-Action — Usage (0:30 – 0:40)

**What the viewer sees**: Click the Usage quick-action. The Usage screen shows data/voice/SMS usage bars for the active Starter Pack subscription.

```
1. Click [data-testid="quick-action-usage"]
2. Wait for text containing "GB" (≤10s)
3. Pause 3s — viewer sees usage bars
```

### Scene 5: Quick-Action — Support (0:40 – 0:50)

**What the viewer sees**: Click the Support quick-action. The Support screen renders with "Your Tickets" section (2 tickets) and "Frequently Asked Questions" section.

```
1. Click [data-testid="quick-action-support"]
2. Wait for "Your Tickets" text (≤10s)
3. Pause 3s — viewer sees tickets + FAQ
```

### Scene 6: Quick-Action — Account Dashboard (0:50 – 1:05)

**What the viewer sees**: Click the Account quick-action. The Account screen renders showing Alex Morgan's profile, Active Subscriptions with usage bars, Recent Activity, and Open Tickets.

```
1. Click [data-testid="quick-action-account"]
2. Wait for "Alex Morgan" text (≤10s)
3. Pause 3s — viewer sees full account dashboard
4. Scroll down slowly to reveal Recent Activity and Open Tickets
5. Pause 2s
```

### Scene 7: Chat Prompt — Balance via Text (1:05 – 1:15)

**What the viewer sees**: Type "show my balance" in the text input. The prompt is sent, processing indicator shows briefly (Tier 1 routing is fast), and the balance screen appears. A chat bubble with the user's message is visible in the history.

```
1. Click input[type="text"]
2. Type "show my balance" (slowMo makes this visible)
3. Click button[type="submit"]
4. Wait for "Current Balance" (≤5s — Tier 1 should be fast)
5. Pause 2s
```

### Scene 8: Chat Prompt — Bundles via Novel Phrasing (1:15 – 1:25)

**What the viewer sees**: Type "what deals do you have" — a phrasing not in the Tier 1 keyword list. This may go through Tier 2 cache or Tier 3 LLM. The bundles screen renders.

```
1. Click input[type="text"]
2. Type "what deals do you have"
3. Click button[type="submit"]
4. Wait for "Starter Pack" (≤15s)
5. Pause 2s
```

### Scene 9: Chat Prompt — Account via Text (1:25 – 1:35)

**What the viewer sees**: Type "show my account overview". The Account dashboard renders with all four sections.

```
1. Click input[type="text"]
2. Type "show my account overview"
3. Click button[type="submit"]
4. Wait for "Alex Morgan" (≤10s)
5. Pause 2s
```

### Scene 10: Dark Mode Toggle (1:35 – 1:42)

**What the viewer sees**: Click the moon icon in the header. The entire app transitions to dark theme (dark background, light text, adjusted colors).

```
1. Click the theme toggle button (contains "☾")
2. Pause 3s — viewer sees dark mode
```

### Scene 11: History Tab (1:42 – 1:55)

**What the viewer sees**: Click the History tab. Previous conversation sessions are listed with message counts and dates.

```
1. Click [data-testid="history-tab"]
2. Wait for session list items (≤5s)
3. Pause 3s — viewer sees conversation history
4. Click [data-testid="chat-tab"] to return
5. Pause 1s
```

### Scene 12: Final Overview — Quick Actions in Dark Mode (1:55 – 2:00)

**What the viewer sees**: Back in chat tab, dark mode active, the quick-action buttons are still visible and functional at the bottom. A clean closing shot.

```
1. Verify [data-testid="quick-actions"] is visible
2. Pause 3s — closing shot
```

---

## Full Test Code

```typescript
// e2e/demo.spec.ts
import { test, expect } from '@playwright/test';

const PAUSE = (ms: number) => new Promise(r => setTimeout(r, ms));

test.describe.serial('Demo Video', () => {
  test('full app walkthrough', async ({ page }) => {
    // ─── Scene 1: App Load ───────────────────────────────
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

    // ─── Scene 7: Chat — Balance via Text ────────────────
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

    // ─── Scene 10: Dark Mode ─────────────────────────────
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
```

---

## Post-Production

### Rename video for clarity
```bash
cp test-results/demo/demo-demo/video.webm demo-telecom-agent-pwa.webm
```

### Optional: Add title card with ffmpeg
```bash
ffmpeg -y \
  -f lavfi -i "color=c=#1C1C1E:s=390x844:d=3:r=30" \
  -vf "drawtext=text='Telecom Agent PWA':fontsize=28:fontcolor=white:x=(w-tw)/2:y=(h-th)/2-20,drawtext=text='AI-Powered Customer Service':fontsize=16:fontcolor=#F07A6D:x=(w-tw)/2:y=(h-th)/2+20" \
  -c:v libvpx-vp9 -pix_fmt yuva420p title.webm

ffmpeg -y -f concat -safe 0 -i <(echo "file 'title.webm'
file 'demo-telecom-agent-pwa.webm'") -c copy demo-final.webm
```

### Convert to MP4 (better compatibility)
```bash
ffmpeg -i demo-final.webm -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p demo-telecom-agent.mp4
```

---

## Key Demo Features Showcased

| Time | Feature | What It Shows |
|------|---------|---------------|
| 0:08 | Quick-Action Balance | Tier 1 instant routing (no LLM) |
| 0:18 | Quick-Action Bundles | Catalog with pricing, badges |
| 0:30 | Quick-Action Usage | Usage bars for active subscription |
| 0:40 | Quick-Action Support | Tickets + FAQ |
| 0:50 | Quick-Action Account | Full account dashboard (4 sections) |
| 1:05 | Text prompt "balance" | Tier 1 keyword match via text |
| 1:15 | Text prompt "what deals" | Tier 2/3 fuzzy or LLM routing |
| 1:25 | Text prompt "account" | Chat-driven account view |
| 1:35 | Dark mode toggle | Theme system with persistence |
| 1:42 | History tab | Session management |
| 1:55 | Closing shot | Quick actions always available |

---

## Notes for the QA/Demo Agent

1. **Serial execution**: All scenes run in a single test (`test.describe.serial`) so the video is one continuous recording with no cuts
2. **Clean database**: Start with a fresh `telecom.db` so balance is $50.00 and all seed data is pristine
3. **Timing**: `slowMo: 150` slows each Playwright action by 150ms — makes typing and clicks visible to viewers
4. **Viewport**: 390×844 (iPhone 14 Pro) — best for PWA demo. Change to `{ width: 1280, height: 720 }` for desktop demo
5. **LLM dependency**: Scenes 7-9 (text prompts) require the LLM server to be running for Tier 3 routing. Quick-action scenes (2-6) work without LLM via Tier 1
6. **Video codec**: Chromium records `.webm` (VP8/VP9). Use ffmpeg to convert to `.mp4` for broader compatibility
