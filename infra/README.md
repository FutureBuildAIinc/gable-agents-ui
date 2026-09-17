# infra

Infrastructure as code, decision records, session briefs, and runbooks for
FutureBuild Cloud. This repository is read by agent sessions as much as by
people: `AGENTS.md` is the canonical instruction file, `CLAUDE.md` imports it,
and `context/FUTURESHADE-CONTEXT.md` is the architecture authority.

No secret value belongs in this repository. Only Infisical paths, and the names
of the identities allowed to read them.

## Layout

| Path | What is in it |
|---|---|
| `AGENTS.md` | Canonical agent instructions: the App Shape base rules plus the addendum for this repository |
| `CLAUDE.md` | One import line plus Claude-only notes |
| `CONTRIBUTING.md` | DCO sign-off, branch and pull request rules, house rules, checks |
| `context/FUTURESHADE-CONTEXT.md` | Single-file synthesis of every decision and plan; authoritative on architecture |
| `docs/fb-platform-as-built.md` | The Platform surface as built: FB Console, FB Deploy, and the launcher, with pins, patches, droplet facts, and divergences from plan |
| `docs/adr/` | Decision records. `0001-forge-and-secrets-v1.md` is the forge and secrets decision; the rest carry their own numbers |
| `docs/sessions/` | Session briefs and as-built notes, one directory per Session id |
| `docs/agents/` | The agent instruction files for the other repositories, plus `README-placement.md` saying where each one goes. The addendum for this repository is not duplicated here; it is the second half of `AGENTS.md` |
| `docs/project/` | The Claude project's knowledge index and the supervisor task contract, which describe how the work is planned rather than how this repository works |
| `docs/` | The plans, reviews, and runbooks the decisions came from |
| `scripts/` | Provisioning and maintenance scripts, and the workflow template mirrors use |
| `.github/workflows/ci.yml` | The `ci` job that every ruleset requires |

## Scripts

Scripts here are read by agents and run by Coolify or by a human operator. A
session never runs them against a live environment.

| Script | What it does |
|---|---|
| `scripts/bootstrap-github.sh` | Configures the organisation, teams, template and first-party repositories, and the rulesets on the default branch |
| `scripts/bootstrap-infisical.sh` | Installs the Infisical CLI on the workstation, logs in, and shows the injection pattern every local process uses |
| `scripts/mirror.sh` | Creates a private mirror of an upstream with a pristine `upstream` branch, a `PINNED_TAG`, and a `PATCHES.md` ledger |
| `scripts/upstream-sync.yml` | Template workflow each mirror installs: force updates `upstream` and opens an `upstream-release` issue when a newer tag appears |
| `scripts/check-dashes-and-dates.sh` | The house rules checker the `ci` job runs over changed Markdown |

## House rules

- No em dashes and no en dashes anywhere.
- No calendar dates, durations, or calendar references in `docs/adr` or
  `docs/sessions`.
- Commits are signed off (`git commit -s`); changes reach the default branch
  through pull requests that pass the `ci` check.

Run the checker before you push:

```bash
scripts/check-dashes-and-dates.sh
```
