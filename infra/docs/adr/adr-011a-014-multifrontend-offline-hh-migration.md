# ADR-011a: Multi-Frontend Apps with Offline Shells, and ADR-014: HH Monorepo Migration

Two decisions in one document because the second depends on the first.

---

## ADR-011a: Amendment to the App Shape (multi-frontend, offline)

**Status:** Proposed

### Context

Hardscape House has two apps (HH Yard, HH Pro) that should share one core. Gable will have the same need (counter, yard, admin, portal). The users of the yard apps work on phones and tablets in places where connectivity drops, so offline caching and a queued outbox are requirements, not features.

### Decision

The App Shape allows one core and many frontends per app. Each frontend is a role-gated micro-app: its own Vite entry and bundle, its own optional Tauri shell, its own offline scope, all sharing the core, the design system, the API client, and one offline-store package.

#### Layout (extends ADR-011 Section 2)

```
<app>/
  manifest.yaml
  core/                              one Go monolith: serve | worker | migrate
  web/
    packages/
      design-system/                 Lit plus Ionic components, tokens.css
      api-client/                    generated from core/api/openapi.yaml
      offline-store/                 the one offline implementation (Section below)
      auth/                          session, JWT refresh, device unlock
    apps/
      yard/                          micro-app: role yard_staff
      pro/                           micro-app: roles contractor, customer
      admin/                         micro-app: roles org_admin, operator (optional)
  tauri/
    yard/                            shell: identifiers, icons, deep links, SQLite schema subset
    pro/
  statecharts/                       includes the sync lifecycle machine
  docs/adr/
```

Bun workspaces; one CI; `fb check` gains a `frontends` list from the manifest and verifies each entry builds and each Tauri shell references an existing micro-app.

#### Manifest additions

```yaml
frontends:
  - id: yard
    roles: [yard_staff]
    shells: [tauri-android, tauri-ios, pwa]
    offline: { mode: full, scopes: [pick_lists, receiving, inventory_lookup, photos] }
  - id: pro
    roles: [contractor, customer]
    shells: [pwa, tauri-desktop]
    offline: { mode: read_cache_plus_outbox, scopes: [quotes, price_matrix, orders] }
```

#### Role gating

Two layers. The core gates every endpoint by role from the JWT and the org manifest. The shell decides which micro-app is installed and which routes render, but the shell is never the security boundary: a yard tablet with a contractor JWT gets the contractor's data and nothing else, whatever bundle is on the device.

#### Micro-apps are separate bundles, not runtime-composed micro-frontends

No module federation, no runtime composition. Each micro-app is its own build from shared packages. The design system and API client are the only coupling, and they are versioned with the monorepo, so the bundles cannot drift from the core.

#### Offline design (the part that fails when it is improvised)

One `offline-store` package used by every micro-app, with two backends behind one interface: SQLite in Tauri shells (via a Tauri SQL plugin in the Rust side), and wa-sqlite on OPFS in the PWA build for the same semantics on the web, with a plain IndexedDB fallback for read-cache-only mode.

Local schema, per device:
- Projection tables for each offline scope (a subset of server entities, denormalised for the screens that need them).
- `outbox(id, op, payload, scope, created_at, attempts, status, error)`: every mutation made offline or online is written here first, then sent.
- `sync_state(scope, last_seq, last_pull_at)`.
- `attachments_queue` for photos, uploaded to Storage when online.

Protocol against the core (conventions already in the shape):
- Pull: `GET /sync/{scope}?since={seq}` returns changes ordered by the scope's `seq`; the client applies them and stores the new `last_seq`.
- Push: replay the outbox in order; every mutation carries a client-generated id as the idempotency key and the `last_seq` the client saw; the core assigns the server `seq`.
- Conflicts: the core answers with the current server state; policy per entity is declared in the manifest (`server_wins`, `last_write_wins_by_field`, or `manual`). `manual` items land in a "needs review" list in the micro-app and, when the org has agents, as a card in the relevant room.
- Deletes are tombstones with `seq`; the client never hard-deletes locally until the tombstone is pulled.
- Identity offline: cached session plus a local unlock (PIN or biometric through the shell) for shared devices; the JWT refreshes when online; role gating still applies per unlocked user.

Lifecycle: a `sync` statechart (`offline -> online -> pulling -> pushing -> idle`, with `conflict` and `auth_expired` as side states) lives in `statecharts/` as a runtime-agnostic definition. This is device state, not agent state, so it is the one place the client runs a lifecycle machine rather than Zag interaction state; ADR-003's rule is amended accordingly. Model-based tests of this machine are the acceptance criteria for the offline store.

Discipline: the offline surface is declared per scope in the manifest and kept small. Full two-way sync is only for the scopes that need it (yard work); everything else is read cache plus outbox.

