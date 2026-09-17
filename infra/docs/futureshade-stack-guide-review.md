# Review: The Systems Thinker's Guide to Our Sovereign Software Factory (v1.0 draft)

Reviewed 2026-09-12 against the FutureShade decisions in `futureshade-greenfield-plan-v2.md` and `futureshade-acp-runtime-review.md`. Framing for this review: FutureShade is the project that refines and implements this stack; the Shade (chat plus agent harness) is the first product built on it; none of the OSS infrastructure has been forked or hosted yet; the initial build happens through the Claude harness; once the Shade is live it becomes the user interaction layer.

---

## 1. Verdict

Directionally sound and unusually good as collateral: the factory-versus-materials split, one central BaaS with isolation, secrets in a vault, a private mesh, boring backups and monitoring, statecharts as the spec, and a "don't fork yet" roadmap are all right. The construction analogies will land with Grant.

Four things need to change before it is a working plan rather than a picture:

1. **It has two different answers for where product data lives** (Appwrite Collections in Section 4, Postgres via pgx and sqlc in Section 5). The Shade decision settles it: domain data in the Go engine's Postgres, Appwrite for identity, teams, storage, push, and hosting. The doc needs one rule.
2. **It assumes Kilo Code plus Kilo Cloud is the shop and the mobile remote.** The initial build is the Claude harness, and the Shade is being built to be the steering surface. Kilo becomes one runner among several behind the Shade's runtime layer, and Kilo Cloud (a hosted SaaS) drops out of the sovereign story.
3. **Agents reading secrets through an MCP server is the one dangerous pattern in the doc.** A coding agent with `infisical-mcp` in its tool list can leak credentials into transcripts, logs, and PRs. Secrets are injected into a runner's environment at spawn by the platform; the agent never holds a secret-reading tool.
4. **Phase 3's "Unified Sovereign Frontend" already has a name: the Shade.** The roadmap should say so from day one, and the Phase 2 rebranding work (proxy-injected styling, logo swaps) is mostly wasted effort once the Shade absorbs those surfaces.

Everything else is refinement.

---

## 2. Reconciliation with this week's decisions

| Topic | The doc says | Decided this week | Resolution for v1.1 |
|---|---|---|---|
| Domain data | Appwrite Collections are the "water manifold"; Grant edits rows in the Appwrite console | Go engine owns Postgres; Appwrite is identity, teams, storage, push, Sites (ADR-002) | One rule: product and platform data in the engine's Postgres via pgx and sqlc; Appwrite Databases only for Appwrite's own needs. Give Grant an Airtable-like view over Postgres (Section 4 below) instead of the Appwrite console. |
| Appwrite tenancy | One Appwrite Project ID per venture, separate user pools | One Appwrite project, orgs as Teams, single login for operators across orgs, per-org Postgres database | Single project for the Shade and every product built on the engine. Separate projects only for products that are truly external apps with their own user base. This needs its own ADR because it also decides whether sandbox logins are SSO. |
| Fork or stock | Phase 1 runs stock releases (good) | Memory says "Appwrite fork is step 1" | The doc is right. Pin stock Appwrite; fork only when a required change cannot be made through config or extension. Same for Sites: stock Sites hosts the Lit PWAs, no fork. |
| Fabrication harness | Kilo Code via MCP; Kilo Cloud and mobile for steering | Claude harness for the initial build; multi-runner (Claude Code, Kimi Code, Kilo, optional Hermes or Pi) behind the Shade's ACP runtime layer | Section 2 and Section 5 should describe the harness as pluggable, with Claude Code first. Mobile steering (trigger runs, approve PRs, watch builds) is a Shade feature, not Kilo Cloud. |
| Human interaction layer | Claude Desktop Cowork, AppFlowy, Penpot, Appwrite console, Kilo Cloud, each in its own tab | The Shade becomes the interaction layer once live | Section 10 Phase 3 becomes "the Shade absorbs the tabs." Specs, approvals, job steering, sandbox previews, and agent conversations move into the Shade; Penpot stays a specialist canvas that the Shade links to or embeds. |
| Deployment | Coolify with Traefik deploys product containers; Sites not mentioned | DigitalOcean droplets with Compose; Sites for PWAs; per-branch sandboxes | Coolify is the better answer for services and sandboxes than hand-rolled Compose, and should replace the Compose references in plan v2 Section 11. Sites for the PWAs. One edge proxy per host (Section 5 below). |
| State machines | XState in product repos, Stately Studio for inspection | Runtime-agnostic statechart package; Bun tier runs agent lifecycles; Zag on the client; Go port later | Add the portability rule to Section 8. Replace Stately Studio (SaaS) with generated diagrams rendered in the Shade or `@xstate/inspect` locally. |
| Frontend stack | Lit, Vite, design tokens | Lit plus Ionic components, Bun plus Vite, Tauri shell, Zag | Decide whether Ionic and Tauri are in the standard stack and say so in Section 5. They are absent from the doc. |
| Backend shape | "Custom Go microservices" | One engine binary per deployment, per-org databases | Say modular monolith. Microservices for a two-person shop is the container-sprawl mistake the doc itself warns against in Section 4. |
| PM and specs | AppFlowy with `appflowy-mcp` | Weekly supervisor workflows already run on Plane cycles | Pick one before Phase 1 and make the Shade's spec objects the eventual home. Whichever is chosen is a Phase 1 side tool, not a destination. |
| Forge | GitHub now, Forgejo behind Tailscale in Phase 3 | Forge is an open decision that shapes the dispatch actor and PR cards | Decide before the runtime layer is built. If Forgejo is the endgame, start there so the PR integration is built once; otherwise keep GitHub and abstract the forge client. |

