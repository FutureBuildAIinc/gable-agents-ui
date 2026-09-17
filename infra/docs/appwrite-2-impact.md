# Appwrite 2.0: Impact on the FutureShade Plan

Researched 2026-09-12 against the Appwrite 2.0 announcement (Aug 31, 2026), the self-hosting release post (Sep 7, 2026), and the GitHub 2.0.0 release notes. Supersedes ADR-004's bridge decision and amends plan v2 where noted.

---

## 1. What Appwrite 2.0 actually ships, and where

| Capability | Appwrite Cloud | Self-hosted 2.0.0 today | Effect on the plan |
|---|---|---|---|
| Appwrite itself runs on PostgreSQL (or MariaDB, MongoDB), chosen at install, fixed for the instance's life | Yes | Yes, Postgres is the default for new installs; no migration path between engines, so start on 2.0 fresh | Install 2.0.0 on Postgres now. Verify whether the installer or compose generator accepts an external Postgres host so Appwrite's underlying database and the engine's org databases can share one managed cluster. |
| Native PostgreSQL and MySQL as dedicated provisioned engines (connection string, PITR, branches, HA, pooler, extensions, from $10 per month) | Yes | Not described for Community Edition; the self-hosted post only covers the underlying database choice | Assume no dedicated-database provisioning self-hosted. The engine's Postgres stays on DigitalOcean Managed Databases (ADR-002 unchanged). Snapshot branches would have been ideal for sandboxes; emulate with per-branch databases restored from a nightly seed. |
| TablesDB (relational with permissions and realtime), DocumentsDB (schemaless), VectorsDB (embeddings with HNSW), Embeddings API | Yes | Yes (RC notes list the Embeddings API and usage service for self-hosted) | Opens the planning-objects option in Section 3. Verify which embedding models are available self-hosted. |
| OAuth 2.1 and OpenID Connect provider (discovery document, PKCE, JWKS, device grant, dynamic client registration, product-hosted consent screen) | Yes | Expected: the only Cloud-only exclusions named are Domains and Firewall, and the self-hosted post's "coming soon" list does not include it. Verify in the Console on first install | Replaces the Go OIDC bridge in ADR-004 (Section 4). |
| S3-compatible Storage API (SigV4, path-style) | Yes | Coming "very soon" per the self-hosted post; not in 2.0.0 | Tools point at Spaces directly until it lands, then optionally at Appwrite buckets. |
| Firewall, Domains, activity log | Yes | Domains and Firewall are Cloud-only; activity log coming | Edge rules stay in Traefik or Coolify plus DigitalOcean Cloud Firewalls. Sites custom domains are manual DNS plus TLS at the edge. |
| Console IV (TanStack), Terminal, Explorer, notifications, realtime event tail | Yes | Yes | Grant's spreadsheet-style editing of TablesDB rows is native; NocoDB is no longer needed for planning objects. |
| Hyperloop B coroutine engine, combined worker topology | Yes | Yes: 16 containers instead of 33, plus a ClickHouse container for usage metrics and a geo container | Appwrite droplet: 4 vCPU and 8 GB minimum; 16 GB if ClickHouse is retained under load. |
| Git deployments for Functions and Sites from GitHub, GitLab, Bitbucket, Gitea | Yes | Yes | Strengthens Forgejo-now (it speaks the Gitea API). Verify the Gitea provider accepts a Forgejo host. |
| One organization per self-hosted instance, many projects | n/a | Yes | Fine: the plan already chose one project for the Shade and engine-backed products. |
| Partner Apps API (register OAuth apps, delegated Console tokens, provision a project per customer) | Yes | Verify | Relevant later if a venture ever needs its own project rather than a Team. |

Bottom line: 2.0 removes most of the "abstraction tax" arguments against Appwrite, and the two features that matter most to FutureShade (Appwrite as an OIDC provider; Appwrite itself on Postgres) are self-hostable now. The two that are not yet (dedicated Postgres provisioning, S3 API) have clean substitutes.

---

## 2. "Refactor the OSS forks' backend and DB layer to run on Appwrite"

Two very different things hide in that sentence.

**Re-pointing (configuration, hours per tool):** each tool keeps its code and is configured to use the estate's shared engines: a database on the shared Postgres cluster, object storage on Spaces (later Appwrite's S3 API), login through Appwrite's OIDC provider, secrets from Infisical, network over Tailscale, compute under Coolify. With 2.0 this is now possible for identity and, once the S3 API lands self-hosted, for files, with zero source changes.

