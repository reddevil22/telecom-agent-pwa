# Design Refresh Spec — Telecom Agent PWA

## Context

A design critique identified five priority issues: cold AI-blue palette, AI slop gradient on chat bubbles, hero metric layout on UsageScreen, loud featured bundle card, and dead tokens polluting the codebase. This spec addresses each issue with concrete changes.

**Target**: Warm, distinctive telecom UI — Notion-inspired warmth applied through a telecom lens.
Not another AI chatbot in blue.

---

## 1. Color Palette — Replace AI Cyan with Warm Coral

**Problem**: `--color-primary: #00A3E0` is the universal "AI assistant" blue. Every generic AI chatbot uses this exact shade. It undermines brand identity and fails the AI slop test.

**Changes**:

| Token | Current | New |
|-------|---------|-----|
| `--color-primary` | `#00A3E0` | `#E8633A` (warm coral) |
| `--color-primary-light` | `#33B5E6` | `#F08B60` |
| `--color-primary-dark` | `#0077B8` | `#C44E2B` |
| Dark `--color-primary` | `#00C9FF` | `#FF9166` |
| Dark `--color-primary-light` | `#33D6FF` | `#FFA880` |
| Dark `--color-primary-dark` | `#0099CC` | `#CC5A2A` |

`--color-secondary` (purple `#7C3AED`) is unused — remove it entirely.

`--color-text-accent` is defined but never used — remove it.

