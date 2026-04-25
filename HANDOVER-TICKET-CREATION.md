# Handover: Ticket Creation Flow Investigation

## Session Context
**Date:** 2026-04-25  
**Task:** Investigate and fix ticket creation flow bug  
**Status:** Root cause identified, fix not yet implemented

---

## Problem Summary

When a user fills out the ticket creation form (Subject + Description) and clicks "Submit Ticket", the ticket is **not created**. Instead, the system routes the request through Tier 1 intent matching (`get_support`) and redisplays the support screen with existing tickets/FAQs.

---

## Root Cause

### Flow Analysis

1. **Frontend (`SupportScreen.tsx` line 68-73):**
   ```typescript
   function handleSubmit() {
     // ...validation...
     actor.send({
       type: "SUBMIT_PROMPT",
       prompt: `Create a support ticket: ${subject}. ${description}`,
     });
   }
   ```
   The form submission constructs a text prompt and sends it through the normal chat flow.

2. **Backend Intent Router (`intent-router.service.ts` line 48-53):**
   ```typescript
   async classify(prompt, userId) {
     // ...share data, top-up, purchase checks...
     const tier1 = this.tier1KeywordMatch(prompt, userId);
     if (tier1) return tier1;
     // ...Tier 2, Tier 3...
   }
   ```

3. **Tier 1 Keyword Match (`intent-keywords.json`):**
   ```json
   "get_support": ["support", "help", "ticket", "problem", "complaint", "faq"]
   ```
   The prompt `"Create a support ticket: Double charge... I was charged twice..."` contains **"ticket"**, **"support"**, and **"problem"** — all Tier 1 keywords for `get_support`.

4. **Result:** Intent router returns `get_support` with confidence 1.0 → `get_support` sub-agent executes → returns existing tickets/FAQs → **`create_ticket` tool never called**.

### Why LLM Never Gets Involved

The prompt `"Create a support ticket: ..."` is designed to be processed by the LLM (Tier 3) which would call the `create_ticket` tool with extracted `subject` and `description` parameters. However, the Tier 1 keyword matcher intercepts it first because:
- The word "ticket" is in the `get_support` keyword list
- The word "support" is in the `get_support` keyword list
- Tier 1 has priority over Tier 3

---

## Proposed Fixes (Choose One)

### Option A: Change Frontend Prompt (Quick Fix)
**File:** `src/screens/SupportScreen/SupportScreen.tsx`

Remove "ticket" and "support" from the prompt to avoid Tier 1 match:
```typescript
// Before:
prompt: `Create a support ticket: ${subject}. ${description}`,

// After:
prompt: `I need to report an issue: ${subject}. ${description}`,
```
**Pros:** Simple, no backend changes  
**Cons:** Fragile — any future keyword addition could break it again

### Option B: Add Action Signal Bypass for Ticket Creation
**File:** `backend/src/domain/services/intent-router.service.ts`

Add `create_ticket` action signals (similar to how `BROWSE_BUNDLES` is skipped when action signals are present):
```typescript
// In tier1KeywordMatch, add:
const hasCreateTicketSignal = /create.*ticket|new.*ticket|submit.*ticket/i.test(lower);
if (hasCreateTicketSignal && intent === TelecomIntent.GET_SUPPORT) continue;
```
**Pros:** More robust, follows existing pattern  
**Cons:** Requires backend change, needs testing

### Option C: Use Confirmation Action Pattern (Best Long-term)
**Files:** Multiple (frontend + backend)

Change the form submission to use the same confirmation pattern as `top_up` and `purchase_bundle`:
1. Frontend sends a structured action (not a text prompt)
2. Backend recognizes it as a `create_ticket` action
3. Returns pending confirmation screen
4. User confirms → ticket created

**Pros:** Consistent with other gated tools, clean separation  
**Cons:** Largest change, requires coordination across frontend/backend

### Option D: Remove "ticket" from Tier 1 Keywords
**File:** `backend/data/intent-keywords.json`

Remove "ticket" from `get_support` keywords:
```json
"get_support": ["support", "help", "problem", "complaint", "faq"]
```
**Pros:** Simple  
**Cons:** Users typing just "ticket" won't get support screen anymore

---

## Recommended Approach

**Option B** is the recommended fix because:
1. It follows the existing pattern (action signals bypass Tier 1 for `BROWSE_BUNDLES`)
2. It's targeted — only affects prompts that clearly intend to create a ticket
3. It doesn't break existing "ticket" keyword behavior for general support queries
4. Minimal change, low risk

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/domain/services/intent-router.service.ts` | Add create_ticket action signal bypass in `tier1KeywordMatch()` |
| `backend/data/intent-keywords.json` (optional) | Consider removing "ticket" from get_support keywords if Option D chosen |
| `src/screens/SupportScreen/SupportScreen.tsx` (optional) | Consider changing prompt format if Option A chosen |

---

## Testing Steps

1. Navigate to Support screen
2. Click "+ New Ticket"
3. Fill in Subject: "Double charge on last purchase"
4. Fill in Description: "I was charged twice for Value Plus bundle"
5. Click "Submit Ticket"
6. **Expected:** LLM processes request, calls `create_ticket` tool, shows confirmation screen
7. **Actual (before fix):** Support screen redisplays with existing tickets

---

## Additional Notes

- The `create_ticket` tool is registered as a **gated tool** (requires confirmation before execution)
- System prompt instructs LLM: "create_ticket: Use when the user describes a PROBLEM or ISSUE and wants to create a support ticket"
- The form validation requires: Subject (5-100 chars), Description (10-500 chars)
- Backend `CreateTicketSubAgent` expects `subject` and `description` parameters

---

## Servers Running

- **Frontend:** `http://localhost:5173` (Vite dev server)
- **Backend:** `http://127.0.0.1:3002` (NestJS, port configured in `backend/.env`)
- **LLM:** Available at `http://127.0.0.1:8080` (2ms response time)

---

## Next Steps

1. Implement Option B fix in `intent-router.service.ts`
2. Run backend tests: `cd backend && npm test`
3. Test in browser using steps above
4. Verify existing "ticket" keyword still works for general support queries (e.g., "show me my tickets")
5. Consider Option C for long-term architecture improvement
