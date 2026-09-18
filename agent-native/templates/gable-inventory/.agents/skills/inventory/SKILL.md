---
name: inventory
description: Gable ERP inventory/PIM domain — endpoints, double-entry stock moves, UOM/DECIMAL rules, adjust vs transfer semantics, and reorder alerts for the gable-inventory app.
---

# Inventory & PIM on Gable

Gable is an ERP for lumber & building-materials dealers. This skill is the
inventory-domain cheat sheet for the `gable-inventory` micro-UI.

## Double-entry inventory moves

Gable's data model treats every stock change as a movement between locations
(`from_location` → `to_location`), never a bare overwrite — see
`gable/docs/database-erd.md` ("Double-Entry Everything"). On the API surface:

- `transfer` is the canonical double-entry move: gable subtracts at the source
  and adds at the destination inside one transaction, with reasons recorded as
  `Move Out: <reason>` / `Move In: <reason>`.
- `adjust` covers the two cases that have no counter-location: cycle counts
  (set the absolute on-hand quantity) and receipts/shrinkage (signed delta via
  `is_delta: true`).
- Constraints enforced by gable: resulting stock may never go negative; only
  unallocated (available = quantity − allocated) stock may be transferred;
  cross-branch moves are rejected (both locations must share a branch).

## Endpoints this app uses

All `/api/v1` (JWT + `X-Branch-Id`):

- `GET /api/v1/inventory?product_id=<uuid>` — stock rows for one product.
  **`product_id` is required** (the handler 400s without it). Returns
  `[{id, product_id, location_id, location, quantity, allocated, updated_at}]`.
- `POST /api/v1/inventory/adjust` — body
  `{product_id, location_id, quantity, reason, is_delta}` (snake_case, per
  `StockAdjustmentRequest`). `is_delta: false` = set absolute count (cycle
  count); `true` = apply signed delta. Returns `{"status":"ok"}`.
- `POST /api/v1/inventory/transfer` — body
  `{product_id, from_location_id, to_location_id, quantity, reason}`
  (per `StockMovementRequest`). Quantity must be positive. Returns
  `{"status":"ok"}` — verify by re-fetching inventory.
- `GET /api/v1/products/{id}` — product/PIM record: `sku`, `description`,
  `uom_primary`, `base_price`, `vendor`, `upc`, `weight_lbs`, `length_in`/
  `width_in`/`height_in` (nullable), `stackable`, `reorder_point`,
  `reorder_qty`, `total_quantity`, `total_allocated`, `average_unit_cost`,
  `target_margin`.
- `GET /api/v1/products/reorder-alerts` — products below reorder point:
  `[{product_id, sku, description, vendor, reorder_point, reorder_qty,
  current_stock, deficit}]`. No query params.

Related read surface for locations: `GET /api/integration/locations`
(integration key) when a location UUID needs a name.

## Domain rules

- **Quantities are DECIMAL(19,4) with a UOM** (PCS, EA, LF, SF, BF, MBF, SQ,
  BOX, CTN, RL, GAL, LBS, BAG, BUNDLE, PAIR, SET). The UOM lives on the
  product (`uom_primary`), not the stock row — never drop or round it, and
  never mix units when adjusting or transferring.
- **Adjust vs transfer**: adjusting is for counts that reconcile reality
  (cycle count, receipt, shrinkage); transferring is for relocating existing
  stock between locations in the same branch. If the user says "move", use
  transfer — an adjust at each end would bypass the double-entry guard.
- **Confirm before writing**: restate product, location(s), quantity with UOM,
  and reason; then call; then re-fetch `list-inventory` to verify.
- **Branch scoping**: inventory is branch-scoped (`X-Branch-Id`); products are
  org-wide with branch stock.
- Idempotency: mutations must carry an idempotency key (the client does this).
