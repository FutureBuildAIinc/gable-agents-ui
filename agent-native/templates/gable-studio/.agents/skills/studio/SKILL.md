---
name: studio
description: Gable Studio flow — customize/build a gable micro-UI template from chat, preview it in-surface, deploy it to the catalog; includes preview HTML style guidance.
---

# Gable Studio

The studio customizes `gable-*` micro-UI templates from chat. The repo is the
workspace: `templates/<name>/` is the working copy and `write-template-file`
is the customization mechanism. Nothing here calls the gable ERP.

## Flow cheat sheet

1. **Pick** — `list-templates`; the user chooses one, or "new" (a new
   `gable-<domain>/` built by copying an existing template's shape file by
   file with `write-template-file`).
2. **Understand** — `read-template-file` the key files first:
   `package.json`, `app/routes.ts` + the main route files, `actions/`,
   `AGENTS.md`, `README.md`. Never guess file contents.
3. **Customize** — `write-template-file`, small and iterative. State what and
   why before each write. Re-read to verify a write landed.
4. **Preview** — after each meaningful change, author a static HTML mockup of
   the screen being customized and `render-preview` it. Hand the user the
   `/preview/<id>` URL (they view it in-surface). Iterate on feedback.
5. **Deploy** — `deploy-template` when the user is satisfied (idempotent;
   registers in `packages/shared-app-config/templates.ts`, hidden until
   productized).
6. **Remind** — `pnpm install` + typecheck for a new app; deploy does not run
   builds.

## Hard limits

- Writes confined to `templates/<name>/` (no absolute paths, no `..`).
- Writable extensions only: `.ts .tsx .md .json .css .txt`.
- Preview HTML is sanitized server-side (no scripts, no `on*` handlers, no
  `javascript:`/`data:text/html` URLs) — keep previews static.
- Template names kebab-case: `gable-<domain>`.

## Preview HTML style guidance

Previews are standalone static documents you author — representative mockups
of the customized UI, not the real app. All `<script>` tags are stripped
server-side (including the Tailwind CDN), so style them with a small inline
`<style>` block of Tailwind-ish utility classes or hand-rolled CSS.

Make previews look like **real ERP screens**, not marketing pages:

- Dense, information-first layout; small type (12–14px), tight rows.
- Realistic data: lumber/building-materials domain (SKUs like `2X4-8-SPF`,
   quantities with UOM like `LF`/`BF`/`EA`, money as `$1,284.60`).
- Tables with right-aligned numerics, status badges, header toolbars,
  summary/total rows; cards for KPIs; breadcrumb or app header with the
  template's name.
- Neutral work-tool palette (zinc/slate + one accent), light or dark to match
  the template being customized; avoid hero sections and large imagery.
- Show the *customization* being iterated on — the delta the user asked for
  should be visually obvious in the mockup.