---

## 3. Section-by-section

### Section 1: Core paradigm and the two-founder model

Strong. Two edits: name the Claude harness (Claude Code plus Cowork) as the fabrication tool for the FutureShade build itself, and describe the fabrication layer as pluggable runners rather than a single vendor. The "Fable as managing engineer" framing is accurate for the Cowork supervisor sessions and should stay.

### Section 2: Workstation versus mobile

The principle (desk time for high-cognition work, fabrication is async) is exactly right and worth keeping verbatim in spirit. Replace every "Kilo Cloud" with "the Shade on your phone": trigger a run from a branch room, approve a spec or a PR from a card, get a push when a sandbox is ready. That is the product being built, and it keeps the loop sovereign. Until the Shade ships, the honest interim is GitHub's mobile PR review plus push notifications from the forge.

### Section 3: MCP worker plus human validator matrix

Good model. Three corrections:
- Remove Infisical from the agent column. Operators use the Infisical UI and CLI; agents get environment variables at spawn and nothing else.
- Add a "verify" note on MCP server maturity per tool. Penpot, Appwrite, and Infisical publish MCP servers; confirm current versions and capabilities before the doc claims specific abilities. An AppFlowy MCP server should be verified to exist in usable form before it anchors the planning workflow.
- Add a row for the Shade: the agent posts status, specs, and sandbox links into rooms; the human approves from cards.

### Section 4: Centralised BaaS

The estate utility analogy is the best writing in the doc. Keep it, but change what flows through the pipes:
- Electrical service (identity and teams), storage shed (buckets), and push are Appwrite. The water manifold (domain data) is Postgres behind the Go engine. Appwrite's own internal database stays exactly as shipped.
- Grant's "spreadsheet over the data" need is real. Serve it with an Airtable-style OSS layer over the engine's Postgres (NocoDB is the obvious candidate; it attaches to an existing database) as a Phase 1 side tool, and later with operator views in the Shade. Do not route product data through Appwrite Collections to get a console.
- Isolation: one Appwrite project, Teams per org and per tenant, one Postgres database per org. Sub-metering happens at the engine, not by splitting user pools.
- Backups: Autorestic to R2 or B2 covers Appwrite volumes and the tool stack; the engine's Postgres on DigitalOcean Managed Databases has its own backups. Add a quarterly restore drill to the doc; a backup that has never been restored is a hope.

### Section 5: Taxonomy

The A versus B split is the single most useful idea in the doc and should be preserved. Adjustments:
- Column A gains: the Shade (interaction layer), an LLM gateway with per-org virtual keys and budgets, a forge (GitHub now or Forgejo), a PM tool (Plane or AppFlowy), NocoDB, and a log and metrics stack (DigitalOcean monitoring plus Uptime Kuma is thin once agents run unattended; a Loki or Grafana pair, or an equivalent, belongs here).
- Column A loses: Kilo Cloud (hosted SaaS, replaced by the Shade), Stately Studio (SaaS, replaced by generated diagrams).
- Column B gains: the shared statechart package rule, Zag for interaction state, Ionic and Tauri if they are standard, sqlc-generated query packages, and an OpenAPI file that generates the TypeScript client types.
- Column B wording: "Go engine (modular monolith) plus background workers," not microservices.
- Tailscale note: it is a hosted control plane. Fine for Phase 1; Headscale is the self-hosted replacement if sovereignty ever requires it.

