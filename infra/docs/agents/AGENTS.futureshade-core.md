# futureshade-core addendum

The Go engine of FutureBuild Cloud and the Shade: rooms, messages, threads, read cursors, presence, agent seats and state, jobs, branches, sandboxes, audit; org resolution; the operator API; typed Cloud events into org rooms. One modular monolith with roles `serve`, `worker`, `migrate`.

- Postgres per org. Every request resolves the org from `X-Org` validated against Team membership before touching a database; there is no cross-org query path.
- Planning objects (specs, tasks, cycles, ADRs, knowledge cards) live in Appwrite TablesDB, not here. Cross-reference by id only; never duplicate their fields.
- The Bun agent tier is the only writer of spec state transitions; this engine stores agent snapshots and events on its behalf and broadcasts `agent_state`.
- The WebSocket hub is the realtime path; LISTEN/NOTIFY is the bus. No third realtime mechanism.
- Agent seat API: subscriptions only to `allowed_room_ids`; anything else is refused before it is logged.
- Typed events are a closed catalogue (`docs/events.md`); adding one is a PR that also adds its client card.
- Contract tests run against `api/openapi.yaml`; generated types in `@futureshade/api` must be regenerated in the same PR as any API change.
