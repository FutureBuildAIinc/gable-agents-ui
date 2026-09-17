# FB Platform As Built

The Platform surface as it is deployed: FB Console (from Appwrite), FB Deploy
(from Coolify), and the FB Cloud launcher. This file records what exists and
where; `context/FUTURESHADE-CONTEXT.md` records what was planned. On facts this
file wins, on intent the context file wins. The Factory surface (FB Factory, the
agent-native fork) is governed by its own decision record, the Factory
deployment and SSO ADR, which lives in the workspace context directory and not
in this repository; it is out of scope here.

Everything below lives in the GitHub org `FutureShade-Cloud-Ecosystem`, all
repositories private. The launcher repository was transferred there from the
`futurebuildai` account, so old `futurebuildai` URLs still resolve through
redirects; pushes go through the `gh` credential helper as that account.

## 1. Naming and repositories

| Product | Built from | Mirror repository | Pinned tag |
|---|---|---|---|
| FB Console | Appwrite | `mirror-fb-console` | 2.1.0 |
| FB Deploy | Coolify | `mirror-fb-deploy` | v4.3.21 |
| Console MCP path | Appwrite MCP server | `mirror-appwrite-mcp` | v0.10.11 |

Other mirrors in the org, not deployed yet: `mirror-claude-agent-acp`,
`mirror-kimi-cli`, `mirror-penpot`, `mirror-uptime-kuma`, `mirror-autorestic`,
`mirror-listmonk`, `mirror-postal`, `mirror-ntfy`. Of the deployed set, only the
three in the table are cloned into the workspace `mirrors/` directory.

First-party Platform repositories in the org: `infra` (this repository) and
`fb_cloud_launcher` (the launcher, Section 7).

## 2. Mirror state

Conventions: the pin and the ledger live under `.futurebuild/` in each mirror
(`PINNED_TAG`, `PATCHES.md`); the mirror rules live in each mirror's `MIRROR.md`.

**mirror-fb-console.** Branch `main` is the pinned tag plus the first
FutureBuild rebrand (Appwrite to FB Console: `APP_NAME` and `APP_EMAIL_*`
constants, the console project name, installer title, logo, favicon, and the
first accent ladder; PHP namespaces, appwrite.io docs links, `APP_DOMAIN`, and
socials intentionally kept). The open pull request `rebrand/console-purple-duo`
replaces the green accent with the Coolify duo #864ffc / #452e72: installer CSS
ladder, email accent, bare duo mark for the logo, favicon, and email PNG assets,
installer backdrop gradients and step indicator, and the footer wordmark
recolored for the light background. The same pull request restores the installer
CSRF header name `x-appwrite-installer-csrf`, which the first rebrand had
renamed to a header the server never validates.

**mirror-fb-deploy.** Branch `main` carries the first FutureBuild rebrand commit
(Coolify to FB Deploy). The deploy branch is `fb/v4.3.21`: the pinned tag plus
the rebrand series, namely the FutureBuild house mark in the purple duo with a
"Deploy" lockup, favicon, wordmarks and auth copy, notification and email
subjects, meta and OG tags, a corrected `PATCHES.md` entry, and an FB Deploy
display version constant (`fb_version`, the version chip links to our releases).
Upstream accent variables, docs links, package and container names, and the
Coolify Cloud analytics conditional are intentionally kept. No open pull
requests.

**mirror-appwrite-mcp.** Pinned at v0.10.11, no patches.

## 3. Where it runs

One droplet, `fb-deploy-1` (DigitalOcean sfo3, 8 vCPU, 16 GB RAM, 160 GB disk,
8 GB swap, Ubuntu 24.04, public IP 159.223.194.184). It sits in the `47a56ab8`
VPC next to the `futurebuild-plane` droplet. A wildcard DNS record points
`*.futurebuild.ai` at the droplet, and the FB Deploy Traefik (traefik v3.6,
Let's Encrypt HTTP-01) owns ports 80 and 443 as the single edge.

Containers on the droplet:

| Container | Image | Role |
|---|---|---|
| coolify | `registry.digitalocean.com/futurebuild/fb-deploy:1.0` | The FB Deploy app, custom build from `mirror-fb-deploy` branch `fb/v4.3.21`, built on the droplet from `/opt/fb-deploy-src` |
| coolify-proxy | traefik:v3.6 | Edge: TLS, Let's Encrypt |
| coolify-db | postgres:15-alpine | FB Deploy instance database |
| coolify-redis | redis:7-alpine | Queues and streams |
| coolify-realtime, coolify-sentinel | upstream images | WebSockets, telemetry |
| fb-console stack | 38 compose services | FB Console, Section 4 |
| fb-cloud-launcher | built from the `fb_cloud_launcher` Dockerfile | The launcher, attached to Traefik by labels, outside Coolify resource management |

Registry: DOCR `registry.digitalocean.com/futurebuild`, on the starter tier;
check the repository allowance before adding new image names.

## 4. FB Console service

Coolify service `fb-console` (uuid `u0puccybt42qso5amainq4ov`), project
Platform, environment production, on `fb-deploy-1`. The stack is Appwrite's own
compose: API, console UI, realtime, 13 workers and schedulers, postgresql,
mariadb, mongodb, redis, clickhouse, the runtimes executor, and side cars.

Domains: `console.futurebuild.ai` (console UI) and `api.futurebuild.ai` (REST),
both routed by the FB Deploy Traefik.

Images, both built on the droplet:

- `fb-console:2.1.0-fb.1`, the API stack, built from `mirror-fb-console` `main`.
  It carries the first, green-era rebrand and predates the purple duo revision.
- `fb-console-ui:1.1.78-fb.3`, the console UI, patched at image build time from
  upstream `appwrite/new:1.1.78-self-hosted`; also green era.

Environment: the full `_APP_*` set (134 variables) lives in Coolify's service
env store, secrets generated at deploy time. Notable values: `_APP_ENV`
production, `_APP_DOMAIN` `api.futurebuild.ai`, `_APP_CONSOLE_DOMAIN`
`console.futurebuild.ai`, and `_APP_WORKER_PER_CORE` trimmed to 2 for the shared
box.

Operational rules learned on this stack, apply them on every compose change:

- Compose changes go through the Coolify API (`docker_compose_raw` is base64);
  never edit `/data/coolify/services/<uuid>/` by hand, Coolify regenerates it.
- No `$$` escapes anywhere (Coolify's env parser crashes on them); healthchecks
  that used them were replaced with `true`.
- Environment values use braced refs (`${_APP_X}`), never bare (`$_APP_X`).
- `container_name` lines are stripped; Coolify renames containers to
  `<service>-<stack-uuid>`.
- Appwrite's own `traefik.docker.network=appwrite` label is removed (the stack
  network differs) and Appwrite's own traefik service is removed from the
  compose; the FB Deploy proxy owns 80 and 443.
- Restart through the API: `POST /services/{uuid}/start`.

The stack's named volumes (postgres, mariadb, mongo, redis, uploads, functions,
builds, certificates, config) are not backed up yet. Standing task: put backups
in place before production data lands there.

