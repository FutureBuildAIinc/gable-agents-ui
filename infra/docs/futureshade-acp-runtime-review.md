# FutureShade Runtime Layer: ACP Runtimes, Auth, and Implementation Review

Research date: 2026-09-12. Scope: which agent runtimes speak the Agent Client Protocol (ACP), how each authenticates its inference backend, which paths are legitimate for an automated server-side platform, and what the Bun agent tier must implement to drive them. Feeds Section 7 of `futureshade-greenfield-plan-v2.md`.

---

## 1. Summary and recommendations

1. **Standardise the runner interface on ACP.** Every runner you named (Claude Code, Kimi Code, Kilo Code, Pi) has an ACP entry point, and the ACP registry verifies each one's handshake in CI. Goose, Gemini CLI, Codex, and OpenCode are also there if you want them later. Hermes has an ACP server mode but is not in the registry.
2. **Headless auth is the `env_var` pattern: API keys injected at spawn.** ACP's `agent` and `terminal` auth methods exist for humans in IDEs (browser OAuth, interactive TUI). A server pipeline never performs them. The Bun tier injects provider keys from Infisical into the runner process environment and treats any `auth_required` error as a job failure plus an operator alert, never as a login prompt.
3. **Three billing models, handle each on its own terms.**
   - Anthropic: API keys from the Console, no exceptions. Subscription OAuth is prohibited outside Claude Code and Claude.ai and enforcement started in April 2026.
   - Moonshot: Kimi Code membership API keys are explicitly sanctioned for third-party tools and carry a membership quota. This is the one place your "subscription-based rate limiting" idea is officially supported. Pay-as-you-go Moonshot Platform keys are the fallback.
   - Nous Portal (via Hermes): a subscription gateway over 300+ models, reachable through `hermes acp` or its subscription proxy. Viable as an optional harness, but verify plan terms for automated use before relying on it. Its built-in Anthropic-OAuth path is out.
4. **Put a self-hosted LLM gateway between runners and providers.** One virtual key per org and runner, spend caps and model allowlists enforced at the gateway, OpenAI- and Anthropic-shaped endpoints so every runner can point at it. Budgets are then enforced twice: pre-dispatch in the Bun tier and at the wire in the gateway.
5. **One container per job, ACP over the container's stdio.** Repo checked out inside, provider keys as env, no credential files mounted. The Bun tier is the ACP Client and owns the permission policy.
6. **Two spikes before committing:** verify `claude-agent-acp` runs headless on an API key in its current release (an open issue reports API-key mode failing in some setups), and verify `kimi acp` honours a configured API key without forcing OAuth (an open PR fixes exactly that). Both have clean fallbacks listed in Section 5.

---

## 2. ACP essentials for a headless client

The Bun agent tier is an ACP Client. Agents are subprocesses speaking newline-delimited JSON-RPC over stdio.

### Handshake

- `initialize`: negotiate `protocolVersion` (integer major version; v1 is stable, v2 is a draft) and capabilities. The Agent responds with its capabilities and, optionally, `authMethods`.
- `authMethods` types:
  - `agent`: the agent runs its own OAuth flow (local HTTP callback, opens a browser). Human-only.
  - `terminal`: the client launches the agent with setup args for an interactive TUI login. Human-only; requires the client to opt in via `capabilities.auth.terminal`.
  - `env_var`: the agent reads a key from an environment variable. No client capability needed. This is the server path.
- v1 method names: `authenticate` and `logout`. v2 draft: `auth/login` and `auth/logout`. Only call them if the agent advertised `authMethods`.
- The registry only lists agents that support `agent` or `terminal` auth, so registry presence tells you an agent works in an IDE, not that it is headless-friendly. Test `env_var` behaviour per runner.

### Sessions

- `session/new` with `cwd` and an optional `mcpServers` list (stdio or HTTP MCP servers the agent should connect to). This is how the platform hands the runner its own tools.
- `session/load` and `session/resume` exist for reconnecting to prior sessions where the agent supports them.
- `session/cancel` is a notification; the agent must still finish the turn with a `cancelled` stop reason.

