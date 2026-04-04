# Chat-Driven UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Telecom Agent PWA to be a chat-driven interface — remove sidebar, embed all screen cards within chat flow, add signal/wave motifs, implement new color palette with proper dark mode.

**Architecture:** Pure CSS/styling refactor. No business logic changes. Update design tokens, simplify AppShell layout, restyle screen components as chat-embedded cards.

**Tech Stack:** React 19, CSS Modules, CSS Custom Properties

---

## File Changes Overview

### Modify (in order):
1. `src/theme/tokens.css` — New color palette (light + dark)
2. `src/components/AppShell.module.css` — Remove sidebar, simplify layout
3. `src/components/AppShell.tsx` — Remove sidebar JSX
4. `src/components/ChatBubble/ChatBubble.module.css` — Agent message accent bar
5. `src/components/PromptContainer/PromptContainer.module.css` — Input styling
6. `src/components/ProcessingIndicator/ProcessingIndicator.module.css` — Add signal wave
7. `src/screens/BalanceScreen.module.css` — Card styling
8. `src/screens/BundlesScreen.module.css` — Card styling
9. `src/screens/UsageScreen.module.css` — Card styling
10. `src/screens/ConfirmationScreen.module.css` — Card styling
11. `src/screens/SupportScreen.module.css` — Card styling

---

## Task 1: Update Design Tokens

**Files:**
- Modify: `src/theme/tokens.css`

- [ ] **Step 1: Read current tokens.css**

Read `src/theme/tokens.css` to understand current structure.

- [ ] **Step 2: Replace with new palette**

Replace the entire `:root` and `[data-theme="dark"]` sections with:

```css
:root {
  /* Light Mode */
  --color-primary: #00A3E0;
  --color-primary-light: #33B5E6;
  --color-primary-dark: #0077B8;
  --color-secondary: #7C3AED;

  --color-bg: #FAFBFC;
  --color-bg-elevated: #FFFFFF;
  --color-bg-card: #FFFFFF;
  --color-bg-input: #F0F2F5;
  --color-surface-hover: rgba(0, 0, 0, 0.04);

  --color-text-primary: #1A1D26;
  --color-text-secondary: #5A6170;
  --color-text-muted: #9099A8;
  --color-text-accent: #00A3E0;
  --color-text-inverse: #FFFFFF;

  --color-border: rgba(0, 0, 0, 0.08);
  --color-border-focus: var(--color-primary);

  /* Shadows - soft, layered */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.12);

  /* Chat bubble specific */
  --chat-bubble-agent-bg: var(--color-bg-elevated);
  --chat-bubble-agent-text: var(--color-text-primary);
  --chat-bubble-user-bg: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  --chat-bubble-user-text: var(--color-text-inverse);
  --chat-bubble-user-border-radius: 16px 16px 4px 16px;
  --chat-bubble-agent-border-radius: 16px 16px 16px 4px;

  /* Status */
  --color-success: #22C55E;
  --color-error: #EF4444;
  --color-warning: #F59E0B;
}

/* Dark Mode */
[data-theme="dark"] {
  --color-primary: #00C9FF;
  --color-primary-light: #33D6FF;
  --color-primary-dark: #0099CC;
  --color-secondary: #A78BFA;

  --color-bg: #0F1117;
  --color-bg-elevated: #181B24;
  --color-bg-card: #1E222C;
  --color-bg-input: #1E222C;
  --color-surface-hover: rgba(255, 255, 255, 0.04);

  --color-text-primary: #F0F2F5;
  --color-text-secondary: #9CA3AF;
  --color-text-muted: #6B7280;
  --color-text-accent: #00C9FF;
  --color-text-inverse: #0F1117;

  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-focus: var(--color-primary);

  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);

  --chat-bubble-agent-bg: var(--color-bg-elevated);
  --chat-bubble-agent-text: var(--color-text-primary);
  --chat-bubble-user-bg: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  --chat-bubble-user-text: var(--color-text-inverse);
}
```

- [ ] **Step 3: Verify dev server**

Run `npm run dev` and check no CSS errors.

---

## Task 2: Simplify AppShell - Remove Sidebar

**Files:**
- Modify: `src/components/AppShell.module.css`
- Modify: `src/components/AppShell.tsx`

### CSS Changes

- [ ] **Step 1: Read AppShell.module.css**

- [ ] **Step 2: Replace with simplified layout**

Replace sidebar CSS with:

