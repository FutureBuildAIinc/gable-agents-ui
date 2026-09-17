# platform/ — Appwrite (FB Console) event backbone

Implements ADR 0001 for project `experiments` (see `provisioning.md` for
project creation, keys, and trigger binding).

## Pieces

| Piece | What |
|---|---|
| `collections/events.json` | TablesDB collection definition (durable event log; indexes for cursor + org/type) |
| `functions/events-ingest` | Go Appwrite Function. HTTP endpoint gable POSTs events to (X-Events-Key auth); validates the envelope, writes a document |
| `functions/events-fanout` | Go Appwrite Function. Triggered on `databases.platform.collections.events.documents.*.create`; delivers to subscriber webhooks with retry. Realtime needs no code (document create emits automatically) |

## Event envelope (from gable `pkg/eventpub`)

```json
POST /v1/functions/events-ingest/executions  (function domain or endpoint)
X-Events-Key: <EVENTS_INGEST_KEY>
{
  "id": "uuid",              // optional, minted when absent
  "type": "order.confirmed", // <entity>.<verb>
  "org": "<org-slug>",
  "branchId": "uuid|null",
  "entity": { "kind": "order", "id": "uuid" },
  "data": { },               // small summary payload
  "at": "RFC3339"            // optional, defaults to now
}
```

Response `201 {"ok":true,"id":"..."}`. Errors: `400` invalid envelope,
`401` bad key, `405` non-POST, `502` Appwrite write failed.

## Deploy

```bash
cd platform/functions/events-ingest/src && go build ./...   # verify
cd ../../../events-fanout/src && go build ./...

# In FB Console, project `experiments` (provisioning.md §2):
# 1. Databases → create `platform` → import collection from collections/events.json
# 2. Functions → create `events-ingest` (Go runtime, entrypoint "Main",
#    execute permissions: any with key) — upload src/, set env:
#      EVENTS_INGEST_KEY, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY,
#      APPWRITE_DATABASE=platform, APPWRITE_COLLECTION=events
# 3. Functions → create `events-fanout` (Go runtime, entrypoint "Main"),
#    events: databases.platform.collections.events.documents.*.create, env:
#      SUBSCRIBER_WEBHOOKS='[{"url":"https://gable-quote.futurebuild.ai/hook","key":"...","types":["quote.","order."]}]'
```

## Realtime subscriptions

Clients subscribe with a documents scope:
`databases.platform.collections.events.documents` (optionally filtered by
`org=` via query). Micro-UIs use the cursor-poll plugin
(`templates/*/server/plugins/gable-events.ts`) instead of browser Realtime —
the Appwrite session must not reach the browser for gable-* apps.
