---
name: ar
description: Gable ERP invoicing/accounts-receivable domain — endpoints, payment methods, invoice status lifecycle, money rules, and the AR workflow for the gable-ar app.
---

# Invoicing / AR on Gable

Gable is an ERP for lumber & building-materials dealers. This skill is the
accounts-receivable cheat sheet for the `gable-ar` micro-UI.

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
- `GET /api/v1/accounts/{id}/transactions` — AR ledger: `{type: INVOICE|PAYMENT|ADJUSTMENT|REFUND, amount, balance_after, description, created_at}`. Payments post as negative amounts.

Not wired as actions (future): `GET /api/v1/invoices/{id}/payments` (payment
history), `POST /api/v1/invoices/{id}/credit-memo` (body `{amount_cents, reason}`
— note this endpoint *does* use `amount_cents`), `GET /api/v1/credit-memos/{customerId}`,
`GET /api/v1/accounts/{id}` (balance/credit-limit summary).

## Domain rules

- **Money is integer cents** in app code and in gable (`subtotal`, `tax_amount`,
  `total_amount`, payment `amount`). Format as currency only at display.
- **Payment methods** (exact strings): `CASH`, `CHECK`, `CARD`, `ACCOUNT`.
  `ACCOUNT` = charged on the customer's account. There is no `ACH` method.
  CARD via `POST /api/v1/payments` records a manual card tender; gateway-charged
  cards go through gable's POS flow.
- **Branches**: invoices are branch-scoped (`X-Branch-Id`). Customers may be
  org-wide; the AR ledger follows the customer.
- **Refunds** only succeed for payments that have a `gateway_tx_id`; check or
  say so rather than promising a cash/check refund.
- Idempotency: mutations must carry an idempotency key (the client does this).
