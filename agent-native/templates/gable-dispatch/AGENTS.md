# Gable Dispatch — Agent Guide

Gable Dispatch is the loading/picking/dispatch micro-UI for a lumber &
building-materials dealer. It runs on the Gable ERP backend: **gable is the
system of record** for orders, routes, stops, and proof of delivery. This app
owns no ERP data — its local database holds only framework state (threads, app
state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `board-set-draft` | app-state | Drive the dispatch-board screen: date, lanes, assign, move stops (bare call = read) |
| `get-board` | GET | A date's routes with stops inline — `{ date, routes: [{ route, deliveries }] }` |
| `list-orders-for-date` | GET (integration) | A date's order book — branch, address, lines with per-unit weights |
| `list-vehicles` / `list-drivers` | GET (integration) | Fleet picks for route assignment (capacity when recorded) |
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
- Confirm before create-route, dispatch (a real truck leaves the yard), and
  completing a route. Verify every write by re-fetching (get-board / get-route).
- The dispatch board is a shared draft (`dispatch-board` in application state):
  the human UI and the agent write the same doc. The agent writes via
  `board-set-draft` (rev-guarded — pass `expectedRev` for dependent writes,
  bare call to read); the UI polls and adopts newer revs. Never clobber the
  user's mid-flight edits.
- **Never fabricate** vehicle capacities (`capacity_weight_lbs` null = unknown),
  promised windows, will-call flags (no `delivery_method` on the wire = unknown),
  coordinates, or ETAs. Omit unknowns and say so.
- Hot-shot insert = `moveStop` onto the target lane + re-sequence; warn about
  broken promised windows only when the window is actually known.
- Surface split: order pull, fleet lists, and route creation use
  `/api/integration/*` (X-Integration-Key); board reads and dispatch/complete use
  `/api/v1/delivery/*` (JWT — forwarded user token or service token). Delivery
  endpoints are NOT branch-scoped — no `branchId`/`X-Branch-Id` is needed.
- Loading/picking lists come from route stops: one stop = one order, with its
  lines and per-unit weights (from `list-orders-for-date`) for truck capacity.
- Auth: sessions are Appwrite JWTs (BYOA). UI feedback: target 100 ms, never
  exceed 400 ms; acknowledge before network work.

## Screens

- `/routes/board` — **the daily dispatch board** (D1): date picker, Unassigned
  lane + planned route lanes (shared draft, up/down + lane-picker cards,
  vehicle/driver selects, capacity warnings) + live gable routes with Dispatch /
  Complete buttons. Driver bar with voice; "Build routes" has the agent cluster
  the day's orders onto the board live.
- `/will-call` — pick-ticket cards (D2); "Ready" hands off to the agent to
  mark the pick ready and notify sales. Will-call badges only appear when the
  order wire carries a delivery method.
- `/routes` — routes table + "Orders needing dispatch" date picker card.
- `/routes/:routeId` — route detail: stops table, status badge, Dispatch and
  Complete buttons (both confirm before mutating).
- `/home` — chat-first surface; the agent can run the whole flow from here.

## Skills

- `dispatch` — domain cheat sheet (endpoints, route lifecycle, stops/POD,
  board draft contract, integration vs v1 surface split).
