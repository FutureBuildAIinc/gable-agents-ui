# Gable AR — Agent Guide

Gable AR is the invoicing/accounts-receivable micro-UI for a lumber &
building-materials dealer. It runs on the Gable ERP backend: **gable is the
system of record** for invoices, payments, refunds, credit memos, and customer
AR ledgers. This app owns no ERP data — its local database holds only framework
state (threads, app state, sync).

## Actions (source of truth)

| Action | Surface | Purpose |
|---|---|---|
| `list-invoices` | GET | List invoices, filter by status (UNPAID/PARTIAL/PAID/VOID/OVERDUE) |
| `get-invoice` | GET | One invoice with lines/totals |
| `record-payment` | POST | Record a payment — posts to the AR subledger, updates invoice status. Confirm with the user first |
| `refund-payment` | POST | Refund a card payment (full or partial). Confirm with the user first |
| `customer-transactions` | GET | Customer AR ledger with running balance |
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
- Never fabricate balances, payment history, or invoice state. If an action
  fails, say so and recover.
- **Verify writes**: after recording a payment or refund, re-fetch the invoice
  (`get-invoice`) before reporting it done.
- Auth: sessions are Appwrite JWTs (BYOA). Forwarded user tokens take
  precedence; the integration key covers agent/background calls.
- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.

## Screens

- `/invoices` — invoice list (status badges, totals).
- `/invoices/:invoiceId` — invoice detail: lines, totals, record-payment form.
- `/accounts/:customerId` — customer AR ledger (transactions with running balance).
- `/home` — chat-first surface; the agent can run the whole AR workflow from here.

## Skills

- `ar` — domain cheat sheet (gable endpoints, payment methods, invoice status
  lifecycle, money-in-cents rule, credit-memo note).
