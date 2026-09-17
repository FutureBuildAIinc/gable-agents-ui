# ADR-011b: Micro-App UX Framework

**Status:** Proposed
**Deciders:** Colton, Grant (design owner)

## Context

Each team or role gets its own micro-app (yard, receiving, dispatch, counter, sales, admin, finance, and more as they appear), plus third-party-facing apps such as HH Pro for contractors and customers. ADR-011a made multi-frontend apps part of the App Shape; this ADR sets the UX rules so a family of small apps feels like one product, ships without app-store sprawl, and can be designed and built repeatably.

## Decisions

### 1. Micro-app per role, shell per audience

A micro-app is a role's workspace: its own bundle, its own home screen, its own offline scope. A shell is what gets installed. The two are not one-to-one.

| Audience | Shell | Contains | Store listings |
|---|---|---|---|
| Internal staff (per product family) | One internal Tauri shell (for example "HH Work") plus PWA | Every internal micro-app; the shell loads the ones the signed-in user's roles allow, and the user switches between them inside the shell | One per platform |
| Third parties (contractors, customers, partners) | A standalone shell per public app (for example "HH Pro") plus PWA | That app only, brand-forward | One per public app per platform |
| Operators (FutureBuild) | The launcher, later the Shade | Operator micro-apps | Internal only |

Rule: adding a role adds a micro-app, never a store listing. A new public audience is the only thing that adds a shell.

### 2. The micro-app catalog lives in the manifest

The manifest lists every micro-app with audience, roles, device context, offline mode, kit, and entry. The internal shell and the launcher render their app switchers from the catalog filtered by the user's Team roles, so the catalog is the single source of what exists.

```yaml
frontends:
  - id: yard
    audience: internal
    roles: [yard_staff, yard_lead]
    devices: [tablet, phone]
    kit: scan-and-confirm
    offline: { mode: full, scopes: [pick_lists, receiving, inventory_lookup, photos] }
  - id: counter
    audience: internal
    roles: [counter, sales]
    devices: [desktop, tablet]
    kit: list-detail
    offline: { mode: read_cache_plus_outbox, scopes: [customers, quotes, orders] }
  - id: pro
    audience: external
    roles: [contractor, customer]
    devices: [phone, desktop]
    kit: guided-flow
    shell: standalone
    brand: hh-pro
    offline: { mode: read_cache_plus_outbox, scopes: [quotes, price_matrix, orders] }
```

### 3. UX principles for the family

- One job per app. A micro-app's home is that role's top three tasks, reachable in one tap; everything else is a level down.
- Same chrome everywhere: a thin shell bar with org, user, app switcher, sync state, and notifications; identical across internal micro-apps so switching apps never means relearning the frame.
- Handoffs are explicit. Work crosses roles through shared entities (order, quote, pick list, customer) opened by deep link in the other role's app, never by duplicating the other role's screens. Each shared entity has one canonical detail view component reused by every app that can see it.
- Role-shaped defaults, not role-shaped forks. Filters, sort orders, and quick actions are set per role in the catalog; the underlying components are the same.
- Status is visible and honest: sync state, offline queue length, last successful sync, and "needs review" items are always one glance away.
- Fewer screens, more states. Empty, loading, offline, conflict, and error states are designed once per pattern and inherited.
- Accessibility as a requirement: yard apps assume gloves, sunlight, one hand, and noise (large targets, high contrast, haptics through the shell, minimal typing, scanning over searching). Office apps assume keyboard and multi-window.
- Brand split: internal apps are utility-first on the FutureBuild token set with the product's accent; external apps are brand-forward on the product's public brand (HH Pro's own palette and voice) while sharing the same components underneath.

### 4. Design system structure

Four layers, each versioned with the monorepo and mirrored in Penpot as a library.

| Layer | Contents | Owner |
|---|---|---|
| Tokens | Colour, type, spacing, elevation, motion; one base set plus per-brand overrides (`tokens.css`, `tokens.hh-pro.css`) | Grant |
| Primitives | Ionic and Lit elements: buttons, inputs, lists, cards, sheets, toasts, scanner, signature pad | Grant and engineering |
| Patterns | Composed behaviours: list-detail, scan-and-confirm, guided flow (wizard), dashboard, approval card, conflict review, offline banner | Grant designs, engineering implements once |
| App kits | A kit is a starter for a micro-app type: which patterns, which chrome, which states, which device assumptions. Kits: `scan-and-confirm`, `list-detail`, `guided-flow`, `dashboard`, `inbox` | Both; a new role app starts by picking a kit |

A new micro-app is: pick a kit, name the role's three jobs, map its shared entities, pick its offline scope, choose brand. That is the design brief, and it fits on one page.

### 5. Navigation model

- Shell level: app switcher (from the catalog), org switcher (for multi-org users), notifications, sync, account.
- App level: three-job home, a short primary nav (three to five items), search scoped to the app's entities, and deep links in and out.
- Cross-app: `fb://<app>/<entity>/<id>` deep links handled by the shell; if the target app is not allowed for the user, the canonical entity detail opens in a read-only sheet inside the current app.
- Web parity: the same routes as URLs on the PWA so links in the Shade, email, and push open the right app and screen.

### 6. Device and offline UX

| Context | Rules |
|---|---|
| Shared yard tablets | Device unlock per user (PIN or biometric); the shell shows who is unlocked; audit records the person; auto-lock on idle |
| Phones in the field | Single-hand layouts, camera and scanner first, photo queue visible, offline full mode where declared |
| Office desktops | Keyboard shortcuts, dense tables, multi-pane list-detail, printing |
| Offline, all contexts | Optimistic UI with the outbox visible; conflicts surface as review cards, never as modal dead ends; the sync statechart drives the banner states |

### 7. Process with Grant

1. Role research: a short interview and shadowing note per role (the design plugin's research skills), producing the three jobs and the shared entities.
2. Kit selection and one-page brief per micro-app.
3. Penpot: one file per micro-app built from the shared library; tokens and components come from the library, never redrawn.
4. Critique against the principles in Section 3 (usability, hierarchy, consistency) before any code.
5. Handoff: the tokens pipeline exports; the component mapping is one-to-one with Lit; states are listed in the brief.
6. Build: an agent lane generates the micro-app from the kit and the Penpot file; Grant's red-pencil round-trip closes it.
7. Review on device: yard apps are reviewed on the tablet in the yard, not on a monitor.

### 8. Effect on existing decisions

- ADR-011a: `frontends[]` gains `audience`, `devices`, `kit`, `shell`, and `brand`; Tauri shells are per audience rather than per micro-app; `tauri/internal` and `tauri/<public-app>` replace `tauri/<microapp>`.
- ADR-014 (HH migration): step 1's inventory produces the role list and the catalog; step 6 becomes "internal shell plus the first internal micro-apps by role priority"; step 7 is HH Pro as the standalone public shell.
- S3-L launcher: the launcher is the operators' shell and the model for the internal shell's chrome; build the chrome once and share it.
- S8 design loop: scope is the four-layer design system and the first two kits (`scan-and-confirm`, `list-detail`), with HH Yard and HH Counter as the proving apps.
- The Shade: its cards and rooms use the same chrome and patterns, so when it attaches to the launcher it is already visually part of the family.

## Consequences

- Easier: many roles without many products; new role apps in days; one store listing per audience; consistent UX across yard, office, and field.
- Harder: the design system and kits must exist before the second micro-app, which puts real work in S8 and HH-2; the role research needs Grant's time in the yard and at the counter.
- Revisit: if a public audience needs internal-style breadth, it is a second public shell, not an internal app exposed outside.
