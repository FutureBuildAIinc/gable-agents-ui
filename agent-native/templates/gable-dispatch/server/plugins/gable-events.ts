import { appStatePut } from "@agent-native/core/application-state";

/**
 * gable-events consumer: cursor-polls the Appwrite `events` collection
 * (ADR 0001) for ERP changes relevant to dispatch and bumps an
 * application-state marker so the framework's SSE sync refreshes clients.
 *
 * Env: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_EVENTS_READ_KEY,
 *      APPWRITE_EVENTS_DATABASE (default "platform"), APPWRITE_EVENTS_COLLECTION (default "events").
 * Disabled when any of endpoint/project/key is unset.
 */

const POLL_MS = 30_000;
const SESSION = "system";
const CURSOR_KEY = "gable-events-cursor";
const MARKER_KEY = "gable-events";

const WATCHED_PREFIXES = ["delivery.", "order."];

interface EventsConfig {
  endpoint: string;
  projectId: string;
  key: string;
  database: string;
  collection: string;
}

function configFromEnv(): EventsConfig | null {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const key = process.env.APPWRITE_EVENTS_READ_KEY;
  if (!endpoint || !projectId || !key) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    projectId,
    key,
    database: process.env.APPWRITE_EVENTS_DATABASE ?? "platform",
    collection: process.env.APPWRITE_EVENTS_COLLECTION ?? "events",
  };
}

interface EventDoc {
  $id: string;
  type?: string;
  at?: string;
  org?: string;
  entity?: { kind?: string; id?: string };
}

async function fetchEvents(cfg: EventsConfig, since: string | null): Promise<EventDoc[]> {
  const url = new URL(
    `${cfg.endpoint}/v1/databases/${cfg.database}/collections/${cfg.collection}/documents`,
  );
  const queries: string[] = ["orderAsc(\"$createdAt\")", "limit(100)"];
  if (since) queries.unshift(`greaterThan("$createdAt", "${since}")`);
  for (const q of queries) url.searchParams.append("queries[]", q);

  const res = await fetch(url, {
    headers: {
      "x-appwrite-project": cfg.projectId,
      "x-appwrite-key": cfg.key,
    },
  });
  if (!res.ok) throw new Error(`events poll failed: ${res.status}`);
  const body = (await res.json()) as { documents?: EventDoc[] };
  return body.documents ?? [];
}

export default async function registerGableEvents(): Promise<void> {
  const cfg = configFromEnv();
  if (!cfg) {
    console.log("[gable-events] disabled (APPWRITE_ENDPOINT/PROJECT_ID/EVENTS_READ_KEY unset)");
    return;
  }

  let cursor: string | null = null;
  const poll = async (): Promise<void> => {
    try {
      const docs = await fetchEvents(cfg, cursor);
      const watched = docs.filter((d) =>
        WATCHED_PREFIXES.some((p) => (d.type ?? "").startsWith(p)),
      );
      if (watched.length > 0) {
        cursor = docs[docs.length - 1]?.$id ?? cursor;
        await appStatePut(SESSION, MARKER_KEY, {
          latest: watched.map((d) => ({ type: d.type, entity: d.entity, at: d.at })),
          count: watched.length,
          _writeId: `${Date.now()}`,
        });
      } else if (docs.length > 0) {
        cursor = docs[docs.length - 1]?.$id ?? cursor;
      }
    } catch (error) {
      console.warn("[gable-events] poll error:", error);
    }
  };

  void poll();
  setInterval(() => void poll(), POLL_MS).unref();
  console.log(`[gable-events] polling ${cfg.endpoint} every ${POLL_MS / 1000}s`);
}