### Section 6: MCP and the Penpot loop

The bi-directional loop is the right ambition. Two honesty edits:
- "What Grant approves on the canvas translates directly into production DOM" needs a tokens pipeline and component conventions to be true: Penpot design tokens exported to `tokens.css`, a mapping from Penpot components to Lit components, and an agent that reads both. Say that the loop depends on those conventions, and add them to Phase 1.
- Drop the Infisical example from the PTO list. Secrets are never an agent attachment.

### Section 7: Tailscale mesh

Correct and well explained. Add: runner containers on the sandbox host reach the gateway and the forge, and nothing else; Tailscale ACLs scope Grant's machine to dev and staging; production database credentials never leave Infisical and the engine. Note Headscale as the self-hosted option.

### Section 8: XState

Keep the argument. Add the three rules decided this week: definitions live in a shared, runtime-agnostic package with actions and guards referenced by name; the Bun tier runs agent lifecycles and the client keeps interaction state only; model-based tests generated from the machines are the acceptance criteria for every agent-built change. Replace Stately Studio with diagrams generated from the machine definitions and rendered in the Shade or locally.

### Section 9: Playbooks

Both playbooks are good narrative. Update the tooling: Step 1 runs in Cowork; Step 3's design loop is Penpot plus tokens; Step 4's fabrication is "a runner behind the Shade" (Claude Code first), triggered and watched from a branch room; Step 5's review happens on a Shade card that links to the PR and the sandbox preview. Playbook A's Appwrite collection provisioning becomes a Postgres migration plus sqlc regeneration.

### Section 10: Roadmap

