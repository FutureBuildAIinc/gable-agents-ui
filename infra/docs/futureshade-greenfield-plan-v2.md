# FutureShade Greenfield Plan v2

Supersedes `futureshade-greenfield-build-plan.md` (v1) and shelves `futureshade-campfire-build-plan.md` as a fallback reference. Campfire and Buzz are pattern sources, not dependencies.

Stack: self-hosted Appwrite fork on DigitalOcean (identity, teams, storage, push, Sites), Go + Postgres engine, Bun agent tier running runtime-agnostic XState statecharts, Lit/Ionic client with Zag interaction state, Tauri 2 shell for the internal team.

---

## 0. What changed since v1

| Change | Effect on the plan |
|---|---|
| Greenfield only, no Campfire interim | No Rails patches, no `campfire` connector. The Gable community launches when the chat core and PWA pass their exit tests. |
| Multi-org venture model | Orgs are first-class in the engine, each gated on its own domain, each with its own database and capability manifest. |
| Single login for FutureBuild staff | One Appwrite project for identity. Orgs and tenants are Teams. Operators hold membership in every org. |
| Operator role and features | FutureBuild staff get an operator surface (provisioning, approvals, runners, sandboxes, audit) that members never see. |
| Member self-serve sandboxes | Any member can open the current app or a branch's changed app for the product their org is focused on, without asking anyone. |
| Multi-runner runtime layer | Claude Code, Kimi Code, Kilo Code, optionally Hermes or Pi as harnesses. API-key based throughout. |
| Provisioned, not subscription based | No signup, no billing, no plans. FutureBuild provisions an org and its users per venture. |
| DigitalOcean | Concrete deployment layout in Section 11. |

Interpretation to confirm: "not subscription based" is read as the platform's provisioning model (ventures are provisioned by FutureBuild). The runner layer is API-key based regardless, per Section 7.

---

## 1. Product model

**Venture -> Org.** Each venture FutureBuild pursues gets one org: a gated domain, its own database, a capability manifest, its own rooms, agents, products, and sandboxes. Users are invited by an operator or an org admin, never self-registered.

**Launch orgs.** `fb` (FutureBuild internal) and `gable` (Gable community). Next: `hh` (Hardscape House). Later: per-client orgs with capability variants, stubbed by the manifest from day one.

**Inside an org.**
- Tenants: a Team per dealer or customer company. Drives private-room visibility and knowledge scoping.
- Products: the repos the community is focused on (for `gable`: the Gable ERP core and its satellites). Each product carries a repo, base branch, sandbox template, and seed dataset.
- Rooms: open, private (tenant), DM, intake, branch. Same policy model as before: human-only by default, intake and branch rooms explicit.
- Agents: seats provisioned per org from the manifest.

**Roles.**

| Role | Who | Scope |
|---|---|---|
| `operator` | FutureBuild staff | Every org. Provisioning, approvals, runners, sandbox fleet, audit, view-as-member. |
| `org_admin` | Venture lead or client admin | One org. Invite and remove users, manage tenants and rooms, pin notices. |
| `reviewer` | FutureBuild engineer or product lead | One or more orgs. Approves specs, reviews branch rooms. |
| `member` | Ops staff, dealer staff | One org. Chat, intake rooms, open sandboxes, give feedback. |
| `agent` | Provisioned seat | Allowed rooms only. |

**Single login.** One Appwrite project holds every user. A FutureBuild operator logs in once and switches between `fb`, `gable`, and `hh` in the client. A dealer member sees only their org.

---

## 2. Pattern sources

| From Campfire | From Buzz |
|---|---|
| Rooms, DMs, @mentions, search, attachments with previews, web push, dark mode: the basics done right | Agents as first-class members with their own identity and seat, not bolted-on bots |
| Link and QR invites; an org admin can onboard a room full of people from a phone | Threads, and the branch-as-discussion pattern (here: a branch room per feature branch) |
| Bot simplicity: a seat, a key, a room, nothing else to configure | Typed events by kind, rendered as cards rather than parsed from text |
| Pinned notices; a human-readable statement of what a room is for | Tamper-evident audit log of every agent and operator action |
| Single-container, boring operations; one volume to back up | ACP-based harness with pluggable runners; agent-first CLI |
| Air-gap friendly: nothing phones home | Workflows as code; kept for later, statecharts cover it now |

