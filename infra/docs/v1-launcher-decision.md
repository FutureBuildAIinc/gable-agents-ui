# v1: The Launcher Instead of the Full Shade

**Decision:** v1 keeps the multi-tool OSS estate (Appwrite 2.0 for identity, data, storage, messaging, Sites; Coolify for daemons; Penpot, Plane, Uptime Kuma, Infisical Cloud, GitHub) and fronts it with a single-page launcher: one login, one page, every tool. Development and agentic work run on Claude Code plus Kilo Code from the workstation. The full Shade (chat, agent seats, intake rooms) moves behind the HH and Gable migrations and grows out of the launcher rather than replacing it.

Assumption stated once: "backend on Appwrite" means the estate's shared services run on Appwrite; product cores (HH, Gable) still follow the App Shape with their own Go core. The launcher itself needs no Go core at all.

---

## 1. What the launcher is

A Lit micro-app (`web/apps/launcher` in the `futureshade` monorepo, deployed on Sites at the `fb` domain), role-gated by Appwrite Teams, no custom backend.

| Section | Content | Source |
|---|---|---|
| Tools | Tiles for Plane, Penpot, Appwrite Console, Coolify, GitHub org, Infisical, Uptime Kuma, Grafana (when present); each opens with single sign-on where the tool supports Appwrite OIDC, plain link otherwise | Static config per org manifest |
| Status | Green, amber, red per tool and per environment; last deploy per service | Uptime Kuma and Coolify, read through an Appwrite Function that holds the tokens server-side |
| Activity | Open PRs, failing checks, active Plane cycle and its exit-test checklist, current Session and harness | GitHub, Plane via Appwrite Functions |
| Quick actions | Open the current preview for an app, open the latest Session brief, open today's Ops items | Links assembled from the same sources |
| Planning | The spec board over TablesDB (the S4 planning module, pulled forward in its simplest form: a list and a board, realtime) | TablesDB via the Web SDK |
| Org switcher | For operators with more than one org membership; members of `gable` see only their tools when that org exists | Appwrite Teams |

Rules: tool tokens never reach the browser; every third-party read goes through an Appwrite Function with a scoped key from Infisical. The launcher is one bundle in the App Shape layout, so it inherits the design system, the auth package, and CI from day one.

## 2. Development and agentic setup (workstation)

| Piece | Setup |
|---|---|
| Claude Code | Primary harness for Sessions; subagents per lane; `CLAUDE.md` imports `AGENTS.md` |
| Kilo Code | Second harness: the Kilo CLI with its orchestrator mode for lane fan-out, `kilo acp` when driven by a client, provider credentials through your own gateway or BYO keys rather than Kilo Cloud, rules kept in the repo (`AGENTS.md`; Kilo's own rules directory if it needs one, verify current behaviour) |
| Shared conventions | One `AGENTS.md` per repo; the same deny-by-default hook policy expressed for both harnesses; per-lane worktrees; the `session` runner with `--harness claude|kilo|mixed` |
| Quota routing | Integrator and verifier on Claude when quota allows; breadth lanes on Kilo; the acceptance gate is harness-independent |
| Local mirror | Appwrite 2.0 on Postgres locally with the same scripts as the cloud; `fb dev` against it |
| Agentic later | The platform runners (ACP adapters, gateway, budgets) arrive with the Shade's runtime layer; until then, "agentic" means Sessions on the workstation and the upstream-watch lane on mirrors |

Kilo replaces Kimi as the second harness in the routing note; the routing rules are unchanged.

## 3. Session plan changes

| Before | Now |
|---|---|
| S3 Shade chat core, S4 orgs and planning, S5 agent tier, S6 runtime, S7 sandboxes, then launch | S3 becomes **S3-L: Launcher** (one Session): the micro-app, SSO tiles, status and activity Functions, the simplest spec board, org switcher. Exit: Colton and Grant start every day from the launcher; every tool is one click behind one login |
| HH and Gable migrations after the Shade | HH-1 starts right after S3-L (it needs only a repo); HH-2 waits on S0 to S2; Gable follows HH-5 |
| Shade chat and agents | Reordered behind HH-5: the launcher grows rooms, cards, and intake (former S3 to S5) once HH is live and the shared packages exist; the runtime layer and sandboxes (S6, S7) follow. The taxonomy and the App Shape do not change; only the calendar does |
| Gable community launch (S9) | Happens on the Shade once it has rooms and intake; until then dealer feedback is captured through the community org's Plane-style intake in the launcher and the existing channels |

New order: Pre-S0, S0, S1, S2, S3-L, HH-1 to HH-5 (with S7-style previews via Coolify PR previews and Sites branch deployments in the meantime), G-1 to G-4, then the Shade Sessions (rooms, agents, runtime, sandboxes), then the community launch and the rest.

## 4. Why this holds up

- Value in weeks: a single login and one page over the estate is real relief for two people, and it forces S2's identity work to be finished properly.
- Nothing is discarded: the launcher is the Shade's operator mode with the chat removed; rooms and cards attach to it later in the same bundle.
- The revenue products move first: HH and Gable on the shape are what make the implementation model and FutureBuild Cloud true.
- The agentic layer arrives when there is something for agents to act on in production.

## 5. Update to the project README

Standing decision to add: "v1 is the multi-tool OSS estate on Appwrite and Coolify behind a single-page launcher, with Claude Code and Kilo Code as the development harnesses; the Shade grows out of the launcher after the HH and Gable migrations."
