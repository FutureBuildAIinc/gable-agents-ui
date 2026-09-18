# Micro-UI conventions — how to build a `gable-*` app

This doc is the build contract for every micro-UI in `agent-native/templates/gable-*`. Follow it exactly; the acceptance criteria (`docs/acceptance-criteria.md`) are checked against it. The reference implementation is `agent-native/templates/gable-quote` — copy its shape.

## Anatomy of a gable micro-UI

```
templates/gable-<domain>/
  actions/                    # one defineAction() per file, kebab-case filename = action name
    navigate.ts               # keep from base template (context-awareness contract)
    view-screen.ts            # keep from base template
    <domain actions...>.ts    # e.g. list-quotes.ts, create-quote.ts
  app/
    routes/                   # React Router routes; domain screens call actions via useActionQuery/useActionMutation
    components/               # shadcn ui + domain components
  server/
    lib/gable.ts              # exports a configured @gable/client instance (reads env)
    plugins/auth.ts           # BYOA Appwrite session (see Auth below)
    plugins/agent-chat.ts     # appId "gable-<domain>", static action registry, initialToolNames, domain system prompt
  .agents/skills/<domain>/SKILL.md   # domain cheat sheet for the agent
  AGENTS.md                   # actions table + core rules (adapt from gable-quote)
  .env.example                # GABLE_*, APPWRITE_* vars
  package.json                # name "gable-<domain>", dep "@gable/client": "workspace:*"
```

## Hard rules

1. **All gable access goes through `@gable/client`** (`agent-native/packages/gable-client`). No direct `fetch()` to gable URLs anywhere else in the app.
2. **No hand-written JSON API routes** under `server/routes/api/` (framework guard `no-action-twin-routes`). Capabilities are actions.
3. **No ERP data in the app's DB.** No Drizzle schema for gable entities (ADR 0003). Framework tables only. Derived caches need an ADR amendment first.
4. **Reads** are actions with `http: { method: "GET" }` and `grounding: true`. **Writes** send an idempotency key (the client does this automatically on POST/PUT) and take `branchId` as an explicit zod field when the gable endpoint is branch-scoped.
5. **Agent context contract**: keep `navigate.ts` and `view-screen.ts`; screens write `navigation`/`selection` into application state so the agent can see where the user is.
6. UI: toolkit + shadcn primitives (`app/components/ui/*`), Tailwind 4, Tabler icons. Dense, keyboard-friendly, ERP-grade tables — this is a work tool, not marketing.

## Auth (BYOA Appwrite)

`server/plugins/auth.ts`:

```ts
import { createAuthPlugin } from "@agent-native/core/server";
import { makeAppwriteGetSession } from "@gable/client/auth";

export default createAuthPlugin({
  getSession: makeAppwriteGetSession(),   // verifies Appwrite JWT via JWKS
  workspaceAppPublicPaths: ["/"],
  marketing: { appName: "<Title>", tagline: "...", features: [...] },
});
```

`makeAppwriteGetSession()` reads `APPWRITE_JWKS_URL` (required), optional `APPWRITE_ORG_CLAIM`/`APPWRITE_ROLE_MAP`. It accepts the JWT from `Authorization: Bearer` or an `aw_jwt` cookie (set by the login screen via the Appwrite Web SDK). In dev, `AUTH_DISABLED=true` bypasses auth entirely (framework feature) — pair with gable's `AUTH_MODE=dev`.

## `@gable/client` API (server-side only)

```ts
import { createGableClient, GableApiError, withBranch } from "@gable/client";

const gable = createGableClient(); // env: GABLE_API_BASE_URL, GABLE_INTEGRATION_KEY (or GABLE_SERVICE_TOKEN)

// typed request; auto X-Idempotency-Key on POST/PUT/PATCH; auto X-Branch-Id when branchId passed
await gable.request<Product[]>("GET", "/api/integration/products", { query: { category: "framing" } });
await gable.request<Quote>("POST", "/api/integration/quotes", { body: {...} });
await gable.request<Quote>("GET", `/api/v1/quotes/${id}`, { branchId, token: userJwt });
```

- `token` (per-call user JWT, from `ctx.requestHeaders` when present) takes precedence; otherwise the integration key is used. Prefer integration-key endpoints for agent/background work.
- Errors throw `GableApiError { status, code, message, body }`. Map 401/403 to "re-auth" UX, 404 `app_disabled` to "capability disabled" UX.
- `withBranch(schema)` extends a zod object with `branchId: z.string().uuid().optional()`.

## Gable REST cheat sheet (verified against `gable/backend`)

Auth: `Authorization: Bearer <jwt>` + `X-Branch-Id: <uuid>` on `/api/v1/*`; `X-Integration-Key: <key>` on `/api/integration/*`. Global rate limit 120 req/min; idempotency middleware on POST/PUT (24h TTL). List endpoints: `?limit=&offset=` (max 200), may return bare arrays or `{data:[...]}` — the client normalizes via `unwrap()`.

