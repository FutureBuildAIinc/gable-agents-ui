# FutureShade: End-to-End Stack and Session Plan

Consolidates every decision from this week into one document: the stack as it will exist, how the 128 GB Linux workstation and the DigitalOcean estate fit together, and the build plan from step 1 to the full vision as a sequence of Sessions (long-run, swarmed Claude Code sessions run from the workstation against locked briefs).

Assumptions stated once: Sessions run 3 to 7 days with 3 to 6 parallel lanes; the workstation's GPU is unknown, so local inference is optional and off the critical path; Infisical's source of truth is in the cloud (reasoning in Part B); Forgejo is the forge from day one.

---

## Part A: The end-to-end stack

### A0. Machines and network

| Component | Choice | Notes |
|---|---|---|
| Cloud | DigitalOcean: services droplet, Appwrite droplet, sandbox droplet, Managed Postgres, Spaces, Container Registry optional | VPC between droplets; Cloud Firewalls; only the two Traefik edges expose public ports |
| Workstation | 128 GB RAM Linux desktop | Fabrication host, local mirror, optional runner and sandbox host, second backup vault (Part B) |
| Mesh | Tailscale on every droplet, the workstation, and every laptop | ACL tags: `tag:infra`, `tag:workstation`, `tag:laptop`, `tag:runner`; Headscale is the self-hosted fallback |
| Off-provider backups | Cloudflare R2 or Backblaze B2 as the restic repository | Never the same provider as hosting |

### A1. Compute and delivery (Coolify)

