# Real-Time Streaming + Screen Transition Animations

## Context

The current UX has two linked quality problems:

**1. SSE is not truly streaming.** The `POST /api/agent/chat/stream` endpoint emits pre-scripted static labels:
```
step "Understanding your request" → done
step "Processing" → active
... awaits processRequest() (blocks entirely)
step "Processing" → done, "Preparing response" → done
event "result" { full response }
```

The supervisor executes as a complete blocking call. The frontend sees a spinner for the full duration (~1-3s), then all steps appear at once. Users have no visibility into what the agent is actually doing.

**2. Screen transitions snap instantly.** When `processing → rendering`, the new screen appears with zero animation. Combined with the static spinner, the overall effect is a disconnected "flash" rather than a cohesive experience.

Both problems are fixable together — live step updates from the backend drive the `ProcessingIndicator`, which then transitions smoothly into the next screen.

---

## Spec Overview

**Backend:** Refactor `SupervisorService.processRequest()` into an async generator that yields progress events after each tool execution. The SSE endpoint pipes these to the client in real time.

**Frontend:** Three concurrent improvements:
- A skeleton loader shown during `processing` state (replaces spinner)
- Real-time `ProcessingIndicator` driven by SSE step events (replaces static spinner)
- A screen transition animation on `ScreenRenderer` when the screen type changes

---

## Part 1: Backend — True SSE Streaming

### Current Flow

```
SupervisorService.processRequest(prompt, history, sessionId)
  → executes ALL tools synchronously
  → returns complete AgentResponse
  → SSE endpoint emits all steps at once as "done"
```

### Desired Flow

```
SupervisorService.processRequest(prompt, history, sessionId)
  → yields progress event: { label: "Understanding request", status: "active" }
  → yields progress event: { label: "Checking your account", status: "active" }
  → [tool: balanceBff.getBalance() executes]
  → yields progress event: { label: "Checking your account", status: "done" }
  → yields progress event: { label: "Reviewing your usage", status: "active" }
  → [tool: usageBff.getUsage() executes]
  → yields progress event: { label: "Reviewing your usage", status: "done" }
  → yields progress event: { label: "Preparing response", status: "active" }
  → [final response assembled]
  → yields final AgentResponse
```

### Files to Change

**`backend/src/domain/services/supervisor/supervisor.service.ts`**
- Change `processRequest()` from a regular async function to an `AsyncGenerator<ProcessingStep | AgentResponse>`
- After each tool execution completes, `yield` a `ProcessingStep` object: `{ label: string, status: 'active' | 'done' }`
- Yield a final `AgentResponse` object (the last yield)

**`backend/src/application/agent/agent.controller.ts`**
- The `streamChat()` method currently does:
  ```
  1. Sets SSE headers
  2. Emits static step "Understanding"
  3. Awaits supervisor.processRequest()
  4. Emits static steps "Processing" + "Preparing response" → done
  5. Emits event "result" with full JSON
  ```
- Refactor to iterate over the async generator:
  ```
  1. Sets SSE headers
  2. Iterates for await (const event of supervisor.processRequest(...))
  3. If event is ProcessingStep → emit as SSE step event
  4. If event is AgentResponse → emit as SSE result event
  5. On client disconnect → abort the generator
  ```

**`backend/src/domain/services/supervisor/intent-cache.service.ts`**
- No structural changes; just confirm it implements `IntentRouterPort`

### Event Shapes

**Progress event (SSE `event: step`):**
```typescript
interface ProcessingStepEvent {
  label: string;       // e.g. "Checking your balance"
  status: 'active' | 'done' | 'error';
  tool?: string;       // optional: which tool is executing, e.g. "balanceBff"
}
```

**Final event (SSE `event: result`):**
```typescript
// Same AgentResponse shape as before
interface AgentResponse {
  screenType: ScreenType;
  screenData: ScreenData;
  replyText: string;
  suggestions: string[];
  confidence: number;
  processingSteps: ProcessingStep[];
  supplementaryResults?: ToolResult[];
}
```

### Step Labeling Strategy

Inside `SupervisorService`, after each tool call completes, derive the step label from:
- The tool name (e.g. `balanceBff` → "Checking your balance")
- The screen type about to be rendered (e.g. `BUNDLES` → "Finding the best bundles for you")
- The intent category (e.g. `PURCHASE_BUNDLE` → "Activating your bundle")

Keep labels concise (3-6 words). Avoid technical names in user-facing labels.

### Error Handling

- If a tool throws, yield `{ label: "Error", status: 'error' }` then emit `event: error` with the message
- Do not yield partial results on error — the frontend can decide how to display

