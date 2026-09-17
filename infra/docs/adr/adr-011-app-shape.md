# ADR-011: The FutureBuild App Shape

**Status:** Proposed
**Deciders:** Colton (with Grant on the web and design conventions)

## Context

The platform's strategy is v1 internal (FutureBuild builds its own products), v2 partner orgs (partners build on FutureBuild infrastructure via admin provisioning), v3 public cloud (self-serve). The decisive simplification, agreed today: the platform builds, deploys, and maintains only apps that follow FutureBuild's own product architecture. It is a golden path, not a general PaaS. Everything the platform promises is promised to conforming apps and to nothing else.

The Shade is the first conforming app and also the platform's interaction layer. Gable and the Hardscape House products migrate onto the shape. Partner apps in v2 and public apps in v3 use the same shape without exception.

## Decision

Define the App Shape v1: an exhaustive list of runtimes, a repository layout, a manifest, a data and security convention set, and a platform contract. Conformance is checked by a CLI in CI; non-conforming apps cannot be deployed. The shape changes only by ADR, and the template carries versioned upgrades.

---

## 1. The runtimes (exhaustive)

| Runtime | Standard | Notes |
|---|---|---|
| Server | Go (current stable line, pinned in the template), one modular monolith binary with roles `serve`, `worker`, `migrate` | pgx for the database, sqlc for typed queries, forward-only SQL migrations run by the platform, OpenAPI as the contract, OpenTelemetry built in |
| Data | PostgreSQL 18, one database per org per app, on the platform's managed cluster | Allowed extensions: pgvector, pg_trgm, PostGIS. Conventions in Section 4 |
| Web | Lit plus Ionic components, built with Bun and Vite into one static bundle, Zag for interaction state, PWA-capable | Served by the platform edge; consumes the server's OpenAPI types; design tokens from `tokens.css` |
| Shell | Tauri 2 for desktop and mobile from the same bundle | Optional per app |
| Agents | `@futureshade/statecharts`-style runtime-agnostic definitions; agent seats provisioned by the platform; runners via ACP behind the Shade | Optional per app; when present, the app is agent-legible by construction |
| Realtime | The engine hub pattern from the template (WebSocket, LISTEN/NOTIFY bus) for app streams; Appwrite Realtime only for planning objects | No third pattern |
| Platform services | Identity (Appwrite Auth and Teams; JWT via JWKS; OIDC provider for third-party tools), planning objects (TablesDB), storage (S3 API), messaging (push and email), secrets (injected at spawn), observability (OTel ingest) | Consumed through standard interfaces only |

Not in the shape, and therefore not supported: other languages or frameworks, user-supplied Dockerfiles, other databases, bespoke auth, generic serverless functions, daemons outside the `worker` role.

## 2. Repository layout (one repository per app)

```
<app>/
  manifest.yaml            what the app is (Section 3)
  core/                    Go module
    cmd/core/              entrypoint: serve | worker | migrate
    internal/              domain packages
    db/migrations/         NNNN_name.sql, forward-only
    db/queries/            sqlc query files
    api/openapi.yaml       the contract
  web/                     Lit bundle (Bun + Vite)
    src/components/        custom elements
    src/machines/          Zag interaction state
    src/tokens.css         design tokens
  statecharts/             optional, agent-legible workflow definitions
  agents/                  optional, seat configs and personas
  tauri/                   optional
  docs/adr/                decisions
  AGENTS.md                canonical agent instructions; CLAUDE.md imports it
  .github/workflows/ci.yml runs fb check, tests, model-based tests
```

Platform services (the Shade engine, the agent tier, the gateway) are not apps; they are the platform. The Shade's web bundle is a conforming `web/`.

## 3. The manifest

```yaml
shape: 1
app: gable
name: Gable ERP
runtimes: [core, web, agents]          # subset of core, web, tauri, agents
tenancy: multi-org                     # single-org | multi-org
database:
  extensions: [pg_trgm]
  seed: db/seed/demo.sql               # per-tenant demo data for previews and sandboxes
web:
  entry: web/index.html
  domains: per-org                     # per-org | fixed
capabilities:                          # what this app can expose; org manifests may restrict
  features: [threads, member_sandboxes, intake_rooms]
agents:
  seats: [product_lead]
  intake_rooms: [ideas, product_feedback]
observability:
  service: gable
```

Two manifests, two questions: the app manifest says what an app can do; the org manifest (plan v2) says what a given org may use. The platform intersects them at request time.

## 4. Conventions the template enforces

