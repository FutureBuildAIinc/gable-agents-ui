# FutureShade Project: Knowledge Index and Instructions

Drop this file into the project's knowledge base first, then the documents listed below (download each from its file card in the originating chat) and the uploaded stack guide HTML.

---

## 1. Document index and precedence

Read in this order. When two documents disagree, the one higher in the "Current" list wins.

### Current (authoritative)

| File | What it is | Status |
|---|---|---|
| `futureshade-e2e-stack-and-sessions.md` | Consolidated end-to-end stack (Part A), workstation-to-cloud model (Part B), the Session plan S0 to S11 (Part C) | Master plan |
| `futureshade-addendum-os-and-scope.md` | Workstation OS decision (Omarchy versus Ubuntu LTS) with the FutureBuild layer; v1 scope trims (GitHub org, Infisical Cloud) and their effect on Sessions | Amends the master plan |
| `appwrite-2-impact.md` | What Appwrite 2.0 changes; identity root without a bridge (ADR-004 v2); planning objects on TablesDB with the boundary rule; first-install checklist | Amends ADR-002 and supersedes the bridge decision in ADR-004 v1 |
| `futureshade-acp-runtime-review.md` | ACP runtimes, auth and billing per provider, runner adapter design, permission policy, routing defaults, spikes | Authoritative for the runtime layer |
| `futureshade-greenfield-plan-v2.md` | Multi-org venture model, roles, operator surface, member sandboxes, DigitalOcean hosting, phases | Base plan; Sections 7, 11, 12 amended by the documents above (Coolify replaces bare Compose; GitHub and Infisical Cloud for v1; TablesDB planning layer) |
| `futureshade-stack-guide-review.md` | Deep review of the Systems Thinker's Guide with the v1.1 change list and the ADRs it implies | Current, with its Section 4 NocoDB note retracted by `appwrite-2-impact.md` |
| `The_Systems_Thinker_s_Guide__Full_Markdown_Render_.html` | The draft stack collateral being refined | Source document; v1.1 pending |

### Superseded or shelved (keep for reference)

| File | Status |
|---|---|
| `adr-004-appwrite-identity-root.md` | v1. The Go OIDC bridge is superseded by Appwrite 2.0's built-in OAuth 2.1 and OIDC provider (see `appwrite-2-impact.md` Section 4). The per-tool SSO table, licence caution, and fork policy still stand. |
| `futureshade-greenfield-build-plan.md` | v1 of the greenfield plan; replaced by v2 |
| `futureshade-campfire-build-plan.md` | Shelved. Campfire is a feature-pattern reference only |

---

## 2. Standing decisions (one-line each, for orientation)

- Greenfield build; Campfire and Buzz are pattern references, not dependencies.
- Compute: self-hosted Coolify on DigitalOcean manages every daemon across three droplets (services, Appwrite with its own Traefik, sandboxes) and optionally the workstation. Appwrite hosts identity, data, storage, messaging, Functions, and Sites.
- Appwrite 2.0.0 self-hosted on PostgreSQL, one organization, one project for the Shade and engine-backed products, stock and pinned, zero fork patches in Phase 1.
- Identity root: Appwrite Auth and Teams; Appwrite's OAuth2 server is the OIDC provider for third-party tools; the engine verifies JWTs via the JWK Set.
- Data: Go engine Postgres per org for runtime objects (chat, presence, jobs, branches, sandboxes, audit); Appwrite TablesDB for planning objects (specs, tasks, cycles, ADRs, knowledge cards, products); cross-reference by ID; the Bun tier is the only writer of spec state.
- Agents: Bun tier running runtime-agnostic XState statecharts; Zag on the client for interaction state only; agents capture knowledge only in designated intake rooms; human approval gates every dispatch.
- Runtime layer: ACP adapters, Claude Agent primary on API keys through an LLM gateway, Kimi CLI secondary on membership keys, Kilo and goose optional; one container per job; secrets injected at spawn, never a secret-reading tool.
- v1 SaaS accepted with exit paths: GitHub org `futureshade` under `futurebuildai`, Infisical Cloud, Tailscale control plane.
- Ventures: FutureBuild provisions a gated org per venture (`fb`, `gable`, then `hh`); operators get one login across orgs; members see plain mode.
- Workstation: 128 GB Linux desktop as fabrication host, local mirror, optional runner host, home backup vault; Omarchy stable channel recommended before S0 if the GPU test passes, otherwise Ubuntu LTS plus Omakub.
- House rules for all output: no em dashes anywhere, artifact-based deliverables, upfront clarifying questions before large deliverables, brief conversational replies.

---

## 3. Project instructions (paste into "Set project instructions")

```
You are working inside the FutureShade project for Colton, founder of FutureBuild AI. FutureShade is the project that refines and implements the FutureBuild stack; the Shade (multi-org human chat plus agent harness) is the first product built on it.

Read the project knowledge before answering anything about the stack, plan, or decisions. Precedence when documents disagree: futureshade-e2e-stack-and-sessions.md, then futureshade-addendum-os-and-scope.md, then appwrite-2-impact.md, then futureshade-acp-runtime-review.md, then futureshade-greenfield-plan-v2.md, then futureshade-stack-guide-review.md. adr-004-appwrite-identity-root.md v1, the greenfield plan v1, and the Campfire plan are superseded or shelved; use them only as history.

Roles: in this project you act as the supervising engineer and thinking partner (planning, briefs, ADRs, reviews). Execution happens in long-run swarmed Claude Code Sessions on Colton's workstation against locked briefs; you prepare briefs, never assume execution happened unless told.

House rules: never use em dashes or en dashes anywhere (replies, copy, deliverables). Prefer artifact-based outputs (markdown files) for anything substantial, with a brief conversational summary. Ask upfront clarifying questions before large deliverables; proceed with stated assumptions when the request is already detailed. Keep replies friendly and brief.

Engineering rules that stand until an ADR changes them: Appwrite stock and pinned, no fork patches in Phase 1; secrets injected at spawn, no secret-reading tools for agents; API keys only for platform runners; TablesDB owns planning objects, the Go engine owns runtime objects; Coolify runs daemons, Appwrite runs identity, data, storage, messaging, Functions, and Sites; every new decision gets an ADR number continuing from ADR-010.

When a new Session brief is requested, produce it in the Session format from Part C0 of the master plan: purpose, locked inputs, lanes, exit test, human checkpoints, outputs, unlocks.
```

---

## 4. Suggested first chats in the project

1. "Draft the S0 Foundations brief" (produces the first Session brief from Part C).
2. "Write v1.1 of the Systems Thinker's Guide using the change list in the review" (collateral update).
3. "Prepare the Appwrite 2.0 first-install verification runbook" (from the checklist in `appwrite-2-impact.md`).