### Consequences

- Easier: HH and Gable share one offline implementation, one design system, one auth package; separate app-store listings and release cadences per micro-app; smaller bundles for phones.
- Harder: the sync protocol and conflict policies must be designed once and tested with the statechart; the first micro-app to go offline (HH Yard) carries that cost.
- Revisit: if a micro-app needs a second core, it is a second app, not a shared-core exception.

---

## ADR-014: HH Monorepo Migration (Yard and Pro first, Gable after)

**Status:** Proposed

### Decision

Merge HH Yard and HH Pro into one App Shape monorepo `hh` with a unified core and two micro-apps, using the strangler pattern per screen and per role, on the stack in ADR-011 and ADR-011a. When done, apply the same plan to Gable (`gable` with counter, yard, admin, portal micro-apps), which becomes ADR-012's execution plan.

### Sequence

| Step | Work | Output |
|---|---|---|
| 1. Inventory | Screens, roles, data entities, integrations, pricing matrix logic, and the offline needs of each current app | A one-page map per app; the union is the unified domain |
| 2. Unified data model | One core schema: customers, contractors, products, price matrix, quotes, orders, inventory, yard tasks, receiving, attachments, audit; `org_id` and `tenant_id` scoping; `seq` on every synced scope | Migrations and sqlc queries in `core/` |
| 3. API first | `core/api/openapi.yaml` written from the two apps' behaviours before code; generated client in `web/packages/api-client` | The contract both micro-apps build against |
| 4. Core build | Go monolith with the template conventions, JWKS auth, role gating, sync endpoints for the declared scopes | Core deployable on FutureBuild Cloud |
| 5. Shared packages | Design system from the tokens pipeline, auth, offline-store with the SQLite and wa-sqlite backends, sync statechart with model-based tests | Reused by Yard, Pro, and later Gable |
| 6. Yard micro-app | Port screens by role priority, offline full mode for its scopes, Tauri Android and iOS shells, shared-device unlock | First offline micro-app in production |
| 7. Pro micro-app | Port screens, read cache plus outbox, PWA plus Tauri desktop | Second micro-app |
| 8. Data migration | Import scripts from the current stores into the unified schema; seed dataset derived from anonymised real data for previews | Repeatable migration and a preview dataset |
| 9. Cutover | Strangler by screen: the new core runs beside the old apps; each role moves when its screens are complete; old apps become read-only, then retired | HH live on the shape |
| 10. Gable | Repeat steps 1 to 9 on the Gable repos with the shared packages already built; Gable's manifest exposes the capability flags the implementation model (ADR-013) needs | Gable on the shape; Dibbits as the first implementation |

### Session mapping

| Session | Content |
|---|---|
| HH-1 | Steps 1 to 3 (inventory, unified model, OpenAPI). Exit: contract reviewed by Colton and Grant; migrations run on a preview |
| HH-2 | Steps 4 and 5 (core and shared packages). Exit: core deployed to an `hh` staging org on FutureBuild Cloud; sync statechart tests green; offline-store round-trips a mutation through the outbox on both backends |
| HH-3 | Step 6 (Yard). Exit: a yard tablet completes a pick list and receiving fully offline, syncs on reconnect without duplicates, and photos upload when online |
| HH-4 | Steps 7 and 8 (Pro, data migration). Exit: a contractor builds a quote from the price matrix in Pro; migration script replays on a fresh database |
| HH-5 | Step 9 (cutover). Exit: old apps read-only; HH runs on the shape; `fb export` produces a runnable bundle |
| G-1 to G-4 | Step 10 on Gable, shorter because the shared packages exist. Exit: Gable on the shape with a capability manifest; Dibbits implementation provisioned per ADR-013 |

These interleave with the platform Sessions: HH-1 needs nothing but a repo; HH-2 needs S0 to S2 (Cloud, identity, previews); HH-3 onward benefit from S7 (sandboxes) but do not block on it. The Shade's S3 to S5 can run thin alongside; the HH and Gable tracks are the ones that move the "first implementation live" metric.

### Risks

| Risk | Mitigation |
|---|---|
| Offline sync eats the schedule | Full mode only for Yard's declared scopes; Pro is read cache plus outbox; the statechart and its tests are built before any screen |
| Unified schema hides two different pricing models | Step 2 resolves the price matrix once with Grant in the room; the ADR records the decision |
| Strangler cutover leaves two sources of truth too long | Each role cuts over completely on a date; no role lives in both apps |
| Shared-device identity on yard tablets | Device unlock per user in the auth package; audit records the unlocked user, not the device |
| Gable migration underestimated | It starts only after HH-5 proves the shared packages; its own inventory step re-estimates before committing Sessions |
