# Gable Dispatch — Agent Guide

Gable Dispatch is the loading/picking/dispatch micro-UI for a lumber &
building-materials dealer. It runs on the Gable ERP backend: **gable is the
system of record** for orders, routes, stops, and proof of delivery. This app
owns no ERP data — its local database holds only framework state (threads, app
state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-orders-for-date` | GET (integration) | A date's order book — branch, address, lines with per-unit weights |
| `create-route` | POST (integration) | Create a route with ordered stops; idempotent per (vehicle, date) |
| `list-routes` | GET | Dispatch board, filterable by date / driver |
| `get-route` | GET | One route + its stops (`{ route, deliveries }`) |
| `dispatch-route` | POST | DRAFT/SCHEDULED → IN_TRANSIT — confirm with the user first |
| `complete-route` | POST | IN_TRANSIT → COMPLETED after all stops are terminal — confirm first |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

All gable access goes through `server/lib/gable.ts` (`@gable/client`). Never
fetch gable URLs directly, and never add hand-written JSON routes.

## Core Rules

- Route lifecycle: `DRAFT → SCHEDULED → IN_TRANSIT → COMPLETED` (terminal
  states also `CANCELLED`). Gable only dispatches DRAFT/SCHEDULED routes and
  only completes routes whose every stop is DELIVERED, FAILED, or PARTIAL —
  don't fight the state machine, follow it.
- Confirm before dispatch (a real truck leaves the yard) and before completing
  a route. Verify every write by re-fetching the route.
- Surface split: order pull and route creation use `/api/integration/*`
  (X-Integration-Key); board reads and dispatch/complete use `/api/v1/delivery/*`
  (JWT — forwarded user token or service token). Delivery endpoints are NOT
  branch-scoped — no `branchId`/`X-Branch-Id` is needed.
- Loading/picking lists come from route stops: one stop = one order, with its
  lines and per-unit weights (from `list-orders-for-date`) for truck capacity.
- Never fabricate stops, statuses, or ETAs. If an action fails, say so and
  recover with the error gable returned.
- Auth: sessions are Appwrite JWTs (BYOA). UI feedback: target 100 ms, never
  exceed 400 ms; acknowledge before network work.

## Screens

- `/routes` — dispatch board (routes table) + "Orders needing dispatch" date
  picker card, with an agent hint to build a route from those orders.
- `/routes/:routeId` — route detail: stops table, status badge, Dispatch and
  Complete buttons (both confirm before mutating).
- `/home` — chat-first surface; the agent can run the whole flow from here.

## Skills

- `dispatch` — domain cheat sheet (endpoints, route lifecycle, stops/POD,
  integration vs v1 surface split).
