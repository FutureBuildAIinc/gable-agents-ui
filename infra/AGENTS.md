# Agent instructions (base, App Shape)

This repository is built and maintained by agent sessions against locked briefs. Read this file fully before acting. `context/FUTURESHADE-CONTEXT.md` (or the project knowledge copy) is the authority on architecture; `docs/adr/` holds this repository's decisions.

## Read order
1. This file, top to bottom.
2. `docs/adr/` (newest first) and `manifest.yaml` if present.
3. The session brief you were given. Its lanes, acceptance checks, and exit test are the contract for this session.

## Rules that always apply
- Never use em dashes or en dashes in anything you write: code, comments, docs, commit messages, PR text. Use commas, colons, or parentheses.
- Work only inside your assigned lane and worktree (`lane/<session>-<n>-<slug>`). Do not touch files outside the lane's declared paths. If you must, stop and write the reason to `docs/BLOCKERS.md`.
- Secrets arrive as environment variables. Never read a vault, never print a secret, never write one to a file, never commit `.env`. If a step needs a credential you do not have, stop and report the Infisical path it should come from.
- Commits are signed off (`git commit -s`). All changes go through pull requests. The `ci` check must pass. Never force-push, never rewrite history, never delete branches you did not create.
- No dates, durations, or calendar references in briefs, ADRs, or session notes.
- Adding a dependency, a runtime, a database, or a build step outside the App Shape is an ADR, not a commit. Propose it; do not do it.
- Never propose pausing, freezing, or rewriting an in-flight client delivery; sequence around it.

## The spec is the contract
- `core/api/openapi.yaml` is the API contract. Write it before code; generate types from it; route parity tests fail the build when code and contract diverge.
- Statecharts are the workflow spec. Definitions are runtime-agnostic (no Bun, Node, or DOM imports; guards and actions by name). Model-based tests generated from them are acceptance criteria.
- Migrations are forward-only and numbered (`core/db/migrations/NNNN_name.sql`). Never edit a merged migration; add a new one.
- Queries live in `core/db/queries/` and are compiled by sqlc; no hand-written SQL in handlers.

## Conventions the platform enforces
- Org data tables carry `org_id`; tenant-scoped tables carry `tenant_id`; scoping is enforced in server middleware, never in individual queries.
- Ordered streams carry a per-scope monotonic `seq`; pagination is by cursor, never offset.
- Every privileged action writes an `audit` row (actor, action, ref, timestamp).
- JWTs are verified against the platform JWK Set; the org comes from `X-Org` validated against Team membership before any database is touched.
- Components come from the shared design system; tokens from `tokens.css`; no ad hoc styling.
- One micro-app per role, built as its own bundle from shared packages; the shell is never the security boundary; the core gates every endpoint by role.

## How to add things
- A table or column: a new migration plus the sqlc queries that use it plus a test.
- An endpoint: the OpenAPI operation first, then the handler, then the route parity test.
- A component: in `web/packages/design-system` if reusable, else in the micro-app; Penpot mapping name in the component doc comment.
- A workflow: a statechart in `statecharts/` with a model-based test.
- A new micro-app: a one-page brief (kit, three jobs, shared entities, offline scope, brand) approved at a checkpoint before code.

## Checks before you push
`fb check` (conformance), `go test ./...`, `bun test`, the statechart model-based tests, the dash and date checker over changed files, `git status` clean outside your lane. Report the exit test of your lane line by line in the PR description with a short transcript summary.

## When blocked
Write the blocker to `docs/BLOCKERS.md` (what, where, what you tried, what you need) and continue with the rest of the lane. Never guess at a decision that belongs to a human checkpoint.

---

# infra addendum

Infrastructure as code for FutureBuild Cloud: DigitalOcean resources, Coolify and Appwrite configurations, provisioning scripts, `docs/adr/`, `docs/sessions/`, `docs/analysis/` (copies), runbooks.

- No secret values anywhere in this repository; only Infisical paths. A committed secret is a blocking incident, not a fix-forward.
- Appwrite stays stock and pinned; configuration lives here, patches do not. The Appwrite droplet's Traefik owns 80 and 443 there; Coolify's proxy is off on that host.
- One reverse proxy per host. Never run two edges on one droplet.
- Provisioning an org is the runbook and only the runbook; ad hoc manual steps are added to the runbook first.
- Deploy scripts are read by agents and executed by Coolify or by Colton; a session never runs them against a live environment.
- Every ADR gets the next number; every session brief and as-built note lands in `docs/sessions/<ID>/`.
