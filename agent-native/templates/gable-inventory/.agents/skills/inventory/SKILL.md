---
name: inventory
description: Gable ERP inventory/PIM domain — endpoints, double-entry stock moves, UOM/DECIMAL rules, adjust vs transfer semantics, reorder alerts, and the blind cycle-count contract for the gable-inventory app.
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

All `/api/v1` (JWT + `X-Branch-Id`) unless noted:

- `GET /api/integration/products?q=&category=&limit=` — catalog search
  (integration key). Returns `[{id, sku, name, category, uom, price, …}]`.
  The `q` param is a substring match over name and SKU.
- `GET /api/integration/locations` — active branches (integration key).
  Returns `[{id, name, address, latitude?, longitude?}]`. Use to resolve a
  human's "north yard" to the UUID `list-inventory`/`adjust-stock` need.
- `GET /api/v1/inventory?product_id=<uuid>` — stock rows for one product.
  **`product_id` is required** (the handler 400s without it). Returns
  `[{id, product_id, location_id, location, quantity, allocated, updated_at}]`.
  `location` is a legacy free-text bin label; `location_id` is the FK.
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
  `target_margin`. **No** `lead_time_days` in the GET response (the column
  exists, the field doesn't serialize yet) — never fabricate one.
- `GET /api/v1/products/reorder-alerts` — products below reorder point:
  `[{product_id, sku, description, vendor, vendor_id, reorder_point,
  reorder_qty, current_stock, deficit}]`. No query params. **No** `on_order`,
  **no** `velocity_30d`, **no** `uom` on this payload — pull UOM from
  `get-product` per row if you need to display it.

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

## Cycle-count contract (I2)

The count sheet's shared draft lives in app-state under `inventory-count`:

```ts
{
  rev: number;
  locationId?: string | null;
  locationLabel?: string;
  bin?: string | null;
  rows: Array<{
    productId: string;
    sku?: string;
    name?: string;
    uom?: string;
    onHand: number | null;        // last-known from gable; HIDDEN while blindMode
    counted?: number;             // what the counter physically saw
    variance?: number;            // counted − onHand, once both are set
    reasonCode?: "damage" | "mispick" | "receiving" | "shrink" | "other";
    status: "uncounted" | "counted" | "reviewed";
  }>;
  blindMode: boolean;
  notes?: string;
}
```

- The human writes via `useCountDraft()`; the agent writes via
  `count-set-draft`. Both bump `rev`; the poller adopts the newer.
- **Blind-mode rule**: while `blindMode` is true, the agent must NOT speak,
  print, or write the `onHand` values anywhere the counter can see — not in
  chat, not in tool summaries, not in variance narration. The number stays in
  the draft so variance math works after reveal. If the user asks "what's the
  book on row 4?" while blind, the answer is "reveal first".
- **Reason codes are mandatory** before the batch can post. `Post
  adjustments` calls `adjust-stock` once per variance with `is_delta: true`
  and reason `"cycle count <YYYY-MM-DD> — <reasonCode>"`. A partial batch is
  a real failure mode — surface which rows posted and which didn't.
- Loading rows: gable has no "list inventory by location" endpoint, so a
  sample is built by `list-products` (category or q filter) → `list-inventory`
  per product → filter to rows at the chosen `location_id`. The agent does
  this fan-out via its own tool calls; the screen just consumes
  `count-set-draft.loadProducts`.

## Reorder-review contract (I3)

- The screen renders `reorder-alerts` rows verbatim — SKU, description,
  vendor, current_stock, reorder_point, reorder_qty, deficit. The suggested
  qty column is editable (override stays client-side).
- "Why is allocated so high?" traces demand through `get-product` (totals)
  and `list-inventory` (allocated per location). If the user wants order-level
  citations, that's the orders surface in gable-quote — hand off with a
  navigate.
- "Send to purchasing" drafts a PO note in chat, grouped by vendor, with a
  classic-link to finish in the desk UI. PO approval lives in the classic
  desk per module-flows — never post POs from this app.

## Reserve handoff (I1)

The availability card's Reserve button hands off to chat with
"start a quote with N UOM of SKU X for <customer?>". The agent asks for the
customer, then navigates to the gable-quote workbench's builder — the quote
app owns the quote-builder draft.
