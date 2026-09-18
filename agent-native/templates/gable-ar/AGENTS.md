# Gable AR — Agent Guide

Gable AR is the invoicing/accounts-receivable micro-UI for a lumber &
building-materials dealer. It runs on the Gable ERP backend: **gable is the
system of record** for invoices, payments, refunds, credit memos, orders, and
customer AR ledgers. This app owns no ERP data — its local database holds only
framework state (threads, app state, sync).

The workbench follows docs/ux/module-flows.md §2 (flows R1–R4): every workspace
is agent-operable — shared-draft state both the human UI and the agent write, a
driver bar (type/voice/upload/buttons → the agent runs), and screen tracking so
the agent sees what the user sees.

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-invoices` | GET | List invoices, filter by status (UNPAID/PARTIAL/PAID/VOID/OVERDUE) |
| `get-invoice` | GET | One invoice with lines/totals |
| `list-orders` | GET | List orders (gable has no status filter — filter client-side; ON_HOLD = credit-holds queue) |
| `account-summary` | GET | Customer balance_due / credit_limit / available_credit (integer cents) |
| `customer-transactions` | GET | Customer AR ledger with running balance |
| `record-payment` | POST | Record a payment — posts to the AR subledger, updates invoice status. Confirm with the user first |
| `refund-payment` | POST | Refund a card payment (full or partial). Confirm with the user first |
| `receipts-set-draft` | — | Agent's write tool for the batch-receipts screen (shared draft `ar-batch`): setSource, setSlipTotalCents, addRows, updateRow, removeRow, markMapped, setNotes, clear |
| `classic-link` | GET | Deterministic deep link into the classic gable ERP desk UI — never fabricate ERP URLs |
| `view-screen` / `navigate` | — | Context-awareness contract; call `view-screen` first |

All gable access goes through `server/lib/gable.ts` (`@gable/client`). Never
fetch gable URLs directly, and never add hand-written JSON routes.

## Core Rules

- **Money is integer cents** in gable and in every action input
  (`amountCents`). Convert to dollars only for display.
- Branch scoping: invoices and AR data are branch data. Pass `branchId`
  (action input) — it becomes `X-Branch-Id`. If the user's branch is unclear,
  ask or use `view-screen`/application state.
- **Confirm before financial writes.** Never call `record-payment` or
  `refund-payment` without the user's explicit go-ahead on amount and method.
  Batch posting is human-confirmed on screen.
- Never fabricate balances, payment history, credit limits, or invoice state.
  If an action fails, say so and recover.
- **Verify writes**: after recording a payment or refund, re-fetch the invoice
  (`get-invoice`) before reporting it done.
- **Credit holds are owner-release only.** Draft the release request with
  account context; never release/confirm/fulfill an order.
- Auth: sessions are Appwrite JWTs (BYOA). Forwarded user tokens take
  precedence; the integration key covers agent/background calls.
- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.

## Screens

- `/receipts/batch` — **R1 morning cash.** Batch-receipts workspace on the
  shared `ar-batch` draft: deposit-slip total with live reconciliation, rapid
  keyboard-first entry (invoice type-ahead over open invoices, amount, method,
  reference), driver bar (voice + freeform + upload deposit list), agent
  mapping of remittances, and confirm-gated *Post batch* (sequential
  `record-payment` per mapped row; exceptions marked on the rows).
- `/aging` — **R2 aging workdown.** Buckets Current/1–30/31–60/61–90/90+ by
  invoice due date with customer rows: open balance, last payment (from the AR
  ledger), open orders (via `list-orders`), credit-limit bar (via
  `account-summary`). Click a customer → AR ledger opens in the pane. Driver
  bar drafts statements + dunning notes and the "who should I call first"
  ranking.
- `/credit-holds` — **R4 queue.** Orders with status ON_HOLD (filtered from
  `list-orders`), per-order over-limit math (via `account-summary`), classic
  ERP link (via `classic-link`), and *Request release (owner review)* which
  drafts the request with the agent. Release is owner-only.
- `/invoices` — invoice list (status badges, totals).
- `/invoices/:invoiceId` — invoice detail: lines, totals, record-payment form.
- `/accounts/:customerId` — customer AR ledger (transactions with running balance).
- `/home` — chat-first surface; the agent can run the whole AR workflow from here.

## Skills

- `ar` — domain cheat sheet (gable endpoints, payment methods, invoice status
  lifecycle, money-in-cents rule, the batch/aging/credit-holds flow).
