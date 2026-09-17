# Private Mirrors with a Patch Series

Replaces the Tier A / Tier B split in `bootstrap-github-infisical.md`. Every upstream you run or depend on becomes a private mirror under the org. Patches are allowed, but only on your branch, only with a recorded reason, and always rebased on upstream releases. Public forks exist transiently, as vehicles for upstream pull requests.

---

## 1. Repository layout

| Item | Rule |
|---|---|
| Remotes | `origin` = `github.com/FutureShade-Cloud-Ecosystem/mirror-<name>` (private); `upstream` = the public repo |
| Branch `upstream` | Pristine copy of upstream's default branch, force-updated by the sync job, never committed to by a human or an agent |
| Branch `main` | Your deploy branch = the pinned upstream tag plus your patch series on top; protected by the ruleset; PRs only |
| Tags | Upstream tags mirrored as-is; your releases tagged `fs-<upstream-tag>-r<n>` |
| `PINNED_TAG` | One line on `main`: the upstream tag `main` is currently based on |
| `PATCHES.md` | One entry per patch on `main`: title, reason, ADR or issue link, upstream PR link or "not upstreamable because ..." |
| Deploy config | Not here. Compose files, env flags, and image tags live in `infra`; the mirror holds code only |

Patch commits carry the prefix `[fs-patch]` so they are trivially identifiable during a rebase.

## 2. Sync workflow (scheduled, in every mirror)

```yaml
name: upstream-sync
on:
  schedule: [{ cron: "17 5 * * *" }]
  workflow_dispatch: {}
permissions: { contents: write, issues: write }
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Track upstream
        run: |
          git remote add upstream "${{ vars.UPSTREAM_URL }}"
          git fetch upstream --tags --prune
          git push origin "refs/remotes/upstream/${{ vars.UPSTREAM_BRANCH }}:refs/heads/upstream" --force
          git push origin --tags
      - name: Detect a newer upstream release
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          PINNED=$(git show origin/main:PINNED_TAG)
          LATEST=$(gh release list --repo "${{ vars.UPSTREAM_REPO }}" --limit 1 --json tagName -q '.[0].tagName')
          if [ -n "$LATEST" ] && [ "$LATEST" != "$PINNED" ]; then
            if ! gh issue list --label upstream-release --search "$LATEST in:title" --json number -q '.[0]' | grep -q .; then
              NOTES=$(gh release view "$LATEST" --repo "${{ vars.UPSTREAM_REPO }}" --json body -q .body)
              gh issue create --title "Upstream release $LATEST (pinned: $PINNED)" \
                --label upstream-release --body "$NOTES"
            fi
          fi
```

Repository variables: `UPSTREAM_URL`, `UPSTREAM_REPO` (owner/name), `UPSTREAM_BRANCH`. The ruleset protects `main` only; `upstream` is unprotected so the job can force-update it. Your own tags use the `fs-` prefix so `--tags` never collides.

## 3. The upstream-watch agent lane

Trigger: an `upstream-release` issue appears, or the monthly Ops Session runs. Inputs: the mirror, `PINNED_TAG`, `PATCHES.md`, the upstream release notes, and `infra`'s deploy config for that tool.

What the agent does, as pull requests only:
1. **Digest.** Reads every release between `PINNED_TAG` and the latest; classifies items as security fix, bug fix, feature, breaking change, or new configuration flag; writes a one-page digest into the issue.
2. **Rebase PR on the mirror.** Creates a branch from the new upstream tag, replays the `[fs-patch]` commits, resolves conflicts, updates `PINNED_TAG`, runs upstream's test suite plus your CI, and opens a PR to `main` with the digest and a note per patch: still needed, upstreamed (drop it), or conflicting (explain).
3. **Config PR on `infra`.** Bumps the pinned tag or image, and for any new feature that is a configuration flag, proposes the flag with a rationale rather than code.
4. **Feature proposal, only when asked.** If you want a new upstream capability wired into the Shade or the deploy, the agent opens a separate PR with the smallest change and an entry in `PATCHES.md` if it is code, or an `infra` change if it is configuration.

Guardrails: no direct pushes to `main`; the verifier runs before review; Colton approves; a rebase that produces more than a handful of conflicts, or a patch series longer than about five commits, opens an ADR to decide between upstreaming harder, redesigning the patch, or accepting that this tool is a real fork.

