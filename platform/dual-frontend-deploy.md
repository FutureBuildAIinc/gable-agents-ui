# Dual-frontend deployment — "two apps, one backend"

Runbook-style definition for the shape confirmed in
`docs/steering/dual-frontend-scope.md`: the classic gable ERP UI and the
agent-native micro-UIs ship as **whole, separately deployed services** over
the one gable backend. No embedding, no switcher — the only bridge is the
`classic-link` action's deterministic deep links.

## Shape (per org, on the existing Coolify + Traefik wildcard)

| Service | Contents | Domain | Notes |
|---|---|---|---|
| `gable-erp-<org>` | gable backend (Go binary) + classic Lit UI static build (single container or two: `gable-api` + `gable-web` on the internal network) | `erp.<org>.futurebuild.ai` | Lit UI built from `gable/app/` (`npm run build`); served statically, its `/api` proxy/env points at the backend service |
| `gable-agents-<org>` (one per micro-UI) | agent-native app (`agent-native build` → Nitro Node service) + its small state DB | `<app>.<org>.futurebuild.ai` (e.g. `quotes.acme.futurebuild.ai`) | PGlite volume `/app/data` or shared platform Postgres schema per app (ADR 0003) |
| (existing) FB Console | Appwrite — identity root + events backbone | `api.futurebuild.ai` | Both frontends trust the same issuer (ADR 0002) so cross-app links are SSO-seamless |

Both frontends sit behind the existing Traefik edge on the
`*.futurebuild.ai` wildcard — new hostnames need no DNS work (single-label
per the as-built runbook).

## Auth front door (one issuer, no seams)

- gable backend: `JWKS_URL` → Appwrite JWKS (already its model).
- agent-native apps: BYOA `getSession` verifying the same issuer
  (`APPWRITE_JWKS_URL`).
- A user clicking a `classic-link` from an agents app is already
  authenticated for `erp.<org>` — same IdP session/JWT, no second login.
  (Open item: the OIDC/JWKS endpoints 404 on the current console build —
  ADR-0002 gate; until fixed, dev deployments use AUTH_MODE=dev /
  AUTH_DISABLED.)

## Env per service

`gable-erp`:
```
DATABASE_URL=<org gable Postgres>
JWKS_URL=<appwrite jwks>
APPWRITE_EVENTS_URL=... APPWRITE_EVENTS_KEY=... APPWRITE_PROJECT_ID=... APPWRITE_ORG=<org>
INTEGRATION_API_KEY=<key shared with agents apps>
```
agents apps (each): see `templates/gable-*/.env.example`, plus
```
CLASSIC_UI_BASE_URL=https://erp.<org>.futurebuild.ai
GABLE_API_BASE_URL=https://erp.<org>.futurebuild.ai   (or the api service host)
GABLE_INTEGRATION_KEY=<same INTEGRATION_API_KEY>
```

## Local dev (two frontends on one machine)

- Backend: `PORT=8090 AUTH_MODE=dev INTEGRATION_API_KEY=... go run ./cmd/server`
  (8080 is commonly taken; the Lit UI's Vite dev proxy defaults to
  `localhost:8080` — either run the backend on 8080 or change the proxy
  target in `gable/app/vite.config.ts` LOCALLY ONLY (do not commit changes
  under `gable/app/`; this note is the sanctioned exception).
- Classic UI: `cd gable/app && npm run dev` → `http://localhost:5173`.
- Agents app: `agent-native dev` with
  `CLASSIC_UI_BASE_URL=http://localhost:5173`.

## Launcher tiles (optional, config-only)

Register both surfaces in the fb-cloud-launcher workload index (a row + card
per the launcher's `docs/deploy/usage.md` pattern, per infra):
`erp.<org>` ("Gable ERP — full desk") and each agents app
("Gable Quotes — agent workspace"). Discovery lives at the platform level;
no in-app coupling.

## Live verification status

- URL construction of `classic-link`: verified against
  `gable/app/src/routes.ts` mapping (incl. product → `/inventory/{id}`,
  customer → `/accounts/{id}`).
- Click-through + Coolify service creation: blocked on DOCR/Coolify deploy
  credentials (already flagged in `provisioning.md`).
