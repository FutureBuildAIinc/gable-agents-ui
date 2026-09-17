# Gable Quotes — Agent Guide

Gable Quotes is the sales/quoting micro-UI for a lumber & building-materials
dealer. It runs on the Gable ERP backend: **gable is the system of record** for
products, customers, prices, quotes, and orders. This app owns no ERP data —
its local database holds only framework state (threads, app state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-products` | GET | Search products by category (SKUs, UOM) |
| `calculate-price` | POST (read-only) | Price lines via gable's pricing engine — never invent prices |
| `list-quotes` | GET | List quotes, filter by status |
| `get-quote` | GET | One quote with lines/totals |
| `create-quote` | POST | Draft a quote in gable |
| `accept-quote` | POST | Accept + convert quote to order — confirm with the user first |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

All gable access goes through `server/lib/gable.ts` (`@gable/client`). Never
fetch gable URLs directly, and never add hand-written JSON routes.

## Core Rules

- Branch scoping: quotes are branch data. Pass `branchId` (action input) — it
  becomes `X-Branch-Id`. If the user's branch is unclear, ask or use
  `view-screen`/application state.
- Money: gable uses integer cents in app code; quantities are DECIMAL with a
  UOM. Always show the UOM next to quantities.
- Auth: sessions are Appwrite JWTs (BYOA). Forwarded user tokens take
  precedence; the integration key covers agent/background calls.
- Never fabricate prices, stock, or quote state. If an action fails, say so
  and recover. Verify a write before reporting it done (re-fetch the quote).
- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.

## Screens

- `/quotes` — quote list (status badges, totals).
- `/quotes/:quoteId` — quote detail: lines, totals, accept-and-convert.
- `/home` — chat-first surface; the agent can build full quotes from here.

## Skills

- `quoting` — domain cheat sheet (gable endpoints, quote lifecycle, UOM/money rules).
