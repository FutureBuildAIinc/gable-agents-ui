# Architecture

```
                          ┌────────────────────────────────────────────┐
                          │        FB Console (Appwrite 2.1)           │
                          │  Users · Teams (org:*, tenant:<org>:*)     │
                          │  OIDC provider + JWKS                      │
                          │  Functions: events-ingest, events-fanout   │
                          │  TablesDB: events collection               │
                          │  Realtime channels: org.<slug>.events      │
                          └───────▲───────────────▲────────────────────┘
                JWT login/OIDC    │               │ POST /events (scoped key)
                                  │               │
┌───────────────┐   browser   ┌───┴───────────────┴───┐      ┌──────────────────┐
│    User       ├────────────►│  Micro-UI (agent-native)      │                  │
└───────────────┘  Appwrite   │  templates/gable-*    │      │   Gable ERP      │
                  JWT         │  ─────────────────    │      │   Go monolith    │
                              │  BYOA getSession ─────┼──►   │                  │
                              │  verifies Appwrite    │ REST │  Postgres 16     │
                              │  JWT via JWKS         ├─────►│  (system of      │
                              │                       │JWT/  │   record)        │
                              │  actions/*.ts proxy   │integ │                  │
                              │  gable REST           │key   │  eventpub ───────┼──► events-ingest
                              │                       │      │  (HTTP emitter)  │
                              │  local PGlite:        │      └──────────────────┘
                              │  app_state, threads,  │
                              │  sync_events, cache   │
                              └───────────────────────┘
                                        ▲
                          Realtime/poll │ events (cursor)
                                        └────────── events-fanout → Realtime/webhooks
```

## Flows

**Auth (interactive).** Browser logs in with Appwrite (account session / OIDC). The micro-UI server receives the Appwrite JWT, verifies it against Appwrite's JWKS in a BYOA `getSession` (`@gable/client/auth`), and maps claims to `{email, orgId, orgRole}` via Team membership. Actions then call gable either (a) with the same user JWT (both sides trust the Appwrite issuer) plus `X-Branch-Id`, or (b) with the service-to-service `X-Integration-Key` where the `/api/integration/*` surface has coverage.

**Auth (agent loop / background).** The agent tool loop never sees request headers, so server-side calls use credentials resolved at call time: integration key (env / app_secrets) or a service-account JWT minted via Appwrite.

**Reads.** `useActionQuery` → action `run()` → `@gable/client` → gable REST → typed JSON. Reads are marked `grounding: true` so the agent can cite them.

**Writes.** `useActionMutation` / agent tool → action `run()` → gable REST write, always with an `X-Idempotency-Key` (gable enforces idempotency on POST/PUT). Gable is the system of record; the micro-UI never writes ERP data to its own DB.

**Events.** Gable's `pkg/eventpub` publishes domain events (order confirmed, quote converted, invoice created, stock moved, route dispatched…) as HTTP POSTs to the Appwrite `events-ingest` Function (scoped key auth). Ingest writes a document to the `events` collection (durable, replayable via cursor). `events-fanout` fires on document-create and publishes to Realtime channel `org.<slug>.events` plus registered subscriber webhooks. Micro-UIs consume server-side (Realtime or cursor-poll), write results into local tables, and their own SSE sync updates connected clients.

## Data ownership (hard rule)

Gable's Postgres is the only system of record for ERP entities. Micro-UI databases hold framework state (`application_state`, `chat_threads`, `agent_runs`, `sync_events`, `settings`) and at most *derived caches* of gable data, refreshable and never authoritative. See `docs/adr/0003-data-ownership.md`.

## What gable surfaces apps use

- `/api/integration/*` (`X-Integration-Key`): products by category, bulk quote pricing, quote create, quote accept-and-convert, vehicles/drivers/locations, orders-by-date, delivery-route creation, staff validation. Preferred for agent/background calls.
- `/api/v1/*` (JWT + roles + `X-Branch-Id`): full ERP surface. Branch-scoped modules: inventory, customer, quote, invoice, deposit, purchase_order, order, pos, dashboard.
- Never call the portal/partner surfaces from micro-UIs (separate session models; human-facing).
