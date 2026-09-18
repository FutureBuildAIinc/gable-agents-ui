# Live runbook — running the experiment against FB Console + gable

State as verified 2026-09-18. Everything below has been executed at least once
end-to-end from this workstation.

## Prerequisites (per machine)

```bash
# agent-native toolchain (repo requires Node >=22.22)
export PATH=~/.local/node22/bin:$PATH
```

Session credentials (Coolify token, Appwrite key, project id, events secret)
live in `~/.cache/gable-session.env` (mode 600, never committed). Refresh by
pasting new values into that file.

## 1. Event backbone (one-time, done)

```bash
source ~/.cache/gable-session.env
APPWRITE_ENDPOINT=https://api.futurebuild.ai \
APPWRITE_PROJECT_ID=$AW_PROJECT \
APPWRITE_API_KEY=$APPWRITE_KEY \
platform/scripts/deploy-appwrite.sh
```

Idempotent. Creates `platform` DB + `events` collection (8 attributes, cursor
+ org_type indexes) and smoke-writes a probe document. The Appwrite key needs
`documents.read/write` (the **Documents sub-section inside the Databases
group** in the key-creation dialog).

## 2. Boot gable with events publishing

```bash
cd gable && docker compose up -d          # Postgres 16 on 127.0.0.1:5434 (long-running)
cd backend && go run ./cmd/migrate        # once, after pulling new migrations

# NOTE: port 8080 is taken by an unrelated container on this workstation — use 8090.
INTEGRATION_API_KEY=$(openssl rand -hex 16) > /tmp/gable-env  # keep for step 3
source ~/.cache/gable-session.env
PORT=8090 AUTH_MODE=dev \
INTEGRATION_API_KEY=<value from above> \
APPWRITE_EVENTS_KEY=$APPWRITE_KEY APPWRITE_PROJECT_ID=$AW_PROJECT APPWRITE_ORG=experiments \
go run ./cmd/server
```

Log line to expect: `platform event publisher enabled org=experiments`.
`AUTH_MODE=dev` bypasses JWT (local only). Every quote create/state change now
writes an `events` document in FB Console — verify:

```bash
curl -s -H "X-Appwrite-Key: $APPWRITE_KEY" -H "X-Appwrite-Project: $AW_PROJECT" \
  "https://api.futurebuild.ai/v1/databases/platform/collections/events/documents?limit(5)"
```

API notes learned live: quote lines require a `uom` enum value (`EA`, `LF`,
`BF`, `PCS`, …) or the insert 500s; `AUTH_MODE=dev` also opens `/api/v1/*`
without a token.

## 3. Boot a micro-UI against gable

```bash
cd agent-native
export PATH=~/.local/node22/bin:$PATH
INTEGRATION=$(cat /tmp/gable-env)
source ~/.cache/gable-session.env

cd templates/gable-quote
cat > .env <<EOF
AUTH_DISABLED=true
GABLE_API_BASE_URL=http://localhost:8090
GABLE_INTEGRATION_KEY=$INTEGRATION
APPWRITE_ENDPOINT=https://api.futurebuild.ai
APPWRITE_PROJECT_ID=$AW_PROJECT
APPWRITE_EVENTS_READ_KEY=$APPWRITE_KEY
EOF
pnpm dev   # agent-native dev; note the printed port
```

Exercise an action over HTTP (the same surface the UI hooks and the agent
use):

```bash
curl -s -X POST http://localhost:<port>/_agent-native/actions/list-quotes \
  -H 'content-type: application/json' -d '{}'
curl -s "http://localhost:<port>/_agent-native/actions/list-products?category=framing"
```

For full agent chat, connect an LLM (Builder.io credits, `ANTHROPIC_API_KEY`,
etc.) per `agent-native` docs.

## Known platform limits (2026-09-18)

- Appwrite function builds fail on this instance ("Build produced no output
  artifact", source-independent) → webhook fanout (Phase 2) parked; the
  node-22 function ports are in `platform/functions/` ready to deploy once an
  operator fixes the executor.
- OIDC discovery/JWKS endpoints 404 → BYOA JWT verification (ADR-0002) has no
  live JWKS URL yet; micro-UIs fall back to `AUTH_DISABLED`/Better Auth in dev.
- The session Appwrite key is broad; mint documents-write-only (gable) and
  documents-read-only (micro-UIs) keys when convenient.

## Local stack (2026-09-18, the active mode after the Coolify blockers)

- gable backend: `:8090` (AUTH_MODE=dev, integration key in /tmp/gable-int-key)
- gable-quote dev: **`:4311`** (4310 kept getting raced by a stale vite supervisor — use 4311)
- **Realistic seed applied** (`DEMO_SEED=1 [DEMO_DISPATCH_DATE=$(date -u +%F)] go run ./cmd/seed`
  from `gable/backend`): 68 real LBM SKUs (framing/PT/OSB-plywood/drywall/doors/roofing/
  insulation/fasteners/hangers/millwork/cornice), 49 customers, 20 quotes across all states
  (10 stale >10d), 77 orders incl. 14 CONFIRMED scheduled for today (dispatch board),
  44 invoices (22 PAID / 12 UNPAID / 10 OVERDUE for AR aging), 15 routes / 45+ deliveries,
  stock across 3 branches. Stale placeholder SKUs (`SPECIAL-%`) purged post-seed.
- Q2 fixture: `docs/fixtures/material-list-takeoff.csv` (exact-SKU + name-only matches +
  a sqft→sheets conversion + 3 deliberate unmatched lines).
- Known gap: no ON_HOLD order fixture (R4 credit-hold flow) — create one by booking an
  order for the near-limit customer through the real service path when needed.
