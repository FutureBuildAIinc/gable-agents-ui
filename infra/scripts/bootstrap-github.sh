#!/usr/bin/env bash
# bootstrap-github.sh
#
# Copied from docs/bootstrap-github-infisical.md with one change: the Tier A
# "gh repo fork" loop is removed, because docs/private-mirrors-with-patches.md
# replaces the Tier A and Tier B split with the mirror model. Mirrors are
# created by scripts/mirror.sh, not here.
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

# Upstreams are not forked here. Every upstream the platform deploys or may
# patch becomes a private mirror with a patch series on its own branch, created
# by scripts/mirror.sh one at a time. The list of what gets mirrored, and what
# is reference only, is in docs/private-mirrors-with-patches.md. Public forks
# exist transiently, as vehicles for upstream pull requests, and are deleted
# after the pull request is merged or rejected.

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