### Prompt turn

- v1: `session/prompt` blocks until the turn ends and returns `stopReason` (`end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`). Updates stream as `session/update` notifications during the request.
- v2 draft: `session/prompt` returns immediately; the agent reports `state_update` transitions (`running`, `requires_action`, `idle` with the stop reason) and may send updates at any time, including before a prompt. Queued messages and agent-initiated updates come with this.
- `session/update` kinds to map: `agent_message_chunk`, `tool_call`, `tool_call_update` (with status and content), `tool_call_content_chunk`, `plan`, `usage_update` (token counts and optional cost in ISO currency), and in v2 `state_update` and `user_message`.
- `session/request_permission`: an agent-to-client request before sensitive tool calls. The client must answer; a headless client answers from policy.
- Extensions ride in `_meta`. The Claude adapter documents several (goal, session failure, recommended config values, permission presentation).

### SDKs and reference clients

- TypeScript: `@agentclientprotocol/sdk`. v1 is the stable entry point; v2 is `@agentclientprotocol/sdk/experimental/v2` and may change between releases. Fluent `client({ name })` API with `requestPermission` and `sessionUpdate` handlers; the older `ClientSideConnection` class is deprecated.
- Go: `github.com/coder/acp-go-sdk` (community, by Coder) implements a full client side including `Authenticate`, `NewSession`, `LoadSession`, `Prompt`, `Cancel`. This is the natural target for the later Go port.
- Python and Rust: official SDKs exist under the agentclientprotocol org.
- Headless reference clients worth reading or reusing for spikes: `acpx` (openclaw) and `acp-cli` (Rust port). Both drive agents from a terminal with `--approve-all` style policies and JSON output.

---

## 3. Runtime matrix (registry-verified 2026-09-12 unless noted)

| Runtime | Registry id, version | License | Launch | Auth modes | Headless key path | Notes |
|---|---|---|---|---|---|---|
| Claude Agent (official adapter over the Claude Agent SDK) | `claude-acp` 0.76.0, `@agentclientprotocol/claude-agent-acp` | Apache-2.0 (repo) | `npx @agentclientprotocol/claude-agent-acp` | `/login` with API key, or Claude Code login where supported | `ANTHROPIC_API_KEY` | Co-authored by Anthropic, Zed, JetBrains. Full tool permissions, MCP servers, subagents, terminals. Open issue #744 (June 2026) reports API-key mode failing with only OAuth offered in some setups: verify in spike. |
| Kimi Code CLI | `kimi` 1.50.0 | MIT | `kimi acp` | `/login` with Kimi Code OAuth or Moonshot Platform API key; provider `api_key` in `~/.kimi/config.toml` | Kimi Code membership key or Moonshot key in config | Single binary, Python inside. PR #2185 (May 2026, open at time of research) fixes ACP mode forcing OAuth even when an API key is configured. Patchable; see Section 5. |
| Kilo | `kilo` 7.6.2, `@kilocode/cli` | MIT | `kilo acp` (stdio; also `--port` and `--hostname` for TCP) | `/connect` to add provider keys; Kilo Gateway account; env var overrides | Provider keys via env | 500+ models through Kilo Gateway or bring your own provider. `kilo mcp` manages MCP servers. TCP listener is convenient for containers. |
| pi ACP (community adapter for the pi coding agent) | `pi-acp` 0.0.33 | MIT | `npx pi-acp` | Configured inside pi | Provider keys in pi config | Early version number. Treat as experimental. |
| Hermes Agent | not in registry | open source | `hermes acp` (stdio) | `hermes login <provider>`; Nous Portal OAuth; provider keys in `~/.hermes/.env` | Nous Portal subscription or provider keys | Also exposes a subscription proxy (OpenAI-compatible endpoint that attaches Portal credentials). Anthropic entry uses Claude Max OAuth, which is a prohibited path. |
| goose (Block) | `goose` 1.50.0 | Apache-2.0 | `goose acp` | Provider keys | Provider keys via env | Same family as Buzz's harness. Good second opinion runner. |
| Gemini CLI | `gemini` 0.59.0 | Apache-2.0 | `gemini --acp` | Google login or `GEMINI_API_KEY` | API key | Interactive login is for Code Assist licences; automation should use the API key or Vertex. |
| Codex (official adapter) | `codex-acp` 1.11.0 | Apache-2.0 | `npx @agentclientprotocol/codex-acp` | ChatGPT login or OpenAI API key | API key | Co-authored by OpenAI, JetBrains, Zed. Use the API key for the platform. |
| OpenCode | `opencode` 1.18.30 | MIT | `opencode acp` | Provider keys | Provider keys via env | Removed Claude subscription auth after Anthropic's legal request; API keys only for Claude. Has had a v1 lifecycle bug (updates after the prompt response) worth checking if adopted. |