Billing lanes: run this inside a Session on Claude Code or Kimi CLI on your subscriptions. If it is ever automated end to end, it runs through the platform runners on API keys via the gateway.

## 4. Contributing back

A mirror cannot open pull requests upstream. When a patch is upstreamable: fork the upstream publicly under the org (temporary), push the patch branch there, open the PR, and delete the fork after merge or rejection. The next rebase drops the patch once upstream carries it.

## 5. Licence note

Private modification of BSD, MIT, Apache, and MPL code is fine; obligations start at distribution or, for AGPL components, at offering the modified service to others. Proprietary `ee/` directories (Infisical, and any tool with a commercial tier) are never modified. `PATCHES.md` is also your licence ledger: it records exactly what you changed and where.

## 6. Which repos get mirrored now

| Mirror now | Why |
|---|---|
| `agentclientprotocol/claude-agent-acp` | Headless API-key mode may need a patch (runtime review) |
| `MoonshotAI/kimi-cli` | ACP forced-OAuth fix may need a patch (PR #2185) |
| `appwrite/mcp` | 2.0 API compatibility; mirrored as `mirror-appwrite-mcp`, pinned v0.10.11, no patches |
| `appwrite/appwrite` | Deployed as FB Console; mirrored as `mirror-fb-console`, pinned 2.1.0, carrying the ledgered FutureBuild rebrand patches (internal branding decisions, not for upstream) |
| `coollabsio/coolify` | Deployed as FB Deploy; mirrored as `mirror-fb-deploy`, pinned v4.3.21, rebrand patch series on the `fb/v4.3.21` deploy branch |
| `penpot/penpot` | Deployed in S1; MCP and tokens work may touch it |
| `louislam/uptime-kuma`, `cupcakearmy/autorestic` | Deployed in S0; archival mainly |
| `listmonk`, `postal`, `ntfy` | Also mirrored in the org; not deployed yet |

Later, when self-hosted: `Infisical/infisical`. Never: Buzz, Campfire, Plane, Omarchy (the Omarchy layer is your own `workstation` repo).

## 7. Setup command

```bash
# mirror.sh <upstream_owner/name> <short-name> <default-branch>
set -euo pipefail
ORG="${ORG:-FutureShade-Cloud-Ecosystem}"; UP="$1"; NAME="$2"; BR="${3:-main}"
gh repo create "$ORG/mirror-$NAME" --private --description "Private mirror of $UP with patch series on main" >/dev/null 2>&1 || true
git clone --mirror "https://github.com/$UP.git" "/tmp/$NAME.git"
( cd "/tmp/$NAME.git" && git push --mirror "git@github.com:$ORG/mirror-$NAME.git" )
git clone "git@github.com:$ORG/mirror-$NAME.git" "/tmp/$NAME" && cd "/tmp/$NAME"
git branch -f upstream "origin/$BR" && git push origin upstream
LATEST=$(git describe --tags --abbrev=0 "origin/$BR" 2>/dev/null || echo "$BR")
echo "$LATEST" > PINNED_TAG
printf '# Patches on main\n\nNone yet. Format: title | reason | ADR or issue | upstream PR or why not\n' > PATCHES.md
git add PINNED_TAG PATCHES.md && git commit -s -m "chore: pin $LATEST, start patch ledger" && git push origin HEAD:"$BR"
gh variable set UPSTREAM_URL --repo "$ORG/mirror-$NAME" --body "https://github.com/$UP.git"
gh variable set UPSTREAM_REPO --repo "$ORG/mirror-$NAME" --body "$UP"
gh variable set UPSTREAM_BRANCH --repo "$ORG/mirror-$NAME" --body "$BR"
echo "now add .github/workflows/upstream-sync.yml and the main ruleset"
```

If the upstream default branch is not `main`, pass it as the third argument; `main` in this doc means "your deploy branch," which will be that branch name on the mirror.

## 8. Changes to the bootstrap runbook

- Section 3 "Tier A forks" is replaced by the mirror list in Section 6; the `gh repo fork` loop is removed.
- The optional Tier B becomes the standard: every deployed upstream is mirrored with `mirror.sh`.
- The fork policy in ADR-004 v1 stands with one amendment: patches live on a mirror's `main` with a `PATCHES.md` entry; public forks are pull-request vehicles only.
