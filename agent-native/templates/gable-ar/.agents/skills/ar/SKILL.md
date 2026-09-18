---
name: ar
description: Gable ERP invoicing/accounts-receivable domain — endpoints, payment methods, invoice status lifecycle, money rules, and the batch/aging/credit-holds workflow for the gable-ar app.
---

# Invoicing / AR on Gable

Gable is an ERP for lumber & building-materials dealers. This skill is the
accounts-receivable cheat sheet for the `gable-ar` micro-UI. The workbench
implements docs/ux/module-flows.md §2 flows R1–R4.

## Invoice lifecycle

Statuses (exact strings from `internal/invoice/model.go`): `UNPAID`, `PARTIAL`,
`PAID`, `VOID`, `OVERDUE`. Recording a payment transitions the invoice
`UNPAID → PARTIAL → PAID` automatically (payment service recomputes from the
payment sum). Payment terms: `COD`, `DUE_ON_RECEIPT`, `NET30`, `NET60`, `NET90`.

## Endpoints this app uses

- `GET /api/v1/invoices?status=&limit=&offset=` — list (paged `{data,total,limit,offset}`; the client unwraps). JWT + `X-Branch-Id`.
- `GET /api/v1/invoices/{id}` — invoice with lines (`product_sku`, `product_name`, `quantity`, `price_each`), `subtotal`, `tax_rate`, `tax_amount`, `total_amount`, `payment_terms`, `due_date`, `paid_at`.
- `POST /api/v1/payments` — body `{invoice_id, amount, method, reference, notes}`. **`amount` is the cents key** (not `amount_cents`). Records the payment, posts to the customer's AR subledger, and updates invoice status in one transaction.
- `POST /api/v1/payments/refund` — body `{payment_id, amount, reason}`. Full or partial; **card payments with a gateway transaction only** (needs RUN_PAYMENTS_API_KEY configured server-side).
- `GET /api/v1/accounts/{id}` — AR account summary `{customer_id, balance_due, credit_limit, available_credit}` — **integer cents**. Backs the aging credit bars and the credit-holds over-limit math (wired as `account-summary`).
- `GET /api/v1/accounts/{id}/transactions` — AR ledger: `{type: INVOICE|PAYMENT|ADJUSTMENT|REFUND, amount, balance_after, description, created_at}`. Payments post as negative amounts.
- `GET /api/v1/orders?limit=&offset=` — order list (paged; client unwraps). **No status filter server-side** — the credit-holds queue filters `status === "ON_HOLD"` client-side (wired as `list-orders`). Order statuses: `DRAFT`, `CONFIRMED`, `ON_HOLD`, `FULFILLED`, `CANCELLED`; `total_amount` is cents.

Not wired as actions (future): `GET /api/v1/invoices/{id}/payments` (payment
history), `POST /api/v1/invoices/{id}/credit-memo` (body `{amount_cents, reason}`
— note this endpoint *does* use `amount_cents`), `GET /api/v1/credit-memos/{customerId}`.

## The workbench flows (R1–R4)

- **R1 Morning cash** — `/receipts/batch` on the shared `ar-batch` draft
  (application-state key `ar-batch`, rev-based). The agent fills/maps the batch
  via `receipts-set-draft`; the human reconciles the running total against the
  paper deposit-slip total and confirms *Post batch*. Posting is sequential
  `record-payment` per mapped row — each posts to the AR subledger and flips
  invoice status. Exceptions (short-pay, unknown remitter) stay on screen as
  pending/error rows; the agent narrates them and writes the batch summary.
- **R2 Aging workdown** — `/aging`. Buckets Current/1–30/31–60/61–90/90+
  computed from invoice `due_date` client-side. Per customer: open balance,
  last payment (latest PAYMENT ledger row), open orders, credit-limit bar
  (`balance_due`/`credit_limit`). Dunning = agent drafts editable text in
  chat; the human sends. Promise-to-pay gets pinned on the account.
- **R3 Dispute → credit memo** — drafted from invoice detail by the agent
  (amount pre-filled from the line); *Issue credit* is confirm-gated. The
  credit-memo endpoint is not yet wired as an action — the agent drafts, the
  human issues in the classic desk until it is.
- **R4 Credit holds** — `/credit-holds`. `order.confirmed` events with ON_HOLD
  status surface as a queue: customer, over-limit amount (`balance_due −
  credit_limit` when positive), the held order (classic-link), and *Request
  release (owner review)* which drafts the request. **Release is owner-only** —
  never release, confirm, or fulfill an order.

## Domain rules

- **Money is integer cents** in app code and in gable (`subtotal`, `tax_amount`,
  `total_amount`, payment `amount`, account `balance_due`/`credit_limit`).
  Format as currency only at display.
- **Payment methods** (exact strings): `CASH`, `CHECK`, `CARD`, `ACCOUNT`.
  `ACCOUNT` = charged on the customer's account. There is no `ACH` method.
  CARD via `POST /api/v1/payments` records a manual card tender; gateway-charged
  cards go through gable's POS flow.
- **Branches**: invoices are branch-scoped (`X-Branch-Id`). Customers may be
  org-wide; the AR ledger follows the customer.
- **Refunds** only succeed for payments that have a `gateway_tx_id`; check or
  say so rather than promising a cash/check refund.
- Idempotency: mutations must carry an idempotency key (the client does this).
