# Gable addendum

Gable is FutureBuild AI's ERP product line for LBM (lumber and building materials) dealers, with satellite modules (the LumberNow portal, AI_LM). The repositories were split in the current cycle along the OpenLBM public and private licence boundary. Gable migrates onto the App Shape after Hardscape House (sessions G-1 to G-4) reusing the shared packages built for `hh`; the plan for that migration is ADR-012, written from the HH transformation path, and until it exists no structural change to these repositories is made from a session.

## Rules specific to Gable
- Respect the licence boundary. Code does not move between the OpenLBM public repositories and the private product repositories without an ADR that names the licence implication. Never copy private code into a public repository.
- Whether the satellites consolidate into a modular monolith with the ERP core is an open ADR question; do not pre-empt it by merging or splitting packages in a lane.
- Vocabulary is LBM, not hardscape: dealer, yard, counter, contractor, quote, order, receiving, inventory, price matrix. Reuse the HH entity shapes where they fit and record any divergence as a decision, so the two products share one pricing and order vocabulary.
- Gable is a product in the client implementation model: it must expose a capability manifest that lists every feature it can switch on per client. Client-specific behaviour is a capability flag or an implementation-repo configuration, never a fork of product code. The first implementation is `impl-gable-dibbits`.
- Demo and walkthrough tours are re-scripted from the HH tours with LBM vocabulary and live in `impl-gable-demo`.

## Read order
`docs/adr/` (ADR-012 when present), the current session file, `manifest.yaml`, then the shared packages' documentation in `hh` for the patterns being reused.
