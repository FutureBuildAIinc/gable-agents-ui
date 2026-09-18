# Gable Studio — Agent Guide

Gable Studio is the agent-native template studio: the user customizes an
existing `gable-*` micro-UI template — or builds a new one — **from chat**,
previews the customization in-surface, then deploys it. The repo is the
workspace: `templates/<name>/` IS the working copy, and `write-template-file`
IS the customization mechanism. The studio never calls the gable ERP.

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-templates` | GET | List `gable-*` templates in the workspace (name, description, hasReadme); studio itself excluded |
| `read-template-file` | POST (read-only) | Read one file under `templates/<name>/` (UTF-8, 256KB cap) |
| `write-template-file` | POST | Edit the working copy — confined path, extension allowlist, atomic write |
| `render-preview` | POST | Sanitize + store a static HTML mockup; returns `/preview/<id>` |
| `deploy-template` | POST | Register the template in `packages/shared-app-config/templates.ts` (idempotent) |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

Previews are served by `server/routes/preview/[id].get.ts` (raw HTML,
`X-Frame-Options: SAMEORIGIN`, 404 for unknown ids) and wrapped by the
`/preview/:id` app route. No hand-written JSON API routes; capabilities are
actions.

## Workflow (customize → preview → deploy)

1. `list-templates` → the user picks one, or says "new" (copy an existing
   template's shape into a new `gable-<domain>/` via `write-template-file`).
2. `read-template-file` the key files (package.json, `app/routes.ts` + main
   routes, actions, AGENTS.md, README.md) — never guess contents.
3. `write-template-file` in small, iterative edits; say what/why before each.
4. After each meaningful change: author a static HTML mockup of the screen
   being customized and `render-preview` it; give the user the `/preview/<id>`
   URL; iterate on feedback.
5. When satisfied: `deploy-template` (idempotent registration).
6. Remind: a new app needs `pnpm install` + typecheck — deploy does not run
   builds.

## Core Rules

- **Path confinement**: every read/write resolves inside
  `templates/<name>/`; absolute paths and `..` escapes are rejected
  server-side (`actions/_template-fs.ts`). Never try to write elsewhere.
- **Extension allowlist** for writes: `.ts .tsx .md .json .css .txt` only.
- **Sanitized previews**: scripts, `on*` handlers, and
  `javascript:`/`data:text/html` URLs are stripped server-side
  (`server/lib/preview-store.ts`); previews are static mockups, same-origin
  framing only, ephemeral (in-memory, per server process — restart
  invalidates old ids; the store keeps the most recent 100).
- **Idempotent registration**: `deploy-template` never duplicates a catalog
  entry; new entries follow the neighboring `hidden: true` shape and get the
  next free `devPort`.
- **Auth**: BYOA Appwrite JWT (verifier inlined in
  `server/lib/appwrite-session.ts`; no `@gable/client` dependency).
  `/preview` is the public-path exception (shareable preview URLs).
- Verify a write by re-reading the file before reporting it done.

## Screens

- `/studio` — supplementary landing: template cards, "customize in chat".
- `/preview/:id` — full-size preview wrapper (iframe over the raw route).
- `/home` — chat-first surface; the main studio. The agent does everything
  from here.

## Skills

- `studio` — studio flow cheat sheet + preview HTML style guidance.
