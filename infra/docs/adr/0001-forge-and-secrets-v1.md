# ADR-0001: Forge and secrets v1

**Status:** Accepted
**Deciders:** Colton

## Context

FutureBuild Cloud needs a forge (git hosting, code review, CI, a container
registry, and an automation actor) and a secrets store before any of the
platform Sessions can start. Both were originally planned as self-hosted
services: Forgejo for the forge and Infisical under Coolify for secrets. Both
are also the kind of service whose operational cost lands before any of the
value does, and both would add a lane to the foundations Session at the moment
when the estate has the least capacity to run it.

The sovereignty framing of the project makes the trade explicit rather than
implicit: a managed dependency is acceptable when the architecture around it
stays identical to the self-hosted shape and the exit is written down before the
dependency is taken. Two further constraints apply. Upstream software that the
platform deploys must remain patchable without becoming a fork nobody can
rebase. And the repositories are being created before the FutureShade
organisation exists as its own account, so the account that holds them today is
not the account that will hold them at launch.

## Decision

Accept two managed services for v1 (a forge and a secrets store), each with a
written exit path, and adopt the private mirror model for every upstream the
platform runs. Record the transfer plan that moves the repositories to the
FutureShade organisation without any repository encoding the account that holds
them today.

### 1. Forge: GitHub for v1, Forgejo as the exit path

- Organisation `futureshade`, holding the first-party repositories (`template`,
  `futureshade-core`, `futureshade-agents`, `statecharts`, `api`, `app`,
  `tauri`, `infra`, `workstation`, `.github`), the product and implementation
  repositories, and the mirrors.
- Organisation settings: two-factor authentication required for all members,
  default repository permission read, repository creation restricted to owners,
  forking of private repositories disabled, and web commit sign-off required so
  the DCO applies to browser commits as well as local ones. Actions are limited
  to GitHub owned and verified creators plus the Infisical secrets action.
- Rulesets on the default branch of every first-party repository: pull requests
  required, the status check named `ci` required and strict, linear history, no
  force pushes, no branch deletion, and review threads resolved before merge.
  The required approving review count stays at zero until a second reviewer is
  active on a repository; the `ci` check and the verifier report are the gate in
  the meantime. The status check context must match the job name in the
  workflow, so the job is literally named `ci` in every repository.
- The dispatch actor is a GitHub App installed on the organisation (contents
  write, pull requests write, checks read, metadata read), never a personal
  access token. Installation tokens are short lived and scoped to the
  organisation.
- Images go to the organisation's container registry on the same forge; Coolify
  pulls with a read only token. A self-hosted Actions runner on the workstation
  takes the heavy jobs; hosted runners take the rest. Appwrite Sites and Coolify
  use their native integrations with this forge. Dependabot is on, and secret
  scanning is on where the plan allows it.
- Exit path: Forgejo is git plus a compatible Actions dialect. The forge client
  in `futureshade-agents` is an interface with this forge as its first
  implementation, and both the Sites and the Coolify integrations speak the Gitea
  API that Forgejo serves. Migration is a mirror push, a cutover of remotes, and
  a swap of the GitHub App for a Forgejo token. It is an option in the
  convergence Session, not a commitment.

### 2. Secrets: Infisical Cloud for v1, self-hosted as the exit path

- One project named `futureshade` with environments `dev`, `staging`, and
  `prod`, and one folder per consumer: `/infra`, `/appwrite`, `/core`,
  `/agents`, `/gateway`, `/runners`, `/workstation`, `/ci`. Names are
  `UPPER_SNAKE`, prefixed by consumer where a name would otherwise be ambiguous.
- One machine identity per consumer, each scoped to its own folders: CI
  authenticates by OIDC with the subject restricted to the organisation's
  repositories, so no long lived token is stored in the forge; the workstation,
  Coolify, the engine, the agent tier, and each runner host use universal auth.
  Humans use the CLI login with short lived tokens. The workstation identity is
  rotated when the workstation operating system is replaced.
- Secrets reach processes only as environment at spawn. The workstation runs the
  Infisical agent and starts every local process through `infisical run`. No
  `.env` file is committed anywhere, no secret value is ever written into this
  repository, a tracker, a pull request, a log, or a transcript, and no agent
  runner holds a secret reading tool.
- The data region is chosen deliberately and written down, because the CLI and
  the actions need the matching domain. Audit logs are enabled.
- Exit path: Infisical exports and imports across instances, and because paths,
  environments, and identity names are identical to what a self-hosted instance
  would use, moving to an instance under Coolify is a re-point of one URL per
  consumer plus re-issued identities. It is an option in the convergence
  Session.

### 3. The mirror model for upstreams

Every upstream the platform deploys or may need to patch becomes a private
repository named `mirror-<name>` in the organisation, created by
`scripts/mirror.sh`:

