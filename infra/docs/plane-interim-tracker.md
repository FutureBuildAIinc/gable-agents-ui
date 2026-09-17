# Plane as the Interim Tracker (S0 to S4)

Decision: the existing self-hosted Plane is the interim tracker and the source of truth for work status until the Shade's planning module lands in S4. Three sources of truth, kept separate on purpose:

| Source of truth for | Lives in | Why |
|---|---|---|
| What we are doing and where it stands (Sessions, lanes, exit tests, verifications) | Plane | Already running; cycles match Sessions; the supervisor workflows already use it |
| Decisions (ADRs) and architecture documents | Git, in `futureshade-infra/docs` on GitHub, mirrored to the Claude project knowledge | Sessions in Claude Code read the repo, not the tracker; a tracker is transient, git is not |
| Specs that agents act on, once the Shade exists | Appwrite TablesDB (from S4) | The Shade is the interaction layer; Plane never becomes the agents' spec store |

## Structure in Plane

- One workspace, one project: `FutureShade`.
- One cycle per Session (S0 through S11) with the Session's dates; modules only if a Session needs sub-grouping.
- One issue per lane, titled `S3.4 Client: rooms, composer, threads`; the lane's scope pasted in; the integrator and verifier as two standing issues per cycle.
- Exit test as a checklist on a pinned issue per cycle; the cycle closes only when every box is ticked and Colton signs off in a comment.
- A standing `Verifications` module holding the carried items (external Postgres host, OAuth2 server and Team claims, Claude adapter API-key mode, Kimi ACP key handling, S3 API arrival, SSO tiers, GPU test), each linked to the Session that resolves it.
- Labels: `lane`, `verification`, `blocker`, `human-checkpoint`, plus one per component (`engine`, `agents`, `client`, `infra`, `appwrite`, `design`).
- States: Backlog, Briefed, In Swarm, In QA, Signed Off, Dropped.
- Pages: Session briefs and as-built notes as Plane pages for reading; the canonical copy is committed to `futureshade-infra/docs/sessions/` in the same Session.

## Agent access

- Plane's REST API with a scoped token for the Cowork supervisor and for Claude Code Sessions (create lane issues, move states, post as-built comments). Plane publishes an MCP server; verify it against the self-hosted version before relying on it, otherwise the REST API through a small script is enough.
- No secrets in Plane, ever. Links to Infisical paths, never values.

## Operations during the interim

- Add Plane to Uptime Kuma and the Autorestic set in S0 wherever it currently runs. Moving it under Coolify is optional; do it only if the current host is going away.
- Local accounts are fine for two people. Forward-auth through Appwrite is a nice-to-have after S2, not a requirement.
- Pin the Plane version; upgrade only in an Ops Session.

## Cutover to the Shade (S4)

- S4 lane 4 gains an import step: Plane cycles to Shade cycles, issues to tasks, pinned exit-test issues to spec-like records, pages to ADR records where they are decisions and to docs otherwise. Keep Plane IDs on the imported rows for traceability.
- After the import passes a side-by-side check, Plane becomes read-only for FutureShade work. It can stay alive for anything outside the Shade (Hardscape House prelaunch tracking, for example) until S11 or until its host is retired.
- Tripwire: if Plane is still the place people look for FutureShade status two Sessions after S4, the planning module missed its mark; fix the module rather than reviving Plane.

## Session plan deltas

| Change | Where |
|---|---|
| Plane registered in monitoring and backups | S0 lane 5 |
| Session briefs and as-built notes committed to `futureshade-infra/docs/sessions/` and mirrored as Plane pages | C0 outputs |
| ADRs live in `futureshade-infra/docs/adr/` from S0; the project knowledge holds copies | C0, README precedence |
| S4 lane 4: TablesDB planning schema plus the Plane import and cutover | S4 |
| Verification table items tracked in the Plane `Verifications` module until S4, then in the Shade | C3 |
| README standing decision added: "Plane is the interim tracker and status source of truth until S4; git holds decisions; TablesDB holds specs from S4" | Project README Section 2 |
