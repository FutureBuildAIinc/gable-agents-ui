# FutureBuild Cloud: Product Taxonomy

Naming and layering for every document from here on. Replaces "the platform" and "the estate" with the product names below.

## 1. The four nouns

| Noun | What it is | Built from |
|---|---|---|
| **FutureBuild Cloud** | The platform: the golden path (ADR-011 App Shape), the engines (identity, data, storage, messaging, hosting, secrets, observability, backups), the control plane (orgs, apps, deployments, previews, runners, budgets), and the `fb` CLI | Coolify and Appwrite 2.0 as engines in v1, owned control plane, DigitalOcean underneath |
| **The Shade** | Each organization's collaborative and agentic workspace on FutureBuild Cloud: the rooms where humans and agents work, and the surface where the org sees and steers its products and deployments | The Shade engine, agent tier, Lit client |
| **Apps** | Products that conform to the App Shape and run on FutureBuild Cloud for one or more orgs: Gable, the Hardscape House products, partner apps later | Template plus `fb` |
| **Orgs** | The ventures, communities, and clients FutureBuild provisions: `fb` (internal), `gable`, `hh`, more later; each gated on its own domain with its own database, manifest, agents, and Shade workspace | Provisioning runbook |

One sentence: FutureBuild Cloud runs apps for orgs, and the Shade is where each org and FutureBuild meet to plan, build, deploy, and support them.

## 2. The Shade as the org's window onto its Cloud footprint

Everything FutureBuild Cloud does for an org shows up in that org's Shade as rooms, cards, and typed events, so there is no separate "cloud console" for orgs.

| The Cloud emits | The Shade shows | Who acts |
|---|---|---|
| App registered, environment created | A product room per app with the current-app card and the app's manifest summary | Operators, org admins |
| Deployment started, succeeded, rolled back | Deployment cards in the product room with version, changelog drafted by an agent, rollback action for authorised roles | Operators, developers (v2) |
| Preview ready or expired | Branch rooms with "Try this change" cards | Members, reviewers |
| Incident or health change | An incident room opened automatically with the timeline; a status card pinned in the product room | Operators, org admins |
| Spec locked, PR opened, sandbox ready | The existing feedback loop cards | Members, reviewers, operators |
| Budget or quota thresholds | Operator inbox items; an org admin notice when their agents pause | Operators, org admins |
| Backup and restore drill results | Operator-only cards; a monthly summary posted to the org's admin room | Operators |

Agents in the Shade are therefore agents on the Cloud too: the product lead seat drafts specs and release notes, the runtime layer builds and previews, and an operations seat (later) can explain an incident, propose a rollback, or open a mirror-rebase PR when an upstream release lands.

## 3. Roles across the three versions

| Role | v1 internal | v2 partner orgs | v3 public cloud |
|---|---|---|---|
| operator (FutureBuild) | Runs everything from the Shade's operator mode | Same, plus partner enablement and quotas | Same, plus support tooling |
| org_admin | Invites, rooms, notices | Plus app settings within their manifest | Plus billing contact |
| reviewer | Approves specs and PRs | Same | Same |
| member | Chat, intake, sandboxes | Same | Same |
| developer (new in v2) | n/a | Uses `fb` against their org's apps: previews, deploys to their environments, agent seats within budget | Same, self-serve |
| agent | Seats in allowed rooms | Same, per app | Same |

The Shade's modes follow the roles: member mode, developer mode (v2), operator mode. One client bundle, role-gated routes.

## 4. What changes in the existing documents

- "The platform" and "the estate" become FutureBuild Cloud; "the interaction layer" becomes the Shade; "operator console" becomes the Shade's operator mode; the "developer" role and developer mode are added for v2.
- Plan v2 Section 3 topology gains the event flow in Section 2 above: the engine emits Cloud events into org rooms as typed events; the client renders them as cards.
- ADR-011 Section 5 (platform contract) is the contract of FutureBuild Cloud; the App Shape is its admission rule.
- The stack guide v1.1 gets a one-page "FutureBuild Cloud and the Shade" opener using the four nouns.
- The project README's standing decisions add: "FutureBuild Cloud runs apps for orgs; the Shade is each org's collaborative and agentic workspace on it; apps conform to the App Shape."

## 5. Name hygiene

- Product names: FutureBuild Cloud, the Shade, the App Shape, `fb`.
- Code names stay as they are: `futureshade-core`, `futureshade-agents`, the `futureshade` GitHub org and Infisical project. FutureShade remains the name of the project that builds all of this; FutureBuild Cloud is what it produces.
- Check the FutureBuild Cloud and Shade names for trademark and domain availability before v2, since partners will see them.
