# Bootstrap: GitHub Org, Repos, and Infisical Cloud

A pre-S0 mini-Session. Runs on the current Ubuntu workstation in about an hour; nothing here depends on the OS swap. Two steps are manual (org creation on both services); the rest is `gh` and `infisical` CLI, safe to hand to a Claude Code or Kimi session as a lane.

Assumptions to confirm before running: org name `futureshade` (fallbacks below), repos private by default until S9 with the intent to open them under Apache-2.0, one Infisical project with folders per app.

---

## 1. Manual: create the GitHub organization (10 minutes)

1. Signed in as `futurebuildai`, create a new organization on the Free plan. Name: `futureshade`. If taken, use `futureshade-ai` or `futureshadehq`; never a hyphenated version of a name you will want on packages later.
2. Organization settings, done once in the UI because the API cannot: require two-factor authentication for all members; set the default repository permission to Read; disallow members creating repositories; disable forking of private repositories; enable "web commit signoff required" (DCO instead of a CLA).
3. Actions: allow actions from GitHub and verified creators only (the script also sets this).
4. Add `grant` later as a member of the `operators` team; do not add anyone as an owner yet.

## 2. Manual: create the Infisical Cloud organization (5 minutes)

1. Sign up at Infisical Cloud with the `futurebuildai` identity; pick the data region deliberately (US or EU) and write it down, since the CLI needs the matching domain.
2. Enable audit logs in the organization settings if the plan offers them.
3. Create one project named `futureshade` with environments `dev`, `staging`, `prod` (rename the defaults if needed).

---

## 3. Script: GitHub org configuration, repos, forks, mirrors

Prerequisites on the workstation: `gh` (GitHub CLI) authenticated with `gh auth login` as `futurebuildai` with the `admin:org`, `repo`, `workflow`, and `write:packages` scopes; `git`; `jq`.

```bash
#!/usr/bin/env bash
# bootstrap-github.sh
set -euo pipefail
ORG="${ORG:-futureshade}"

echo "== org settings"
gh api -X PATCH "/orgs/$ORG" \
  -f default_repository_permission=read \
  -F members_can_create_repositories=false \
  -F members_can_create_public_repositories=false \
  -F members_can_fork_private_repositories=false \
  -F web_commit_signoff_required=true

echo "== actions: GitHub-owned and verified actions only, plus Infisical"
gh api -X PUT "/orgs/$ORG/actions/permissions" \
  -f enabled_repositories=all -f allowed_actions=selected
gh api -X PUT "/orgs/$ORG/actions/permissions/selected-actions" \
  -F github_owned_allowed=true -F verified_allowed=true \
  -f 'patterns_allowed[]=Infisical/secrets-action@*'

echo "== teams"
gh api -X POST "/orgs/$ORG/teams" -f name=operators -f privacy=closed >/dev/null || true

echo "== template repo"
gh repo create "$ORG/template" --private --template=false \
  --description "FutureShade repository template: AGENTS.md, CI skeleton, DCO, Dependabot" \
  --add-readme --license apache-2.0 >/dev/null 2>&1 || true
# mark as template after first push of skeleton files (see section 4)
gh api -X PATCH "/repos/$ORG/template" -F is_template=true >/dev/null

echo "== first-party repos"
declare -A REPOS=(
  [futureshade-core]="Go engine: chat, realtime, agent seats, orgs, operator API"
  [futureshade-agents]="Bun agent tier: XState actors, native connector, runtime layer"
  [statecharts]="Runtime-agnostic XState-style statechart definitions and model-based tests"
  [api]="OpenAPI specification and generated TypeScript client types"
  [app]="Lit plus Ionic client with Zag interaction state; PWA and Tauri bundle"
  [tauri]="Tauri 2 desktop and mobile shell"
  [infra]="IaC, Coolify and Appwrite configs, docs/adr, docs/sessions, runbooks"
  [workstation]="Workstation layer: Omarchy or Ubuntu bootstrap, session runner, hooks, personas"
)
for r in "${!REPOS[@]}"; do
  gh repo create "$ORG/$r" --private --template "$ORG/template" \
    --description "${REPOS[$r]}" >/dev/null 2>&1 || echo "exists: $r"
done

echo "== org profile repo"
gh repo create "$ORG/.github" --private --add-readme \
  --description "Org profile and reusable workflows" >/dev/null 2>&1 || true

echo "== Tier A forks (patches plausible; keep PR-able)"
for up in agentclientprotocol/claude-agent-acp MoonshotAI/kimi-cli appwrite/mcp; do
  gh repo fork "$up" --org "$ORG" --clone=false --default-branch-only || true
done

echo "== rulesets on main for first-party repos"
cat > /tmp/ruleset.json <<'JSON'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "ci" } ] } }
  ],
  "bypass_actors": [ { "actor_id": 1, "actor_type": "OrganizationAdmin", "bypass_mode": "always" } ]
}
JSON
for r in "${!REPOS[@]}"; do
  gh api -X POST "/repos/$ORG/$r/rulesets" --input /tmp/ruleset.json >/dev/null 2>&1 || echo "ruleset exists or CI check not yet defined: $r"
done

echo "done"
```

