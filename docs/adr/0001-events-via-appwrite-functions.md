# ADR 0001 — Events via Appwrite Functions + TablesDB

**Status:** accepted · **Date:** 2026-09-17

## Context

Gable has no externally consumable event stream: its `pkg/eventbus` is in-process, in-memory, at-most-once, and today only carries quote price-exposure subjects. Agent-native micro-UIs need to know when ERP data changes (quote converted, order confirmed, stock moved, route dispatched) to keep their UI fresh and to trigger agent automations. The swarm feasibility memo (see `/home/colton/colton-org/swarm/20260917-152628/final.md`) rated this gap P0.

Appwrite's event system (Function triggers, Realtime) fires from its **API layer**, not from Postgres. Sharing a Postgres cluster with Appwrite would not create visibility; only calls into the Appwrite API produce events.

## Decision

1. Gable gains a small outbound publisher (`backend/pkg/eventpub`) that POSTs domain events to an Appwrite Function HTTP endpoint (`events-ingest`), authenticated with a scoped key. Fire-and-forget with a bounded queue; ERP transactions never block on event delivery.
2. `events-ingest` validates and writes each event as a document in a TablesDB `events` collection. The collection is the durable, replayable log (consumers track a cursor); delivery is at-least-once at this hop.
3. `events-fanout` is triggered on document-create and (a) publishes to Realtime channel `org.<slug>.events`, (b) POSTs to registered subscriber webhook URLs with retries.
4. Micro-UIs consume server-side via Realtime websocket or cursor-polling of the collection, fold changes into their local DB, and let agent-native's own SSE sync update clients.

This consciously stretches `infra/docs/adr/adr-011-app-shape.md` ("Appwrite Realtime for planning objects only") for the gable product line; gable has no engine WebSocket hub and building one is out of scope. If a future FB-wide event backbone lands, `eventpub` repoints at it — the producer contract (event envelope below) is the stable part.

## Event envelope

```json
{
  "id": "uuidv4",
  "type": "order.confirmed",
  "org": "<org-slug>",
  "branchId": "uuid|null",
  "entity": { "kind": "order", "id": "uuid" },
  "data": { "...small summary payload..." },
  "at": "2026-09-17T15:00:00Z"
}
```

Types use `<entity>.<verb>` past tense: `quote.created`, `quote.converted`, `order.confirmed`, `order.cancelled`, `invoice.created`, `payment.recorded`, `inventory.moved`, `inventory.adjusted`, `delivery.dispatched`, `delivery.completed`, `product.updated`.

## Alternatives rejected

- **Share/replace gable's Postgres with Appwrite's**: DB-level proximity creates no API-level events; replacing the data layer is a rewrite (see `docs/adr/0003`).
- **Polling only** (micro-UIs poll gable REST by `updated_at`): works as an interim but adds latency and load per app; centralizing in one ingest point is strictly better once gable can be patched — and this repo owns the gable fork.
- **Outbound webhooks from gable direct to each app**: N subscriber management in the ERP vs 1 in Appwrite; Functions give retries/logging for free.

## Consequences

- Gable carries a small, additive patch (`pkg/eventpub` + publish calls in services). If gable restarts mid-emit, events are lost (in-memory queue) — acceptable for UI freshness; not acceptable for audit-grade consumers, who must poll REST as fallback. A durable outbox table in gable is the documented hardening step.
- Appwrite Functions execution limits comfortably fit LBM dealer event volumes.
