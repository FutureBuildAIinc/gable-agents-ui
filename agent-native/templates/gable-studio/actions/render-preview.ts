import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  sanitizePreviewHtml,
  savePreview,
} from "../server/lib/preview-store.js";

/**
 * Step 4 of the studio flow: after each meaningful customization, the agent
 * writes a static HTML mockup of the screen being customized (representative
 * of the customized UI) and stores it here. The returned /preview/<id> URL
 * renders in-surface (iframe) so the user can see the change without
 * rebuilding anything.
 */
export default defineAction({
  description:
    "Store a static HTML preview of the screen being customized and return its URL. The HTML is sanitized (scripts, on* handlers, javascript:/data:text/html URLs stripped) and served at /preview/<id>. Give the user the URL to view in-surface. Previews are ephemeral (in-memory, per server process).",
  schema: z.object({
    html: z
      .string()
      .min(1)
      .max(512 * 1024)
      .describe(
        "Complete standalone HTML document for the preview — a representative static mockup of the customized UI",
      ),
  }),
  run: async (args) => {
    const html = sanitizePreviewHtml(args.html);
    const preview = savePreview(html);
    return { id: preview.id, url: `/preview/${preview.id}` };
  },
});