**Refactoring (weeks per tool, forever):** rewriting each tool's data layer onto TablesDB or DocumentsDB through the Appwrite SDK. This buys Appwrite permissions, realtime, and Console editing over the tool's data, at the cost of rewriting ORMs, migrations, and queries in codebases you do not control, then rebasing that rewrite on every upstream release. It also does not move compute: Appwrite Functions remain ephemeral, so Penpot, Plane, Infisical, and Forgejo still run as long-lived containers somewhere, which means Coolify.

Recommendation: re-point everything, refactor nothing. Where the Shade needs to own a tool's data (planning objects), build it natively instead of adopting the tool's schema. That is Section 3.

| Tool | Its own stack | Re-point to | Refactor? |
|---|---|---|---|
| Penpot | Postgres, Redis, S3 assets, OIDC login | Shared Postgres database, Spaces (then Appwrite S3), Appwrite OIDC | No |
| Plane (if kept) | Postgres, Redis, S3 (MinIO), OAuth or OIDC by edition | Same pattern; check SSO tier | No; superseded by Section 3 |
| AppFlowy Cloud | Postgres, Redis, MinIO or S3, GoTrue auth | Same pattern; GoTrue's generic OIDC support must be verified | No; heavy for what it adds (Section 3) |
| Infisical | Postgres, Redis, SSO by tier | Shared Postgres; forward-auth if SSO is gated | No |
| Forgejo | Postgres, optional S3 for LFS, attachments, packages; OIDC | Shared Postgres, Spaces, Appwrite OIDC | No |
| Grafana and Loki | Postgres for Grafana, object storage for Loki | Shared Postgres, Spaces | No |
| Coolify | Its own Postgres and Redis | Leave isolated; it is the deployer and must not depend on what it deploys | No |
| Uptime Kuma | SQLite or MariaDB | Leave as is; forward-auth at the edge | No |
| NocoDB | Postgres meta | Only if still needed after Section 3; likely dropped | No |

Rule for the stack guide: the estate shares engines (identity, database server, object storage, secrets, network, edge) and shares nothing above them. Application code stays upstream.

---

## 3. PM tooling: AppFlowy versus an Appwrite database served to the Shade

Recommendation: **build the Shade's planning objects on Appwrite TablesDB and serve them to the Shade**, with the boundary below. Skip AppFlowy for PM. Keep Plane only as a stopgap if a board is needed before the TablesDB module exists, which should be a matter of weeks, not months.

Why TablesDB wins for this specific data:
- Planning objects (specs, tasks, cycles, ADRs, knowledge cards, comments) are low volume, collaborative, permissioned by Team, and edited by humans and agents alike. That is exactly the shape TablesDB, Appwrite Realtime, and the Console are built for.
- Grant gets the spreadsheet view natively in Console IV. No NocoDB.
- Agents get a first-class path: the Appwrite MCP server for the intake and spec actors, the server SDK for the Bun tier, scoped API keys per agent seat.
- The Shade renders boards and cards in Lit through the Web SDK with realtime subscriptions and no Go endpoints, which makes it the fastest route to "the Shade is the interaction layer."
- Appwrite Functions (Go runtime available) hold light validation and webhooks if needed.

Why not AppFlowy for PM: its editor is excellent for humans, but its collaborative document model is a poor surface for agents, an MCP server is unverified, SSO through its GoTrue layer is unverified, and it is a heavy service (auth server, database, cache, object storage, worker) for a role the Shade is about to absorb. If a rich docs editor is wanted later, embed one in the Shade.

### Boundary rule (amends ADR-002)

| Owner | Holds | Never holds |
|---|---|---|
| Appwrite TablesDB (planning layer) | specs, tasks, cycles, ADRs, knowledge cards, comments, approvals as records, product registry entries | messages, presence, typing, jobs, runner events, sandbox state |
| Go engine Postgres (runtime layer) | rooms, messages, threads, read cursors, agent seats and state, jobs, branches, sandboxes, audit | any planning object |

- Cross-reference by ID only (a spec row stores `branch_room_id`; a job row stores `spec_id`). No duplication of fields across the two stores.
- The Bun tier is the only writer of spec state transitions; humans edit content fields, not status, and the Console's permissions enforce that split per Team role.
- Anything that starts needing joins across the two stores for a hot path moves to the engine. That is the tripwire.

### Schema sketch (one TablesDB database per org, or one database with a `tenant` column plus Team permissions; decide with the org topology ADR)