Notes:
- `required_approving_review_count` is 0 on purpose: two humans plus agents cannot afford a hard one-approval rule yet; the required `ci` check and the verifier report are the gate. Raise it to 1 when Grant is active on a repo.
- The `ci` status context must match the job name in the CI workflow (section 4), otherwise the ruleset blocks every merge.
- Forks are for repos where a patch is plausible: the Claude ACP adapter (headless API-key mode), the Kimi CLI (ACP forced-OAuth fix), and the Appwrite MCP server (2.0 API compatibility). Each fork gets a `futureshade` branch only when an ADR says so; until then the fork tracks upstream.

### Optional Tier B: pinned mirrors (no patches, sovereignty copies)

Mirrors are plain repos, not forks, so they survive an upstream going private. One scheduled workflow keeps them current.

```bash
# mirror.sh <upstream_url> <name>
set -euo pipefail
ORG="${ORG:-futureshade}"; UP="$1"; NAME="$2"
gh repo create "$ORG/mirror-$NAME" --private --description "Pinned mirror of $UP (no patches)" >/dev/null 2>&1 || true
git clone --mirror "$UP" "/tmp/$NAME.git"
cd "/tmp/$NAME.git" && git push --mirror "git@github.com:$ORG/mirror-$NAME.git"
```

Candidates: `appwrite/appwrite`, `coollabsio/coolify`, `penpot/penpot`, `Infisical/infisical`, `louislam/uptime-kuma`, `cupcakearmy/autorestic`. Skip for now if scope matters; nothing in S0 through S4 depends on them.

Not forked or mirrored: `block/buzz`, `basecamp/once-campfire`, `makeplane/plane`, `basecamp/omarchy`. Reference only; the Omarchy layer lives in `workstation`.

---

## 4. Template repo skeleton

Push these into `futureshade/template` before creating the first-party repos (or re-run the create loop after).

```
AGENTS.md            # canonical agent instructions (read by Kimi, Codex, others)
CLAUDE.md            # single line: @AGENTS.md, plus Claude-only notes
LICENSE              # Apache-2.0
CODEOWNERS           # * @futurebuildai
.editorconfig
.github/CODEOWNERS
.github/dependabot.yml
.github/workflows/ci.yml
docs/adr/0000-template.md
```

`ci.yml` minimal, with a job literally named `ci` so the ruleset context resolves:

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
permissions: { contents: read, id-token: write }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Placeholder until the repo has a toolchain
        run: echo "ci ok"
