# Implementation Plan — Priority Recommendations (Telecom Agent PWA)

Created: 2026-04-20

## 1. Fix `window.__topUpPanel` Global Callback → React Callback Prop
**Severity:** High | **Effort:** Medium | **Risk:** Medium (UI behavior change)

**Problem:** `TopUpPanel.tsx` (lines 46-51) sets `window.__topUpPanel` with no cleanup. `BundleDetailScreen.tsx` (lines 60-96) reads it in 3 places. Race conditions if user navigates away mid-top-up.

**Plan:**
- Remove the `window.__topUpPanel` global from `TopUpPanel.tsx`
- Have `TopUpPanel` accept `onSuccess(balance: number)` and `onError(msg: string)` callback props
- `BundleDetailScreen` passes callbacks that update its own local state
- Remove all `window as unknown as { __topUpPanel? }` casts from `BundleDetailScreen`

**Files:** `src/screens/BundleDetailScreen/TopUpPanel.tsx`, `src/screens/BundleDetailScreen/BundleDetailScreen.tsx`

---

## 2. Fix RateLimitGuard Bypass
**Severity:** High | **Effort:** Low | **Risk:** Low

**Problem:** `rate-limit.guard.ts` (lines 33-35) returns `true` (allow) when `resolveKey()` returns `null` (no userId, no IP). Bypasses rate limiting behind misconfigured reverse proxies.

**Plan:**
- Change `if (!key) { return true; }` to use fallback key `"unknown"` instead of bypassing
- Unidentifiable requests are still rate-limited under a shared bucket

**File:** `backend/src/adapters/driving/rest/guards/rate-limit.guard.ts`

---

## 3. Add Fetch/Stream Timeouts
**Severity:** High | **Effort:** Low | **Risk:** Low

**Problem:** All frontend `fetch` calls can hang indefinitely. `agentService.ts` accepts optional `signal` but no default timeout. `historyService.ts` and `llmStatusService.ts` have zero timeout/signal support.

**Plan:**
- Use `AbortSignal.timeout(ms)` or manual `AbortController` + `setTimeout`
- Default timeouts:
  - Agent chat: 30s (LLM can be slow)
  - Agent stream initial fetch: 30s, stream read idle: 60s (per-chunk)
  - History API calls: 10s
  - LLM status poll: 5s
- In `agentService.ts`: compose caller's `signal` with timeout signal using `AbortSignal.any()`
- In `historyService.ts`: add timeout to all 3 fetch calls
- In `llmStatusService.ts`: add timeout to poll fetch

**Files:** `src/services/agentService.ts`, `src/services/historyService.ts`, `src/services/llmStatusService.ts`

---

## 4. Add Missing E2E Test Selectors
**Severity:** Medium | **Effort:** Low | **Risk:** None

**Problem:** `e2e/history.spec.ts` references `data-testid="prompt-input"`, `"send-button"`, and `"balance-screen"` — none exist in components.

**Plan:**
- Add `data-testid="prompt-input"` to `<input>` in `PromptContainer.tsx` (line ~30)
- Add `data-testid="send-button"` to `<button>` in `PromptContainer.tsx` (line ~40)
- Add `data-testid="balance-screen"` to root `<div>` in `BalanceScreen.tsx` (line ~29)

**Files:** `src/components/PromptContainer/PromptContainer.tsx`, `src/screens/BalanceScreen/BalanceScreen.tsx`

---

## 5. Validate LLM Response Shape
**Severity:** Medium | **Effort:** Low | **Risk:** Low

**Problem:** `openai-compatible.adapter.ts` (line 145) passes `choice.message` without validating `content` is string or `tool_calls` have valid structure. Malformed API response propagates bad data.

**Plan:**
- After existing `if (!choice?.message)` guard, add validation:
  - Ensure `content` is `string | null` (not object/number)
  - If `tool_calls` present, validate each has `id`, `type`, `function.name`/`function.arguments`
  - On invalid shape: log warning, return `{ message: { content: null }, usage: raw.usage }`

**File:** `backend/src/adapters/driven/llm/openai-compatible.adapter.ts`

---

## 6. Remove Deprecated `baseUrl`
**Severity:** Low | **Effort:** Trivial | **Risk:** None

**Problem:** `backend/tsconfig.json` line 12 has `"baseUrl": "./"` deprecated in TS 7.0. No imports use it — all relative paths.

**Plan:** Remove the `"baseUrl": "./"` line.

**File:** `backend/tsconfig.json`

---

## Execution Order

| Phase | Items | Reason |
|-------|-------|--------|
| Phase 1 (quick wins) | #2 RateLimitGuard, #4 Test selectors, #6 baseUrl | Trivial changes, zero risk, immediate value |
| Phase 2 (services) | #3 Fetch timeouts, #5 LLM validation | Low risk, prevents production issues |
| Phase 3 (refactor) | #1 TopUpPanel refactor | Medium risk, requires careful testing of top-up flow |

## Notes
- "Dark mode tokens" from original analysis was a false positive — `tokens.css` lines 67-87 already have complete `[data-theme="dark"]` section
- All backend imports use relative paths, confirming `baseUrl` removal is safe
