# Gable Dispatch

Agent-native loading/picking/dispatch micro-UI for a lumber & building-materials
dealer on the [Gable ERP](../../docs/micro-ui-conventions.md) backend. Gable is
the system of record for orders, routes, and deliveries — this app owns no ERP
data, only framework state.

- `/routes` — dispatch board: routes with status/vehicle/driver, plus a day's
  orders needing dispatch (date picker) with a hint to ask the agent to build a
  route from them.
- `/routes/:routeId` — route detail: ordered stops with customer/address/status,
  Dispatch (confirm) and Complete (confirm) actions.
- `/home` — chat-first surface; the agent pulls a date's orders, builds a route
  with stops, dispatches it, and completes it.

## Gable API gaps

- `GET /api/v1/delivery/routes/{id}` (single route) does not exist in gable —
  only the list and `/{id}/deliveries`. `get-route` composes the two: it finds
  the route in the list and returns `{ route, deliveries }`.
- `GET /api/v1/delivery/routes` supports only `date` and `driver_id` filters —
  no status/limit/offset (ignored by the handler).