- Every table that holds org data carries `org_id`; tenant-scoped tables carry `tenant_id`; scoping is enforced in the server middleware, never left to queries.
- Ordered streams use a per-scope monotonic `seq`; pagination is by cursor, never offset.
- An `audit` table records every privileged action with actor, action, ref, timestamp.
- Identity: the server verifies JWTs against the platform JWK Set and resolves the org from the `X-Org` header validated against Team membership before touching a database.
- Migrations are forward-only, numbered, and run by the platform before the new binary starts; the platform snapshots the database first.
- Secrets arrive as environment at spawn; the code never reads a vault and never holds a secret-reading tool.
- Errors, logs, traces, and metrics follow the template's OTel conventions; the platform ingests them without per-app configuration.
- Agents, when enabled, get the FutureShade MCP tools for this shape: `add_migration`, `add_query`, `add_endpoint`, `add_component`, `add_machine`, `run_checks`, `open_pr`.
- Design: components come from the shared Lit plus Ionic design system; tokens from `tokens.css`; Penpot components map one-to-one to Lit components.

## 5. The platform contract (what conformance buys)

| Promise | Detail |
|---|---|
| Build | From any git ref, two toolchains, one base image, reproducible, target under five minutes |
| Deploy | Per environment (dev, staging, prod) per org, replicas by manifest, rollback in one action |
| Migrate | Snapshot, migrate, start, with automatic rollback on failure |
| Preview | Per branch, per org, with seed data, TTL and teardown, surfaced as cards in the Shade |
| Identity and isolation | One login across the estate; org and tenant isolation by construction |
| Secrets, TLS, domains | Injected, issued, and routed by the platform |
| Observability | Logs, metrics, traces, uptime, and cost per app per org without app-side setup |
| Backups | Nightly, off-provider, restore-drilled |
| Agents | Seats, intake rooms, spec to branch to PR to sandbox loop through the Shade, budgets enforced |
| Exit | A conforming app is a Go binary, a Postgres database, and a static bundle; `fb export` produces a Compose bundle that runs anywhere without the platform |

The exit promise is deliberate: the golden path is a convenience, not a cage, and it is the sales argument for v2 and v3.

## 6. The `fb` CLI

Go binary, Apache-2.0, the developer's and the platform's shared tool.

`fb new <app>` scaffold from the template. `fb check` conformance (manifest, layout, migrations, OpenAPI present, tests present, statechart tests). `fb dev` run against the local mirror. `fb migrate`, `fb preview`, `fb deploy <env> --org <slug>`, `fb rollback`, `fb export`. `fb upgrade` applies template upgrades as scripted codemods. Operator subcommands (`fb org provision`, `fb app register`) call the platform API.

## 7. Versioning

The shape is versioned (`shape: 1`). Changes require an ADR and a template upgrade path via `fb upgrade`. The platform supports the current and one previous shape version. Runtime majors (Go line, PostgreSQL, Bun, Lit, Ionic, XState, Tauri) are pinned in the template and bumped in Ops Sessions.

## 8. How the three versions use the shape

| Version | What is added | What the shape does for it |
|---|---|---|
| v1 internal | The shape itself, the template, `fb`, the Shade, Gable and HH migrated | Every Session builds one thing; agents get better with each app because the shape never varies |
| v2 partner orgs | App registry, developer role, per-org quotas, isolated build runners, secrets per app per org, chargeback ledger, partner docs | Partners inherit identity, isolation, previews, agents, and exit for free; no runtime negotiations |
| v3 public cloud | Signup, billing, abuse prevention, hardened isolation, regions, status page, SLAs, legal | Predictable resource usage and a fixed attack surface make billing, limits, and isolation tractable |

## 9. Consequences

- Easier: one build, one deploy, one security model, one design system, one agent tooling surface; partner enablement becomes policy work; public cloud becomes trust and money work rather than engineering sprawl.
- Harder: Gable and the HH products must be brought onto the shape (their own migration ADRs); every "can we just use X" request is answered by the shape, which sometimes means no.
- Revisit: when a real partner needs something the shape lacks, decide by ADR whether to extend the shape for everyone or decline, never to special-case one app.

## 10. Action items

1. [ ] Create the `template` app repository from this ADR (Pre-S0 template skeleton grows into it in S1).
2. [ ] `fb check` in S1 CI; `fb new`, `fb dev` in S2; `fb preview` and `fb deploy` in S7; `fb export` before S9.
3. [ ] The Shade's `web/` conforms in S3; the Shade engine's conventions become the template's conventions in S3.
4. [ ] ADR-012: Gable migration onto the shape (scope, sequence, and its own Sessions).
5. [ ] Add the App Shape to the stack guide v1.1 as its own section and to the project README standing decisions.
