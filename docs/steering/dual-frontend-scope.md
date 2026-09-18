# Steering — Dual-frontend scope: "two apps, one backend"

**Status:** accepted · **Date:** 2026-09-18

## Context

The gable-agents-ui experiment treats gable's standard Lit UI (`gable/app/`)
as dormant: backend-only patches so far. Direction confirmed with Colton:
keep it that way and ship **both frontends as whole, separately deployed apps
over the one gable backend**. No page-level switching, no embedding, no
shared chrome between them. The only bridge: the agent chat can hand the user
a link into the correct routed page of the other running frontend service.

## Scope

1. **classic-link action (deterministic URL builder)** — in
   `templates/gable-quote` (pattern reused by the other gable-* apps):
   input `{entity: quote|order|invoice|product|customer, id: uuid}` →
   `{url, openInNewTab: true}` from a constant entity→route map, base URL
   from `CLASSIC_UI_BASE_URL`. The agent calls this instead of fabricating
   URLs; taught in the system prompt + domain skill ("when the user asks to
   open something in the classic ERP, call classic-link").
2. **Env + docs** — `CLASSIC_UI_BASE_URL` in gable-* `.env.example` files;
   local-dev note: the Lit UI's Vite proxy targets `:8080` while our backend
   runs `:8090` (one-line proxy tweak or a second backend instance).
3. **Deployment definition** — Coolify runbook (in `platform/`): service 1
   `gable-erp` (Lit UI build + gable backend) at `erp.<org>.futurebuild.ai`;
   service 2+ agent-native micro-UIs at `agents.<org>…`. Both behind the
   existing Traefik wildcard. One auth front door per ADR-0002 (both trust
   the Appwrite issuer) so cross-app links are SSO-seamless.
4. **Launcher tiles (optional, config-only)** — register both apps in the
   fb-cloud-launcher workload index per the infra runbook pattern; platform
   discovery without in-app coupling.

## Out of scope

- Embedding either UI in the other (iframe / `@agent-native/embedding` is a
  separate future spike).
- A UI toggle/switcher inside either app.
- Any committed change under `gable/app/` beyond the local-dev proxy note.

## Acceptance criteria

- classic-link returns correct URLs for all mapped entities and is listed in
  the agent's tool set.
- "Open this quote in the ERP" in chat produces a working link (dev: verify
  URL construction against the mapping; live click-through once the classic
  UI is booted).
- `.env.example` + runbook updated; typechecks stay at 0 errors; **no
  changes under `gable/app/` committed**.

Effort: ~half a day including the deploy runbook. Blocked-on: nothing for
items 1–2; item 3's live verification wants the Coolify/DOCR credentials
already flagged as pending.