**Why coral**: DM Serif Display (serif, editorial) pairs well with warm earthy tones. Coral (#E8633A) feels human, personal, and distinctly NOT "AI blue." It's bold without being aggressive.

---

## 2. Remove Gradient Tokens

**Problem**: `tokens.css` defines `linear-gradient` values for `--chat-bubble-user-bg` and other semantic tokens. These serve no purpose and are residue from an earlier direction. They risk being accidentally re-applied.

**Changes**:
- Delete `--chat-bubble-user-bg`, `--chat-bubble-user-text`, `--chat-bubble-agent-bg`, `--chat-bubble-agent-text`, `--chat-bubble-user-border-radius`, `--chat-bubble-agent-border-radius` — these semantic gradient tokens are never referenced in component CSS
- Delete `--button-primary-bg`, `--button-primary-text`, `--button-secondary-bg`, `--button-secondary-text`, `--input-bg`, `--input-border`, `--input-focus-border`, `--input-radius` — unused semantic button/input tokens
- Delete `--color-text-accent` — confirmed unused
- Confirm `--color-secondary` is unused, then delete it

**Verification**: grep the codebase to confirm none of these tokens are referenced in any `.css` file before deletion.

---

## 3. UsageScreen — Remove Hero Metric Layout

**Problem**: The classic "AI dashboard" layout: large percentage in primary color, progress bar, "100%" callout. Creates visual noise and is the #1 reason UsageScreen feels templated.

**Current structure** (UsageScreen.module.css):
```css
.valuesPercent {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
  color: var(--color-primary);  /* <- large primary-colored percentage */
}
```

**Changes**:

- **`valuesPercent`**: Remove `color: var(--color-primary)`. Percentage text should be `--color-text-secondary` — supporting information, not primary. Size can stay `--text-xl` but weight should be 400 (it already is).
- **`barFill`**: Keep the fill color as `--color-primary` (coral after fix) but the percentage display above the bar should NOT compete visually with the data itself.
- **Reorder visual hierarchy**: The absolute values (`2.9 / 2 GB`) should be the dominant text. The percentage should feel like a footnote.
- **Over-limit state**: For items at >100%, change the bar fill color to `--color-warning` (amber) instead of primary. The bar fill should be `color: var(--color-warning)` when `used > limit`.

**Result**: Data at a glance — the numbers tell the story. The percentage is secondary context.

---

## 4. BundlesScreen — Reduce Featured Bundle Weight

**Problem**: The featured bundle card is the loudest element in the app — `box-shadow: var(--shadow-md)`, large price with `--text-4xl`, thick borders. It competes with chat bubbles for attention and feels like a "buy now" landing page.

**Current featured card**:
```css
.featured {
  box-shadow: var(--shadow-md);       /* loud shadow */
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.priceAmount {
  font-family: var(--font-display);
  font-size: var(--text-4xl);         /* dramatic but inconsistent */
}
```

**Changes**:

- **Remove `box-shadow`** from `.featured` — the border is sufficient separation
- **Reduce `priceAmount`** from `--text-4xl` to `--text-2xl` — consistency with the rest of the type scale
- **Reduce border radius** from `--radius-xl` to `--radius-lg` — less "card-ness"
- **Adjust `featuredMeta`** gap from `--space-lg` to `--space-md` — tighter, more considered
- **Buy button**: Keep but reduce `transform: translateY(-1px)` on hover — the float effect draws too much attention

**Result**: Featured bundle is prominent without being louder than the chat experience.

---

## 5. ConfirmationScreen — Fix Hardcoded Hex Values

**Problem**: `ConfirmationScreen.module.css` uses inline hardcoded hex values instead of design tokens.

```css
/* Current — hardcoded */
.status.healthy {
  background: #22c55e20;  /* hardcoded with alpha */
  color: #22c55e;         /* hardcoded */
}
.status.unhealthy, .status.unknown {
  background: #ef444420;
  color: #ef4444;
}
```

**Changes**:

- `--color-success-bg` token does not exist. Create it as `rgba(34, 197, 94, 0.12)` (12% opacity success)
- `--color-success` already exists as `#22C55E` — use it
- `--color-error-bg` does not exist. Create it as `rgba(239, 68, 68, 0.12)`
- `--color-error` already exists as `#EF4444` — use it
- Update CSS to use the token variables

**Also fix**: `.icon` dimensions in `ConfirmationScreen.module.css` use hardcoded `28px` — consider whether this should use a spacing token (it probably doesn't need to, 28px is specific enough).

---

## 6. QuickActionBar — Replace data-testid Selector with Class

**Problem**: CSS targets `.button[data-testid="quick-action-balance"]` — `data-testid` is a test attribute, not a styling hook. This couples tests to presentation.

**Changes**:
- Add a `.balanceButton` class to the Balance button in `QuickActionBar.tsx`
- Update CSS selector from `.button[data-testid="quick-action-balance"]` to `.balanceButton`
- `data-testid` attributes should remain for test stability, but CSS should not reference them

---

## 7. AccountScreen — Add prefers-reduced-motion

**Problem**: Usage bar fills animate with `transition: width 0.5s cubic-bezier(...)` but there's no `prefers-reduced-motion` handling, unlike `ProcessingIndicator.module.css` which handles it correctly.

**Changes**:
- Add reduced motion media query to `AccountScreen.module.css`:
```css
@media (prefers-reduced-motion: reduce) {
  .usageBarFill {
    transition: none;
  }
}
```

---

## Implementation Order

1. **tokens.css** — Update color palette (coral), remove dead tokens
2. **ConfirmationScreen.module.css** — Fix hardcoded hex values, add `--color-success-bg` / `--color-error-bg` tokens
3. **UsageScreen.module.css** — Deprioritize percentage, handle over-limit state
4. **BundlesScreen.module.css** — Reduce featured bundle visual weight
5. **QuickActionBar.tsx + .module.css** — Replace data-testid selector with class
6. **AccountScreen.module.css** — Add prefers-reduced-motion
7. **Verify**: All tokens used in CSS are defined in `tokens.css` — run a grep to confirm

---

## Verification Checklist

- [ ] No `#00A3E0` or `#00C9FF` anywhere in the codebase
- [ ] No `linear-gradient` in any component CSS
- [ ] `data-testid` not used in any CSS selector
- [ ] Usage percentage is muted (secondary color, not primary)
- [ ] Over-limit usage bars use warning color
- [ ] Featured bundle has no box-shadow
- [ ] All status colors use design tokens
- [ ] Reduced motion handled for all animated elements
- [ ] grep for `#22c55e`, `#ef4444`, `#7C3AED` returns zero results (except in tokens.css comments if any)