- `specs`: title, problem, acceptance_criteria, out_of_scope, state, product_id, requested_by, approver_id, locked_at, branch_room_id, pr_url
- `tasks`: spec_id, cycle_id, title, status, assignee (human or agent seat), estimate, order
- `cycles`: name, starts_at, ends_at, goal, status
- `adrs`: number, title, status, context, decision, consequences, links
- `knowledge_cards`: tenant, source_room_id, source_message_id, kind, text, embedding (VectorsDB or an embeddings attribute; verify self-hosted model availability)
- `comments`: parent_kind, parent_id, author, body
- `products`: slug, repo_url, base_branch, sandbox_template, seed_dataset_ref

---

## 4. ADR-004 v2: identity root (supersedes the bridge decision)

**Decision:** Appwrite 2.0's built-in OAuth 2.1 and OpenID Connect provider is the identity surface for every third-party tool. No Go bridge.

- Enable the OAuth2 server on the single project. The Shade hosts the consent screen in its own Lit design language.
- Register each tool as an OAuth client through the client registration API during provisioning (the operator console can do this; it is an SDK call, not a Console form).
- The Go engine verifies JWT access tokens against the published JWK Set instead of calling the account endpoint. Cheaper and offline-verifiable.
- Group and role mapping: verify whether Team memberships surface as claims. If they do, tools map groups to roles natively. If they do not, two fallbacks in order: an Appwrite Function that enriches userinfo, or per-tool mapping by email domain and manual role assignment for the handful of operators.
- Tools without OIDC sit behind forward-auth at the edge, as before.
- Fallback if the OAuth2 server turns out to be absent from Community Edition: the Go bridge from ADR-004 v1, or a standard IdP with Appwrite as an OIDC client.

Everything else in ADR-004 v1 stands: the per-tool SSO readiness table, the licence caution about `ee/` code, and the fork policy.

---

## 5. Amendments to plan v2 and the stack guide review

| Item | Change |
|---|---|
| ADR-002 | Add the planning-layer boundary from Section 3. Chat and runtime objects unchanged. |
| ADR-004 | Superseded by Section 4. Drop the bridge spike; replace with "verify OAuth2 server and Team claims on first install." |
| Plan v2 Section 11 (hosting) | Appwrite on Postgres, combined topology, 8 to 16 GB. Verify external Postgres support; if supported, one managed cluster hosts Appwrite's underlying database plus the org databases and Autorestic covers the rest. |
| Plan v2 Section 3 (topology) | Add TablesDB as the planning layer beside the engine; add Appwrite MCP as the agent tier's path to planning objects. |
| Plan v2 Section 8 (sandboxes) | No snapshot branches self-hosted; per-branch databases restored from a nightly seed dump. |
| Plan v2 Section 12 (phases) | Phase 1 gains a "planning module" slice: TablesDB schema, Console roles, spec board in Lit, Appwrite MCP wired to the intake actor. Phase 2 provisioning registers OAuth clients per tool. |
| Stack guide review Section 4 | Retract "no NocoDB needed only after Shade views exist": Console IV covers Grant's editing for planning objects now. NocoDB drops unless engine tables need ad hoc editing. |
| Stack guide review Section 5 | Column A: remove NocoDB, keep Coolify, add "Appwrite MCP server." Column B: add "TablesDB schema definitions for planning objects." |
| Runtime review Section 5.5 | The FutureShade MCP server for runners can delegate `read_spec` to TablesDB via the server SDK. |
| Forge ADR-005 | Forgejo now, deployed under Coolify, on the shared Postgres cluster, with Appwrite OIDC login; Sites and Functions pull from it through the Gitea provider (verify). |

---

## 6. First-install verification checklist (Appwrite 2.0.0 Community Edition)

1. OAuth2 server present in the project settings; discovery document served; a test client completes PKCE code flow; inspect claims for Team membership.
2. Installer or compose generator accepts an external Postgres host and credentials (DigitalOcean Managed Databases).
3. Embeddings API and VectorsDB work self-hosted, and which models are available offline.
4. Gitea Git provider connects to a Forgejo instance for Sites deployments.
5. Appwrite MCP server works against 2.0 APIs (TablesDB naming, new endpoints).
6. Sites custom domains: manual DNS plus TLS at the edge, since Domains is Cloud-only.
7. Container count and memory at idle on the chosen droplet; ClickHouse footprint.
8. S3 API arrival: watch release notes; until then Spaces direct for tools.

---

## 7. Sources

- appwrite.io/blog/post/announcing-appwrite-2 (Aug 31, 2026)
- appwrite.io/blog/post/appwrite-2-self-hosted (Sep 7, 2026)
- appwrite.io/blog/post/appwrite-2-0-postgres-by-default (Sep 2026)
- github.com/appwrite/appwrite releases: 2.0.0 and release candidates
- appwrite.io/changelog
