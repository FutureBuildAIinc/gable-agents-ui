# HH First Deployment and Public Walkthroughs

**Decision:** the HH ecosystem (core, HH Work, HH Field, HH Pro, public desk) is the first deployment on FutureBuild Cloud once S0 to S2 stand, and it ships with a public demo org and guided walkthroughs for prospects, onboarding, and release checks.

---

## 1. Environments and orgs for HH

| Org | Purpose | Data | Access | Lives |
|---|---|---|---|---|
| `hh-staging` | Internal QA of every HH session's QA branch | Anonymised seed, reset on each deploy | Operators and reviewers | First up, right after S2 |
| `hh-demo` | Public walkthroughs and sales demos | The seed scenario, reset nightly and on demand | Prospects via time-limited demo sessions; operators for guided demos | After HH-7 (yard plus counter plus quotes exist) |
| `dibbits` | The client's production instance | Real, converged in HH-5 | Dibbits staff and contractors | HH-5 onward |
| Branch previews | "Try this change" per pull request | Seed | Reviewers, then members through the Shade later | From S2 (Sites) and Coolify PR previews |

All four are ordinary orgs on the platform: `hh-demo` is the implementation repository `impl-hh-demo` (manifest with every capability on, brand `hh`, seed pointed at the demo scenario, integrations stubbed, payments in test mode), so the demo is provisioned and upgraded exactly like a client and never drifts from the product.

## 2. The demo org

- **Seed:** the HH Pro scenario and demo seed the analysis carries (`hh_pro_dibbits/src/core/data/scenario.ts`, the ERP's additive `demoseed`), priced through `core` so every number a prospect sees is what the product computes. Deterministic ids, nightly reset, an operator "reset now" action in the launcher.
- **Access:** no signup. A public entry page issues a time-limited demo session per role (dealer owner, counter, yard, driver, contractor, homeowner) through Appwrite's magic-URL flow against pre-provisioned demo users; sessions expire and the org resets, so a prospect can break nothing and see nothing real. Operators can also start a guided demo from the launcher and hand a link to a prospect.
- **Guardrails:** a visible "Demo" banner in every shell; rate limits at the Traefik edge and DigitalOcean Cloud Firewalls; outbound integrations stubbed; email and push routed to a sink; no export; the demo org excluded from the project brain.
- **Devices:** the entry page shows QR codes so a prospect installs HH Field or HH Pro as a PWA on their phone in two taps. That is the demo that sells a yard app.

## 3. The walkthrough system (built once, used four ways)

| Piece | What it is | Used for |
|---|---|---|
| `guided-tour` pattern in the design system | Step overlays with spotlight, copy, and a next action; role-aware; works in every shell; skippable and resumable | Prospect walkthroughs, member onboarding |
| Scenario scripts as statecharts | A walkthrough is a statechart in `statecharts/tours/`: states are steps, transitions are the user's actions or scripted data changes, guards check the app reached the expected state | Agent-legible, testable, and the same file drives the tour, the recording, and a release check |
| Scripted data | Each tour ships the seed slice it needs (a contractor plan at the right stage, a pick list, a run with stops) applied on tour start | Repeatable demos; no "let me find a good example" |
| Recordings | A headless run of the tour statechart in a browser produces the video and screenshots for the marketing site and release notes | Public-facing walkthrough pages without manual recording |

The first three tours, in the order the path makes them possible: **Counter to yard** (a quote becomes an order, the yard picks it, offline, on a phone), **Contractor to homeowner** (a contractor builds a plan in HH Pro, the desk prices it, the homeowner accepts by magic link), **Dispatch to delivery** (a run is planned, the driver delivers with proof of delivery queued offline).

## 4. Public-facing surfaces

- A walkthrough landing per audience on the Hardscape House site (dealer owner, counter, yard, contractor), each with the recording, a two-line "what you are looking at," and the demo entry link for that role.
- The demo entry page itself lives under the HH Pro brand on Sites, with the role cards and QR codes.
- Release notes generated from tour recordings when a tour's statechart changes, so every visible change has a clip.

## 5. Where it lands in the path

| Session | Addition |
|---|---|
| S2 | `hh-staging` org provisioned as the first org after `fb`; Sites previews verified |
| HH-4 | `guided-tour` pattern in the design system; the tour statechart convention and its model-based test harness |
| HH-5 | The demo scenario as tenant seed (already HH-5.2) plus per-tour seed slices; `impl-hh-demo` created from the implementation template with the demo manifest |
| HH-7 | `hh-demo` provisioned; tour 1 (counter to yard) built and recorded; the public entry page with role cards and QR codes |
| HH-8 | Tour 3 (dispatch to delivery) |
| HH-10 | Tour 2 (contractor to homeowner); the audience landing pages on the Hardscape House site embed the recordings and entry links |
| HH-11 and HH-12 | The tours run as release checks against `dibbits` staging before each cutover step; the export proof includes `impl-hh-demo` |
| Gable | The same tours re-scripted with LBM vocabulary; `impl-gable-demo` |

Preconditions unchanged: S0 to S2 before `hh-staging`; nothing here touches the in-flight delivery.

## 6. Prompt to fold this into the branch (for the Claude Code session, after the review is applied)

```
Add the demo and walkthrough layer to the HH path, analysis/ files only, same house rules.
1. In transformation-path.md add a section "Environments and orgs" listing hh-staging, hh-demo, dibbits and branch previews with purpose, data, access, and the session each first exists in, per the table you are given.
2. Add lanes: HH-4 gains a guided-tour design-system pattern and a tour statechart convention with model-based tests; HH-5 gains per-tour seed slices and the creation of impl-hh-demo from the implementation model; HH-7 gains provisioning of hh-demo, the counter-to-yard tour built and recorded, and a public entry page with role cards and QR codes; HH-8 gains the dispatch-to-delivery tour; HH-10 gains the contractor-to-homeowner tour and the audience landing pages; HH-11 and HH-12 run the tours as release checks and include impl-hh-demo in the export proof.
3. Each new lane follows the required format with scope, touches, acceptance and a paste-ready prompt. Demo guardrails are acceptance criteria: visible banner, rate limits, stubbed integrations, expiring sessions, nightly reset.
4. Update the Gable section: the same tours with LBM vocabulary and impl-gable-demo.
Push and list what changed.
```
