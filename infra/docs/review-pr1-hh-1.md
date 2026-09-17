# Review: PR #1, HH-1 analysis and transformation path

Reviewed the full branch `analysis/hh-1` at `21db1e6` against the FutureShade context, ADR-011, 011a, 011b, 013, 014, the harness routing note, and the three decisions in `DECISIONS.md`.

## Verdict

Approve the analysis as the basis for HH-2, with the fixes below applied first. The path is executable rather than descriptive: every session file has lanes with paths, acceptance checks, and paste-ready prompts; the integrator and verifier steps are concrete; the exit tests are observable. The four load-bearing choices are right and should be treated as settled:

1. **The core is the ERP's Go monolith carried with additive retrofits**, not a rewrite. That protects the in-flight delivery, matches the App Shape, and keeps 312 unit files and the gate suite as regression armour.
2. **The tracking lane (HH-3.7) with `core/db/PORTED.md`** is the mechanism that makes "sequence around the delivery" a fact instead of a promise. Keep it in every verifier checklist as the standing rules say.
3. **Database convergence as the pivot (HH-5)**, additive-only schema until cutover, the ERP's own suite run against the shared schema in every session, per-table checksums, a rehearsed rollback, and a per-role read-only switch that refuses writes with a sentence naming the new app. This is the safest strangler design I have seen for a live ERP.
4. **The product rules carried as standing rules**: money never queues, never render a confident wrong number, the refusal sentence is the contract, HH Pro's stage and pricing guards move server-side. These are worth promoting into the App Shape's pattern library for Gable.

## Blocking fixes before HH-2

**F1. The repository is public.** `hh_pro_dibbits` is a public GitHub repository, so PR #1 publishes Dibbits' ERP module catalog, in-flight work, gate-criteria mapping, pricing conflicts, and staging deployment shape. Make the repository private now (and confirm `hardscapeos_dibbits` is private). Since the content has already been visible, assume it was fetched; there is nothing secret-shaped in it (the house rules held), but it is client-confidential. Going forward, analysis of client repositories lands only in private repositories, and Pre-S0's org settings keep repository creation private by default.

**F2. The role catalog still declares one internal shell.** `role-catalog.yaml` lists `hh-internal` loading ten micro-apps, and the micro-app files carry the old shell ids, while D2 splits it into `hh-work` and `hh-field`. HH-2.2 generates `manifest.yaml` from the catalog, so the split must be applied to the catalog and the micro-app files first, and the coverage check re-run. HH-2.1's skeleton prompt also still says `tauri/internal`; it should create `tauri/hh-work`, `tauri/hh-field`, and `tauri/hh-pro`.

**F3. HH-2's preconditions assume the `futureshade` org and the `template` repo.** Decision: the `hh` monorepo lives under `futurebuildai` for now, with an HH account later. Change HH-2.1 to create `hh` under `futurebuildai` and generate the App Shape skeleton in-session from context section 4.2; the `template` repository is not a precondition.

**F4. Platform dependencies are implicit.** HH-3 can run against a preview database with test-generated JWKS keys, but HH-5 needs S0 (Managed Postgres, the `dibbits` org database) and S2 (Appwrite identity so real tokens exist). State S0 to S2 as preconditions of HH-5 in `transformation-path.md` so the platform Sessions are visibly on HH-5's critical path.

## Decisions to close now (from the twelve catalog questions)

D1 to D3 closed questions 1 to 6 and 10. Of the remaining five:

- **Q7 (operator micro-app or launcher):** the launcher. Per the v1 launcher decision, operators use the launcher and later the Shade's operator mode; `operator-console` in the catalog becomes a launcher section, not an `hh` micro-app.
- **Q9 (does the till get an outbox):** no. Standing rule 4 already decides it: tenders, payments, delivery-date commits, and freight raises resolve online; the till caches reads and queues nothing money-shaped.
- **Q12 (deep-link root for an order on both sides):** one canonical `order` id in `core` after unification, with the contractor-side id kept as an alias column for the mapping period; `fb://hh/order/<id>` carries the canonical id only. Resolve in HH-2.3's OpenAPI document.
- **Q8 (per-role landing as served row or switcher default):** the shell's switcher default, seeded from the served table during migration. Confirm with Grant at the HH-6 mid checkpoint.
- **Q11 (warranty as its own micro-app):** defer to the HH-9 design sync with Grant; the catalog keeps it split until then.

Record these as D4 to D6 in `DECISIONS.md` (Q7, Q9, Q12 now; Q8 and Q11 as pending with their checkpoint named) so HH-2.4 can draft them alongside the others.

## Non-blocking recommendations

- **`citext`:** 51 migrations use it and it is a standard contrib extension. Amend ADR-011's allowlist to include `citext` rather than rewriting the baseline. The HH-2.4 extensions ADR should record that and the PostgreSQL major-version move together.
- **Session labels:** the path expands the master plan's HH-1 to HH-5 into HH-2 to HH-12 and documents the mapping. Update the master plan, the context file section 8, and the Plane seed to the eleven-session path so the tracker and the plan agree.
- **Merge PR #1** into `master` of the HH Pro repository once private, so the branch is not lost; HH-2.5 then copies `analysis/` into `hh/docs/analysis/` as planned.
- **Gable section:** good. Note for later that G-1's pricing ADR "re-derived for LBM" should start from D1's resolution order and record only what LBM changes, so the two products share one pricing vocabulary.
- **Kits and states:** "five kits, five states, both measured-contrast gates" in HH-4 is the right scope; make the yard app's gloves-and-sunlight assumptions from ADR-011b explicit in the `scan-and-confirm` kit's acceptance.

## Read order for Grant

`role-catalog.yaml` (after F2), then `microapps/yard-pick.md`, `microapps/counter-till.md`, `microapps/quote-desk.md`, `microapps/pro-procurement.md`, then the D2 section of `DECISIONS.md`. The twelve open questions are at the bottom of the catalog; only Q8 and Q11 still need design input.
