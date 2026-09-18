/**
 * Shared filesystem plumbing for the studio actions. NOT an action — the
 * leading underscore keeps it out of the action registry scanners.
 *
 * The studio's customization mechanism is direct: templates/<name>/ IS the
 * working copy (the repo is the workspace). Everything here confines reads
 * and writes to that directory.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The workspace templates directory: agent-native/templates/.
 *
 * Resolved from this module's own location (two levels up from actions/)
 * so it is correct regardless of the process cwd. When the server bundle
 * is relocated (production .output), fall back to cwd-relative candidates
 * covering the common ways the studio is launched (from the app dir, the
 * agent-native root, or the repo root).
 */
function resolveTemplatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", ".."),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "templates"),
    path.resolve(process.cwd(), "agent-native", "templates"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "gable-studio"))) return candidate;
  }
  return candidates[0]!;
}

export const TEMPLATES_DIR = resolveTemplatesDir();

/** Template names must be plain kebab-case directory names. */
export const TEMPLATE_NAME_RE = /^[a-z0-9-]+$/;

/** File extensions the studio is allowed to write. */
export const WRITABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".md",
  ".json",
  ".css",
  ".txt",
]);

export class TemplatePathError extends Error {}

/**
 * Resolve <templatesDir>/<template>/<file> with an escape guard: the result
 * must live directly inside the template's own directory. Rejects absolute
 * file paths, `..` segments, and null bytes before resolving.
 */
export function resolveTemplateFilePath(
  template: string,
  file: string,
): string {
  if (!TEMPLATE_NAME_RE.test(template)) {
    throw new TemplatePathError(`Invalid template name: ${template}`);
  }
  if (!file || file.includes("\0")) {
    throw new TemplatePathError("File path is required.");
  }
  if (path.isAbsolute(file)) {
    throw new TemplatePathError(
      "File path must be relative to the template directory.",
    );
  }
  const templateRoot = path.resolve(TEMPLATES_DIR, template);
  const resolved = path.resolve(templateRoot, file);
  if (
    resolved !== templateRoot &&
    !resolved.startsWith(templateRoot + path.sep)
  ) {
    throw new TemplatePathError("File path escapes the template directory.");
  }
  return resolved;
}

/** Repo-relative display path, e.g. templates/gable-quote/app/routes/x.tsx. */
export function displayPath(template: string, file: string): string {
  return `templates/${template}/${file.split(path.sep).join("/")}`;
}
