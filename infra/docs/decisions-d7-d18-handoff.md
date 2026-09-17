# Decisions D7 to D18, as taken by Colton

Record these in `analysis/DECISIONS.md` exactly as written, each with the conflict it resolves. All twelve are taken; none is pending.

## HH-2: contract and ADRs

**D7 (resolves C19). Board card versus dealer order.** One canonical `order` aggregate in `core`. The contractor's board card is a read projection, `OrderCard`, defined in the OpenAPI document with an explicit field map and a documented state map from dealer order states to the contractor vocabulary. No second entity, no second writer. The alias column from D6 carries the contractor-side id through the mapping period.

**D8 (resolves C15). Two documents named quote.** Two resources: `dealer_quote` (dealer to contractor, priced by `core` under D1, carries `valid_until`) and `customer_quote` (contractor to homeowner, carries the acceptance artifact and the magic-link token). They share a `quote_line` shape and nothing else. Different senders, lifecycles and acceptance semantics rule out a `kind` field.

**D9 (resolves C25). Invoice shape.** The ERP invoice is canonical: lines, tax, holdback, the AR subledger tie. The portal exposes `InvoiceView`: lines, tax and holdback totals, balance due, payment history. Contractors never see subledger internals; payments post through `core` and the fee rule from HH-3.6 applies.

**D10 (resolves C37). Attachment entity.** `attachment` in `core`: id, `org_id`, nullable `tenant_id`, `kind` (photo, proof_of_delivery, document, signature, product_image), `appwrite_file_id`, bucket, mime, size, checksum, `created_by`, `created_at`, `deleted_at`. Bytes live in Appwrite Storage. A polymorphic `attachment_link` (`attachment_id`, `owner_kind`, `owner_id`, `role`) attaches one file to orders, plans, stops, receiving and quotes without per-owner columns. Offline scopes carry attachments through `attachments_queue` as the offline framework defines.

**D11 (resolves C8). Imagery.** One `product_image` model. An uploaded image is canonical whenever it exists; the measured swatch is stored as an attribute (`swatch_hex`) and rendered only as a fallback, never as an image when a real one exists. The swatch generator stays a script, not a runtime feature.

**D12 (resolves C14). Contractor branding.** A `tenant_brand` record in `core` under tenant scope: display name, logo attachment, primary colour, footer text. Rendered inside the HH Pro frame on customer quotes and the public desk, per D2's ruling that acceptance renders under HH Pro's brand; the dealer's tokens never appear on a contractor's document.

## HH-3: schema and identity

**D13 (resolves C6). Lead time.** `lead_time_days` is a product attribute and the default. `availability` is a computed read model, never stored, with `source` in {attribute, incoming_supply, transfer}; when incoming supply or a transfer estimate exists it overrides the attribute for that quantity.

**D14 (resolves C17). Price validity grain.** Validity is document-level (`dealer_quote.valid_until`), which is the ERP's current rule and what a contractor can reason about. Each line carries a `price_snapshot` with `resolved_at` for audit. Expiry re-blocks the plan at document level. Stock holds are separate objects with their own expiry. D1's estimate label expires with the document.

**D15 (resolves C20). Frozen line versus live reference.** Both, by phase: every line stores `product_id` as the live reference and, at document freeze, a snapshot of the priced fields (sku, description, unit, unit price, tax code). Before freeze the reference renders; after freeze the snapshot renders and the reference is for navigation only.

**D16 (resolves C21). Special-order lines.** A boolean `is_special_order` plus `special_order_description` and an optional `supplier_ref`. The synthetic sku prefix is a legacy encoding; a one-time migration parses it into the boolean and keeps the original sku in the snapshot for traceability.

**D17 (resolves C24). What a contractor sees of a stop.** The minimum that answers "when, and did it arrive": an ETA window, the stop status (planned, en route, delivered, exception), the driver's first name, and the proof of delivery. Never the route, the sequence, or other stops.

**D18 (resolves C26). Card fee.** Surcharge off by default. When enabled for an org it is credit-only, capped by the jurisdiction's rule, and configured with the jurisdiction recorded; the "fee shown equals fee charged" rule from HH Pro holds byte for byte. The flat-percentage model is rejected because it cannot express the cap or the credit-only restriction. Enabling a surcharge requires a recorded jurisdiction and its cap.

## Carried as verification, not decided

Whether Appwrite Team memberships surface as OIDC claims stays a S2 check. D3 stands either way: if claims are absent, a Function enriches userinfo and the engine resolves the coarse gate from Team membership by lookup.

## Still open, by design

- Q8 (per-role landing) at HH-6's mid checkpoint with Grant; default is the switcher seeded from the served row.
- Q11 (warranty micro-app) at HH-9's design sync with Grant.
- The state of the delivery's BisTrack phase at HH-11's start checkpoint.

---

## Instruction for the session

Record D7 to D18 above in `analysis/DECISIONS.md` as taken, exactly as written, each with the conflict it resolves. Thread them into the session files: D7 to D12 into HH-2.3 (OpenAPI) and HH-2.4 (one ADR draft for the contract entities covering D7 to D12); D13 to D18 into HH-3.1 (schema) and HH-3.6 (domain rules). For D18 add to HH-3.6's acceptance that enabling a surcharge requires a recorded jurisdiction and its cap. Keep the Team-claims item as a S2 verification. New commits only, `analysis/` files only, same house rules (no em or en dashes, no dates, no secrets). Push and list what changed.