**Integration surface (`/api/integration`, key auth — prefer these):**
- `GET /api/integration/products?category=`
- `POST /api/integration/quotes/bulk-price` — price a set of lines
- `POST /api/integration/quotes` — create quote
- `POST /api/integration/quotes/{id}/accept-and-convert` — quote → order
- `GET /api/integration/vehicles` · `GET /api/integration/drivers` · `GET /api/integration/locations`
- `GET /api/integration/orders?date=YYYY-MM-DD`
- `POST /api/integration/delivery-routes` — create route w/ stops
- `POST /api/integration/validate-staff`

**Sales/quoting (`/api/v1`, branch-scoped):** `GET/POST /api/v1/quotes`, `GET/PUT /api/v1/quotes/{id}`, `PUT /api/v1/quotes/{id}/state`, `POST /api/v1/quotes/{id}/convert`, `GET /api/v1/quotes/analytics`; pricing: `POST /api/v1/pricing/calculate`; customers: `GET /api/v1/customers…` (see `internal/customer/handler.go`).

**Invoicing/AR (`/api/v1`, branch-scoped):** `GET /api/v1/invoices`, `GET /api/v1/invoices/{id}`, `POST /api/v1/invoices/{id}/credit-memo`, `GET /api/v1/credit-memos/{customerId}`; payments: `POST /api/v1/payments`, `GET /api/v1/invoices/{id}/payments`, `POST /api/v1/payments/refund`; AR: `GET /api/v1/accounts/{id}`, `GET /api/v1/accounts/{id}/transactions`.

**Inventory/PIM (`/api/v1`, branch-scoped):** `GET /api/v1/products`, `GET /api/v1/products/{id}`, `GET /api/v1/products/reorder-alerts`, `PATCH /api/v1/products/{id}/{margins|dimensions|lead-time}`; `GET /api/v1/inventory`, `POST /api/v1/inventory/adjust`, `POST /api/v1/inventory/transfer`; PIM: `/api/v1/products/{id}/pim/...` (see `internal/pim/handler.go`).

**Loading/picking/dispatch (`/api/v1`):** `GET/POST /api/v1/delivery/routes`, `POST /api/v1/delivery/routes/{id}/{dispatch|reorder|optimize|complete}`, `GET /api/v1/delivery/routes/{id}/deliveries`, `GET /api/v1/delivery/deliveries/{id}`, vehicles/drivers CRUD under `/api/v1/delivery/{vehicles,drivers}`. Orders for picking: `GET /api/v1/orders`, `GET /api/v1/orders/{id}`.

When a needed endpoint is missing: prefer composing existing ones; if truly needed, note it in the app's README under "Gable API gaps" — do not invent endpoints.

## Events (consuming)

Apps may subscribe to `platform` events (ADR 0001) via a server plugin that cursor-polls the Appwrite `events` collection (`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, server key) filtered by `type` prefix, and folds results into local state (e.g. invalidate react-query caches via application-state change markers). Optional per app; the pattern lives in `gable-quote/server/plugins/gable-events.ts` — copy it if your domain needs freshness beyond manual refresh.

## Scaffolding a new app

1. `cp -r templates/gable-quote templates/gable-<domain>` (reference impl is the cleanest base — it carries the full workbench shell).
2. Rename: `package.json` name, `agent-chat.ts` appId + system prompt, `AGENTS.md`, `server/plugins/auth.ts` marketing block, `app/lib/app-config.ts` title.
3. Replace domain actions/routes/skill; keep navigate/view-screen/provider-api-request; keep the auth + gable lib wiring untouched.
4. **Pane manifest**: write `app/lib/pane-routes.tsx` mapping the domain's client-component screens to lazy imports (in-process pane renderer).
5. **Launcher tiles**: set `app/routes/launch.tsx` ACTIONS to the domain's verb-tiles.
6. Add to `packages/shared-app-config/templates.ts` when ready for the picker (keep `hidden: true` until productized).
7. Typecheck: `pnpm --filter gable-<domain> typecheck` from `agent-native/`.

## The workbench shell (shared by every gable-* app — do not fork per app)

Chat-center with an in-process artifact pane:
- `app/components/layout/Layout.tsx` — narrow `IconRail` left, chat center, `ArtifactPane` right; `?pane=1` renders any route chromeless (used by the detached OS window).
- `app/components/layout/IconRail.tsx` — workspace icon rail (artifact buttons open in-process).
- `app/components/layout/ArtifactPane.tsx` — renders the screen via `pane-routes.tsx` IN-PROCESS (no iframe double-chrome); resizable (drag, persisted), collapsible, "opened by agent" pulse; detach MOVES to an OS window (reattach strip), never duplicates.
- `app/lib/artifact.ts` — localStorage+event artifact store (open/close/detach/reattach, width).
- `app/lib/pane-routes.tsx` — client-component route manifest (the in-process renderer's registry).
- `app/lib/{hotkeys,voice,screen-tracking}.ts` — operator input + screen→agent context.
- `app/global.css` — Gable Industrial Dark theme (tokens from `gable/docs/design-system.md`); apply to every gable-* app unchanged.
