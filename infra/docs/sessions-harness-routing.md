# Sessions: Harness Routing (Claude Code or Kimi Code CLI)

Amends Part C0 of `futureshade-e2e-stack-and-sessions.md`. Fable in Cowork stays the project core: briefs, ADRs, reviews, as-built sign-off. The swarm that executes a Session runs on Claude Code or on the Kimi Code CLI depending on available quota, and the plan is written so that switch costs nothing.

---

## 1. What each harness gives you (verified September 2026)

| Capability | Claude Code | Kimi Code CLI |
|---|---|---|
| Parallel work | Subagents; one process per worktree | `/swarm <task>` runs multiple agents on one objective in parallel with rate-limit-aware retries; subagent and AgentSwarm tools; experimental Tower mode coordinates multiple agents toward an objective from a base branch; subagent fork from a conversation snapshot |
| Long autonomy | Interactive and headless runs | `/goal <objective>` works across turns until done or at a decision point; `/goal next` queues follow-ups; Ctrl+B backgrounds tasks; `/tasks` panel |
| Instructions | `CLAUDE.md` with `@file` imports | `AGENTS.md` style project files, `SYSTEM.md` to override the main agent prompt, `--agent-file` for personas |
| Guardrails | Permission modes, hooks | Hooks (PreToolUse), `[tools]` enable and disable in `config.toml`, `/yolo` and `/auto` modes |
| Quota visibility | Usage view | `/usage` in-session |
| Context | Large | Up to 1M across membership tiers on K3 |
| Ecosystem | Skills, MCP, plugins | Skills, MCP, plugins marketplace, `/fork`, `/export-md`, `/sessions` |
| Billing for interactive use | Claude subscription (sanctioned surface) | Kimi Code membership (sanctioned surface); swarm tasks consume several times a normal task's credit |

Both are legitimate interactive surfaces on their own subscriptions. Neither is used by the platform's runners, which stay on API keys through the gateway.

---

## 2. Routing rules

1. **Fable is fixed.** Cowork prepares the brief, reviews the as-built, and signs off. Harness choice never changes that.
2. **Choose per Session by quota, per lane when mixing.** Before a Session starts, check Claude usage and `/usage` in Kimi. Record the choice in the brief: `harness: claude | kimi | mixed`.
3. **Critical roles go to the strongest available model.** The integrator (merges lanes into the QA branch) and the verifier (runs exit tests and model-based tests, reviews the diff) run on Claude Code when quota allows. If a Session runs entirely on Kimi, Colton reviews the verifier's report before merge rather than after.
4. **Security-critical lanes prefer Claude.** Identity and OIDC wiring, permission policy, secrets handling, the statechart package, engine auth. Breadth lanes (client components, docs, tests, infra scripts, seed data, runbooks) are fine on Kimi K3 when Claude quota is low.
5. **Partition, do not duplicate.** Sessions want one agent per lane in its own worktree. Kimi's `/swarm` puts many agents on the same objective, which is right for review fan-out, research, and test generation, not for lane work. For lanes on Kimi, run one `kimi` process per worktree (or Tower mode with the Session's base branch once it leaves experimental), and reserve `/swarm` for the verifier's parallel review and for exploratory lanes.
6. **The gate does not move.** Acceptance is CI plus the model-based tests plus the exit test checklist. A lane built on Kimi passes or fails the same gate as one built on Claude.
7. **Mixed Sessions are normal.** Lanes are isolated, so a Session can run two lanes on Claude and three on Kimi and integrate on Claude.

---

## 3. Mechanics that make the switch free

- **One instruction source.** `AGENTS.md` is canonical in every repo; `CLAUDE.md` contains a single `@AGENTS.md` import plus Claude-only notes. Lane personas live in `docs/sessions/personas/` as plain Markdown that either harness can load (`--agent-file` in Kimi; a subagent definition in Claude).
- **A `session` runner in `futureshade-workstation`.** `session start <brief> --harness claude|kimi|mixed` reads the brief, creates one worktree per lane, launches the chosen CLI per lane with the lane prompt, tracks state in a `session.json`, then runs the integrator and verifier steps. Per-worker isolated home directories for Kimi processes so concurrent runs do not share state; UTF-8 environment set explicitly.
- **Guardrails identical on both.** A deny-by-default hook set: writes only inside the lane's worktree, no secrets paths, no force push, no package publishing; the same policy expressed as Claude hooks and Kimi PreToolUse hooks, checked into the repo.
- **Quota ledger.** Each lane records harness, model, thinking level, and rough token or credit use in its as-built note. Over a few Sessions this tells you where Kimi is good enough and where it is not, so routing improves from evidence rather than habit.
- **Brief format unchanged**, one field added: `harness` (Session default) and an optional per-lane `harness` override.

---

## 4. Kimi-specific settings for Sessions

- Thinking level `max` for integrator and verifier work if run on Kimi; `high` for breadth lanes; never `off` for anything that touches the engine.
- `/goal` for long lanes with clear exit criteria; `/tasks` to background builds and tests.
- Independent AgentSwarm timeout set in `config.toml` so a fan-out cannot run unbounded; a finite wall-clock budget on every swarm review.
- `[tools]` table used to disable anything a lane should never touch (deploy scripts, secrets CLIs).
- `/usage` checked at Session start and before the verifier step.

---

## 5. Deltas to the plan

| Change | Where |
|---|---|
| C0 "Swarm" paragraph: Claude Code or Kimi Code CLI, chosen by quota; Fable fixed as supervisor | Master plan Part C0 |
| S0 workstation lane: `session` runner, `AGENTS.md` and `CLAUDE.md` convention, shared hook policy, isolated Kimi homes | S0 lane 6 |
| Brief template: `harness` field and per-lane override; as-built note: quota ledger | C0 outputs |
| README standing decision: "Sessions run on Claude Code or Kimi Code CLI by quota; integrator and verifier prefer Claude; the acceptance gate is harness-independent" | Project README Section 2 |
