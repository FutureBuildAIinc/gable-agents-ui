# Platform provisioning — `experiments` projects (FB Deploy + FB Console)

Status: **scripted, awaiting credentials.** Probed 2026-09-17 from colton-thinkstation:
Tailscale up; `api.futurebuild.ai` and `console.futurebuild.ai` reachable; Coolify on
`http://159.223.194.184:8000` responds; Infisical CLI (v0.38.0) is logged in as
`colton@futurebuild.ai` but could not enumerate the `futureshade` project secrets
(project-id/flag mismatch with the old CLI). Everything below is ready to run once
secrets are pulled with a working Infisical session (upgrade the CLI or run from a
linked workspace dir).

## 1. FB Deploy (Coolify) — project `experiments`

```bash
# Needs: COOLIFY_TOKEN (Coolify UI → Keys & Tokens → API token)
export COOLIFY=http://159.223.194.184:8000/api/v1
curl -s -X POST "$COOLIFY/projects" -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"experiments","description":"gable-agents-ui experiment workloads"}'
# then create environments:
curl -s -X POST "$COOLIFY/projects/<uuid>/staging" -H "Authorization: Bearer $COOLIFY_TOKEN"
```

Planned services in the project (one per micro-UI, Docker from
`registry.digitalocean.com/futurebuild`, domain `<app>.futurebuild.ai`, port 3000,
volume at `/app/data` for PGlite): `gable-quote`, `gable-ar`, `gable-inventory`,
`gable-dispatch`, `gable-studio`. Env per service per `docs/architecture.md`
(`GABLE_API_BASE_URL`, `APPWRITE_*`, `BETTER_AUTH_SECRET` not needed in BYOA mode).

## 2. FB Console (Appwrite) — project `experiments`

Project creation is a console-scope call (no API-key scope exists for it):

```bash
# Needs: FB Console admin email/password
curl -s -c aw.cookies -X POST "https://api.futurebuild.ai/v1/account/sessions/email" \
  -H "content-type: application/json" -d '{"email":"'$AW_EMAIL'","password":"'$AW_PASSWORD'"}'
curl -s -b aw.cookies -X POST "https://api.futurebuild.ai/v1/projects" \
  -H "content-type: application/json" \
  -d '{"projectId":"experiments","name":"experiments","teamId":"<org team id>","region":"default"}'
```

Then in project `experiments`:

1. **Database** `platform` (TablesDB), **collection** `events` — import
   `platform/collections/events.json` (attributes + indexes: `org`, `type`, `at` cursor).
2. **API keys** (Settings → API keys, or console API):
   - `events-ingest` — scope `databases.write` on `platform` (used by gable `eventpub`).
   - `events-read` — scope `databases.read` (used by micro-UI event consumers).
3. **Functions**: deploy `platform/functions/events-ingest` and
   `platform/functions/events-fanout` (Go runtime; bind fanout trigger to
   `databases.platform.collections.events.documents.*.create`). Set env per each
   function's README. Configure the ingest function's Custom key to the `events-ingest` key.
4. **Teams**: reuse the existing `org:*` / `tenant:<org>:*` teams — do NOT create
   per-experiment teams; identity stays shared (ADR 0002).
5. **JWKS**: confirm the OIDC discovery + JWKS URLs (`/v1/oauth2/.well-known/openid-configuration`)
   and record them into Infisical `/appwrite` for the micro-UI `APPWRITE_JWKS_URL` env.

## 3. Infisical

Add folder `/experiments` to project `futureshade` (env `staging`): `COOLIFY_TOKEN`,
`APPWRITE_PROJECT_ID`, `APPWRITE_JWKS_URL`, `APPWRITE_EVENTS_INGEST_KEY`,
`APPWRITE_EVENTS_READ_KEY`, `GABLE_INTEGRATION_KEY`.
