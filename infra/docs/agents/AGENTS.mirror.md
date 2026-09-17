# Mirror repository instructions

This is a private mirror of an upstream project. `upstream` is a pristine copy of upstream's default branch, force-updated by the sync workflow. `main` is `PINNED_TAG` plus a short patch series.

- Never commit to `upstream`. Never rebase or force-push `main`.
- A patch is a commit on `main` prefixed `[fs-patch]`, with an entry in `PATCHES.md` (title, reason, ADR or issue, upstream PR or why not). No entry, no patch.
- Never modify `ee/` or any directory under a proprietary licence. `PATCHES.md` is also the licence ledger.
- On an `upstream-release` issue: write a digest (security fix, bug fix, feature, breaking change, new config flag), open a rebase PR that replays the patch series onto the new tag with the upstream test suite run, update `PINNED_TAG`, and open a separate configuration PR on `infra` for flags and image bumps. PRs only.
- More than a handful of patches, or a rebase that conflicts heavily, stops and opens an ADR rather than pushing through.
- Contributing upstream uses a temporary public fork as the PR vehicle; the mirror itself never opens upstream PRs.
