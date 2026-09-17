# app addendum

The Lit plus Ionic client: the launcher (operator mode), the Shade's member and operator surfaces, and any micro-app that ships from this repository. Built with Bun and Vite; one bundle per micro-app under `web/apps/`; shared packages under `web/packages/`.

- Zag machines hold interaction state only; authoritative agent and workflow state comes from the engine's `agent_state` and typed events. The one client lifecycle machine allowed is the offline `sync` machine from `@futureshade/statecharts`.
- Tool tokens never reach the browser; every third-party read goes through an Appwrite Function.
- Components come from `web/packages/design-system`; tokens from `tokens.css`; Penpot component names in doc comments.
- Typed events render as cards from the closed catalogue; parsing agent text for meaning is forbidden.
- Member mode stays plain; operator routes are role-gated and never leak into member bundles.
- PWA and Tauri build from the same bundle; nothing shell-specific in a micro-app beyond the shell's declared capabilities.