```

`id-token: write` is there from day one so Infisical's OIDC auth works without a stored token (section 6).

`AGENTS.md` seed (short; each repo grows its own):

```
# Agent instructions
- Read docs/adr before changing architecture. New decisions get an ADR.
- Work only inside your assigned worktree. Never touch secrets paths or deploy scripts.
- No em dashes in any text you write, including code comments and docs.
- Commits are signed off (DCO). PRs must pass the `ci` check.
- Statecharts and OpenAPI are the spec; tests generated from them are the acceptance criteria.
```

---

## 5. Infisical Cloud project layout

One project `futureshade`, three environments, folders per consumer:

| Folder | Holds |
|---|---|
| `/infra` | DigitalOcean token, Tailscale auth keys, Coolify API token, DNS provider token, restic repository and password |
| `/appwrite` | Appwrite API keys per purpose (server, MCP, CI), Messaging provider credentials, SMTP |
| `/core` | Engine database URLs per org, JWKS URL, service tokens |
| `/agents` | Engine service token, Appwrite server SDK key, gateway admin key |
| `/gateway` | Provider API keys (Anthropic, Moonshot, Google, OpenAI), virtual-key policy |
| `/runners` | Per-host gateway virtual keys, forge App credentials |
| `/workstation` | Local mirror credentials only; never prod paths |
| `/ci` | Registry token, deploy hooks |

Naming: `UPPER_SNAKE`, prefixed by consumer where ambiguity is possible (`CORE_DB_URL_GABLE`). No secret is ever committed, echoed in CI logs, or pasted into chat.

### Machine identities (Organization, Access Control)

| Identity | Auth method | Scope |
|---|---|---|
| `github-actions` | OIDC auth, issuer `https://token.actions.githubusercontent.com`, subject restricted to `repo:futureshade/*` | `/ci`, `/appwrite` read for deploy jobs |
| `workstation` | Universal auth (client id and secret stored only on the workstation) | `dev` environment, all folders except `/gateway` prod |
| `coolify` | Universal auth | `staging` and `prod`, `/infra`, `/core`, `/agents` |
| `engine` and `agents` | Universal auth, one each | Their own folders, `prod` |
| `runner-workstation`, `runner-sandbox` | Universal auth, one per host | `/runners` |

Rotate the workstation identity when the OS is swapped.

---

## 6. Script: Infisical CLI setup on the workstation

```bash
#!/usr/bin/env bash
# bootstrap-infisical.sh
set -euo pipefail
# Ubuntu install (Arch later: AUR package infisical-bin)
if ! command -v infisical >/dev/null; then
  curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | sudo -E bash
  sudo apt-get install -y infisical
fi

infisical login            # choose the Cloud domain matching your region
# in each first-party repo checkout:
#   infisical init         # links the repo to project futureshade, env dev
# seed a few dev values (examples)
infisical secrets set --env=dev --path=/workstation MIRROR_PG_URL="postgres://..." 
infisical secrets set --env=dev --path=/infra RESTIC_REPOSITORY="s3:..." 
# run anything with secrets injected, never from .env files
infisical run --env=dev --path=/infra -- ./scripts/plan.sh
```

GitHub Actions usage pattern (goes into the real CI later):

```yaml
- uses: Infisical/secrets-action@v1
  with:
    method: oidc
    identity-id: ${{ vars.INFISICAL_IDENTITY_ID }}
    domain: https://app.infisical.com        # or the EU domain
    env-slug: dev
    project-slug: futureshade
    secret-path: /ci
```

---

## 7. Order of operations for the mini-Session

1. Manual org creation on GitHub and Infisical (sections 1 and 2).
2. Run `bootstrap-github.sh` once; push the template skeleton; re-run the repo loop if repos were created before the template existed.
3. Create the Infisical machine identities in the UI; store the workstation identity's credentials with the Infisical agent on the workstation.
4. Run `bootstrap-infisical.sh`; `infisical init` in each first-party repo.
5. Commit `docs/adr/0001-forge-and-secrets-v1.md` into `infra` recording: GitHub org `futureshade` for v1 with Forgejo as the exit path; Infisical Cloud for v1 with self-hosted as the exit path; fork tiers and the no-patch rule.
6. Open the Plane cycle `S0 Foundations` and log this mini-Session as complete with links.

Exit test: `gh repo list futureshade` shows the first-party repos, the template, and the three forks; a throwaway workflow in `infra` fetches a secret from `/ci` via OIDC and prints only its length; `infisical run` on the workstation injects a dev secret into a local process.
