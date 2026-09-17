# FB Console staging

Staging deployment of FB Console on the production host, used to verify mirror
patches and upstream rebases before the production service is bumped. Same
infra shape as production: a Coolify Docker Compose service on fb-deploy-1,
images from DOCR, routing and TLS through Coolify's Traefik on the
`*.futurebuild.ai` wildcard DNS record.

## Shape

| | |
|---|---|
| Coolify | project Platform, environment `staging`, service `fb-console-staging` (uuid assigned at creation) |
| Domains | `console-staging.futurebuild.ai` (console UI), `api-staging.futurebuild.ai` (API, `/v1`) |
| Images | `fb-console:2.1.0-fb.2` and `fb-console-ui:1.1.78-fb.4`, same tags later promoted to production |
| Data | fresh empty volumes, no production data, no backups, safe to destroy and recreate |
| Droplet files | `/opt/fb-console-staging/` holds the compose, the env file, and this runbook copy |

The stack is trimmed to the core services that release testing needs: API,
console UI, realtime, one combined worker, one combined scheduler, the
maintenance and interval tasks, postgres, redis, geo, autogravity, and
clickhouse. Clickhouse stays because executions storage has no off switch
(an empty DSN falls back to the default clickhouse connection, so the API
retries schema setup forever without it). Dropped relative to production:
traefik (Coolify's proxy owns 80 and 443), mariadb, mongodb, the separate
worker fleet, embedding, assistant, browser, executor, and orchestrator.
Consequences: usage panels degrade (usage stats disabled), functions and
sites cannot build (no executor, which also mirrors production where the
executor side-car currently restart-loops), and documents DB features are
off. The compose redis runs without requirepass, so the staging env sets
`_APP_REDIS_PASS` empty; sending a password to it fails every worker and
task with an AUTH error.

Isolation from production comes from Coolify's per-service uuid namespacing
(containers, volumes, and the attachable uuid network). Two transforms make
that airtight: the compose defines only an unprefixed `appwrite` network (the
upstream literal names `appwrite`, `gateway`, `runtimes` would otherwise join
production's physical networks and cross-talk service DNS), and it pins no
volume names (Coolify prefixes every volume with the service uuid).

## Files

- `docker-compose.staging.yml`: the trimmed stack, derived from the mirror's
  `docker-compose.yml`. Coolify quirks already applied: no `$$` in
  healthchecks, braced env refs only, no `container_name`, no upstream traefik
  labels (Coolify generates routing from the domain settings).
- `generate-staging-env.sh`: run on fb-deploy-1; derives the staging env file
  from the production Coolify env store, applies the staging layer (domains,
  trimmed features, worker count, mail off), and generates fresh secrets.
  Output stays on the droplet, never committed.

## Bring-up

Prerequisites: the mirror PR being promoted is merged on
`FutureShade-Cloud-Ecosystem/mirror-fb-console` main, and both images exist in
DOCR (build steps in the launcher's `docs/console/infrastructure.md`).

1. On fb-deploy-1 as root:
   - `mkdir -p /opt/fb-console-staging`
   - copy `docker-compose.staging.yml` and this README into it
   - run `generate-staging-env.sh` (default output `/opt/fb-console-staging/.env`)
2. In the Coolify panel (deploy.futurebuild.ai), Colton:
   - project Platform, create environment `staging`
   - new resource, Docker Compose, name `fb-console-staging`, server
     fb-deploy-1, paste `docker-compose.staging.yml`
   - paste the contents of `/opt/fb-console-staging/.env` into the service
     environment (bulk paste keeps the 100+ keys manageable)
   - domains: on the `appwrite-console` service set
     `https://console-staging.futurebuild.ai` and
     `https://api-staging.futurebuild.ai`; on the `appwrite` service set
     `https://api-staging.futurebuild.ai/v1`
   - start the service
3. After the first start:
   - set `_APP_BUILDS_VOLUME` in the service environment to the real volume
     name, `<service-uuid>_appwrite-builds` (find it with
     `docker volume ls | grep builds` on the droplet); leave empty only if
     build testing is not planned
   - if realtime does not connect in the console, add the domain
     `https://api-staging.futurebuild.ai/v1/realtime` to the
     `appwrite-realtime` service (longer path rules win Traefik priority)
4. Verify isolation before use: `docker network inspect appwrite` and
   `docker network inspect runtimes` on the droplet must list no staging
   containers; staging containers carry the new service uuid in their names.

## Smoke checklist

- `https://api-staging.futurebuild.ai/v1/health` returns ok
- console loads at `https://console-staging.futurebuild.ai` with the current
  branding (purple duo mark, FB Console wordmark) and a clean TLS cert
- signup, create project, create database, collection, document round-trip
- realtime connects (project stats page or websocket status in console)
- no outbound mail (SMTP is empty by design; confirm nothing was queued)
- `docker ps` shows no restart loops after several minutes; record a
  `docker stats --no-stream` snapshot for capacity notes

## Promotion flow

Current diffs (our patches):

1. Merge the mirror PR on main.
2. Build `fb-console:<upstream>-fb.<n>` from `/opt/fb-console-src` on the
   droplet and push to DOCR; build the console UI image fresh from pristine
   upstream with the current patch values. Both recipes live in the
   launcher's `docs/console/infrastructure.md`.
3. Update `_APP_VERSION` and `_APP_CONSOLE_VERSION` in the staging service
   environment and restart staging.
4. Run the smoke checklist.
5. Colton bumps the same two tags in the production service and restarts it.
   Rollback on either side is repointing to the previous tag.

Downstream diffs (upstream releases):

1. The upstream sync workflow opens its issue; rebase the mirror patch series
   onto the new pin and merge (mirror conventions in MIRROR.md there).
2. Build `<new-upstream>-fb.1` images as above.
3. Prefer recreating staging volumes before this deploy (destroy and recreate
   the staging service, or `docker volume rm` the staging volumes) so
   migrations run against a clean database, which is exactly what production
   will do on upgrade.
4. Smoke, then promote to production as above.

## Drift rule

After creation the Coolify-held copy of the compose is what runs. Any change
made through the panel or API for staging gets backported into
`docker-compose.staging.yml` in the same PR cycle that motivated it, so this
directory stays the reviewable source for the next recreate.

## Known production gaps this staging stack does not fix

Production's env store still sets `_APP_SYSTEM_EMAIL_NAME` to `Appwrite`,
points SMTP at a nonexistent `maildev` host, and uses `exc1`,
`appwrite-builds`, and `runtimes` literals that Coolify renames (the likely
root of the restart-looping executor side-car). Fixing those belongs to a
production env-store pass in the panel, not to staging.
