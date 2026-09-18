import { randomUUID } from "node:crypto";

/**
 * In-memory store for studio previews, shared by the render-preview action
 * and the public /preview/:id server route.
 *
 * Previews are EPHEMERAL by design: a preview is a point-in-time static
 * mockup the agent hands to the user mid-conversation, not a persisted
 * artifact. The Map lives for the lifetime of the server process — a
 * restart invalidates old preview URLs, which is acceptable (and documented
 * in AGENTS.md). No DB row, no app state: the raw route must be readable
 * without a tab/session context.
 */

export interface StoredPreview {
  id: string;
  html: string;
  createdAt: number;
}

const previews = new Map<string, StoredPreview>();

/** Keep the most recent 100 previews; old ids 404. */
const MAX_PREVIEWS = 100;

export function getPreview(id: string): StoredPreview | undefined {
  return previews.get(id);
}

export function savePreview(html: string): StoredPreview {
  const preview: StoredPreview = {
    id: randomUUID(),
    html,
    createdAt: Date.now(),
  };
  previews.set(preview.id, preview);
  while (previews.size > MAX_PREVIEWS) {
    const oldest = previews.keys().next().value;
    if (oldest === undefined) break;
    previews.delete(oldest);
  }
  return preview;
}

/**
 * Best-effort HTML sanitizer for static previews:
 *  - strips <script>...</script> blocks (including unclosed ones)
 *  - strips on*="" inline event handlers (onclick=, onerror=, ...)
 *  - neutralizes javascript: and data:text/html URLs in href/src attributes
 *
 * Previews are additionally framed same-origin only (X-Frame-Options on the
 * serving route). This is defense-in-depth for agent-generated markup, not a
 * general-purpose HTML sanitizer.
 */
export function sanitizePreviewHtml(html: string): string {
  return (
    html
      // <script ...> ... </script> — case-insensitive, DOTALL; also drop an
      // unclosed <script> to end-of-string.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*$/i, "")
      // Inline event handlers: onclick="..." / onerror='...' / onload=bare
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Dangerous URLs in href/src (quoted or bare), including entity/newline
      // smuggling inside the scheme.
      .replace(
        /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        (match, attr: string, dq?: string, sq?: string, bare?: string) => {
          const raw = (dq ?? sq ?? bare ?? "").trim();
          const scheme = raw.replace(/[\s\x00-\x1f]/g, "").toLowerCase();
          if (
            scheme.startsWith("javascript:") ||
            scheme.startsWith("data:text/html")
          ) {
            return `${attr}="#"`;
          }
          return match;
        },
      )
  );
}