- `origin` is the private mirror and `upstream` is the public repository.
- The branch `upstream` is a pristine copy of the upstream default branch,
  force updated by the scheduled `upstream-sync` workflow
  (`scripts/upstream-sync.yml` is the template). No human and no agent ever
  commits to it.
- The branch `main` is the deploy branch: the pinned upstream tag recorded in
  `PINNED_TAG` plus a short series of patch commits prefixed `[fs-patch]`. It is
  protected by the ruleset and takes pull requests only.
- `PATCHES.md` holds one entry per patch (title, reason, ADR or issue, upstream
  pull request or why it cannot be upstreamed) and doubles as the licence
  ledger. No entry, no patch. Directories under a proprietary licence, `ee/`
  among them, are never modified.
- When the sync workflow sees a newer upstream release it opens an
  `upstream-release` issue carrying the release notes. The upstream watch lane
  turns that issue into a digest, a rebase pull request on the mirror that
  replays the patch series onto the new tag, and a separate configuration pull
  request on this repository for flags and image tags. Deploy configuration
  lives here; the mirror holds code only.
- Upstream tags are mirrored as they are; releases of the patched branch are
  tagged with the `fs-` prefix so the two never collide.
- A patch series that grows past a handful of commits, or a rebase that fights
  back, opens an ADR to choose between upstreaming harder, redesigning the
  patch, and accepting that the tool is a real fork. A mirror never opens
  upstream pull requests: a public fork is created as a transient pull request
  vehicle and deleted after the pull request is merged or rejected.
- Mirrored now: the Claude agent ACP adapter, the Kimi CLI, the Appwrite MCP
  server, Appwrite, Coolify, Penpot, Uptime Kuma, and Autorestic. Infisical
  joins the list if and when it is self-hosted. Buzz, Campfire, Plane, and
  Omarchy are reference only and are never mirrored.

### 4. Transfer plan to a FutureShade organisation

The repositories are created under the organisation `futureshade` owned by the
founder's existing account, and they transfer to the FutureShade organisation
account when it exists. To keep that transfer a settings change rather than a
migration, nothing in a repository encodes the owning account:

- Remotes are referred to as `origin`; no script, workflow, or document hard
  codes a clone URL under the current owner.
- Scripts take the organisation from the environment (`ORG="${ORG:-futureshade}"`)
  so the same script serves before and after the transfer.
- Workflows use the forge's own context (`github.repository` and the automatic
  token) rather than a written out owner.
- `CODEOWNERS` is the one file that names an owner. It is updated in the same
  pull request that follows the transfer, together with any team names the
  rulesets reference.
- Transfer keeps issues, pull requests, releases, and the git history, and the
  forge redirects the old paths, so the ordering is: transfer the repositories,
  update `CODEOWNERS` and team references, re-point the Coolify and Sites
  integrations and the GitHub App installation, re-issue the CI machine identity
  in the secrets store because its OIDC subject changes, then re-point the
  workstation and runner remotes.

## Consequences

- Two managed dependencies are accepted and belong in the sovereignty ledger
  alongside the Tailscale control plane, each with the exit path written above.
- The foundations Session loses two lanes: no forge to install and no secrets
  store to install. The convergence Session gains two optional ones.
- Both services hold data that matters: the forge holds the code and the
  decision history, and the secrets store holds the credentials for the whole
  estate. The mirror model covers the first (every dependency also exists as a
  private copy, and the first-party repositories are cloned on the workstation),
  and an export of the secrets store in the backup set covers the second.
- The `ci` job name is now load bearing across every repository, because the
  rulesets reference it as a status check context. Renaming that job in a
  repository blocks every merge in it until the ruleset is updated.
- The transfer plan constrains what may be written: a clone URL or an owner name
  pasted into a script or a workflow turns a settings change back into a
  migration.

## Alternatives considered

- **Self-hosted Forgejo now.** It is the eventual shape and it removes the
  dependency, but it adds a service to operate, a runner topology to build, and
  a registry to secure before there is anything to host in it. Deferred to the
  convergence Session with the interface in place so the swap stays small.
- **Self-hosted Infisical now.** Same reasoning, with the additional risk that
  the secrets store is the one service whose outage blocks everything else,
  including its own recovery. The managed instance is the safer place to start,
  and the identical layout keeps the move cheap.
- **Forks instead of mirrors.** A fork cannot survive its upstream going
  private, it carries the upstream's fork network, and it invites unrecorded
  drift. The mirror plus patch ledger keeps the same ability to patch while
  making every deviation visible and rebasable.
- **Creating the repositories directly under a new organisation account.**
  Rejected for now because the organisation account does not exist yet and
  waiting for it would block the foundations Session. The transfer plan above is
  the price of that choice.
