import fs from "node:fs";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  TEMPLATE_NAME_RE,
  TemplatePathError,
  displayPath,
  resolveTemplateFilePath,
} from "./_template-fs.js";

const MAX_BYTES = 256 * 1024;

/**
 * Read one file from a gable template's working copy. Step 2 of the studio
 * flow: understand the template before customizing it.
 */
export default defineAction({
  description:
    "Read a file inside a gable template's working copy (UTF-8, max 256KB). Use it to inspect a template's key files (package.json, routes, actions, AGENTS.md) before customizing. Paths are confined to templates/<name>/.",
  schema: z.object({
    template: z
      .string()
      .regex(TEMPLATE_NAME_RE)
      .describe("Template directory name, e.g. 'gable-quote'"),
    file: z
      .string()
      .min(1)
      .max(512)
      .describe("File path relative to the template directory"),
  }),
  grounding: true,
  readOnly: true,
  run: async (args) => {
    let resolved: string;
    try {
      resolved = resolveTemplateFilePath(args.template, args.file);
    } catch (error) {
      if (error instanceof TemplatePathError) throw new Error(error.message);
      throw error;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      throw new Error(
        `File not found: ${displayPath(args.template, args.file)}`,
      );
    }
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${displayPath(args.template, args.file)}`);
    }
    if (stat.size > MAX_BYTES) {
      throw new Error(
        `File too large (${stat.size} bytes; cap is ${MAX_BYTES}). Read it in pieces or skip binary assets.`,
      );
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return { path: displayPath(args.template, args.file), content };
  },
});
