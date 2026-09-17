# ADR 0003 — Data ownership: gable is the only system of record

**Status:** accepted · **Date:** 2026-09-17

## Context

Agent-native's runtime requires its own Postgres/PGlite for framework services: Better Auth tables (unused in our BYOA mode), `chat_threads`, `agent_runs`, `application_state`, `settings`, `sync_events`. Templates conventionally also own domain tables via Drizzle. Gable owns ERP truth in its own Postgres with 86 migrations and raw-SQL repositories (double-entry inventory, GL posting). Two writable copies of the same ERP entity would diverge.

## Decision

1. Gable's Postgres is the sole system of record for all ERP entities (products, quotes, orders, invoices, payments, inventory, deliveries, customers, vendors, GL).
2. Each micro-UI has its own small database (PGlite on a volume in dev/small deployments; Postgres schema in production) containing **only**:
   - agent-native framework tables (threads, runs, app state, settings, sync events);
   - **derived caches** of gable data, when a UI needs fast list/filtering — always refreshable from gable, never written back, clearly namespaced (e.g. `cache_products`).
3. No micro-UI ever executes a write against gable's database directly, and never stores a local copy it treats as authoritative. All ERP reads/writes go through gable's REST API via `@gable/client`.
4. Sharing one Postgres cluster between gable and Appwrite is an ops decision only (allowed: separate databases on a shared cluster). Sharing Appwrite's internal database or replacing gable's data layer with TablesDB is rejected — DB-level proximity creates no API-level events and TablesDB cannot express gable's SQL data layer.

## Consequences

- UIs that need server-side filtering over large ERP sets either call gable list endpoints (offset pagination, max 200/page) or maintain a derived cache refreshed by the event stream (ADR 0001).
- Cache invalidation is event-driven (entity events) + TTL; on doubt, refetch.
