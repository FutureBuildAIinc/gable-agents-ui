# Module experience design — user flows for the gable-* micro-app surfaces

**Status:** design contract v1 · **Date:** 2026-09-18
**Feeds:** the brand rebrand pass, Dibbits workflow validation, and the seed-data
plan. Implementation follows this doc; deviations get recorded here.

Personas (one LBM dealer, one of each): **Sales** (inside/counter), **AR**
(office manager), **Yard** (warehouse lead), **Dispatch** (delivery
coordinator), **Builder** (the agent-builder using Studio).

## 0. The shared experience model (all modules)

Every module is the same shape, learned once:

```
┌──┬──────────────────────────────┬─────────────────┐
│R │                              │  ARTIFACT PANE  │
│A │        CHAT (center)         │  (live screen)  │
│I │  "Other…" freeform + driver  │  detach → 2nd   │
│L │  handoffs land here          │  monitor        │
└──┴──────────────────────────────┴─────────────────┘
```

- **Launcher** (`/launch`): tiles per job-to-be-done + the Classic ERP tile.
  Tiles are verbs, not menus ("New Quote", not "Quote Editor").
- **Every workspace** is agent-operable: shared-draft state (human UI and
  agent write the same doc), driver bar (type/upload/buttons → agent runs),
  screen tracking (agent sees what you see via `view-screen`).
- **Step ownership notation** used below: **H** human drives, **A** agent
  drives, **H/A** either — the point of the pattern is that ownership can
  flip mid-flow without the flow changing.
- **Kill-switch rule:** every A-step has an H-escape (a button that does the
  same thing). The agent is an operator, never a dependency.
- **Bridge moments** to the classic ERP (`classic-link`) are named per module:
  the desk UI remains home for deep/keyboard work (GL, PO editing, pricing
  rule admin); micro-apps are for velocity + agent leverage.

---

## 1. gable-quote — Sales & Quoting

**Job:** turn "what'll that run me?" into a priced, accepted order — fast,
accurately, with margin visibility.

### Flow Q1 — Counter quote (the 4-minute path)  *[primary]*
1. **H**: Launcher → *New Quote* (artifact pane opens builder).
2. **H**: Type customer in the box (top-7 fuzzy matches, account number +
   balance chip — credit awareness at glance).
3. **H/A**: Add lines — type-ahead SKU/name search, qty stepper, UOM badge;
   or paste a list / upload CSV into the driver bar.
4. **A**: *Price* — engine prices every line; margin column appears; agent
   flags thin/negative margins inline (red chip + reason: cost change,
   price-level, rebate).
