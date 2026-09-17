# Acceptance criteria — gable-agents-ui

Self-check gate for this build-out. Each item has a verification I can run without the user.
Status legend: ☐ pending · ☑ verified · ✖ failed (with note)

## A. Repo & docs

- ☐ A1. `git log` in `gable-agents-ui/` shows a single greenfield history; no `.git` dirs exist under `agent-native/`, `gable/`, `gable-sdk/`, `infra/`; no git remote points at an upstream. Verify: `find . -name .git -not -path "./.git"` empty; `git remote -v` empty.
- ☐ A2. README + `docs/architecture.md` + ADRs 0001–0004 + `docs/micro-ui-conventions.md` exist and match what was actually built (re-read after building; fix drift).

## B. Shared package `@gable/client` (`agent-native/packages/gable-client`)

- ☐ B1. Exports: gable REST client (base URL + integration-key/JWT auth + `X-Branch-Id` + idempotency-key injection + typed error mapping), Appwrite BYOA `getSession` (JWKS verify via `jose`, team-role → orgRole mapping), action helper(s). Verify: files exist, exports resolve.
- ☐ B2. Unit tests for the client (URL/header construction, error mapping, idempotency key passthrough) pass. Verify: `pnpm --filter @gable/client test`.
- ☐ B3. Typecheck passes. Verify: `pnpm --filter @gable/client exec tsc --noEmit` (or workspace typecheck script).

## C. Micro-UIs (`agent-native/templates/gable-*`)

Per app (gable-quote, gable-ar, gable-inventory, gable-dispatch):

- ☐ C1. Structure follows `docs/micro-ui-conventions.md`: `actions/` one-action-per-file with zod schemas; domain routes; `server/plugins/auth.ts` wired to BYOA Appwrite session with Better-Auth fallback documented; `AGENTS.md` + `.agents/skills/<domain>/SKILL.md` describing the domain actions; no hand-written JSON API routes under `server/routes/api/`.
- ☐ C2. Actions call gable only through `@gable/client` — grep: no direct `fetch(` to gable URLs outside the shared package.
- ☐ C3. Every mutating action sends an idempotency key (via the client) and declares `branchId` where gable branch-scopes the endpoint. Verify: code inspection per app.
- ☐ C4. No ERP data written to the app's own DB: the template has no Drizzle domain schema for gable entities (framework tables only). Verify: `server/db/schema.ts` absent or framework-only.
- ☐ C5. `pnpm install` (workspace, filtered) completes and each app typechecks: `pnpm --filter <app> typecheck` (or `agent-native typecheck`).
- ☐ C6. gable-quote additionally has: quote list + quote detail/builder routes wired with `useActionQuery`/`useActionMutation`, and at least the actions `list-products`, `calculate-price`, `list-quotes`, `get-quote`, `create-quote`, `accept-quote`.

## D. Template studio (`agent-native/templates/gable-studio`)

- ☐ D1. Chat-driven flow exists: list available gable-* templates; select one to customize OR start new; agent writes/modifies files in a studio workspace dir; preview artifact rendered in the chat surface (HTML mock iframe, per conventions); "deploy" step materializes the template into `templates/` + registers it in `packages/shared-app-config/templates.ts`.
- ☐ D2. Studio actions are real `defineAction()` actions (list-templates, read-template, write-file, render-preview, deploy-template) with path-traversal guards (writes confined to the studio workspace + `templates/` allow-list).
- ☐ D3. Typechecks like C5.

## E. Appwrite platform (`platform/`)

- ☐ E1. `platform/functions/events-ingest` and `platform/functions/events-fanout` exist as Appwrite Go-runtime functions with `go.mod` + `main.go`, and both compile: `cd <fn> && go build ./...`.
- ☐ E2. Ingest validates the ADR-0001 envelope (id/type/org/entity/at required, type matches `<entity>.<verb>`), authenticates via scoped key header, and writes to the `events` collection via the Appwrite server SDK. Fanout triggers on document create, publishes to Realtime channel `org.<slug>.events`, and posts to subscriber webhooks with retry/backoff.
- ☐ E3. `platform/collections/events.json` (or TablesDB equivalent) defines the collection with indexes on `org`, `type`, `at`; README documents deploy steps (function create, key scopes, trigger binding, collection import).

## F. Gable event emitter (`gable/backend`)

- ☐ F1. `pkg/eventpub` exists: bounded-queue async HTTP publisher to `events-ingest`, env-configured (`APPWRITE_EVENTS_URL`, `APPWRITE_EVENTS_KEY`), never blocks ERP transactions, drop-on-full with a log/metric.
- ☐ F2. Publish calls wired for at least: `quote.created`, `quote.converted`, `order.confirmed`, `order.cancelled`, `invoice.created`, `payment.recorded`, `inventory.moved`, `inventory.adjusted`, `delivery.dispatched`, `delivery.completed` (matching ADR-0001 envelope).
- ☐ F3. `cd gable/backend && go build ./...` passes and `go vet ./pkg/eventpub ./cmd/server` is clean.
- ☐ F4. Emitter is disabled (no-op) when env is unset; existing behavior unchanged. Verify: code inspection + existing tests still pass (`go test ./pkg/eventbus/... ./internal/quote/... ./internal/order/...` or full `go test ./...` if fast enough).

## G. Verification pass

- ☐ G1. All of the above re-run after swarm output lands; failures fixed or explicitly reported.
- ☐ G2. Final commit(s) land in the greenfield repo with a coherent message; `git status` clean.
- ☐ G3. Summary delivered to user: what was built, what passed/failed verification, what remains (with reasons).

Known environment limits (not failures): Node 20 vs required ≥22 may block `pnpm build`/`dev` runtime smoke tests — typecheck/install are the gate; Appwrite/gable not running locally — deploy verification is documented steps, not executed.