| Component | Role |
|---|---|
| Coolify (self-hosted, services droplet) | Control plane for all daemons; manages the Appwrite droplet (proxy off, Appwrite's Traefik owns 80 and 443), the sandbox droplet, and optionally the workstation as servers over Tailscale SSH |
| Traefik | One edge per host; forward-auth against Appwrite for tools without SSO |
| Forgejo | Forge, CI (Forgejo Actions with runners on the services droplet and the workstation), built-in container registry, OIDC login via Appwrite |
| Autorestic and restic | Nightly encrypted snapshots of every volume and database dump to R2 or B2; quarterly restore drills |
| Uptime Kuma | Heartbeats for every public and tailnet endpoint, TLS expiry |
| Grafana, Loki, node exporters | Logs and metrics for engine, agent tier, runners, sandboxes, cost spikes |

### A2. Platform (Appwrite 2.0, self-hosted on PostgreSQL)

| Product | Used for |
|---|---|
| Auth and Teams | Every user in one project; Teams per org (`org:<slug>`) and per tenant (`tenant:<org>:<slug>`); roles operator, org_admin, reviewer, member, agent |
| OAuth 2.1 and OIDC provider | Single login for Forgejo, Penpot, Grafana, Infisical (or forward-auth), and any future tool; the Shade hosts the consent screen; the engine verifies JWTs against the JWK Set |
| TablesDB (planning layer) | specs, tasks, cycles, ADRs, knowledge cards, comments, products; Team-scoped permissions; realtime boards; Grant edits in Console IV |
| VectorsDB and Embeddings API | Knowledge-card similarity search, if self-hosted models check out; otherwise pgvector in the engine |
| Storage | Attachments per org bucket; S3 API adopted when it lands self-hosted |
| Messaging | Push and email for the Shade and products |
| Functions (Go runtime) | Webhooks, TablesDB event triggers, cron sweeps, light validation |
| Sites | The Shade PWA per org domain, product PWAs, per-branch frontend previews, the consent screen; Git source is Forgejo through the Gitea provider |
| Realtime | Planning boards and cards only; chat uses the engine's hub |
| Appwrite MCP server | The agent tier's path to planning objects; scoped API keys per agent seat |

Underlying database: PostgreSQL, ideally the same Managed Postgres cluster as the engine's org databases (verify external host support in the installer). Combined worker topology. One organization per instance, one project for the Shade and engine-backed products.

### A3. Secrets and access

| Component | Role |
|---|---|
| Infisical (Coolify service, cloud) | Source of truth for every credential; environments dev, staging, prod; paths per app; machine identities for the engine, agent tier, CI, runners, and the workstation |
| Spawn-time injection | Runners and services receive env at start; no agent ever holds a secret-reading tool |
| LLM gateway (LiteLLM or equivalent, Coolify service) | Virtual keys per (org, runner), spend caps, model allowlists, OpenAI- and Anthropic-shaped endpoints in front of Anthropic, Moonshot, Google, OpenAI |

### A4. Engine and agent tier

| Component | Stack | Owns |
|---|---|---|
| `futureshade-core` | Go modular monolith, pgx and sqlc, Postgres per org, WebSocket hub, LISTEN/NOTIFY bus | rooms, messages, threads, read cursors, presence, agent seats and state, jobs, branches, sandboxes, audit; org resolution via `X-Org` plus JWT; operator API |
| `futureshade-agents` | Bun, XState v5 actors (intake, spec, dispatch, sandbox_request, session), `native` connector to the engine, Appwrite server SDK to TablesDB | Agent lifecycles; only writer of spec state transitions; persists snapshots through the engine |
| `@futureshade/statecharts` | Runtime-agnostic XState-style definitions, model-based tests | The spec and the acceptance criteria for agent-built code; Go port later is a port, not a rewrite |
| `@futureshade/api` | TypeScript types generated from the engine's OpenAPI | One contract for client and agent tier |
| Runtime layer | ACP adapters: Claude Agent (API key via gateway) primary, Kimi CLI (membership key) secondary, Kilo and goose optional, Hermes or Pi experimental; one container per job; permission policy; FutureShade MCP server (`read_spec`, `post_status`, `request_review`, `open_pr`, `deploy_sandbox`, `report_blocker`) | Fabrication behind the Shade |
| Routing policy | Per org and job kind: primary, fallback, budget, concurrency; failover on `auth_required`, 429 or 5xx, cap reached, wall clock | Enforced pre-dispatch and at the gateway |

### A5. Client

Lit custom elements with Ionic components, Bun plus Vite, Zag for interaction state, in-memory room store fed by WebSocket and REST with optimistic outbox reconciled by `seq`. One bundle: PWA on Sites per org domain for members, Tauri 2 desktop and mobile for operators, browser-side SQLite for offline later. Member mode stays plain; operator routes are role-gated and hidden.

### A6. Ventures, orgs, products, sandboxes

- Orgs are provisioned by FutureBuild per venture: domain, Teams, per-org Postgres database, capability manifest, default rooms, agent seats, Sites domain, OAuth clients for tools. Launch: `fb`, `gable`; then `hh`; client orgs later with manifest variants.
- Products: repo, base branch, sandbox template, seed dataset. Sandboxes: a warm current-app stack per product (nightly reset) and per-branch previews (Sites deployment plus backend stack under Coolify, TTL, teardown on merge), surfaced as "Open the current app" and "Try this change" cards.

### A7. Design and knowledge

- Penpot (Coolify service, stock) with its MCP server; design tokens exported to `tokens.css`; component conventions map Penpot components to Lit components; Grant's red-pencil loop.
- Project brain: knowledge cards in TablesDB with embeddings; intake agents file into it from designated rooms only; tenant-scoped retrieval. Obsidian on the workstation stays the personal second brain; a one-way import into knowledge cards is a later option.

### A8. Interaction layer (what humans touch)

| Surface | Who | For |
|---|---|---|
| The Shade (member mode) | Dealer and ops staff | Chat, intake rooms, product and branch cards, sandboxes |
| The Shade (operator mode) | FutureBuild | Org switcher, provisioning, approvals, runners, sandbox fleet, audit, view-as-member |
| Cowork with Fable | Colton and Grant | Planning sessions, briefs, ADRs, weekly supervision |
| Claude Code swarms on the workstation | Colton | Sessions (Part C) |
| Penpot | Grant | Visual design and prototype validation |
| Console IV | Colton and Grant | Planning-object editing, platform administration |

Everything else (Forgejo, Grafana, Infisical, Coolify, Uptime Kuma) is an operator tool reached over the tailnet with the same login.

---

## Part B: How the workstation and the cloud intertwine

### B1. Five roles for the workstation

1. **Fabrication host.** Claude Code Sessions run here: git worktrees per lane, local Postgres and Appwrite for tests, the 128 GB of RAM buying many parallel containers and test databases. Pushes go to Forgejo; CI and Coolify take it from there.
2. **Local mirror.** A dev instance of Appwrite 2.0 on Postgres, dev Postgres for the engine, the engine and agent tier running locally, all provisioned by the same `futureshade-infra` scripts that build the cloud so the two never drift. Local mirror is for iteration and offline work; staging and prod are cloud only.
3. **Hybrid compute.** Registered in Coolify as a managed server over Tailscale SSH with `tag:workstation`. The agent tier's runner host selection prefers the workstation for runner containers and internal sandbox stacks when it is online and healthy, falling back to the sandbox droplet. Client-facing sandboxes always run in the cloud so a dealer never depends on a desk being powered.
4. **Second backup vault.** A nightly restic pull from R2 or B2 to local disk gives an off-cloud copy of the entire estate at home. Disk, not RAM, is the constraint here.
5. **Optional local inference.** If a capable GPU is present: an embeddings server for knowledge cards and a small model for intake classification behind the gateway as one more provider. Never in the critical path; production routing does not assume it.

### B2. Secrets: local or cloud

The question is availability, not sovereignty. Cloud services have to boot, rotate, and recover while the workstation is asleep or on a jobsite. If Infisical lives only on the desk, a power cut becomes an outage for every agent and every sandbox.

Recommended model:
- **One Infisical, in the cloud, as the source of truth.** Environments dev, staging, prod; a path per app; machine identities per consumer (engine, agent tier, CI, each runner host, the workstation).
- **The workstation is a client, not a vault.** It authenticates with its own machine identity, runs `infisical run -- <command>` for every local process, and keeps an Infisical agent cache for offline reads. Nothing is written to `.env` files.
- **Remote devices (laptop, phone) get short-lived access only.** Tailscale membership plus an Infisical CLI login that issues short-lived tokens scoped to dev. Prod paths are never readable from a laptop.
- **Disaster copy at home.** Infisical's own database is in the nightly backup set, so the workstation vault (B1.4) holds an encrypted copy. Restore drills include standing Infisical up from that copy.
- **The local-first variant, if wanted later:** a workstation Infisical holding workstation-only dev secrets, with the cloud instance still owning anything a cloud service needs. Two vaults cost more attention than they save; only do it if a concrete workflow demands it.

### B3. Network and access

- Tailscale ACLs: `tag:workstation` reaches everything (admin); `tag:laptop` reaches the Shade, Console IV, Forgejo, Grafana; `tag:runner` reaches only the gateway and the forge; nothing reaches Managed Postgres except droplets and the workstation.
- Tailscale SSH for droplet access; no public SSH.
- Coolify's remote-server SSH to the workstation rides the tailnet.

### B4. Data discipline

- Seed datasets per tenant live in the repo (anonymised). Local and per-branch databases are restored from seed dumps, never from prod.
- Prod data leaves the cloud only as encrypted restic snapshots.

### B5. Model access, two lanes

- Sessions (interactive fabrication) run on your Claude subscription through Claude Code, which is the sanctioned surface.
- The platform's runners run on API keys through the gateway. The two never share credentials.

---

## Part C: Session plan

### C0. How a Session runs

- **Brief.** Prepared in Cowork with Fable: purpose, locked inputs (which ADRs and plan sections), lanes, exit test, human checkpoints. The brief is the contract; scope changes end the Session and start another.
- **Swarm.** Claude Code on the workstation, one subagent per lane in its own git worktree, an integrator agent that merges lanes into a QA branch, a verifier agent that runs the exit test and model-based tests against that branch. This matches the existing supervisor pattern: supervision and specs in Cowork, execution in Claude Code against locked specs, QA validated before merge.
- **Checkpoints.** Start (brief approved), mid (design sync with Grant where UI is involved), end (exit test signed off by Colton).
- **Outputs.** PRs merged to Forgejo, deployments through Coolify and Sites, an as-built note, and the next Session's prerequisites recorded as ADR or planning objects.
- **Ops Sessions.** A recurring monthly Session for upgrades, fork rebases (if any), restore drills, and cost review.

### C1. The sequence

| Session | Purpose | Lanes (parallel) | Exit test | Unlocks |
|---|---|---|---|---|
| **S0 Foundations** | Cloud and workstation ground truth | (1) DigitalOcean IaC: VPC, droplets, Managed Postgres, Spaces, Cloud Firewalls, DNS; (2) Tailscale mesh and ACLs; (3) Coolify install, remote servers registered (Appwrite droplet with proxy off, sandbox droplet, workstation); (4) Infisical with machine identities and the secrets model; (5) Uptime Kuma, Grafana, Loki, Autorestic to R2 or B2; (6) workstation mirror scripts and Claude Code Session conventions (worktrees, CLAUDE.md, verifier) | Every host on the tailnet; a test container receives a secret from Infisical at spawn; monitors green; a restore drill succeeds on a throwaway database; the workstation appears in Coolify | S1 |
| **S1 Delivery layer** | Everything code flows through | (1) Forgejo with Actions runners on the services droplet and the workstation, container registry, branch protection; (2) LLM gateway with virtual keys, caps, logging; (3) Penpot stock install; (4) CI templates: Go, Bun, Lit, statechart model-based tests; (5) runbooks | A PR triggers CI, builds an image into the registry, and Coolify deploys it; a runner container receives a gateway virtual key and completes a test completion; Penpot loads | S2 |
| **S2 Appwrite 2.0 platform and identity** | The mechanical room | (1) Appwrite 2.0.0 on Postgres (external cluster if supported), combined topology, pinned; (2) one project, Teams model, buckets, Messaging providers; (3) OAuth2 server enabled, Team claims verified, OIDC wired to Forgejo, Penpot, Grafana, Infisical or forward-auth; (4) Sites connected to Forgejo through the Gitea provider, hello-world Lit bundle on the `fb` domain; (5) Appwrite MCP verified against 2.0; (6) the same install scripted for the workstation mirror | The first-install checklist passes; one login across all tools; a member invited by link lands in a Team, uploads a file, receives a push | S3, S8 |
| **S3 Shade chat core** | Engine and client, one org | (1) engine: rooms, DMs, messages with `seq`, threads, reactions, read cursors, search, attachments via Storage; (2) WebSocket hub, LISTEN/NOTIFY, JWT verification via JWKS, Team sync; (3) OpenAPI and `@futureshade/api`; (4) client: room list, message view, composer, threads, unread, PWA install, Zag interaction state; (5) deploy: engine under Coolify, PWA on Sites, CI contract tests | The FutureBuild team moves daily chat into `fb` and stays there for two weeks (the clock runs through S4) | S4 |
| **S4 Orgs, operators, planning layer** | Multi-org and the first Shade-native planning module | (1) org registry, per-org Postgres, org resolution, manifests; (2) provisioning runbook end to end, including OAuth client registration for tools; (3) operator console: provisioning, people, audit, view-as-member, org switcher; (4) TablesDB planning schema, Console roles per Team, spec board and cards in Lit with realtime; (5) provision `gable` (no dealers yet) | An operator provisions an org from the console; a spec created in the Shade appears in Console IV and updates live on the board; a dealer-role test user in `gable` sees only member mode while the operator works in `fb` on one login | S5 |
| **S5 Statecharts and agent tier** | Agents as members | (1) `@futureshade/statecharts` with model-based tests; (2) Bun tier, snapshot persistence through the engine, `native` connector; (3) engine agent seat API, `agent_state`, typed events, room policy enforcement; (4) intake, spec, and session actors; Appwrite MCP for planning objects; (5) approval cards and the pinned-notice flow | One feedback item in a `gable` intake room becomes candidate, draft spec with acceptance criteria, clarifying question, locked spec, human approval, entirely in chat | S6 |
| **S6 Runtime layer, branches, PRs** | Fabrication behind the Shade | (1) ACP adapter interface and the Claude Agent adapter headless on a gateway key (spike from the runtime review); (2) Kimi CLI adapter on a membership key; (3) permission policy and the FutureShade MCP server; (4) dispatch actor, routing policy, budgets, failover; (5) branch rooms, PR cards, Forgejo integration; (6) runner host selection: workstation when online, sandbox droplet otherwise | An approved spec becomes a branch, passes CI, opens a PR whose description is the spec and a transcript summary, posted to its branch room with usage and cost recorded | S7 |
| **S7 Sandboxes** | "Try this change" from a phone | (1) sandbox templates per product with seed datasets; (2) current-app stacks with nightly reset; (3) per-branch previews: Sites deployment plus backend stack under Coolify, wildcard domain, TTL, teardown; (4) product and branch cards with streamed status; (5) login handoff | A member with only a phone opens the current Gable app and a branch preview, tries the change, and posts feedback that becomes a follow-up job | S9 |
| **S8 Design loop** (parallel with S5 to S7) | Grant's red pencil | (1) Penpot MCP wired to a Session; (2) tokens pipeline to `tokens.css`; (3) component conventions and a Lit plus Ionic design system; (4) round-trip: agent drafts a screen, Grant edits on canvas, agent regenerates the Lit component | One real Shade screen round-trips with Grant's edits preserved; tokens change once and propagate | S9 |
| **S9 Gable community launch** | First venture live | (1) dealer onboarding: invites, QR, pinned notices, intake rooms per dealer; (2) Tauri 2 operator builds with native push; (3) support runbooks and the operator inbox; (4) load and restore drills before invite day; (5) client-facing sandboxes pinned to the cloud | First real dealer feedback item ships to a sandbox and is tried by that dealer; operators handle a week of traffic from the Shade alone | S10, S11 |
| **S10 Hardscape House org and manifests** | Second venture, variant capabilities | (1) provision `hh`; (2) manifest variants and the per-client rollout stub; (3) HH product registry and seed data; (4) any Kilo or goose adapters a job kind needs | Two orgs, one login, operator switcher; a manifest toggle changes what a member sees without a deploy | S11 |
| **S11 Convergence** | The full vision | (1) Shade absorbs remaining operator tabs: data views over planning objects and engine tables, docs editor; (2) browser-side SQLite for Tauri offline; (3) engine replicas over LISTEN/NOTIFY; (4) Go port of the statecharts if the Bun tier is ever the bottleneck; (5) headless use of Appwrite and Infisical behind Shade views; (6) Appwrite fork only if a concrete need has appeared, per the fork policy | Colton and Grant do a full working week in the Shade, Penpot, Cowork, and Claude Code only; no other tab opened except for administration | Ongoing Ops Sessions |

### C2. Dependencies

S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S9 → S10 → S11. S8 starts after S2 and runs alongside S5 to S7. The two-week dogfood clock from S3 must finish before S9 opens invites, not before S4 starts.

### C3. Verification items carried into Sessions

| Item | Session |
|---|---|
| Installer accepts an external Postgres host | S2 |
| OAuth2 server present in Community Edition; Team memberships as claims | S2 |
| Gitea provider accepts a Forgejo host for Sites | S2 |
| Appwrite MCP against 2.0 APIs | S2 |
| Embeddings and VectorsDB self-hosted model availability | S4 |
| Claude Agent adapter headless on an API key (issue #744) | S6 |
| Kimi CLI ACP honours a configured API key (PR #2185) | S6 |
| S3 API arrival for self-hosted Storage | Ops Session when released |
| Per-tool SSO tiers (Infisical, Plane if used, NocoDB if used) | S2 |
| Workstation GPU and local inference viability | S4 or later, optional |

---

## Part D: What "full vision realized" means

- Every venture is a gated org on its own domain, provisioned in minutes, with its own database, manifest, agents, products, and sandboxes.
- Members chat, give feedback in intake rooms, and try changes from a phone. Agents draft specs, humans approve, runners build, sandboxes prove it, PRs merge.
- Operators run the whole estate from the Shade with one login, and the factory tools are reached through the same identity over the tailnet.
- The workstation fabricates and mirrors; the cloud serves; backups exist in three places and have been restored on purpose.
- No fork exists without a written reason, and the fork count is zero until one does.
