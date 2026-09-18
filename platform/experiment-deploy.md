# Experiment deployment — current state and how to finish

**Status: image-ready, infra-blocked.** Date: 2026-09-18.

## What's done (fully working locally)

| Piece | State |
|---|---|
| Voice + hotkeys input layer (gable-quote) | built, typecheck 0, committed `f900003d` |
| `gable-quote` production Docker image | **builds clean (rc=0)** — `.output/server/index.mjs` produced; server starts and fails only on unset `GABLE_API_BASE_URL`/`DATABASE_URL` as designed. Committed `b8c00343`. |
| `gable/backend` production Dockerfile | exists (upstream), reuse as-is |
| `FutureBuildAIinc/gable-agents-ui` GitHub repo | **pushed** (private, `main`, includes the agent-native Dockerfile at `agent-native/templates/gable-quote/Dockerfile`) |
| Experiment Postgres | **running:healthy** in Coolify Experiments (uuid `1wcgwjddhxiksowfbaardqil`, image `postgres:16-alpine`, db `gable_erp`, user `gable`) |
| Both Coolify applications | created with correct env + domains (see Blockers) |

## Deployment shape (two frontends, one backend)

| Service | Source | Domain | Key env |
|---|---|---|---|
| `gable-erp` | `FutureBuildAIinc/gable` → `backend/Dockerfile` | `erp.experiments.futurebuild.ai` | `DATABASE_URL=postgres://gable:<pw>@<pg-uuid>:5432/gable_erp`, `PORT=8080`, `AUTH_MODE`, `INTEGRATION_API_KEY`, `APPWRITE_ORG=experiments`, `CORS_ORIGINS` |
| `gable-quote` | `FutureBuildAIinc/gable-agents-ui` (base_dir `/agent-native`) → `agent-native/templates/gable-quote/Dockerfile` | `quotes.experiments.futurebuild.ai` | `PORT=3000`, `APP_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL=postgres://gable:<pw>@<pg-uuid>:5432/gable_quote`, `GABLE_API_BASE_URL=http://gable-erp:8080`, `GABLE_INTEGRATION_KEY` (same as erp), `APPWRITE_*`, `CLASSIC_UI_BASE_URL=https://erp.experiments.futurebuild.ai` |

Both behind the existing Traefik wildcard (`*.futurebuild.ai`), one auth front
door per ADR-0002. App needs its own Postgres db `gable_quote` on the same
instance (the pg create API had no sub-endpoint to add a second database —
do it in the Console or via a second database resource).

## Blockers (operator, not code)

1. **Coolify project-scoped create broke mid-session** (`Project not found`
   on `POST /api/v1/applications/dockerfile` and `databases/postgresql`,
   even for payloads identical to ones that succeeded an hour earlier). The
   database creation then altered environment resolution
   (`environment_id` 6 vs the apps' 3). Apps created *before* the break
   exist with env/domains set; I could not create the final git-sourced
   versions after. **Fix on the host:** restart Coolify / re-check project
   environment integrity, then re-run the create calls below.
2. **Inline base64 `dockerfile` never persists** on this Coolify build — a
   dockerfile-type app silently falls back to `coollabsio/coolify`. The only
   working path is a real git repo (now available for both).
3. **Private-repo access**: the "Public GitHub" source lists no installation
   id, so private org repos may not clone — if `FutureBuildAIinc/gable` or
   `gable-agents-ui` fail to clone, either make them public temporarily or
   attach a GitHub App with access (see "Public GitHub" source in Coolify).

## Exact create calls (re-run after blocker 1)

```bash
# gable-erp
POST /api/v1/applications/dockerfile
{ "project_uuid":"iioxcdmvrwtulbvycbpz3pmp", "server_uuid":"abcwvixeca4zcbmvecdri65y",
  "environment_name":"production", "name":"gable-erp", "build_pack":"dockerfile",
  "git_repository":"FutureBuildAIinc/gable", "git_branch":"main",
  "base_directory":"/", "dockerfile_location":"/backend/Dockerfile",
  "dockerfile":"<base64 backend Dockerfile>", "ports_exposes":"8080" }

# gable-quote
POST /api/v1/applications/dockerfile
{ "project_uuid":"iioxcdmvrwtulbvycbpz3pmp", "server_uuid":"abcwvixeca4zcbmvecdri65y",
  "environment_name":"production", "name":"gable-quote", "build_pack":"dockerfile",
  "git_repository":"FutureBuildAIinc/gable-agents-ui", "git_branch":"main",
  "base_directory":"/agent-native",
  "dockerfile":"<base64 agent-native/templates/gable-quote/Dockerfile>",
  "dockerfile_location":"/agent-native/templates/gable-quote/Dockerfile",
  "ports_exposes":"3000" }
```

Then set env per the table above (API: `POST /applications/{uuid}/envs`
with `{key,value}`; update via `DELETE` + re-POST), set `domains` via
`PATCH /applications/{uuid}` with `{"domains":"<url>"}`, and
`POST /api/v1/deploy?uuid=<uuid>`.

## Local dev (already proven end-to-end)

gable backend `:8090` + `agent-native dev` `:4310` with
`GABLE_API_BASE_URL=http://localhost:8090` — the full driver-loop +
event-backbone loop verified live 2026-09-18 (see `docs/runbook-live.md`).
