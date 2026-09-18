// events-ingest — Appwrite Function (node-22, zero deps).
// Receives domain events from gable's eventpub and writes them as documents
// to the `events` collection (gable-agents-ui ADR 0001). The document write
// fires the fanout trigger and Realtime.
//
// Appwrite's execution API cannot forward arbitrary headers, so the shared
// secret travels in the body (ingestKey) OR the X-Events-Key header (when a
// function domain is configured later — both paths are accepted).
//
// Env: EVENTS_INGEST_KEY (required), APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID,
//      APPWRITE_API_KEY (documents.write), APPWRITE_DATABASE (platform),
//      APPWRITE_COLLECTION (events).

const TYPE_RE = /^[a-z_]+\.[a-z_]+$/;

function validate(event) {
  if (!event || typeof event !== "object") return "event object required";
  if (typeof event.type !== "string" || !TYPE_RE.test(event.type)) {
    return `type must match <entity>.<verb>, got ${JSON.stringify(event.type)}`;
  }
  if (typeof event.org !== "string" || !event.org) return "org is required";
  if (!event.entity || typeof event.entity.kind !== "string" || typeof event.entity.id !== "string") {
    return "entity.kind and entity.id are required";
  }
  return null;
}

export default async ({ req, res, log, error }) => {
  const ingestKey = process.env.EVENTS_INGEST_KEY ?? "";
  const endpoint = (process.env.APPWRITE_ENDPOINT ?? "").replace(/\/+$/, "");
  const project = process.env.APPWRITE_PROJECT_ID ?? "";
  const apiKey = process.env.APPWRITE_API_KEY ?? "";
  const database = process.env.APPWRITE_DATABASE ?? "platform";
  const collection = process.env.APPWRITE_COLLECTION ?? "events";

  if (!ingestKey || !endpoint || !project || !apiKey) {
    error("missing required env (EVENTS_INGEST_KEY, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY)");
    return res.json({ error: "misconfigured function" }, 502);
  }
  if (req.method !== "POST") {
    return res.json({ error: "POST only" }, 405);
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.json({ error: "invalid JSON body" }, 400);
  }

  // Accept either { ingestKey, event } (execution API) or a bare envelope
  // with the key in the X-Events-Key header (function-domain call).
  const key = payload.ingestKey ?? req.headers?.["x-events-key"];
  const event = payload.event ?? payload;
  if (key !== ingestKey) {
    return res.json({ error: "unauthorized" }, 401);
  }

  const invalid = validate(event);
  if (invalid) {
    return res.json({ error: invalid }, 400);
  }
  if (!event.id) event.id = crypto.randomUUID();
  if (!event.at) event.at = new Date().toISOString();

  const doc = {
    eventId: event.id,
    type: event.type,
    org: event.org,
    branchId: event.branchId ?? "",
    entityKind: event.entity.kind,
    entityId: event.entity.id,
    data: JSON.stringify(event.data ?? {}),
    at: event.at,
  };

  const url = `${endpoint}/v1/databases/${database}/collections/${collection}/documents`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-appwrite-project": project,
      "x-appwrite-key": apiKey,
    },
    body: JSON.stringify({ documentId: "unique()", data: doc }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    error(`appwrite write ${resp.status}: ${body.slice(0, 300)}`);
    return res.json({ error: "appwrite write failed" }, 502);
  }

  log(`ingested ${event.type} ${event.entity.kind}/${event.entity.id} (${event.id})`);
  return res.json({ ok: true, id: event.id }, 201);
};

// build cache buster v3
