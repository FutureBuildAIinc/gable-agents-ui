---
name: dispatch
description: Gable ERP loading/picking/dispatch domain — endpoints, route lifecycle and statuses, stops/POD concepts, and the integration-vs-v1 surface split for the gable-dispatch app.
---

# Dispatch on Gable

Gable is an ERP for lumber & building-materials dealers. This skill is the
dispatch/yard-domain cheat sheet for the `gable-dispatch` micro-UI.

## Route lifecycle

`DRAFT → SCHEDULED → IN_TRANSIT → COMPLETED` (exact strings; `CANCELLED` is the
other terminal state). Gable enforces: only `DRAFT`/`SCHEDULED` routes may
dispatch (→ `IN_TRANSIT`); a route may complete only when it has stops and every
stop is `DELIVERED`, `FAILED`, or `PARTIAL`.

Stop (delivery) statuses: `PENDING`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED`,
`PARTIAL`. Delivering/partial stops require POD (proof URL + signed-by; photos
via the pod-photo endpoints on the v1 surface).

## Endpoints this app uses

Integration surface (X-Integration-Key; no branch header, no user token):

- `GET /api/integration/orders?date=YYYY-MM-DD&status=` — a day's order book.
  Each order: `{id, status, branch_id, customer_name, address, latitude,
  longitude, scheduled_date, lines:[{product_id, sku, quantity, weight_lbs}]}`
  (per-unit weights for loading/picking and truck capacity). There is **no
  will-call flag, no delivery_method, and no promised window** on this wire —
  never invent them; `weight_lbs: 0` means unknown.
- `GET /api/integration/vehicles` — `[{id, name, vehicle_type, license_plate?,
  capacity_weight_lbs?, make?, model?, year?}]`; `capacity_weight_lbs` null =
  rating never recorded (unknown, not zero).
- `GET /api/integration/drivers` — `[{id, name, status}]` (ACTIVE/INACTIVE/ON_LEAVE).
- `POST /api/integration/delivery-routes` — body
  `{vehicle_id, driver_id?, scheduled_date, notes, stops:[{order_id, sequence,
  lat?, lng?}], load_manifest?}` → `{route_id, stop_count, created, replaced}`.
  Requires ≥1 stop; idempotent per (vehicle_id, scheduled_date) — re-approving
  an edited plan REPLACES the not-yet-dispatched route.

V1 surface (JWT: forwarded user token or GABLE_SERVICE_TOKEN; role-gated
admin/owner/warehouse/driver; NOT branch-scoped — no X-Branch-Id):

- `GET /api/v1/delivery/routes?date=&driver_id=` — dispatch board (only these
  two filters exist; no status/limit/offset).
- `GET /api/v1/delivery/routes/{id}/deliveries` — a route's stops.
- `POST /api/v1/delivery/routes/{id}/dispatch` — → `IN_TRANSIT` (empty 200).
- `POST /api/v1/delivery/routes/{id}/complete` — → `COMPLETED`
  (`{"status":"completed"}`), all stops terminal.
- No `GET /api/v1/delivery/routes/{id}` exists — `get-route` composes the list
  + deliveries endpoints and returns `{route, deliveries}`.

Related (not wrapped by this app's actions): vehicles/drivers CRUD and
`GET /api/integration/locations`, `/reorder` and `/optimize` for stop ordering,
`PUT /api/v1/delivery/deliveries/{id}/status` for stop completion with POD.

## The dispatch board's shared draft

The `/routes/board` screen is a shared-draft workspace (same pattern as
gable-quote's quote-builder): the doc lives in application state under
`dispatch-board` as `{ rev, date?, lanes: { unassigned: OrderCard[], routes:
[{ id?, vehicleId?, vehicleLabel?, driverId?, driverLabel?, stops: OrderCard[]
}] }, notes? }`. `OrderCard` = `{ orderId, customerName?, town?, willCall?,
sizeClass?, weightLbs?, promisedWindow?, status? }` — every optional field is
omitted when gable's wire doesn't carry it.

- The human UI polls and adopts newer revs; the agent writes via the
  `board-set-draft` action (`setDate`, `addRoute`, `setVehicle`, `setDriver`,
  `assignOrders`, `moveStop`, `removeRoute`, `setNotes`, `clear`). A bare call
  with no args is a pure read; `expectedRev` guards dependent writes.
- The UI seeds the draft from gable truth: on date change it refills
  unassigned from `list-orders-for-date` minus orders already on a live route,
  and cards that land on a real route leave the draft.
- Planned lanes become real via `create-route` (human confirms); live lanes
  dispatch/complete in place. `get-board` (composed: list-routes + per-route
  deliveries) is the one query the screen polls/invalidates.
- Load sequencing hint: heavy drops go last-on-first-off (heaviest lines load
  first, deliver last), using each order's summed `quantity × weight_lbs`.

## Domain rules

- **Stops are orders**: one delivery stop = one order. The loading/picking list
  for a truck is its route's stops with each order's lines and per-unit weights.
- **Capacity** is soft: gable warns when assignment exceeds vehicle
  `capacity_weight_lbs` but does not block. Surface the warning, don't hide it.
- **Dates** are `YYYY-MM-DD` on both surfaces; route `scheduled_date`
  serializes as a timestamp — format for display only.
- **Confirmation**: always confirm before dispatch or complete — dispatch puts
  a real truck on the road. Verify writes by re-fetching the route.
- Idempotency: mutations carry an idempotency key (the client does this), and
  create-route is additionally replace-idempotent per (vehicle, date).
