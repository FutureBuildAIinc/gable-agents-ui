# ADR-013: Client Implementation Model

**Status:** Proposed
**Deciders:** Colton

## Context

In v1 only FutureBuild's product repositories live on FutureBuild Cloud. A client implementation (Gable for an LBM dealer, a Hardscape House product for a landscape supplier) is created by taking the product and customising it for that client, and the work happens in the internal Shade workspace (`fb` org). The Hardscape House prelaunch scope already asks for the single-dealer software to become a configurable repository for many dealer deployments. The risk is the obvious one: copying the product repository per client produces N diverging forks that cannot take product upgrades.

## Decision

An implementation is not a copy of the product. It is a small repository that pins a product version and holds only what is client-specific, deployed as an app instance into that client's own org on FutureBuild Cloud, and upgraded by rebasing onto new product tags.

### Three repositories, three jobs

| Repository | Example | Contains | Never contains |
|---|---|---|---|
| Product | `gable` | The App Shape app: code, migrations, OpenAPI, web bundle, statecharts, capability manifest listing every feature the product can expose | Any client's data, branding, or credentials |
| Implementation | `impl-gable-dibbits` | `PRODUCT_TAG`, the org manifest (which capabilities are on), configuration (branding tokens, workflow settings, integration endpoints), seed and data-import scripts for that client, sandbox template, docs, and an `OVERLAYS.md` ledger | Product code copies; forks of product files |
| Overlay (exception) | a branch or directory inside the implementation | A minimal, ledgered patch when a client needs behaviour the product cannot express by configuration yet | Anything that could have been a product feature behind a capability flag |

The default answer to "the dealer needs X" is a product feature behind a capability flag, shipped to everyone and switched on in that client's manifest. Overlays are the exception, need an ADR entry, and are rebased on every product tag exactly like mirror patches.

### Orgs

- The product's community stays shared: the `gable` org is where all dealers talk, give feedback, and try changes.
- Each client's deployed app instance runs in that client's own org (for example `dibbits`), provisioned by FutureBuild, with its own database, domain, manifest, agents, and Shade workspace. Client data never shares a database with another client.
- One login covers both: a dealer's staff are members of the community org and of their own client org.

### Where the work happens

- An implementation room per client in the `fb` org, with a client implementation manager seat (the manager layer of the agent org) that orchestrates engineer seats for configuration, data import, and any approved overlay.
- Feedback from the client's intake rooms in the community org becomes either a product spec (generalisable) or an implementation task (client-specific). The intake agent proposes the split; a reviewer decides. The split rule is the table above.
- Deployments, previews, and incidents for the client's instance surface in the client org's Shade, so the client sees their own footprint without seeing FutureBuild's internal rooms.

### Upgrades

- `fb upgrade` in an implementation repo bumps `PRODUCT_TAG`, replays overlays, runs the product's migrations against a preview restored from the client's seed, runs the client's acceptance checks, and opens a PR. The upstream-watch lane pattern applies, with the product's release notes as the digest.
- A client is never left more than one product minor version behind without an entry in the implementation's ledger explaining why.

### Naming and layout

```
impl-<product>-<client>/
  PRODUCT_TAG
  manifest.yaml            org manifest for this client
  config/                  branding tokens, settings, integrations (secrets by reference only)
  data/                    import scripts, seed dataset for previews
  sandbox/                 template for the client's preview and current-app stacks
  overlays/                exception patches, each with an entry in OVERLAYS.md
  docs/                    implementation notes, runbook, acceptance checks
  AGENTS.md
```

### Exit

`fb export` on an implementation produces the product binary at `PRODUCT_TAG`, the client's database, and the static bundle as a Compose bundle. The client can leave with their instance. This is the same promise the App Shape makes, applied per client.

## Consequences

- Easier: one product to upgrade, N thin implementations that follow it; agents work on a repeatable shape; client onboarding becomes provisioning plus configuration plus data import.
- Harder: Gable must first become configurable (ADR-012 owns that), and the discipline of "feature flag, not fork" has to be enforced at review time.
- Revisit: if a client needs a second product-sized divergence, decide by ADR whether it is a new product or a product line, never a permanent overlay.

## Effect on the Sessions

| Session | Addition |
|---|---|
| S4 | Provisioning covers client orgs, not only venture orgs; the org manifest schema is shared with implementations |
| S5 | The client implementation manager seat and the product-versus-implementation split in the intake actor |
| S7 | Sandboxes and previews per implementation from the client's seed dataset |
| S9 | The first real implementation (Dibbits on Gable) provisioned and cut over; `fb upgrade` proven once |
| ADR-012 | Gable migration onto the App Shape must deliver the capability manifest and configuration surface this model depends on |