5. **H**: *Create quote* (confirm) → pane navigates to quote detail.
6. **H/A**: *Send* — email/PDF via driver bar ("send to the customer with a
   note about lead time") or the button.
7. **H/A**: *Accept & convert* — one click or "the customer said yes";
   confirm-gated (creates a real order). Order number appears with a
   **→ Dispatch board** handoff chip and a **→ Classic order** classic-link.

### Flow Q2 — Material-list quote (upload day)  *[the agent showpiece]*
1. **H**: Driver bar → *Upload material list* (CSV/TXT/photo-of-takeoff
   later). (A): agent parses, matches SKUs, fills the builder **live on
   screen** — lines stream in, prices populate; user watches work happen.
2. **A**: reports unmatched items as a compact table ("these 3 need you") —
   never silently guesses.
3. **H**: resolves mismatches (pick from alternates the agent offers).
4. Continue Q1 from step 4. Agent suggests *quantification sanity* ("OSB
   sheathing for 2,400 sqft ≈ 80 sheets — you have 40") before pricing.

### Flow Q3 — Stale-quote roundup  *[events-driven, proactive]*
1. **A** (triggered by launcher tile *Follow-ups* or morning chat prompt):
   "7 quotes >10 days old, $84k total — top 3 by value are…".
2. **H/A**: "draft follow-ups" → agent drafts per-customer nudges (in-chat,
   editable) → human sends.
3. **H**: accept path back into Q1 step 7.

### Flow Q4 — Exposure awareness  *[lumber-index quotes]*
- When a quote contains commodity lines, the detail screen shows an
  **exposure chip** (from gable's price-exposure subsystem): CLEAR /
  ACK_REQUIRED / BLOCKED. ACK is an H-step by policy. Blocked quotes link to
  the classic exposure screen for the owner override.

**States:** DRAFT → SENT → ACCEPTED → CONVERTED (+ EXPIRED/REJECTED).
Every state change is an artifact: status ribbon on detail, event to the
backbone, quote list badge.

**Agent-driver moments:** fill-from-list · price+margin review · alternate
suggest (same spec, better margin/stock) · follow-up drafting ·
"make it win" re-price within authority (agent never discounts alone —
proposes, human confirms).

**Classic bridge:** quote analytics/exposure screens; pricing-rule admin.

---

## 2. gable-ar — Invoicing & Receivables

**Job:** cash in, disputes out, no surprises for the sales floor.

### Flow R1 — Morning cash (batch check posting)  *[primary; the daily ritual]*
1. **H**: Launcher → *Post receipts* → the **batch workspace**: a rapid-entry
   stack — customer/invoice/amount/reference, keyboard-first (Enter = next),
   running batch total vs. the deposit slip in hand.
2. **H/A**: or paste the deposit-list into the driver bar; agent maps
   remittances to open invoices, fills the batch **on screen**.
3. **H**: *Post batch* (confirm) → payments post, invoices flip
   PAID/PARTIAL, receipts print; agent narrates exceptions (short-pays,
   unknown remitter → unapplied cash row).
4. **A**: "batch summary for the file" → formatted note in chat.

### Flow R2 — Aging workdown
1. **H**: Launcher → *Aging* → buckets 0/30/60/90 with customer rows
   (balance, last payment, open orders, credit-limit bar).
2. **H/A**: pick a customer → pane becomes their AR ledger; agent reads it
   aloud on request ("they've been 45-day for three cycles, $12.4k, always
   pays after the 10th").
3. **A**: *Draft statement + dunning note* → editable in chat → send.
4. **H**: log a promise-to-pay (quick action) — pinned note on the account.

### Flow R3 — Dispute → credit memo
1. **H/A**: from invoice detail (pane) — "line 4 was damaged" → agent drafts
   the credit memo (amount pre-filled from the line).
2. **H**: *Issue credit* (confirm-gated; writes AR + GL via gable).
3. Agent offers the follow-up: re-invoice corrected line / note the account.

### Flow R4 — Credit holds (cross-module, events-driven)
- `order.confirmed` events with ON_HOLD status surface in AR as a **Credit
  holds** queue tile: customer, over-limit amount, the held order
  (classic-link), one-click *Release for owner review* → drafts the request;
  release itself is owner-only (H, classic or future permission).

**Agent-driver moments:** remittance mapping · aging narration · dunning
drafts · dispute summaries with invoice-line citations · month-end "who
should I call first" ranking.

**Classic bridge:** GL drill-down, statement printing at scale, payment
gateway config.

---

## 3. gable-inventory — Stock, Yard & PIM

**Job:** know what you have, what's available (not just on-hand), and what
to buy next.

### Flow I1 — Counter availability (the #1 phone question)
1. **H/A**: chat or pane: "2×10×16 SPF — what've we got?" → availability
   card: on-hand / allocated / available by location+bin, UOM-correct
   (BF vs EA never mixed), lead time if zero.
2. **A**: alternates ("Trus Joist equivalent in stock; dimensional is
   3 days out").
3. **H**: *Reserve* quick-action on the card → drafts a quote (→ Q1).

### Flow I2 — Cycle counting
1. **H**: Launcher → *Count sheet* → location/bin picker → printed-style
   count list (blind counts — quantities hidden).
2. **H**: enters counts (keyboard grid).
3. **A**: variance table appears with reason-code chips (damage, mis-pick,
   receiving error, shrink); agent proposes adjustments.
4. **H**: *Post adjustments* (confirm-gated batch; each writes a
   double-entry move with reason).

### Flow I3 — Reorder review
1. **A**: morning: reorder-alerts digest in chat ("8 SKUs below reorder
   point; suggested PO $31k; two have vendor lead-time spikes").
2. **H/A**: *Review* → pane shows suggestion rows (on-hand, on-order, 30-day
   velocity, suggested qty). Human tweaks; agent explains any line.
3. **H**: *Send to purchasing* → drafts the PO (classic-link to finish — PO
   approval lives in the desk app per policy).

### Flow I4 — Transfers & adjustments
- Quick-action cards: branch-to-branch transfer (from/to/qty/reason),
   single adjustment with mandatory reason code. Both confirm-gated;
   double-entry semantics explained in a one-line helper under the form.

**Agent-driver moments:** variance narration · "why is allocated so high on
this SKU" (traces open orders) · alternates · PIM copy generation
(description, unit label) into a review card (H approves → PATCH product).

**Classic bridge:** PO receiving, bin/location admin, PIM bulk ops.

---

## 4. gable-dispatch — Loading, Picking & Delivery

**Job:** today's orders on trucks, in the right order, with proof.

### Flow D1 — The daily board  *[primary]*
1. **H**: Launcher → *Dispatch board* → date = today: orders-for-date as
   cards (customer, town, will-call vs delivery, size/weight class,
   promised window).
2. **A**: *Build routes* — agent clusters by geography/size, proposes N
   routes with stop sequences; **routes appear on the board live**.
3. **H**: drag/± stops (or tell the agent), assign vehicle+driver from
   chips; conflict warnings (DOT hours, vehicle capacity) inline.
4. **H/A**: *Dispatch* per route (confirm) → status IN_TRANSIT; drivers get
   their day (classic /driver surface, linked).
5. **H**: track completion → *Complete route* when stops are
   delivered/failed/partial; POD photos land on the route detail.

### Flow D2 — Will-call / pick coordination
- Board column *Will-call*: pick tickets; *Ready* action → notifies sales
  (event); customer pickup at counter links back to POS (classic).

### Flow D3 — Hot-shot insert
1. **H/A**: "add a hot-shot stop to Route 2" → agent re-sequences
  (reorder endpoint), warns if a promised window breaks.

**Agent-driver moments:** route building + load sequencing (heavy items
last-on-first-off hint) · delay replanning ("truck 12 is 40 min behind —
who gets called?") · end-of-day narration (delivered/failed/partial + POD
gaps) → drafts the day report.

**Classic bridge:** driver management, fleet/vehicle admin, full route
history.

---

## 5. gable-studio — Build & customize the workbenches

**Job:** the dealer's own dev-in-a-box — adjust a micro-UI or spawn a new
one from a conversation, safely.

### Flow S1 — Customize
1. **H**: Launcher → *Studio* → tile per installed gable-* app.
2. **H/A**: "add a margin column to the quote list" → agent reads the
   template, edits the file, **renders a static preview of the changed
   screen in the pane** (sanitized HTML).
3. **H**: approve → applied to the working copy; *Deploy* registers it
   (idempotent) — with a "new apps need pnpm install + restart" honesty
   note.

### Flow S2 — New micro-UI from a conversation
1. **H/A**: describe the job ("a returns-workflow app for our counter") →
   agent scaffolds from the conventions doc (actions/screens/skill),
   previews each screen as it goes, wires the launcher tile, deploys
   hidden. Guardrails visible: path confinement + extension allowlist +
   sanitized previews (stated in the UI, not just docs).

**Classic bridge:** none — Studio builds only on our side of the fence.

---

## 6. Cross-module choreography (the compounding wins)

- **Quote accepted** (Q1) → dispatch board's *Tomorrow* lane gains the order
  card (event `order.confirmed`); AR sees nothing yet (healthy).
- **Order ON_HOLD** (credit) → AR *Credit holds* queue (R4) AND the
  salesperson's chat gets a heads-up with the quote context.
- **Route completed** (D1) → invoice event → AR ledger updates; Studio's
  user hears nothing (correct — role-scoped experiences).
- **Morning digest** (per persona, chat): each app's proactive slot
  (Q3 stale quotes · R1 batch prompt · I3 reorder digest · D1 board
  pre-build) — one message, links open the right artifact.

## 7. Maturation ladder (how the ceiling gets earned)

1. **Buttons** (done) — actions are clickable, agent behind each.
2. **Driver bar + shared draft** (done) — agent operates the visible screen.
3. **Upload/vision flows** (Q2 seeded) — documents in, work out, on screen.
4. **Proactive digests** (§6) — the app opens with today's work pre-read.
5. **Cross-app A2A** — the quote agent asks the inventory agent to reserve;
   visible to the human as a compact handoff card in chat.
6. **Memory** — per-customer quoting norms ("Kelbrook takes 2×10 SPF,
   never finger-jointed") surfaced at Q1 step 2 as a chip.

## 8. Implementation notes

- Flows need seed data shaped for them: customers with credit states,
  aging histories, allocated stock, orders-for-today, unmatched-list
  fixtures for Q2. The seed plan must cover per-flow scenarios, not just
  catalog volume.
- Dibbits review maps onto this doc: patterns that contradict these flows
  get reconciled here before code.
- Brand pass implements tokens/components only — no flow changes during
  rebrand.
