# Gable Inventory — Agent Guide

Gable Inventory is the inventory/PIM micro-UI for a lumber & building-materials
dealer. It runs on the Gable ERP backend: **gable is the system of record** for
products, stock rows, locations, and reorder points. This app owns no ERP data —
its local database holds only framework state (threads, app state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-inventory` | GET | On-hand stock rows for one product across locations (requires `productId`) |
| `adjust-stock` | POST | Set absolute count (cycle count) or apply a signed delta — confirm first |
| `transfer-stock` | POST | Double-entry move from one location to another — confirm first |
| `get-product` | GET | One product/PIM record: SKU, UOM, price, dimensions, reorder info |
| `reorder-alerts` | GET | Products below their reorder point, with suggested reorder qty |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

All gable access goes through `server/lib/gable.ts` (`@gable/client`). Never
fetch gable URLs directly, and never add hand-written JSON routes.

## Core Rules

- **Double-entry moves**: stock is never just "updated" — a transfer subtracts
  at the from-location and adds at the to-location in one gable transaction.
  Cross-branch moves are rejected; only unallocated (available) stock may move.
- **UOM discipline**: quantities are DECIMAL(19,4) with a UOM (PCS, LF, BF,
  MBF…). Never drop, round, or guess the unit — carry it next to every number.
- **Confirm before writes**: adjust-stock and transfer-stock change real
  stock. Confirm product, location(s), quantity with UOM, and reason with the
  user before calling.
- **Verify writes**: re-fetch with `list-inventory` after every adjust/transfer
  before reporting success. Negative stock is rejected by gable — treat that
  as a data problem to surface, not to code around.
- **Branch scoping**: stock is branch/yard data. Pass `branchId` (action
  input) — it becomes `X-Branch-Id`. If the user's branch is unclear, ask or
  use `view-screen`/application state.
- Auth: sessions are Appwrite JWTs (BYOA). Forwarded user tokens take
  precedence; the integration key covers agent/background calls.
- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.

## Screens

- `/inventory` — stock lookup by product, adjust/transfer cards, reorder alerts.
- `/products/:productId` — product detail: stock & reorder, PIM fields, pricing,
  stock by location.
- `/home` — chat-first surface; the agent can run the whole inventory workflow
  from here.

## Skills

- `inventory` — domain cheat sheet (gable endpoints, double-entry moves, UOM
  rules, adjust vs transfer semantics, reorder alerts).