## 5. FB Deploy operating rules

- Auto-update stays off. Upgrades are deliberate patch-reapply builds from the
  mirror, never an upstream pull.
- Never run the upstream Coolify install script on `fb-deploy-1`; it reverts the
  branding and can downgrade the schema.
- New hostnames need no DNS work (the wildcard covers `*.futurebuild.ai`) but
  must stay on that domain; client-facing domains are a separate decision.
- Secrets go in Coolify's per-resource env editor or the server-level env,
  never in application repositories.

## 6. Brand state

The house mark uses the Coolify purple duo: body #864ffc, accents #452e72. The
interim green accent (#00FFA3) is retired. Where each piece stands:

| Piece | State |
|---|---|
| FB Deploy rebrand | Merged on the `fb/v4.3.21` deploy branch; deployed in `fb-deploy:1.0` |
| FB Console purple duo revision | Open pull request on `mirror-fb-console` |
| Deployed console API image | Still the green-era `2.1.0-fb.1`; the purple rebuild (`2.1.0-fb.2`) waits on the mirror pull request |
| Deployed console UI image | Still the green-era `1.1.78-fb.3`; the purple rebuild (`1.1.78-fb.4`) waits on the mirror pull request |
| Launcher | Cards carry the #864ffc accent; the console card and docs purple duo pass is an open pull request on the launcher |

The console rebuild recipe (fresh UI image from pristine upstream, never a
re-sed of an already patched image; the sed targets for wordmark, copyright
brand, and accent hexes; DOCR push; Coolify API image bump and restart) lives in
the launcher's living docs, `docs/console/infrastructure.md` in
`fb_cloud_launcher`.

## 7. The launcher

Repository `fb_cloud_launcher`. A standalone Node service (`server.js` plus
Dockerfile): every `apps/<slug>.md` becomes a card (name, url, status, order,
tagline, optional mark and accent), and every `docs/<slug>/*.md` set becomes
that app's living docs (overview, infrastructure, usage, plus any extra pages).
Auth is a single shared password (`LAUNCHER_PASSWORD`) issued as an HMAC-signed
httpOnly session cookie; no user accounts yet, by design.

It runs as a Docker container on `fb-deploy-1`, attached to the FB Deploy
Traefik through labels with no Coolify API dependency, at
`cloud.futurebuild.ai`. Updates are: merge, pull, rebuild the image, recreate
the container.

Cards: Deploy (`deploy.futurebuild.ai`) and Console (`console.futurebuild.ai`),
both live. The workloads index in `docs/deploy/usage.md` is the living list of
everything running on FB Deploy; any new workload gets a row there plus a card
and docs of its own. Current workloads: the FB Console stack and the launcher
itself. Planned next: a monitoring stack as a sibling service, and FB Factory
templated apps.

The launcher README still names the old `futurebuildai` clone URL; it redirects,
so it needs no fix to keep working.

## 8. Divergences from plan

Recorded so the context file can be amended deliberately rather than drift:

- One droplet. The plan splits a services droplet, an Appwrite droplet, and a
  sandbox droplet; today the whole Platform runs on `fb-deploy-1`, and the only
  other droplet is `futurebuild-plane`.
- Branding patches exist. The plan says Appwrite stays stock and pinned with
  zero patches in Phase 1; both deployed mirrors now carry rebrand patch series,
  each ledgered in `PATCHES.md` as internal branding decisions, not for
  upstream.
- The launcher is a standalone Node repository behind Traefik, not a Lit
  micro-app on Appwrite Sites as the v1 launcher decision describes.
- Appwrite is pinned at 2.1.0, not the 2.0.0 the mirror plan named.
- The GitHub org is `FutureShade-Cloud-Ecosystem`, not the `futureshade` org the
  early plans name.

## 9. Pending work

- Merge the `mirror-fb-console` purple duo pull request, then run the console
  image rebuilds and bump the service through the Coolify API.
- Merge the launcher purple duo pull request, then recreate the container.
- Backups for the fb-console stack volumes.
- The monitoring stack as the next Platform workload.
