# Gable Inventory — Agent Guide

Gable Inventory is the inventory/PIM micro-UI for a lumber & building-materials
dealer. It runs on the Gable ERP backend: **gable is the system of record** for
products, stock rows, locations, and reorder points. This app owns no ERP data —
its local database holds only framework state (threads, app state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-products` | GET | Search the catalog by name/SKU (integration endpoint) |
| `list-locations` | GET | Branch/yard list — resolve a name to the UUID other actions need |
| `list-inventory` | GET | On-hand + allocated rows for one product across locations (requires `productId`) |
| `adjust-stock` | POST | Set absolute count (cycle count) or apply a signed delta — confirm first |
| `transfer-stock` | POST | Double-entry move from one location to another — confirm first |
| `get-product` | GET | One product/PIM record: SKU, UOM, price, dimensions, reorder info, totals |
| `reorder-alerts` | GET | Products below their reorder point, with suggested reorder qty |
| `count-set-draft` | — | Drive the cycle-count sheet's shared draft (load rows, record counts, tag variances) |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

All gable access goes through `server/lib/gable.ts` (`@gable/client`). Never
fetch gable URLs directly, and never add hand-written JSON routes.

## Workspaces (screens the agent can drive)

| Screen | Path | Shared state |
|---|---|---|
| Availability | `/inventory` (also `/inventory/availability`) | — |
| Count sheet | `/inventory/count` | `inventory-count` app-state, rev-guarded |
| Reorder review | `/inventory/reorder` | — |
| Adjust / transfer | `/inventory/stock` (legacy index) | — |
| Product detail | `/products/:productId` | — |
| Launcher | `/launch` | — |

## Core Rules

- **Never fabricate.** If gable doesn't expose a field (on-order, 30-day
  velocity, lead time on the list endpoint), omit it from UI and chat. Available
  = on_hand − allocated; both come back on `list-inventory` rows and
  `get-product` totals. Never substitute a guess.
- **Double-entry moves**: stock is never just "updated" — a transfer subtracts
  at the from-location and adds at the to-location in one gable transaction.
  Cross-branch moves are rejected; only unallocated (available) stock may move.
- **UOM discipline**: quantities are DECIMAL(19,4) with a UOM (PCS, EA, LF, SF,
  BF, MBF, SQ, BOX, CTN, RL, GAL, LBS, BAG, BUNDLE, PAIR, SET). The UOM lives
  on the product (`uom_primary`). Never drop, round, or guess the unit — carry
  it next to every number, on every card, on every chip.
- **Confirm before writes**: adjust-stock and transfer-stock change real
  stock. Restate product, location(s), quantity with UOM, and reason; get an
  explicit yes; then call. Batches (cycle-count posts) go one row at a time so
  a partial failure is visible.
- **Verify writes**: re-fetch with `list-inventory` after every adjust/transfer
  before reporting success. Negative stock is rejected by gable — treat that
  as a data problem to surface, not to code around.
- **Blind-count rule**: while `blindMode` is on the count sheet, the agent
  must not speak or write the on-hand column — not in chat, not in tool
  summaries, not in draft notes. The count is blind until the human reveals.
- **Reason codes**: every cycle-count variance needs a reason code
  (`damage`, `mispick`, `receiving`, `shrink`, `other`) before the batch can
  post. The reason becomes the adjust-stock audit note.
- **Branch scoping**: stock is branch/yard data. Pass `branchId` (action
  input) — it becomes `X-Branch-Id`. If the user's branch is unclear, ask or
  use `view-screen`/application state.
- Auth: sessions are Appwrite JWTs (BYOA). Forwarded user tokens take
  precedence; the integration key covers agent/background calls.
- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.

## Skills

- `inventory` — domain cheat sheet (gable endpoints, double-entry moves, UOM
  rules, adjust vs transfer semantics, reorder alerts, count-sheet contract).
