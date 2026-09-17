# Hardscape House (hh) addendum

The `hh` monorepo is the App Shape product for Hardscape House: one core carried from the HardscapeOS ERP with additive retrofits, role-based micro-apps in two internal shells (`hh-work`, `hh-field`) and one public shell (`hh-pro`), plus the public desk. The transformation path and every decision live in `docs/analysis/` (`transformation-path.md`, `DECISIONS.md` D1 onward, `sessions/HH-2` to `HH-12`).

## Read order for this repository
`docs/analysis/DECISIONS.md`, then the current session file under `docs/analysis/sessions/`, then `docs/analysis/transformation-path.md` section on standing rules, then `docs/adr/`.

## Standing rules carried from the products
- Money never queues. Tenders, payments, delivery-date commits, and freight raises resolve online; the till has no outbox. Never queue anything money-shaped.
- Never render a confident wrong number. Cached prices are labelled estimates until the core confirms on sync; the refusal sentence is the contract when the core cannot answer.
- HH Pro's stage and pricing guards are server-side rules in the core; the browser never gates money or stage transitions.
- The core resolves prices in D1's order (contract price final; base; quantity break replaces the tier; promotions never stack). The running ERP's resolver is untouched until its roles switch; the pre-switch pricing difference report is signed by the sales manager before sales roles move.
- One canonical `order` aggregate; `OrderCard` is a projection. `dealer_quote` and `customer_quote` share only `quote_line`. Attachments are `attachment` plus `attachment_link`. Tenant branding is `tenant_brand`, rendered inside HH Pro's frame.

## Strangler discipline
- The schema is additive-only until the ERP cutover session; the ERP's own test suite runs against the shared schema in every session and must pass.
- The tracking lane keeps `core/db/PORTED.md` current: every ERP change landed during the delivery is ported or explicitly deferred with a reason. No session closes with an unrecorded ERP change.
- A role switches completely or not at all; the old app becomes read-only for that role with the sentence naming the new app. Rehearse the rollback before every switch.
- The in-flight HardscapeOS delivery is never paused or rewritten from here.

## Shells, roles, offline
- Roles are gated in the core from app-role tables keyed by platform user id; Appwrite Teams are the coarse gate only. The ERP portal's contractor role set is canonical; driver is a role plus a profile row.
- `hh-field` (Yard, Drive) is phone-first with camera and GPS and offline full mode for its declared scopes; `hh-work` is desktop and tablet with read cache plus outbox; `hh-pro` is the brand-forward public shell; homeowner acceptance is a magic-link page under HH Pro's brand.
- The `offline-store` package and the `sync` statechart are the only offline implementation; no micro-app rolls its own cache or queue.

## Open by design (do not decide in a lane)
Per-role landing default (HH-6 mid checkpoint with Grant), the warranty micro-app (HH-9 design sync), the BisTrack phase state (HH-11 start checkpoint), Team memberships as OIDC claims (S2 verification).
