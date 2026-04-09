# Telecom Agent PWA — Frontend Demo Guide

## What It Is

A mobile-first Progressive Web App that lets telecom subscribers manage their account through an AI-powered conversational interface. Built with React 19, XState v5 state machines, and a warm coral + teal design system.

## Key Features

### Conversational Interface
Type natural-language requests or tap quick-action buttons. The app routes each request intelligently — common queries like balance, usage, bundles, and support are resolved instantly without waiting for an AI response.

### Quick-Action Buttons
Five persistent buttons at the bottom of the screen: **Balance**, **Bundles**, **Usage**, **Support**, and **Account**. One tap returns a fully rendered screen. These work even when the AI service is unavailable.

### Screen Rendering
Each response renders as a purpose-built screen rather than plain text:

| Screen | What It Shows |
|--------|---------------|
| **Balance** | Current balance, billing cycle dates, account status |
| **Bundles** | Catalog of 5 plans with pricing, data allowances, and badges |
| **Bundle Detail** | Full plan breakdown with purchase confirmation flow |
| **Usage** | Data, voice, and SMS consumption bars for active subscriptions |
| **Support** | Open tickets with status badges + FAQ accordion |
| **Account** | Full dashboard — profile, subscriptions with usage bars, recent activity, open tickets |
| **Confirmation** | Action confirmation dialogs (e.g., bundle purchase) |

### Account Dashboard
The Account screen aggregates everything into one view:
- **Profile card** — name, phone number, plan, balance
- **Active subscriptions** — with real-time usage progress bars
- **Recent activity** — last 5 transactions (purchases, top-ups, tickets)
- **Open tickets** — unresolved support issues with status

### Resilient by Default
- **Degraded mode**: If the AI backend goes down, a warning banner appears and the text input is hidden — but quick-action buttons continue to work
- **Dark mode**: One-tap theme toggle, persists across sessions
- **Session history**: All conversations saved and restorable from the History tab

## Design

- **Colors**: Coral primary (`#E85D4C`), teal secondary (`#1AAB9A`), off-white background
- **Typography**: DM Serif Display for headings, DM Sans for body text
- **Responsive**: Optimized for mobile (390px width) with full desktop support
- **PWA**: Installable, offline-capable with service worker

## Demo Walkthrough

1. **Landing** — App loads with welcome message and quick-action buttons
2. **Tap Balance** — Instant balance display ($50.00)
3. **Tap Bundles** — Full catalog with 5 plans, "popular" badge on Value Plus
4. **Tap Usage** — Data/voice/SMS usage bars for Starter Pack subscription
5. **Tap Support** — Two support tickets + FAQ section
6. **Tap Account** — Full dashboard with Alex Morgan's profile, subscriptions, activity
7. **Type "show my balance"** — Same result via text input
8. **Type "what deals do you have"** — AI interprets novel phrasing, returns bundles
9. **Toggle dark mode** — Full theme transition
10. **History tab** — View and manage past conversation sessions

## Tech Stack

React 19 · TypeScript · XState v5 · Vite 8 · CSS Modules · vite-plugin-pwa
