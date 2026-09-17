# Contributing

This repository holds the infrastructure as code, the decision records, and the
session briefs for FutureBuild Cloud. Read `AGENTS.md` before you change
anything; it is canonical for humans and for agent sessions alike.
`context/FUTURESHADE-CONTEXT.md` is the architecture authority.

## Developer Certificate of Origin (DCO)

Every commit must carry a sign-off line. There is no contributor licence
agreement; the DCO is the whole of it. Sign off with:

```bash
git commit -s -m "your message"
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

By signing off you certify the Developer Certificate of Origin, version 1.1
(https://developercertificate.org): you wrote the change or otherwise have the
right to submit it under the repository's licence, and you understand that the
contribution and the sign-off are public and are kept indefinitely.

Commits made through the GitHub web editor are signed off automatically because
the organisation requires web commit sign-off. Commits made anywhere else need
`-s`. A pull request whose commits are not signed off is not merged; fix it by
amending or rebasing with `git rebase --signoff` before review.

## Branches and pull requests

- `main` is protected: pull requests only, linear history, no force pushes, and
  the `ci` check must pass.
- Work happens in a lane worktree on `lane/<session>-<n>-<slug>`; the integrator
  merges lanes into `qa/<session>`; the verifier gates the merge.
- A pull request description carries the brief or the specification it
  implements, the exit test line by line, and a short transcript summary.
- Never force push, never rewrite history, never delete a branch you did not
  create.

## House rules

- No em dashes and no en dashes anywhere: code, comments, documentation, commit
  messages, pull request text. Use commas, colons, or parentheses.
- No calendar dates, durations, or calendar references in `docs/adr` or
  `docs/sessions`. Work is sequenced, never scheduled.
- No secret values in this repository, ever. Only Infisical paths and the names
  of the identities that read them. A committed secret is a blocking incident,
  not something to fix forward.
- Scripts here are read by agents and run by Coolify or by a human operator. A
  session never runs them against a live environment.
- A new architectural decision is an ADR in `docs/adr` with the next number, not
  a commit message.

## Checks before you push

```bash
scripts/check-dashes-and-dates.sh              # every tracked Markdown file
scripts/check-dashes-and-dates.sh <file> ...   # the files you touched
git status                                     # clean outside your lane
```

The `ci` job runs the same checker over the Markdown your pull request changes.