Rewrite around the Shade:
- Phase 1 (now): stock releases, pinned versions, Claude harness, GitHub or Forgejo, products shipping. No forks.
- Phase 2: the Shade absorbs surfaces one at a time: specs and approvals, job steering, sandbox previews, then operator views over data. Rebranding the third-party tools is dropped except where a tool has a supported theming config; proxy-injected styling is brittle (CSP, SPA bundles, upgrades) and buys nothing the Shade will not replace.
- Phase 3: headless is realistic for Appwrite and Infisical (API-first), unrealistic for Penpot (the canvas is the product), and partial for the PM tool (its data moves into the Shade's spec objects; the editor is not worth rebuilding). Forgejo behind Tailscale stands. Forks of Appwrite happen here if at all, driven by a concrete need.

### Section 11: Translation Zero

Keep. Soften "zero recurring SaaS platform taxes" to "no per-seat SaaS for core tooling": Tailscale, R2 or B2, DigitalOcean, Claude subscriptions, and LLM API spend are all recurring. The honest claim is stronger than the absolute one.

---

## 4. What the doc is missing

| Gap | Why it matters | Where it goes |
|---|---|---|
| Runtime layer (ACP, runners, permission policy) | The fabrication shop is a pluggable layer, not a vendor | New Section 5.5, summarised from the runtime review |
| LLM gateway and budgets | Unattended agents plus API keys need spend caps enforced twice | Column A, and a paragraph in Section 4 |
| Sandbox previews per branch | The Shade's "try this change" feature is the payoff of the whole loop | New playbook step and a Column A entry |
| CI: where tests run | Coolify builds containers; something has to run tests on PRs | Forge CI (GitHub Actions or Forgejo Actions) named explicitly |
| Observability beyond uptime | Job failures, runner errors, and cost spikes need logs and metrics | Column A |
| Local development | Grant's laptop needs a reproducible dev environment against dev Appwrite over Tailscale | Section 7 addition |
| Design tokens pipeline | Makes the Penpot loop real | Section 6 addition |
| Email and push providers | Appwrite Messaging needs configured providers; pick them | Section 4 addition |
| Restore drills | Backups without restores are untested | Section 4 addition |
| Org and role model | Operators, org admins, reviewers, members, agents | Reference to the Shade plan |

---

## 5. Hosting shape on DigitalOcean (doc tools mapped onto plan v2 Section 11)

| Host | Runs | Edge |
|---|---|---|
| Appwrite droplet | Stock Appwrite (its own Compose stack, including its Traefik), Sites for the PWAs | Appwrite's Traefik |
| Coolify droplet | Coolify managing: Go engine, Bun agent tier, LLM gateway, Penpot, PM tool, Infisical, NocoDB, Uptime Kuma, log stack | Coolify's Traefik |
| Sandbox droplet | Coolify-managed per-branch product stacks and current-app stacks; runner containers | Coolify's Traefik, wildcard `*.sandbox.<domain>` |
| Managed Postgres | Engine databases (one per org) plus engine metadata | VPC only |
| Spaces | Appwrite storage backend, Autorestic targets (or R2 or B2 off-provider for real off-site) | n/a |

Rule: one reverse proxy per host. Never run Appwrite's Traefik and Coolify's Traefik on the same box. Tailscale on every droplet; only the edge proxies expose public ports.

Off-site backups should not be the same provider as the hosting. Spaces for working storage, R2 or B2 for the restic repository.

---

## 6. Stand-up sequence via the Claude harness (no forks)

Ordered so each step is testable and nothing waits on a fork.

1. DigitalOcean project, VPC, DNS, Tailscale on three droplets, Cloud Firewalls.
2. Infisical (Coolify service) with machine identities for the engine, the agent tier, and CI. Everything after this reads secrets from it.
3. Coolify on the services droplet; Uptime Kuma and the log stack first so everything later is watched from birth.
4. Stock Appwrite on its droplet, pinned version, Spaces as storage backend, Messaging providers configured, one project, first Teams. Sites connected to the app repo.
5. Managed Postgres; Autorestic to R2 or B2; a restore drill on day one with a throwaway database.
6. Forge decision made; CI running tests on PRs; the LLM gateway with one virtual key per (org, runner).
7. Penpot and the PM tool as Coolify services; tokens export wired to `tokens.css`; NocoDB attached to a dev database.
8. Shade Phase 0 exit test from plan v2, then Phase 1 chat core dogfooded in the FutureBuild org.

At step 8 the doc's Phase 1 is complete and the Shade takes over as the convergence vehicle.

---

## 7. ADRs the doc implies but does not record

- ADR-004: Appwrite project topology (one project with Teams versus one per venture) and its effect on sandbox SSO.
- ADR-005: Forge (GitHub now versus Forgejo now) and CI runner.
- ADR-006: PM and spec tool for Phase 1 (Plane versus AppFlowy) and the migration path into Shade spec objects.
- ADR-007: Edge and PaaS (Coolify as the standard for services and sandboxes; Sites for PWAs).
- ADR-008: Secrets handling for agents (spawn-time injection only; no secret-reading tools in any runner).
- ADR-009: Frontend standard (Lit plus Ionic, Bun plus Vite, Zag, Tauri) so the doc and the repos agree.
- ADR-010: Fork policy (stock and pinned until a concrete need; fork criteria written down).

---

## 8. Risks specific to the doc as written

| Risk | Note |
|---|---|
| Secrets exposure through agent tooling | Highest severity item in the review; fix in the doc and in every agent config |
| Two data layers | Agents will happily build against both if the doc does not pick one |
| Kilo Cloud dependency | Hosted SaaS at the centre of a "sovereign" narrative; the Shade replaces it |
| Rebranding effort | Months of Phase 2 work that the Shade makes unnecessary |
| Microservice sprawl | Contradicts Section 4's own argument; say monolith |
| Penpot loop overclaim | Needs tokens and conventions before it is true; otherwise Grant will be disappointed by the first round-trip |
| "Zero SaaS" claim | Undermines credibility with anyone who checks; the softer claim is still compelling |

---

## 9. Suggested v1.1 change list (for the next revision)

1. Section 1: name the Claude harness for the FutureShade build; describe runners as pluggable.
2. Section 2: replace Kilo Cloud with the Shade for mobile steering; note the GitHub-mobile interim.
3. Section 3: drop Infisical from the agent column; add a Shade row; add "verify MCP maturity."
4. Section 4: Postgres behind the engine is the manifold; NocoDB for Grant's spreadsheet view; single Appwrite project with Teams; restore drills.
5. Section 5: add and remove Column A and B entries as listed above; "modular monolith."
6. Section 6: add the tokens pipeline and component conventions; remove the Infisical PTO example.
7. Section 7: add runner network scope and the Headscale note.
8. Section 8: add the three statechart rules; replace Stately Studio.
9. Section 9: update both playbooks to Cowork, runner-behind-the-Shade, cards, and sandbox previews.
10. Section 10: rewrite the roadmap around the Shade; drop proxy-injected rebranding.
11. Section 11: soften the SaaS claim.
12. New: runtime layer, gateway and budgets, sandbox previews, CI, observability, local dev, providers.
