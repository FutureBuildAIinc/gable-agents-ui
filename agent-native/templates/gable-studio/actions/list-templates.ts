import fs from "node:fs";
import path from "node:path";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { TEMPLATES_DIR } from "./_template-fs.js";

interface TemplatePackageJson {
  description?: unknown;
}

/**
 * List the gable-* templates available in the workspace templates directory
 * (the studio itself excluded). This is step 1 of the studio flow: pick a
 * template to customize, or say "new" to start from a copy.
 */
export default defineAction({
  description:
    "List gable micro-UI templates available in the workspace (name, description, hasReadme). Use this first so the user can pick a template to customize — or offer to start a new one.",
  schema: z.object({}),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async () => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    } catch {
      throw new Error(`Templates directory not found: ${TEMPLATES_DIR}`);
    }

    const templates = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          e.name.startsWith("gable-") &&
          e.name !== "gable-studio",
      )
      .map((e) => {
        const dir = path.join(TEMPLATES_DIR, e.name);
        let description = "";
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(dir, "package.json"), "utf-8"),
          ) as TemplatePackageJson;
          if (typeof pkg.description === "string")
            description = pkg.description;
        } catch {
          // No/invalid package.json — description stays empty.
        }
        return {
          name: e.name,
          description,
          hasReadme: fs.existsSync(path.join(dir, "README.md")),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return templates;
  },
});