---

## 4. Auth and billing by provider: what is allowed for the platform

| Provider | Platform path | Status of the subscription path | Practical notes |
|---|---|---|---|
| Anthropic | Console API key, injected as `ANTHROPIC_API_KEY`; optionally routed through the gateway via `ANTHROPIC_BASE_URL` | Prohibited for third-party or automated use since April 2026. OAuth tokens are for Claude Code and Claude.ai only. | Your personal Max subscription stays on your interactive Claude Code. The platform never sees it. |
| Moonshot (Kimi) | Kimi Code membership API key (base URLs under `api.kimi.com/coding/`, OpenAI- and Anthropic-compatible), or Moonshot Platform key (`api.moonshot.ai`, pay-as-you-go) | Sanctioned. Kimi's docs state that third-party tools authenticate with a membership API key, with quota by tier. | Membership keys and platform keys are different products with different base URLs; do not mix them. Up to 5 membership keys per account, shown once on creation. |
| Kilo | Kilo Gateway account credentials (credits), or your own provider keys inside Kilo | Kilo Gateway is a paid gateway, not a subscription workaround | Env var overrides make it container-friendly. |
| Nous Portal | `hermes login nous` OAuth stored in `~/.hermes/auth.json`, then `hermes acp` or `hermes proxy start` | Nous' own subscription product; plans carry quotas | Requires a one-time browser login on the runner host and a stored refresh token. Confirm plan terms permit automated, multi-job use before making it a routing target. |
| Google | `GEMINI_API_KEY` or Vertex | Code Assist login is for interactive use | API key for the platform. |
| OpenAI | API key | ChatGPT login is for interactive Codex use | API key for the platform. |

Rule that follows: the platform holds exactly one class of credential per provider, an API key or gateway virtual key, stored in Infisical and injected at spawn. No OAuth token files, no `~/.claude`, no `~/.kimi` login state mounted into runner containers, with Nous Portal as the single documented exception if you adopt it.

---

## 5. Recommended implementation

### 5.1 Runner adapter interface (Bun tier)

```
interface Runner {
  id: string                                  // "claude", "kimi", "kilo", "goose", "hermes"
  spawn(job: Job): Promise<RunnerProcess>     // container + env + stdio
  initialize(): Promise<Capabilities>         // ACP initialize, record protocolVersion + authMethods
  newSession(cwd, mcpServers): Promise<SessionId>
  prompt(session, blocks): AsyncIterable<RunnerEvent>   // normalised across v1 and v2
  cancel(session): Promise<void>
  close(): Promise<void>
}
```

`RunnerEvent` is the normalised union the dispatch actor consumes: `text`, `plan`, `tool_call`, `tool_call_update`, `permission_request`, `usage`, `state`, `stopped(stopReason)`, `error`. Adapters translate protocol versions and per-agent quirks into this one shape so the statecharts never see ACP details.

### 5.2 Process model

- One container per job on the sandbox host. Image contains the runner binary, git, the product's toolchain, and nothing else. Repo cloned at start on the job's branch.
- The Bun tier attaches to the container's stdin and stdout through the Docker API and runs ACP over that stream. Kilo's TCP mode is an alternative if stdio attach proves awkward.
- Environment at spawn: provider or gateway key, `FUTURESHADE_JOB_ID`, forge token scoped to the one repo, and nothing that outlives the job.
- Hard limits per job: wall clock, max turn requests, max tokens, disk. Enforced by the container and by the dispatch actor.