---

## 3. Topology

```
 gable.<domain>        hh.<domain>          fb.<domain>          *.sandbox.<domain>
 members (PWA)         members (PWA)        operators (Tauri/PWA) member previews
       |                     |                    |                     ^
       +---------------------+--------------------+                     |
                             |                                          |
             [ Appwrite fork: ONE project, all users and teams ]        |
             Auth | Teams | Storage buckets per org | Messaging | Sites |
                             |                                          |
                 [ Go engine: futureshade-core ]                        |
                 org resolution -> per-org Postgres database            |
                 REST + WebSocket hub | agent seat API | operator API   |
                             ^                                          |
                             |  native agent seat API                   |
                 [ Bun agent tier: futureshade-agents ]                 |
                 intake | spec | dispatch | sandbox_request | session   |
                             |                                          |
          +------------------+------------------+                       |
          v                  v                  v                       |
   [ Project brain ]   [ Runtime layer ]   [ Sandbox fleet ] ----------+
   org+tenant scoped   Claude Code, Kimi   Sites deployment per branch
                       Code, Kilo Code,    + per-branch engine + seeded DB
                       Hermes/Pi (opt.)    + shared "current app" per product
                             |
                        [ Forge PR ]
```

- One Appwrite project. Org domains are Sites custom domains serving the same Lit bundle with per-org config.
- One engine deployment. The API lives on one platform domain; the client sends an `X-Org` header derived from its own hostname, and the engine validates it against the user's team membership before routing to that org's database.
- One agent tier. It sees only intake and branch rooms and tags everything by org and tenant.

---

## 4. Identity, orgs, and provisioning

**Appwrite layout.**
- Project `futureshade`. Users are global.
- Teams: `org:<slug>` with roles `operator`, `org_admin`, `reviewer`, `member`; `tenant:<org>:<slug>` for dealers and customers.
- Buckets: `attachments-<org>` with team-scoped permissions.
- Messaging: push providers configured once, used by every org.
- Sites: one site per org domain, all deploying the same bundle with `VITE_ORG=<slug>`.

**Engine org registry** (engine metadata database, separate from org databases).

| Table | Key fields |
|---|---|
| orgs | slug, name, domain, db_name, manifest_json, status (provisioning, active, suspended), created_by |
| org_memberships (cache) | org_slug, user_id, role, synced_at |
| products | org_slug, slug, repo_url, base_branch, sandbox_template, seed_dataset_ref, forge_kind |
| runners | slug, kind, endpoint, credential_ref (Infisical path), enabled |
| runner_policies | org_slug, job_kind, primary_runner, fallback_runner, monthly_budget, concurrency |

**Capability manifest** (stubbed, versioned JSON per org). Example keys: `features.threads`, `features.member_sandboxes`, `features.dms`, `agents.max_seats`, `agents.intake_rooms`, `sandboxes.max_concurrent`, `sandboxes.ttl_days`, `runners.allowed[]`, `limits.attachment_mb`. The engine reads it at request time; the client reads a filtered copy at login. Per-client variants later are just different manifests.

**Provisioning runbook** (one operator console action, executed by the engine).
1. Create org record and domain; create `org:<slug>` team; add all operators.
2. Create the org database, run migrations, seed default rooms (`general`, `announcements`, one intake room named for the product), pinned notices.
3. Attach products (repo, base branch, sandbox template, seed dataset).
4. Provision agent seats from the manifest.
5. Create the Sites custom domain and trigger the first deployment.
6. Invite the org admin; the org admin invites members by link or QR.

Deprovisioning archives the database and bucket, revokes the team, and keeps the audit trail.

---

## 5. Go engine: futureshade-core

Chat data model, API surface, WebSocket hub, and room policy carry over from v1 unchanged (rooms, memberships, messages with per-room `seq`, threads, reactions, read cursors, attachments, agent seats, agent state, specs, jobs, branches, knowledge items, audit). Additions in v2:

| Addition | Detail |
|---|---|
| Per-org database routing | Connection pool per org; migrations run per org; backups and exports are per org by construction. |
| Org resolution middleware | `X-Org` header + JWT verification against Appwrite + membership cache. Anything unresolvable is rejected before touching a database. |
| Roles | Membership role enforced per endpoint. Operator endpoints live under `/operator/*` and require the `operator` role in `org:fb`. |
| Products and sandboxes | `products` (registry) and per-org `sandboxes` (id, product, kind: current or branch, branch_id, url, state, owner, expires_at, last_activity_at). |
| Operator API | Provision and suspend orgs, manage users and teams, edit manifests, approve specs, manage runners and policies, list and tear down sandboxes, read audit, view-as-member. |
| Typed event catalogue | `spec.candidate`, `spec.locked`, `job.dispatched`, `job.failed`, `branch.opened`, `sandbox.ready`, `sandbox.expired`, `approval.requested`. Cards in the client, rows in the audit log. |

Auth: the client obtains a short-lived Appwrite JWT; the engine verifies it against Appwrite's account endpoint and caches briefly. Team membership syncs on login and on Appwrite team webhooks.

Realtime: single node per deployment; Postgres `LISTEN/NOTIFY` per org database as the bus for later replicas.

---

## 6. Bun agent tier: futureshade-agents

Actors and rules from v1 carry over (intake, spec, dispatch, sandbox, session; definitions in `@futureshade/statecharts`; snapshots persisted through the engine; Go is the only writer). Changes in v2:

- The `campfire` connector is dropped. `native` is the only transport.
- New `sandbox_request` machine, one per member request: `requested -> resolving_product -> (attach_existing | provisioning) -> ready -> (refreshing | expired)`. Triggered by a member action, not by an agent.
- `dispatch` gains runner routing: reads the org's runner policy, picks primary, falls back on failure or quota exhaustion, records runner, model, tokens, and cost on the job.
- Every actor carries `org` and `tenant` in context; retrieval from the project brain is scoped by both.

Intake behaviour is unchanged: quiet by default, plain language, silent knowledge filing, at most one or two clarifying questions, a spec with acceptance criteria, human approval before any dispatch.

---

## 7. Runtime layer

Runners are adapters behind one interface: `start(job) -> stream of events -> result`. ACP is used where the runner supports it; a stdio or CLI wrapper otherwise. Every runner runs on API keys issued by its provider.

| Runner | Role | Notes |
|---|---|---|
| Claude Code | Primary for builds and follow-ups | API key from the Console. Anthropic prohibits subscription OAuth outside Claude Code and Claude.ai for any third-party or automated use, so the platform never touches a subscription token. |
| Kimi Code | Secondary builder, cost-sensitive jobs | Per Moonshot's terms for automated use. |
| Kilo Code | Alternative harness for repo work | Per its provider terms; useful where its tooling fits the repo. |
| Hermes or Pi | Optional harness | Only against API-key-backed providers. Treated as a harness choice, not a billing strategy. |

**Routing policy** (per org, per job kind): primary runner, fallback runner, monthly budget, concurrency cap. Defaults: builds and follow-ups on Claude Code with Kimi Code as fallback; documentation and small fixes on Kimi Code with Claude Code as fallback. The manifest's `runners.allowed[]` restricts what an org may use.

**Quota awareness.** The dispatch queue backs off on provider rate limits, tracks per-runner concurrency, and fails over when a provider window is exhausted. Budgets are enforced before dispatch, not discovered on the invoice.

**Your interactive tools stay as they are.** Claude Code, OpenHands, and the rest on your own subscriptions are your development environment. The platform's automated runners are a separate, API-key-based path.

---

## 8. Member self-serve sandboxes

The most important member feature after chat itself. A non-technical member must be able to open the product as it is today, and the product as it would be with a proposed change, without asking anyone.

