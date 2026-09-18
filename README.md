# gable-agents-ui

Greenfield experiment: **agent-native micro-UI agentic frontends running on the Gable ERP backend**, with Appwrite (FB Console) as the unified identity root and event backbone.

This repo is a fresh git project. It vendors four upstream codebases (histories detached, see `docs/adr/0004-repo-layout.md`):

| Dir | Upstream | Role here |
|---|---|---|
| `agent-native/` | BuilderIO/agent-native | The micro-UI framework monorepo ("FB Factory" base). Our apps live in `agent-native/templates/gable-*`, shared code in `agent-native/packages/gable-client`. |
| `gable/` | FutureBuildAIinc/gable | The LBM-dealer ERP (Go monolith + Postgres). Our event-emitter patch lives in `gable/backend/pkg/eventpub` + wiring. |
| `gable-sdk/` | FutureBuildAIinc/gable-sdk | In-process Go plugin seam (reference for later gable-side apps). |
| `infra/` | FutureShade-Cloud-Ecosystem/infra | FBHQ platform docs/ADRs (reference). |
| `platform/` | (new) | Appwrite Functions (`events-ingest`, `events-fanout`), TablesDB collection schemas, deploy notes. |
| `docs/` | (new) | Architecture, ADRs, micro-UI conventions. |

## The thesis

Gable stays the system of record for ERP data (quotes, orders, invoices, inventory, deliveries). Each micro-UI is a small agent-native app (React + `defineAction()` actions that proxy gable's REST API) where the AI agent and the UI are equal partners: every action is simultaneously an agent tool, a UI data hook, an HTTP endpoint, an MCP tool, and an A2A skill.

- **Identity**: Appwrite OIDC provider; micro-UIs verify Appwrite JWTs via a BYOA `getSession`; gable verifies the same JWTs via its `JWKS_URL` middleware. One user pool, Appwrite Teams = orgs/dealers.
- **Events**: gable emits domain events over HTTP to the Appwrite `events-ingest` Function → durable `events` collection → `events-fanout` Function → Realtime channels + subscriber webhooks → micro-UIs fold changes into local state so their SSE sync updates the UI.
- **Deployment**: each micro-UI is a Coolify service on `fb-deploy-1` at `<app>.futurebuild.ai`; PGlite (or small Postgres) for framework state only.

## The apps

| App | Domain | Status |
|---|---|---|
| `agent-native/templates/gable-quote` | Sales / quoting | reference implementation |
| `agent-native/templates/gable-ar` | Invoicing / accounts receivable | built, typechecked |
| `agent-native/templates/gable-inventory` | Inventory / PIM | built, typechecked |
| `agent-native/templates/gable-dispatch` | Loading / picking / dispatch | built, typechecked |
| `agent-native/templates/gable-studio` | Template builder: customize or create micro-UIs from chat with in-chat preview | built, typechecked |

Event backbone **verified live 2026-09-18** (see `docs/runbook-live.md`): gable
mutations produce `events` documents in FB Console; function-free Phase 1 per
ADR-0001 amendment.

## Quickstart

```bash
# 1. gable ERP (needs Postgres 16)
cd gable && make up && make migrate && DEMO_SEED=1 make seed
cd gable/backend && AUTH_MODE=dev go run ./cmd/server   # :8080

# 2. a micro-UI (from the monorepo root)
cd agent-native && corepack enable && pnpm install --filter gable-quote...
cd agent-native/templates/gable-quote && cp .env.example .env  # set GABLE_* vars
pnpm dev                                                       # agent-native dev

# 3. Appwrite functions — see platform/README.md
```

Docs: `docs/architecture.md` · `docs/micro-ui-conventions.md` · `docs/runbook-live.md` · `docs/adr/`
