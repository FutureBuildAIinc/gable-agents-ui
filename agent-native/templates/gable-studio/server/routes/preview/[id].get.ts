import {
  defineEventHandler,
  getRouterParam,
  setResponseHeader,
  setResponseStatus,
} from "h3";

import { getPreview } from "../../lib/preview-store.js";

/**
 * Public raw-HTML preview route (the allowed non-JSON public exception —
 * see docs/micro-ui-conventions.md). The auth plugin lists "/preview" in
 * publicPaths so previews are shareable; unknown ids 404 without leaking
 * anything. The HTML was sanitized at store time (preview-store.ts) and is
 * framed same-origin only.
 *
 * The React wrapper page (app/routes/preview.$id.tsx) embeds this route in
 * an iframe; nitro routes this specific path before the [...page] catch-all.
 */
export default defineEventHandler((event) => {
  const id = (getRouterParam(event, "id") ?? "").trim();
  const preview = /^[a-zA-Z0-9-]{1,64}$/.test(id) ? getPreview(id) : undefined;
  if (!preview) {
    setResponseStatus(event, 404);
    setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
    return "Preview not found";
  }
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "x-frame-options", "SAMEORIGIN");
  setResponseHeader(event, "cache-control", "no-store");
  return preview.html;
});
