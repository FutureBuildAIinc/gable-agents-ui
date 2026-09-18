---
name: quoting
description: Gable ERP sales/quoting domain — endpoints, quote lifecycle, money/UOM rules, and the quoting workflow for the gable-quote app.
---

# Quoting on Gable

Gable is an ERP for lumber & building-materials dealers. This skill is the
quoting-domain cheat sheet for the `gable-quote` micro-UI.

## Quote lifecycle

`draft → sent → accepted → converted` (terminal states also: `expired`, `cancelled`).
Conversion creates a sales order (`orders` table) from the quote lines.
Accept+convert is one call on the integration surface; on `/api/v1` it is
`PUT /api/v1/quotes/{id}/state` then `POST /api/v1/quotes/{id}/convert`.

## Endpoints this app uses

- `GET /api/integration/products?category=&limit=&offset=` — product search (integration key).
- `POST /api/integration/quotes/bulk-price` — body `{customer_id, lines:[{product_id, quantity}]}` → priced lines from the pricing engine (price levels, rules, rebates, escalators).
- `POST /api/integration/quotes` — body `{customer_id, job_id?, notes?, lines:[{product_id, quantity, unit_price?}]}` → creates draft quote.
- `POST /api/integration/quotes/{id}/accept-and-convert` — quote → order.
- `GET /api/v1/quotes?status=&limit=&offset=` / `GET /api/v1/quotes/{id}` — JWT + `X-Branch-Id`.

## Classic ERP bridge

`classic-link {entity, id}` → `{url, openInNewTab}` to the classic Lit UI
(quote `/quotes/{id}`, order `/orders/{id}`, invoice `/invoices/{id}`,
product `/inventory/{id}`, customer `/accounts/{id}`; base from
CLASSIC_UI_BASE_URL). Use it when the user wants the full desk UI; never
build URLs by hand.

## Domain rules

- **Money** is integer cents in app code. Format as currency only at display.
- **Quantities** are DECIMAL(19,4) with a UOM (LF, BF, SQFT, EA…). Never drop the UOM.
- **Branches**: quotes/orders/inventory are branch-scoped (`X-Branch-Id`). Customers may be org-wide; products are org-wide with branch stock.
- **Pricing**: always call the pricing engine (`bulk-price`); customer price levels and rules make list price unreliable.
- **Jobs**: contractor customers have `customer_jobs`; quote to the job when known.
- Idempotency: mutations must carry an idempotency key (the client does this).