### 5.3 Credential injection and the gateway

- Infisical is the only source of provider keys. The Bun tier fetches a short-lived gateway virtual key for `(org, runner)` and injects it.
- Gateway: a self-hosted LLM gateway such as LiteLLM in front of Anthropic, Moonshot, Google, and OpenAI. Virtual keys per org and runner, monthly spend caps, model allowlists, request logging. Runners point at it:
  - Claude Agent: `ANTHROPIC_BASE_URL` to the gateway, `ANTHROPIC_API_KEY` to the virtual key.
  - Kimi CLI: a custom provider block in `config.toml` with `base_url` at the gateway.
  - Kilo and goose: custom OpenAI- or Anthropic-compatible provider pointed at the gateway.
- Budgets are enforced pre-dispatch (Bun tier reads the org's remaining budget) and at the wire (gateway cap). The invoice can never be the first place a runaway job shows up.

### 5.4 Permission policy (the client side of `session/request_permission`)

- Allow: read and write inside the job's repo checkout, run the product's test and build commands, network to the gateway and the forge.
- Deny: writes outside the checkout, package publishing, force pushes, anything touching secrets paths.
- Escalate: destructive git operations and dependency additions become a `requires_action` card in the branch room for a reviewer. Timeout means deny and the job pauses.
- Log every decision to the audit table with the tool call id.

### 5.5 Platform tools via MCP

Pass a FutureShade MCP server in `session/new`'s `mcpServers` so the runner can act on the platform without shell hacks: `read_spec`, `post_status` (to the branch room), `request_review`, `open_pr`, `deploy_sandbox`, `report_blocker`. Same server for every runner, so behaviour is uniform across Claude, Kimi, and Kilo.

### 5.6 Event mapping to the engine

| ACP update | Engine event or state |
|---|---|
| `plan` | `agent_state.plan` on the branch room (drives the client's plan card) |
| `agent_message_chunk` | streamed into the job log; summarised into a message at turn end |
| `tool_call`, `tool_call_update` | job timeline entries; long-running ones surface as status cards |
| `usage_update` | `jobs.tokens_in`, `jobs.tokens_out`, `jobs.cost` (plus gateway logs as the source of truth) |
| `state_update` (v2) or turn boundaries (v1) | `dispatch` actor transitions |
| `stopReason` | `done`, `failed`, or `paused` with the reason recorded |

### 5.7 Health and readiness

- At runner registration and daily: spawn, `initialize`, record `protocolVersion`, capabilities, and `authMethods`, then `session/new` and a trivial prompt against the gateway. Fail loudly if `auth_required` appears; that means a key expired or an agent started forcing an interactive login.
- Pin runner versions in the image. The registry auto-bumps versions hourly; you do not want that in production.

### 5.8 Provider-specific implementation notes

- **Claude Agent adapter.** Spike headless API-key mode on the current release. If it insists on OAuth (issue #744), two fallbacks: pin the last release known to honour `ANTHROPIC_API_KEY`, or bypass the adapter and call the Claude Agent SDK directly from the Bun tier (it is TypeScript and API-key native). Keep the ACP event shape either way so the dispatch actor does not care.
- **Kimi CLI.** Spike `kimi acp` with an API-key provider configured and no OAuth login. If it forces OAuth, apply PR #2185's fix in a fork (two functions in `kimi_cli/acp/server.py`) or pre-authenticate the image with a membership key via the CLI's non-ACP path. Use Kimi Code membership keys for the quota model you wanted; keep a Moonshot Platform key as overflow.
- **Kilo.** Set provider credentials through environment overrides rather than the interactive `/connect`. Decide between Kilo Gateway (one bill, 500+ models) and BYO keys through your own gateway; the latter keeps spend control in your hands.
- **Hermes and Nous Portal.** Optional. The runner host needs a one-time `hermes login nous`; the refresh token then lives on that host. Treat it as a single-tenant runner until Nous confirms automated multi-job use is within plan terms. Do not configure its Anthropic provider.
- **Pi.** Experimental adapter at 0.0.x. Only adopt if a concrete job kind needs pi's behaviour.
- **v1 and v2.** Ship on v1 with the stable SDK entry point. Add v2 negotiation behind a flag using the experimental import, since agents will migrate at different speeds and v2 changes the prompt lifecycle.

---

## 6. Routing policy defaults (replaces plan v2 Section 7 defaults)

| Job kind | Primary | Fallback | Notes |
|---|---|---|---|
| build (new feature branch) | Claude Agent, API key via gateway | Kimi CLI, membership key | Claude for correctness on larger changes |
| follow_up (branch room feedback) | Claude Agent | Kimi CLI | Same session resumed where the runner supports `session/load` |
| small_fix, docs, tests | Kimi CLI | Kilo (BYO key) | Cheaper, quota-based |
| second_opinion (review of a PR) | goose or Kilo | Kimi CLI | Different model family on purpose |
| experimental | Hermes (Nous Portal) or pi | none | Off by default in every manifest |

Per-org manifests restrict `runners.allowed[]`. Failover triggers: `auth_required`, provider 429 or 5xx beyond retry budget, gateway cap reached, `max_turn_requests`, container wall-clock limit.

---

## 7. Spikes before Phase 4

1. `claude-agent-acp` headless with `ANTHROPIC_API_KEY` through the gateway, permission auto-policy, one real spec. Exit: PR opened, usage recorded.
2. `kimi acp` with a membership key, no OAuth. Exit: same spec, cost compared.
3. `kilo acp` in a container over stdio and over TCP. Exit: pick one transport.
4. Gateway virtual keys: per-org caps trip correctly and the Bun tier sees the rejection as a failover trigger.
5. Container stdio bridge under load: three concurrent jobs, cancel one mid-turn, confirm `cancelled` arrives and the container exits.
6. v2 negotiation flag against the experimental SDK entry point with one agent that supports v2.

---

## 8. Risks and open questions

| Risk | Mitigation |
|---|---|
| Adapter regressions on API-key auth (Claude, Kimi) | Pinned versions, daily readiness check, fallbacks in 5.8 |
| Registry churn (hourly version bumps, quarantine list) | Never install from `latest` in production images |
| Provider policy changes (Anthropic tightened twice in 2026) | API keys only; gateway abstracts base URLs so a policy change is a config change |
| Nous Portal terms for automated use | Keep it optional and single-tenant until confirmed in writing |
| v2 draft instability | v1 default, v2 behind a flag |
| Cost surprises | Two-layer budgets, `usage_update` capture, gateway logs as source of truth |
| Runner escaping the sandbox | Container limits, scoped forge token, permission policy denies outside the checkout |

Open: gateway choice (LiteLLM assumed); whether to keep a direct Claude Agent SDK runner alongside the ACP adapter permanently; whether Kilo Gateway credits or BYO keys; Nous Portal terms.

---

## 9. Sources consulted

- agentclientprotocol.com: initialization, authentication (v1 and v2 draft), prompt turn (v1) and prompt lifecycle (v2), TypeScript library page
- github.com/agentclientprotocol/registry (README, AUTHENTICATION.md) and cdn.agentclientprotocol.com/registry/v1/latest/registry.json
- github.com/agentclientprotocol/claude-agent-acp (README, issue #744, issue #146)
- github.com/agentclientprotocol/typescript-sdk and npm `@agentclientprotocol/sdk`
- pkg.go.dev/github.com/coder/acp-go-sdk
- github.com/MoonshotAI/kimi-cli PR #2185; kimi.com/code docs (overview, FAQ); platform.kimi.ai API overview
- kilo.ai/docs (CLI, CLI reference); github.com/Kilo-Org/kilocode issue #6766
- hermes-agent.nousresearch.com docs (providers, Nous Portal, subscription proxy, Buzz integration)
- zed.dev/docs/ai/external-agents
- Coverage of Anthropic's subscription OAuth restriction: The Register (Feb 2026), VentureBeat (Jan 2026), alternativeto.net (Feb 2026), dev.to (Apr and Jul 2026)