```css
/* Main layout - no sidebar */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Remove ALL sidebar-related CSS (`sidebar`, `sidebarSection`, `sidebarStat`, etc.)

Add/update content area:

```css
/* Main content area */
.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.contentArea {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.contentArea--initial {
  justify-content: center;
  align-items: center;
}
```

Remove `.main { flex-direction: row; }` if present.

### JSX Changes

- [ ] **Step 3: Read AppShell.tsx**

- [ ] **Step 4: Remove sidebar JSX**

Find and remove:
```jsx
{/* Sidebar toggle */}
<button className={styles.sidebarToggle} ...>

{/* Sidebar */}
<aside className={`${styles.sidebar} ...`}>
  <div className={styles.sidebarSection}>...</div>
</aside>
```

- [ ] **Step 5: Remove sidebarOpen state**

Remove `const [sidebarOpen, setSidebarOpen] = useState(true);`

- [ ] **Step 6: Verify layout**

Check dev server — chat should now be full-width without sidebar.

---

## Task 3: Style ChatBubble - Agent Message Accent

**Files:**
- Modify: `src/components/ChatBubble/ChatBubble.module.css`

- [ ] **Step 1: Read ChatBubble.module.css**

- [ ] **Step 2: Add agent message accent bar**

In `.bubble.agent` (or similar), add:

```css
/* Left accent bar - telecom signal motif */
.bubble.agent {
  position: relative;
  background: var(--chat-bubble-agent-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--chat-bubble-agent-border-radius);
  box-shadow: var(--shadow-xs);
}

/* Gradient accent bar on left edge */
.bubble.agent::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 50%;
  background: linear-gradient(180deg, var(--color-primary), var(--color-secondary));
  border-radius: 0 2px 2px 0;
  opacity: 0.8;
}
```

Update `.bubble.user` if needed:

```css
.bubble.user {
  background: var(--chat-bubble-user-bg);
  color: var(--chat-bubble-user-text);
  border-radius: var(--chat-bubble-user-border-radius);
  box-shadow: var(--shadow-sm);
}
```

---

## Task 4: Style ProcessingIndicator - Add Signal Wave

**Files:**
- Modify: `src/components/ProcessingIndicator/ProcessingIndicator.module.css`

- [ ] **Step 1: Read ProcessingIndicator.module.css**

- [ ] **Step 2: Add signal wave CSS**

Add after `.steps` or `.step`:

```css
/* Signal wave animation - telecom motif */
.signalWave {
  display: flex;
  gap: 2px;
  align-items: center;
  height: 16px;
  margin-left: var(--space-sm);
}

.signalWave span {
  width: 2px;
  background: var(--color-primary);
  border-radius: 1px;
  animation: wave 1s ease-in-out infinite;
}

.signalWave span:nth-child(1) { height: 5px; animation-delay: 0s; }
.signalWave span:nth-child(2) { height: 9px; animation-delay: 0.1s; }
.signalWave span:nth-child(3) { height: 13px; animation-delay: 0.2s; }
.signalWave span:nth-child(4) { height: 9px; animation-delay: 0.3s; }
.signalWave span:nth-child(5) { height: 5px; animation-delay: 0.4s; }

@keyframes wave {
  0%, 100% { transform: scaleY(0.6); opacity: 0.4; }
  50% { transform: scaleY(1); opacity: 1; }
}
```

- [ ] **Step 3: Update ProcessingIndicator.tsx**

Add signal wave JSX after the dots. Read the component first.

---

## Task 5: Style Screen Cards - Unified Card Design

All screen cards (Balance, Bundles, Usage, Confirmation, Support) should follow the same embedded card pattern.

**Files:**
- Modify: `src/screens/BalanceScreen.module.css`
- Modify: `src/screens/BundlesScreen.module.css`
- Modify: `src/screens/UsageScreen.module.css`
- Modify: `src/screens/ConfirmationScreen.module.css`
- Modify: `src/screens/SupportScreen.module.css`

### Common Card Styles (apply to each)

- [ ] **Step 1: Read each CSS file**

- [ ] **Step 2: Add unified card styling**

For each screen's `.module.css, add:

```css
/* Screen card - embedded in chat flow */
.card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  margin-top: var(--space-sm);
}

.cardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-input);
}

.cardTitle {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-primary);
}

.cardBody {
  padding: var(--space-md);
}

/* Status indicator with pulsing dot */
.statusBadge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.statusDot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  animation: statusPulse 2s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Action button */
.actionBtn {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: var(--color-text-inverse);
  border: none;
  border-radius: 10px;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 4px 16px rgba(0, 163, 224, 0.25);
}

.actionBtn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(0, 163, 224, 0.35);
}
```

Apply these classes to the respective TSX components.

---

## Task 6: Style PromptContainer - Input Polish

**Files:**
- Modify: `src/components/PromptContainer/PromptContainer.module.css`

- [ ] **Step 1: Read PromptContainer.module.css**

- [ ] **Step 2: Update input styling**

```css
.promptInput {
  flex: 1;
  background: var(--color-bg-input);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 12px 18px;
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  font-family: inherit;
  transition: all var(--transition-fast);
}

.promptInput:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-dim, rgba(0, 163, 224, 0.1));
}

.promptInput::placeholder {
  color: var(--color-text-muted);
}

.sendBtn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  border: none;
  color: var(--color-text-inverse);
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  box-shadow: 0 4px 16px rgba(0, 163, 224, 0.25);
}

.sendBtn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 24px rgba(0, 163, 224, 0.35);
}

.sendBtn:active {
  transform: scale(0.98);
}
```

---

## Task 7: Theme Toggle - Update Icon

**Files:**
- Modify: `src/components/AppShell/AppShell.tsx`

- [ ] **Step 1: Read AppShell.tsx (if not already read)**

- [ ] **Step 2: Update theme toggle icons**

Change `☾` / `◑` to `☾` / `☀`:

Find: `{theme === 'light' ? '◐' : '◑'}`
Replace: `{theme === 'light' ? '☾' : '☀'}`

---

## Task 8: Verify & Test

- [ ] **Step 1: Check dev server**

Run `npm run dev` and verify:
- No console errors
- Light mode colors correct
- Dark mode toggle works
- Chat messages display correctly
- Screen cards render within chat

- [ ] **Step 2: Test dark mode**

Click theme toggle, verify:
- All colors transition smoothly
- Text contrast is readable
- Cards/buttons maintain proper styling

- [ ] **Step 3: Test chat flow**

"Check balance" → verify balance card embeds in chat correctly.

- [ ] **Step 4: Build check**

Run `npm run build` to verify no TypeScript or build errors.

---

## Notes

- All changes are **visual only** — no business logic affected
- If any component renders unexpectedly, check CSS variable names match
- The signal wave animation is subtle — intentional for telecom motif without being distracting
