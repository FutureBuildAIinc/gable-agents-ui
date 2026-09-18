// events-fanout — Appwrite Function (node-22, zero deps).
// Triggered on `databases.platform.collections.events.documents.*.create`.
// Delivers the event to registered subscriber webhooks with bounded retry.
// Realtime needs no code: the document-create emits on the collection channel.
//
// Env: SUBSCRIBER_WEBHOOKS — JSON array:
//   [{"url":"https://app.example/hook","key":"bearer","types":["quote.","order."]}]
//   `types` is an optional prefix filter; omitted = all events.

const RETRY_DELAYS_MS = [0, 1_000, 5_000];

function matches(subscriber, type) {
  if (!subscriber.types || subscriber.types.length === 0) return true;
  return subscriber.types.some((p) => type.startsWith(p));
}

async function deliver(subscriber, payload) {
  let lastError;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const resp = await fetch(subscriber.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(subscriber.key ? { authorization: `Bearer ${subscriber.key}` } : {}),
        },
        body: payload,
      });
      if (resp.status < 300) return null;
      lastError = new Error(`status ${resp.status}`);
    } catch (e) {
      lastError = e;
    }
  }
  return lastError;
}

export default async ({ req, res, log, error }) => {
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    body = null;
  }
  if (!body || typeof body.type !== "string" || !body.eventId) {
    // Manual/test invocation without a document payload — nothing to fan out.
    log("no event document in payload; nothing to fan out");
    return res.json({ ok: true, delivered: 0 });
  }

  let subscribers = [];
  if (process.env.SUBSCRIBER_WEBHOOKS) {
    try {
      subscribers = JSON.parse(process.env.SUBSCRIBER_WEBHOOKS);
    } catch (e) {
      error(`SUBSCRIBER_WEBHOOKS invalid JSON: ${e.message}`);
      return res.json({ error: "misconfigured" }, 502);
    }
  }

  const payload = typeof req.body === "string" ? req.body : JSON.stringify(body);
  let delivered = 0;
  let failed = 0;
  for (const s of subscribers) {
    if (!matches(s, body.type)) continue;
    const err = await deliver(s, payload);
    if (err) {
      failed++;
      error(`deliver ${body.eventId} to ${s.url} failed: ${err.message}`);
    } else {
      delivered++;
    }
  }

  log(`fanout ${body.eventId} (${body.type}): ${delivered} delivered, ${failed} failed`);
  return res.json({ ok: failed === 0, delivered, failed });
};