### Cancellation

- The SSE controller should pass an `AbortSignal` to `processRequest`
- On client disconnect, call `abortController.abort()`
- The async generator should check `signal.aborted` between yields and short-circuit gracefully

---

## Part 2: Frontend — Skeleton Loader

### Problem

Currently, when `state === 'processing'`, only the `ProcessingIndicator` (animated dots/waves) is shown. This means the screen area is blank, then snaps to the new screen. This creates a jarring "hole" in the UI.

### Solution

Add a `SkeletonScreen` component that shows during `processing` state, rendered by `ScreenRenderer` or `AppShell` alongside the `ProcessingIndicator`. It should show a subtle shimmer animation that suggests content loading without being distracting.

### Design

```css
/* Skeleton shimmer — subtle, non-distracting */
.skeleton {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255,255,255,0.04) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s ease-in-out infinite;
}
```

### Component: `SkeletonScreen`

A single generic skeleton matching the general layout of the app — placeholder blocks for:
- A chat bubble shape (agent message)
- A screen content area (matching the expected screen's proportions)

The skeleton can be positioned in the chat area during processing, providing visual continuity.

### Files to Create/Change

- **Create:** `src/components/SkeletonScreen/SkeletonScreen.tsx`
- **Create:** `src/components/SkeletonScreen/SkeletonScreen.module.css`
- **Modify:** `src/components/AppShell/AppShell.tsx` — render `SkeletonScreen` during `processing` state
- **Modify:** `src/components/ProcessingIndicator/ProcessingIndicator.tsx` — when steps arrive via SSE, render the live steps (see Part 3)

### States

- **`idle`:** No skeleton, show `SuggestionChips`
- **`processing`:** Show `SkeletonScreen` + `ProcessingIndicator` (with live steps if available, fallback animation if not)
- **`rendering`:** Show chat bubbles + screen + `SuggestionChips` — no skeleton

---

## Part 3: Frontend — Live ProcessingIndicator

### Problem

The `ProcessingIndicator` currently shows either animated typing dots or wave animation, but does not reflect actual progress from SSE step events.

### Solution

When `processingSteps` in the orchestrator context is non-empty (populated via `STEP_UPDATE` events from SSE), render the steps list:
- Each step shows its label + a status indicator (active spinner, done check, error X)
- Active steps animate (pulsing dot or spinning indicator)
- Done steps show a checkmark in success green
- The list grows in real time as new steps arrive

### Implementation

**`src/components/ProcessingIndicator/ProcessingIndicator.tsx`** — Add a render branch:
```tsx
// When steps exist (driven by SSE), render step list
// Otherwise render the typing dots / signal wave fallback
```

**`src/components/ProcessingIndicator/ProcessingIndicator.module.css`** — Add step item styles:
```css
.stepItem {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.stepItem--active {
  color: var(--color-text-primary);
}

.stepItem--done {
  color: var(--color-success);
}

.stepItem--error {
  color: var(--color-error);
}

.stepSpinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.stepCheck {
  color: var(--color-success);
}
```

### Interaction

- Steps animate in with `indicatorIn` keyframe (already defined)
- New steps append to the list (no re-render of existing steps)
- When final `result` event is received, the `ProcessingIndicator` fades out as the screen slides in

---

## Part 4: Frontend — Screen Transition Animation

### Problem

Screens snap in instantly with no transition. Combined with no skeleton, the experience is: spinner → flash of new screen. Even with a skeleton, the cut from skeleton → screen feels abrupt without an animation bridging them.

### Solution

Add a CSS class-based transition to `ScreenRenderer`:

- Track previous `screenType` in a `useRef`
- On screen change, apply an exit animation class (`screenExit`) to the old screen, then after 200ms apply an enter animation class (`screenEnter`) to the new screen
- `screenExit`: fade out + slide up 8px over 200ms
- `screenEnter`: fade in + slide up from -8px over 250ms with `cubic-bezier(0.22, 1, 0.36, 1)`

### Implementation

**`src/components/ScreenRenderer/ScreenRenderer.tsx`:**
```tsx
const prevScreenType = useRef<string | null>(null);
const [transitionClass, setTransitionClass] = useState('');

useEffect(() => {
  if (prevScreenType.current && prevScreenType.current !== screenType) {
    // Trigger exit then enter
    setTransitionClass('screenExit');
    setTimeout(() => {
      setTransitionClass('screenEnter');
      setTimeout(() => setTransitionClass(''), 250);
    }, 200);
  } else if (!prevScreenType.current && screenType) {
    setTransitionClass('screenEnter');
    setTimeout(() => setTransitionClass(''), 250);
  }
  prevScreenType.current = screenType;
}, [screenType]);
```

**`src/components/ScreenRenderer/ScreenRenderer.module.css`:**
```css
.screenExit {
  animation: screenExit 200ms ease forwards;
}

.screenEnter {
  animation: screenEnter 250ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes screenExit {
  to { opacity: 0; transform: translateY(-8px); }
}

@keyframes screenEnter {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### Reduced Motion

Both animations must be suppressed when `prefers-reduced-motion: reduce` is set. Apply the media query to the CSS:
```css
@media (prefers-reduced-motion: reduce) {
  .screenExit, .screenEnter { animation: none; }
  .stepSpinner { animation: none; }
}
```

---

## Part 5: Bug Fix — BalanceScreen DOM Rendering

### Problem

`+ Add funds` button (and the balance amount text) appear in Playwright's accessibility snapshot but `document.querySelector()` cannot find them. This means they exist in React's virtual DOM / accessibility tree but not in the actual DOM. This is a pre-existing bug unrelated to the design refresh.

### Diagnosis

The balance screen renders via `ScreenRenderer` → `BalanceScreen`. The component returns JSX, but something is preventing it from mounting to the real DOM. Likely causes:
- A conditional render returning `null` unexpectedly
- A CSS `display: none` applied before the element is interactive
- A React portal issue where the element renders in the wrong tree

### Investigation Steps

1. Add `console.log` in `BalanceScreen.tsx` to verify it renders
2. Check if the issue is in `ScreenRenderer` — does it ever pass `null` data?
3. Check if `AppShell` conditionally renders `ScreenRenderer` based on some state that excludes balance screen
4. Examine whether there are multiple `ScreenRenderer` mounts and one is hidden via CSS

### Fix (to be determined after investigation)

Expected fix: Ensure `BalanceScreen` always mounts its DOM elements. Verify the component is not wrapped in a conditional that evaluates to false. If it is a CSS visibility issue, fix the CSS. If it's a React conditional render, refactor to always render with conditional visibility.

---

## File Summary

### Backend (3 files)

| File | Change |
|------|--------|
| `backend/src/domain/services/supervisor/supervisor.service.ts` | Convert `processRequest()` to `AsyncGenerator<ProcessingStep \| AgentResponse>` |
| `backend/src/application/agent/agent.controller.ts` | Iterate async generator, emit SSE step events in real time, support AbortSignal |
| `backend/src/domain/services/supervisor/intent-cache.service.ts` | No structural change (confirm interface compliance) |

### Frontend (6 files)

| File | Change |
|------|--------|
| `src/components/SkeletonScreen/SkeletonScreen.tsx` | **New** — skeleton shimmer component |
| `src/components/SkeletonScreen/SkeletonScreen.module.css` | **New** — skeleton styles |
| `src/components/AppShell/AppShell.tsx` | Show `SkeletonScreen` during `processing` state |
| `src/components/ProcessingIndicator/ProcessingIndicator.tsx` | Add live steps render branch |
| `src/components/ProcessingIndicator/ProcessingIndicator.module.css` | Add step item and spinner styles |
| `src/components/ScreenRenderer/ScreenRenderer.tsx` | Add exit/enter transition with `useRef` + `useEffect` |
| `src/components/ScreenRenderer/ScreenRenderer.module.css` | Add `screenExit` / `screenEnter` keyframes |

---

## Verification Checklist

- [ ] Backend SSE emits step events in real time (< 100ms after each tool completes)
- [ ] Backend SSE handles client disconnect without zombie requests
- [ ] Backend error paths emit `{ status: 'error' }` step and `event: error`
- [ ] Frontend skeleton shows during `processing` state
- [ ] Frontend `ProcessingIndicator` renders live steps from SSE data
- [ ] Frontend screen transitions with exit → enter animation sequence
- [ ] All animations respect `prefers-reduced-motion`
- [ ] BalanceScreen `+ Add funds` button is findable in the actual DOM (not just accessibility tree)
- [ ] No regression: non-streaming `/api/agent/chat` continues to work
- [ ] SSE streaming endpoint works with existing Playwright test if any

---

## Open Questions

1. **Step label localization:** Should step labels be i18n-ready, or is English-only acceptable for now?
2. **Max steps before timeout:** Should the supervisor cap the number of steps emitted to prevent unbounded SSE connections?
3. **Skeleton design:** Should the skeleton be a generic placeholder or a blurred preview of the incoming screen content?
4. **BalanceScreen bug investigation:** Should Part 5 be part of this spec or a separate tracking issue?
