# Telecom Agent PWA - Chat-Driven UI Redesign

## Overview

Redesign the Telecom Agent PWA to be a **chat-driven interface** where the conversation is the primary UI. Remove all persistent data panels and balance cards. The AI conversation drives everything.

## Design Direction

### Aesthetic
- **Chat-native** — No sidebars, no static data panels. All information flows through the conversation.
- **Signal/wave motifs** — Subtle visual touches that reinforce telecom without being heavy-handed
- **Professional telecom blue** — Primary color that feels trustworthy and connected

### Color Palette

**Light Mode:**
- `--bg: #FAFBFC` — Off-white background
- `--bg-elevated: #FFFFFF` — Cards and elevated surfaces
- `--primary: #00A3E0` — Telecom blue
- `--primary-dark: #0077B8` — Darker blue for gradients
- `--text: #1A1D26` — Near-black text
- `--text-secondary: #5A6170` — Secondary text
- `--border: rgba(0, 0, 0, 0.08)` — Subtle borders

**Dark Mode:**
- `--bg: #0F1117` — Deep dark
- `--bg-elevated: #181B24` — Elevated surfaces
- `--primary: #00C9FF` — Bright cyan-blue
- `--text: #F0F2F5` — Off-white text
- `--text-secondary: #9CA3AF` — Muted text
- `--border: rgba(255, 255, 255, 0.08)` — Subtle borders

## Key Design Elements

### 1. Brand Icon with Pulse Ring
- Letter "T" on gradient background
- Animated ring emanating outward (subtle pulse)
- Reinforces "signal/connectivity" without being literal

### 2. Agent Message Accent
- Left border gradient bar (teal to purple)
- 3px wide, rounded edges
- Signals "this is from the agent" without being heavy

### 3. Typing Indicator
- Standard three-dot animation
- Signal wave bars next to dots (5 bars, wave animation)
- Reinforces telecom context during processing

### 4. Screen Cards (in-chat)
- Rendered as part of the conversation flow
- Light shadow and border separation
- Header with icon label (Balance, Bundles, etc.)
- Status indicator with pulsing green dot where relevant

### 5. Quick Action Chips
- Appear in welcome state
- Rounded pill buttons
- Hover: border glow + background tint
- Examples: "Check balance", "Buy bundle", "Top up", "View usage"

### 6. Input Area
- Full-width input with rounded pill shape
- Gradient send button (circular)
- Focus state: border glow + subtle shadow

### 7. Dark Mode Toggle
- Icon button in header
- ☾ for dark mode (shows moon)
- ☀ for light mode (shows sun)
- Smooth CSS transition between themes

## Typography

- **Body/UI:** DM Sans (Google Fonts)
- **Display/Headings:** Space Grotesk (Google Fonts)
- Fluid scaling with clamp() where appropriate

## Components to Update

### Header
- Keep: Brand icon with pulse animation, brand name
- Remove: Theme toggle stays, sidebar toggle removed
- Style: Minimal, just enough identity

### Sidebar (Account Overview)
- **REMOVE** entirely
- Account info woven into chat responses instead

### Chat Area
- Messages flow naturally
- Agent messages: left-aligned, accent border
- User messages: right-aligned, gradient background
- Typing indicator: dots + signal wave

### Screen Cards (Balance, Bundles, Usage, etc.)
- Embed within agent message bubbles
- Card header with type label
- Clear visual hierarchy
- Action buttons at bottom of card

### Welcome State
- Centered content
- App icon with pulse ring
- "How can I help?" headline
- Quick action chips below

## Animations

- **Message entrance:** fade + translateY (0.25s ease-out)
- **Typing dots:** standard bounce pulse
- **Signal wave:** scaleY wave (1s ease-in-out infinite)
- **Brand pulse ring:** scale + opacity (2.5s ease-out infinite)
- **Theme toggle:** CSS transition on all color properties (0.3s)

## Layout Structure

```
┌─────────────────────────┐
│  [T] Telecom Agent  [☾] │  ← Header (minimal)
├─────────────────────────┤
│                         │
│  [Welcome / Messages]   │  ← Chat area (scrollable)
│                         │
│  ┌─────────────────┐    │
│  │ Screen Card     │    │  ← Embedded in chat
│  │ (Balance/etc)   │    │
│  └─────────────────┘    │
│                         │
├─────────────────────────┤
│  [Input...        ] [→] │  ← Prompt area (fixed bottom)
└─────────────────────────┘
```

## Technical Approach

### CSS Changes
- Update `tokens.css` with new color variables
- Use CSS custom properties for all colors
- Ensure smooth transitions between themes

### Component Changes
- `AppShell` — Remove sidebar, simplify layout
- `BundlesScreen` — Style as embedded card in chat
- `BalanceScreen` — Style as embedded card in chat
- `UsageScreen` — Style as embedded card in chat
- `ConfirmationScreen` — Style as embedded card in chat
- `SupportScreen` — Style as embedded card in chat

### No Functional Changes
- All business logic, API calls, and state management remain unchanged
- Purely visual/CSS refactoring

## Files to Modify

1. `src/theme/tokens.css` — New color palette
2. `src/components/AppShell.module.css` — Remove sidebar styles
3. `src/components/AppShell.tsx` — Remove sidebar JSX
4. `src/screens/*Screen*.module.css` — Card styling for chat embedding
5. `src/screens/*Screen*.tsx` — Wrapper adjustments if needed
6. `src/components/ChatBubble/ChatBubble.module.css` — Message styling
7. `src/components/PromptContainer/PromptContainer.module.css` — Input styling
