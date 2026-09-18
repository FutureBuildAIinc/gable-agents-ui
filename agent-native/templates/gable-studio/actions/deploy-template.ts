import fs from "node:fs";
import path from "node:path";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  TEMPLATES_DIR,
  TEMPLATE_NAME_RE,
  TemplatePathError,
  resolveTemplateFilePath,
} from "./_template-fs.js";

/** packages/shared-app-config/templates.ts — the first-party template catalog. */
function registryPath(): string {
  return path.resolve(
    TEMPLATES_DIR,
    "..",
    "packages",
    "shared-app-config",
    "templates.ts",
  );
}

interface TemplatePackageJson {
  displayName?: unknown;
  description?: unknown;
}

function skipString(source: string, start: number): number {
  const quote = source[start]!;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return source.length;
}

/** Index of the closing `]` of the TEMPLATES array literal (string/comment aware). */
function findTemplatesArrayClose(source: string): number {
  const decl = source.indexOf("export const TEMPLATES");
  if (decl === -1)
    throw new Error("TEMPLATES declaration not found in templates.ts.");
  const assignment = source.indexOf("= [", decl);
  if (assignment === -1)
    throw new Error("TEMPLATES array literal not found in templates.ts.");
  const open = source.indexOf("[", assignment);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      const newline = source.indexOf("\n", i);
      if (newline === -1) break;
      i = newline;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Could not locate the TEMPLATES array closing bracket.");
}

/** Fallback accent used for registered gable-* entries (unmapped icons degrade gracefully). */
const REGISTRY_COLOR = "#6366F1";
const REGISTRY_COLOR_RGB = "99 102 241";

/**
 * Step 5 of the studio flow: register a template in
 * packages/shared-app-config/templates.ts so it appears in the pickers.
 * Idempotent — an already-registered template is a no-op. This does NOT run
 * installs or builds; remind the user to `pnpm install` + typecheck.
 */
export default defineAction({
  description:
    "Register a gable template in packages/shared-app-config/templates.ts (the first-party catalog used by every picker). Idempotent: returns alreadyRegistered when the entry exists. Call only when the user is satisfied with the customization. Does not run installs or builds.",
  schema: z.object({
    template: z
      .string()
      .regex(TEMPLATE_NAME_RE)
      .describe("Template directory name, e.g. 'gable-quote'"),
  }),
  run: async (args) => {
    // Guard + existence checks against the template working copy.
    let pkgPath: string;
    try {
      pkgPath = resolveTemplateFilePath(args.template, "package.json");
    } catch (error) {
      if (error instanceof TemplatePathError) throw new Error(error.message);
      throw error;
    }
    if (!fs.existsSync(pkgPath)) {
      throw new Error(
        `Cannot deploy '${args.template}': no package.json at templates/${args.template}/package.json.`,
      );
    }

    const registry = registryPath();
    let source: string;
    try {
      source = fs.readFileSync(registry, "utf-8");
    } catch {
      throw new Error(`Template catalog not found: ${registry}`);
    }

    // Idempotency: an entry with this name already exists -> no-op.
    if (new RegExp(`\\bname:\\s*["']${args.template}["']`).test(source)) {
      return { registered: true, alreadyRegistered: true };
    }

    const pkg = JSON.parse(
      fs.readFileSync(pkgPath, "utf-8"),
    ) as TemplatePackageJson;
    const label =
      typeof pkg.displayName === "string" && pkg.displayName
        ? pkg.displayName
        : args.template;
    const hint =
      typeof pkg.description === "string" && pkg.description
        ? pkg.description
        : `Agent-native micro-UI template ${args.template}.`;

    // devPort: one past the highest currently assigned port.
    let maxPort = 8000;
    for (const match of source.matchAll(/\bdevPort:\s*(\d+)/g)) {
      const port = Number(match[1]);
      if (Number.isInteger(port) && port > maxPort) maxPort = port;
    }

    // Insertion shape mirrors the neighboring hidden entries (tasks/crm/factory).
    const entry = [
      "  {",
      `    name: ${JSON.stringify(args.template)},`,
      `    label: ${JSON.stringify(label)},`,
      `    hint: ${JSON.stringify(hint)},`,
      `    icon: "Stack2",`,
      `    color: ${JSON.stringify(REGISTRY_COLOR)},`,
      `    colorRgb: ${JSON.stringify(REGISTRY_COLOR_RGB)},`,
      `    devPort: ${maxPort + 1},`,
      `    defaultMode: "dev",`,
      `    hidden: true,`,
      `    core: false,`,
      "  },\n",
    ].join("\n");

    const close = findTemplatesArrayClose(source);
    fs.writeFileSync(
      registry,
      source.slice(0, close) + entry + source.slice(close),
      "utf-8",
    );

    return { registered: true };
  },
});
