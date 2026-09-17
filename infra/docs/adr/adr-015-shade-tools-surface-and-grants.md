# ADR-015: The Shade's Tools Surface and Tool Grants

**Status:** Proposed
**Deciders:** Colton, Grant

## Context

The Shade is chat-first (rooms, agents, cards). The launcher idea grew into a native shell that wraps the internal OSS tools in webviews. The two belong together: the Shade gets a second surface, Tools, where every user sees exactly the slice of the factory tools their role allows. FutureBuild operators see the whole internal stack and every tenant's projects; a tenant's designer sees only their Penpot project; a tenant's IT lead sees their deployments, repos, tracker and dashboards but not Penpot; partner developers in v2 see their org's slice of FutureBuild Cloud.

The constraint that shapes everything: a webview shows the tool's own UI, so what a user can see or do inside it is decided by that tool's permission model, not by the Shade's tile list. The Shade must therefore provision permissions into each tool, not merely hide links.

## Decision

1. **Two surfaces in one Shade.** Rooms (chat-first, agents, cards, the existing plan) and Tools (a permission-aware shell). One identity, one chrome, one org switcher, one notification strip. The launcher is the first cut of Tools.
2. **Tool grants are first-class objects.** A grant is `(subject, tool, scope, role, expiry)`, where the subject is a user or a Team, the tool is one of the supported tools, the scope is that tool's own unit of isolation (Penpot project, Plane project, Coolify team, GitHub repository, Grafana folder or org), and the role maps to the tool's role vocabulary. Grants live in the engine, are audited, and are the only way tool access is given or removed.
3. **Provisioners apply grants into the tools.** One provisioner per supported tool, idempotent `apply` and `revoke` through the tool's API, plus a nightly drift check that reports any permission in a tool that has no matching grant (and removes it if the grant was revoked). Single sign-on through Appwrite's OIDC provider makes the tool recognise the same person the grant names.
4. **Tools are rendered by capability.** In the native Shade (Tauri), each granted tool opens as a webview tab inside the Tools surface. In the browser PWA, a granted tool opens as a tile that launches the tool in a new tab with SSO, because admin tools block embedding. Deep links (`fb://tools/<tool>/<scope>/<ref>`) route to the tab or tile.
5. **Tools without multi-tenant scoping are never exposed to tenants.** They are either operator-only in the shared instance or deployed per org under Coolify, in which case the org's instance is the scope.
6. **Console-class tools stay operator-only.** The Appwrite Console (one project for everything), Infisical, and Coolify's server administration are never granted to tenants; tenants see their data through Shade views (planning objects scoped by Team) and their deployments through the Cloud events in their rooms and product cards.

## Supported tools and their scope units (v1)

| Tool | Scope unit the grant maps to | Tenant-safe | Notes |
|---|---|---|---|
| Penpot | Team and project membership | Yes | Designers and SMEs; a tenant's project only |
| Plane | Workspace project membership and role | Yes | Until the Shade's planning module absorbs it |
| GitHub | Repository collaborator or team through the GitHub App | Yes | IT leads, partner developers in v2; scoped to the org's repos |
| Coolify | Team membership; resources belong to teams | Yes, with care | Deployment visibility per team; server administration operator-only |
| Grafana | Org, team, or folder permissions | Yes | Dashboards for the tenant's apps only |
| Uptime Kuma | None | No | Operator-only, or a per-org instance if a tenant needs status pages |
| Appwrite Console | Project membership only | No | Operator-only |
| Infisical | Project and environment roles | No for tenants | Operator-only; partners in v2 get their own project if ever |

## Roles and what they see

| Role | Rooms | Tools |
|---|---|---|
| operator (FutureBuild) | Every org | Every tool, every scope, including all tenant projects |
| org_admin | Their org | Their org's Plane project, Grafana folder, deployment view, GitHub repos if granted |
| reviewer | Their orgs | Plane and GitHub for the products they review |
| developer (v2) | Their org | Their org's repos, previews, deployments, Grafana folder, Plane project |
| designer or SME | Their org | Their Penpot project, and only that |
| member | Their org | Nothing in Tools by default; product and branch cards live in Rooms |

Grants can be narrower than the role default and always expire for contractors.

## Consequences

- Easier: one place to give and take away access across the whole factory; the drift check turns tool permissions into something audited rather than remembered; the same model serves FutureBuild internally, tenants today, and partner developers in v2.
- Harder: a provisioner per tool is real integration work that must track each tool's API; the supported-tool list must stay short; the native Shade needs the multi-webview shell (verify Tauri 2's multiple-webview status, or fall back to one window per tool behind the shared sidebar).
- Security: the native Shade holds live sessions to every admin tool an operator can reach. Device encryption, auto-lock, tailnet-only endpoints, and no tool tokens stored by the shell are requirements, not options. Every grant change and every drift-check finding is audited.
- Revisit: when the Shade absorbs a tool's surface through its API (convergence), that tool's provisioner and webview retire together.

## Where it lands

- S3-L (launcher): the Tools surface in its simplest form, tiles by grant, SSO, no provisioners yet (grants recorded, applied by hand).
- After HH-5, alongside the Shade Sessions: the grant model in the engine, the Penpot and Plane provisioners first (SMEs and reviewers are the first outside users), then GitHub and Coolify, then Grafana; the native Shade's webview tabs once the multi-webview approach is settled.
- v2: the developer role and partner grants reuse the same objects with no new machinery.
