# futureshade-agents addendum

The Bun tier: XState v5 actors (intake, spec, dispatch, sandbox_request, session), the `native` connector to the engine, the Appwrite server SDK for planning objects, the runtime layer (ACP adapters, permission policy, routing, budgets), and the FutureShade MCP server for runners.

- Machine definitions come from `@futureshade/statecharts`; this repository binds actions and guards by name and never redefines a machine.
- The tier is stateless: snapshots and events persist through the engine after every transition; on restart, rehydrate from the latest snapshot.
- Runners run on API keys through the LLM gateway, one container per job, secrets injected at spawn. No runner ever holds a secret-reading tool. Subscription OAuth tokens are never used here.
- The permission policy is deny by default: writes only inside the job's checkout; no publishing, force pushes, or secrets paths; destructive git and dependency additions escalate to a reviewer card.
- Every job records runner, model, tokens, and cost; budgets are checked before dispatch and enforced again at the gateway.
- Intake actors act only in rooms listed as intake for their seat; knowledge is filed tenant-scoped; nothing from one tenant is surfaced in another's room.
- Human approval gates every dispatch. There is no auto-approve path.
