import { appStatePut } from "@agent-native/core/application-state";

/**
 * gable-events consumer: cursor-polls the Appwrite `events` collection
 * (ADR 0001) for ERP changes relevant to quoting and bumps an
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

const WATCHED_PREFIXES = ["quote.", "order.", "invoice.", "inventory.", "delivery.", "product."];

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
  // This FB Console build (Go fork) silently IGNORES list params (queries[],
  // limit, cursor, ordering) over REST — every call returns the full list.
  // Fetch everything (the event log stays small) and dedupe client-side.
  void since;
  const url = new URL(
    `${cfg.endpoint}/v1/databases/${cfg.database}/collections/${cfg.collection}/documents`,
  );

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

  let lastSeenId: string | null = null;
  const poll = async (): Promise<void> => {
    try {
      const docs = await fetchEvents(cfg, lastSeenId);
      if (docs.length === 0) return;
      // This build returns documents in insertion order (oldest first);
      // docs AFTER the last-seen id are new. On boot, anchor on the newest
      // without emitting so the UI doesn't replay the backlog.
      let fresh: EventDoc[];
      if (lastSeenId == null) {
        fresh = [];
      } else {
        const cut = docs.findIndex((d) => d.$id === lastSeenId);
        fresh = cut === -1 ? docs : docs.slice(cut + 1);
      }
      lastSeenId = docs[docs.length - 1]?.$id ?? lastSeenId;

      const watched = fresh.filter((d) =>
        WATCHED_PREFIXES.some((p) => (d.type ?? "").startsWith(p)),
      );
      if (watched.length > 0) {
        await appStatePut(SESSION, MARKER_KEY, {
          latest: watched.map((d) => ({ type: d.type, entity: d.entity, at: d.at })),
          count: watched.length,
          _writeId: `${Date.now()}`,
        });
        console.log(`[gable-events] ${watched.length} new event(s): ${watched.map((d) => d.type).join(", ")}`);
      }
    } catch (error) {
      console.warn("[gable-events] poll error:", error);
    }
  };

  void poll();
  setInterval(() => void poll(), POLL_MS).unref();
  console.log(`[gable-events] polling ${cfg.endpoint} every ${POLL_MS / 1000}s`);
}