**Surfaces.**
- Product card (pinned in the org's product room): "Open the current app". Attaches to the org's shared current sandbox for that product. Always warm, seeded with demo data for the org, reset nightly, plus a "Reset demo data" button for org admins.
- Branch card (in each branch room): "Try this change". Attaches to that branch's preview if it exists, otherwise provisions it. Status streams through `agent_state` into the card: provisioning, ready, refreshing, expired.
- Feedback entered in the branch room after trying the change becomes a follow-up job.

**Mechanics.**

| Layer | Current app | Branch preview |
|---|---|---|
| Frontend | Sites deployment of the product's base branch | Sites deployment per branch, unique URL |
| Backend | Long-lived per-org product stack from the sandbox template | Per-branch stack on the sandbox host |
| Data | Org seed dataset, reset nightly | Fresh copy of the org seed dataset per branch |
| Lifecycle | Always on while the org is active | TTL from the manifest (default 7 days after last activity), torn down on merge or close |
| URL | `<org>-<product>.sandbox.<domain>` | `<org>-<product>-<branch>.sandbox.<domain>` |

**Login handoff.** If the product already runs on the same Appwrite identity, the sandbox accepts the member's session and no second login exists. Until then, the card shows demo credentials for that org's seed dataset.

**Guardrails.** Never production data. Manifest caps on concurrent sandboxes per org. Operators see and can tear down everything in the fleet. Sandboxes carry a visible banner naming the branch and the expiry.

---

## 9. Operator role and features (FutureBuild internal)

Operators use the same client bundle; operator routes are role-gated and hidden from members.

- Org switcher and a cross-org inbox: approvals requested, jobs failed, sandboxes expiring, new intake candidates.
- Provisioning: create and suspend orgs, attach products, edit capability manifests, manage runner policies and budgets.
- People: invite and remove users, assign roles, manage tenants and teams across orgs.
- Approvals: review a spec, edit acceptance criteria, approve or send back, all from the card.
- Runners: live job view with streamed events, retry, cancel, re-route to a different runner.
- Sandbox fleet: every sandbox across every org, age, cost, tear down, extend.
- Audit: filterable log of agent, operator, and admin actions.
- View as member: see exactly what a member of a given org and tenant sees. Read-only.
- Internal work: `fb` is an ordinary org with its own rooms, intake rooms, products, and agents. Operators do their own work there and step into `gable` or `hh` from the switcher.

---

## 10. Client: futureshade-app

Unchanged from v1 in structure: Lit custom elements with Ionic components, Bun + Vite, Zag for interaction state, in-memory room store fed by WebSocket and REST, optimistic outbox reconciled by `seq`, one bundle for PWA and Tauri.

Additions:
- Org resolution from hostname at boot; `X-Org` on every request; org switcher for users with more than one membership.
- Role-gated routes: operator console, org admin tools.
- Product and branch cards with sandbox actions and streamed status.
- Member mode stays deliberately plain: rooms, DMs, one intake room, product card. Nothing operator-shaped leaks in.

Distribution: PWA on Sites for every org domain (the dealer path). Tauri 2 desktop and mobile builds for operators.

---

## 11. DigitalOcean deployment

| Component | DigitalOcean resource | Notes |
|---|---|---|
| Appwrite fork | Droplet (4 vCPU, 8 GB to start), Docker Compose, Traefik included | Custom domains per org for Sites; TLS via Let's Encrypt through Traefik; Appwrite's internal database left exactly as shipped |
| Appwrite storage backend | Spaces bucket (S3-compatible) | Attachments, Sites build artefacts, backups |
| Engine + agent tier | Droplet (4 vCPU, 8 GB), Docker Compose | `futureshade-core`, `futureshade-agents`, Caddy or Traefik for the API domain |
| Databases | Managed PostgreSQL cluster | One database per org plus the engine metadata database; daily backups on; point-in-time recovery when available |
| Sandbox host | Droplet (8 vCPU, 16 GB), Docker | Per-branch stacks and shared current-app stacks; wildcard DNS `*.sandbox.<domain>`; Traefik routes subdomains to stacks |
| Images | Container Registry | Engine, agent tier, product sandbox images |
| DNS | DigitalOcean DNS | Org domains -> Appwrite droplet (Sites); API domain -> engine droplet; wildcard -> sandbox host |
| Secrets | Infisical (self-hosted on the engine droplet, or Infisical cloud) | Every service pulls from Infisical at start; no secrets in compose files or Sites env panels |
| Firewall and access | Cloud Firewalls, SSH keys only | Droplet-to-droplet traffic on the VPC; managed Postgres restricted to the VPC |
| Monitoring | DigitalOcean Monitoring plus uptime checks on each org domain and the API | Alerts on WebSocket disconnect spikes, job failures, sandbox count |

Growth path: move the engine, agent tier, and sandbox fleet to DOKS when per-branch stacks outgrow a single droplet. Nothing in the design depends on that move happening early.

---

## 12. Phases and exit tests

**Phase 0: platform on DigitalOcean**
- Deploy the Appwrite fork, create the project, teams, buckets, Messaging providers, Sites with custom domains for `fb` and `gable`, managed Postgres, Spaces, Infisical, DNS.
- Exit: an invited user logs in on `fb.<domain>`, joins a team, uploads a file, receives a push, and a hello-world Lit bundle serves on both org domains.

**Phase 1: chat core, one org**
- Engine chat model, WebSocket hub, JWT auth, team sync, org resolution (single org for now). Client rooms, DMs, threads, mentions, attachments, unread, search, PWA install.
- Exit: the FutureBuild team runs its daily chat in `fb` for two weeks without falling back.

**Phase 2: orgs, provisioning, operator basics**
- Org registry, per-org databases, manifest, provisioning runbook, roles, operator console (provisioning, people, audit, view-as-member), org switcher.
- Provision `gable`. Invite the first dealer tenant. Intake room with pinned notice.
- Exit: an operator provisions an org end to end from the console, and a dealer member chats in `gable` while the operator works in `fb` on the same login.

**Phase 3: agents and specs**
- `@futureshade/statecharts` with model-based tests, agent tier with `native` connector, agent seats, intake and spec actors, approval cards.
- Exit: one dealer feedback item goes candidate -> locked spec -> approved, entirely in chat.

**Phase 4: runners, branches, PRs**
- Runtime layer with Claude Code and Kimi Code adapters, routing policy, budgets, dispatch actor, branch rooms, PR cards.
- Exit: an approved spec becomes a branch and a PR with the spec and transcript summary, posted to its branch room.

**Phase 5: member sandboxes**
- Sandbox host, product registry, current-app stack for the Gable product with seed data, branch previews, product and branch cards, TTL and teardown.
- Exit: a dealer member opens the current Gable app and a branch preview from a phone, tries the change, and posts feedback that becomes a follow-up job.

**Phase 6: expand**
- Provision `hh`. Kilo Code and Hermes or Pi adapters if wanted. Tauri 2 builds for operators. Per-client manifest variants. Browser-side SQLite for offline. Engine replicas.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Platform and first app land together | Phase 0 and Phase 1 exit tests; `fb` dogfoods every feature before `gable` sees it |
| Per-org databases multiply operations | Migrations, backups, and exports are scripted per org from day one; the provisioning runbook is the only way an org is created |
| Runner terms and cost | API keys only; budgets enforced pre-dispatch; every job records tokens and cost; routing policy per org |
| Sandbox sprawl and cost | Manifest caps, TTLs, nightly reset of current-app stacks, operator fleet view |
| Member confusion between current app and branch preview | Distinct URLs, a banner naming branch and expiry, one button per card |
| Agent-built code drifting from spec | Statechart model-based tests and OpenAPI contract tests are the acceptance criteria for every runner job |
| Tenant or org leakage | Org resolved and validated before any database is touched; tenant scoping at the query layer in engine and agent tier |
| PWA push limits, especially iOS | Best effort on PWA; operators carry native push via Tauri |
| Appwrite fork drift | Config, branding, and additive extensions only; rebase on upstream releases; internal database untouched |

---

## 14. Open decisions

- Forge: which one hosts the Gable repos; shapes the dispatch actor and PR cards.
- Database per org (assumed) vs schema per org in one database. Per org is cleaner for exports and client hand-offs; schema per org is cheaper to operate. Decide before Phase 2.
- Whether and when Gable itself moves onto the same Appwrite identity, which removes the second login from sandboxes.
- Tauri timing: Phase 6 assumed; earlier if operators want native push sooner.
- Ionic depth: full Ionic shell vs a handful of components inside custom Lit layouts.
- Hermes or Pi: adopt only if a concrete job kind needs what they offer beyond the Claude Code and Kimi Code adapters.
