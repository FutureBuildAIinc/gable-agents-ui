import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  TEMPLATE_NAME_RE,
  TemplatePathError,
  WRITABLE_EXTENSIONS,
  displayPath,
  resolveTemplateFilePath,
} from "./_template-fs.js";

/**
 * Write one file inside a gable template's working copy — this IS the
 * customization mechanism (the repo is the workspace). Step 3 of the studio
 * flow: small, iterative edits. Writes are atomic (temp file + rename) and
 * confined to templates/<name>/ with an extension allowlist.
 */
export default defineAction({
  description:
    "Write a file inside a gable template's working copy (this edits templates/<name>/ directly — that IS the customization). Allowed extensions: .ts .tsx .md .json .css .txt. Paths are confined to templates/<name>/. Prefer small, iterative edits.",
  schema: z.object({
    template: z
      .string()
      .regex(TEMPLATE_NAME_RE)
      .describe("Template directory name, e.g. 'gable-quote'"),
    file: z
      .string()
      .min(1)
      .max(512)
      .describe(
        "File path relative to the template directory; parent dirs are created",
      ),
    content: z
      .string()
      .max(512 * 1024)
      .describe("Full UTF-8 file content"),
  }),
  run: async (args) => {
    let resolved: string;
    try {
      resolved = resolveTemplateFilePath(args.template, args.file);
    } catch (error) {
      if (error instanceof TemplatePathError) throw new Error(error.message);
      throw error;
    }

    if (!WRITABLE_EXTENSIONS.has(path.extname(args.file).toLowerCase())) {
      throw new Error(
        `Extension not allowed: '${path.extname(args.file) || "(none)"}'. Allowed: ${[
          ...WRITABLE_EXTENSIONS,
        ].join(" ")}`,
      );
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });

    // Atomic write: same-directory temp file + rename, so a reader never
    // sees a half-written module.
    const temp = path.join(
      path.dirname(resolved),
      `.studio-${randomUUID()}.tmp`,
    );
    fs.writeFileSync(temp, args.content, "utf-8");
    fs.renameSync(temp, resolved);

    return {
      written: true,
      path: displayPath(args.template, args.file),
      bytes: Buffer.byteLength(args.content, "utf-8"),
    };
  },
});
