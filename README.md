# Rinova BD

Rinova BD is a mobile-first beauty and personal-care storefront built for Bangladesh, with a premium pastel visual system and Meta/Facebook Ads-ready product presentation. The repository contains a static storefront and a Hono-based Cloudflare Worker API backed by D1, KV, R2, and Workers AI bindings.

## Current build

The current build includes a responsive storefront with local image assets, category navigation, product filtering, product cards, bag drawer, visible **Add to Cart** and **Shop Now** CTAs, WhatsApp CTA, newsletter CTA, analytics-ready events, and conversion-focused hero/product layouts. The catalog now includes the user-provided makeup, skincare, blush, serum, and gift-set images as seeded products with barcodes and package weights. The Worker API includes product and category reads, searchable district/upazila locations, automatic delivery fees, order creation, order lookup, order status history, and internal customer trust scoring.

Courier fees are not customer-selectable. The API automatically applies **৳90 inside Dhaka** and **৳150 outside Dhaka** after district/upazila selection. Emergency delivery is configured as **৳250** but is deliberately not exposed as a customer selection; it is reserved for authorised admin workflow.

Customer trust scoring distinguishes delivered, customer-cancelled, refused, delivery-failed, returned, and admin-cancelled orders. Admin-facing trust data can be consumed from `GET /api/customers/:phone/trust` and includes success rate, cancel rate, recent orders, and a `trusted`, `regular`, `review-required`, or `high-risk` rating.

## Custom admin dashboard

The private admin dashboard is available at `/admin` and is intentionally not linked from the customer navigation. It uses a 12-hour hashed D1 session rather than exposing credentials in frontend code. The dashboard currently includes overview metrics for revenue, gross profit, order pipeline, average order value, stock valuation, low-stock count, product catalogue search, product create/edit, SKU, cost/selling/compare-at prices, stock, MOQ, volume-tier JSON, image URL, status, featured flag, order status controls, stock adjustment ledger, and store settings. The Bengali operating guide is available at `/admin/guide`.

The dashboard schema is in `worker/migrations/0004-admin-dashboard.sql` and `worker/migrations/0005-commerce-support-expansion.sql`. The live Rinova database has been verified with both migrations applied, all 15 seeded products assigned SKUs, and the expansion tables present for returns, POS sales, CMS content, customer sessions, and chatbot conversations.

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` as Cloudflare Worker secrets. The GitHub Actions deployment workflow syncs those secrets when the corresponding repository secrets are available; secret values must never be committed or placed in client code. `ADMIN_API_TOKEN` remains supported for automation and legacy integrations. Gemini fallback can use `GEMINI_API_KEY`, `GEMINI_API_KEY_1`, and `GEMINI_API_KEY_2`; Cloudflare Workers AI remains the default provider and keys are only read server-side.

## Structure

```text
web/       Static customer-facing storefront and local visual assets
worker/    Hono Worker API, D1 schema, migrations, and Wrangler configuration
```

## Local development

```bash
pnpm install
pnpm build
pnpm --filter @rinova/worker dev
```

The production-style Worker configuration is in `worker/wrangler.toml`. The D1 schema and seed data are available in both `worker/schema.sql` and `worker/migrations/0001_initial.sql`.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Service health check |
| GET | `/api/config` | Shop, payments, and delivery configuration |
| GET | `/api/categories` | Active categories |
| GET | `/api/products` | Product catalogue with query/category/featured filters |
| GET | `/api/locations?q=` | Searchable district and upazila directory |
| GET | `/api/delivery-fee` | Automatic zone and fee calculation |
| POST | `/api/orders` | Create a COD or mobile-payment order |
| GET | `/api/orders/:orderCode/invoice` | Secure invoice data for customer or admin print view |
| POST | `/api/account/register` | Create a customer account |
| POST | `/api/account/login` | Sign in a customer account |
| GET | `/api/account/me` | Read the current customer profile |
| GET | `/api/account/orders` | Read the current customer's order history |
| POST | `/api/account/returns` | Submit a return request for an eligible order |
| GET | `/api/orders/:orderCode` | Retrieve order summary and items |
| PATCH | `/api/orders/:orderCode/status` | Update order status and history |
| GET | `/api/customers/:phone/trust` | Internal order success/cancel profile |
| POST | `/api/admin/login` | Create a 12-hour admin session |
| GET | `/api/admin/session` | Validate the current admin session |
| POST | `/api/admin/logout` | Revoke the current admin session |
| GET | `/api/admin/overview?days=30` | Dashboard revenue, profit, stock and pipeline metrics |
| GET/PUT | `/api/admin/settings` | Read or update store settings |
| GET | `/api/admin/categories` | Admin category list |
| GET/POST | `/api/admin/products` | Search or create products |
| GET/PATCH | `/api/admin/products/:id` | Read or edit a product |
| POST | `/api/admin/products/:id/stock` | Add a stock ledger movement |
| GET | `/api/admin/products/:id/stock-movements` | Read product stock history |
| GET | `/api/admin/orders` | Search and filter orders for admin |
| GET/PATCH | `/api/admin/returns` and `/api/admin/returns/:id` | Review, receive and refund returns |
| GET | `/api/admin/pos/products` | Search active products by name, SKU or barcode |
| POST | `/api/admin/pos/sales` | Complete an in-store POS sale and stock movement |
| GET | `/api/admin/content` | Read CMS blocks, pages, posts and offers |
| PUT | `/api/admin/content/:key` | Publish a CMS block/banner |
| POST | `/api/admin/pages` | Create or update a page |
| POST | `/api/admin/posts` | Create or update a Journal post |
| POST | `/api/admin/offers` | Create a promotional offer |
| POST | `/api/admin/chat` | Private shop-only staff/owner/admin assistant |
| POST | `/api/chat/customer` | Public shop-only customer support assistant |
| GET | `/api/customer-tracking?orderId=...` or `?phone=...` | Customer-safe delivery status message |
| POST | `/api/admin/orders/:orderCode/steadfast/book` | Admin-only parcel booking |
| GET | `/api/admin/orders/:orderCode/steadfast/status` | Admin-only Steadfast status lookup |
| POST | `/api/webhooks/steadfast` | Steadfast delivery/return status callback; accepts configured bearer or documented API headers |

## Cloudflare status

The GitHub repository is `bayzed123/rinovabd.com`. The Cloudflare D1 database `rinovabd-db` and KV namespace `rinovabd-cache` have been provisioned and seeded for this build. The Hono Worker `rinovabd-worker` is deployed with D1, KV, and Workers AI bindings. The existing Cloudflare Pages project `rinovabd-api` was detected during inspection. R2 is not attached to the first deployment because the account currently reports that R2 must first be enabled from the Cloudflare Dashboard; until that is enabled, the repository's local image assets continue to support the storefront.

Before production deployment, replace any environment-specific payment numbers, courier credentials, domain settings, and admin authentication secrets. Do not commit secrets to this repository.

### Steadfast activation

The Worker is already coded and deployed with credential-safe Steadfast adapter routes. Add the merchant credentials only as Cloudflare Worker secrets:

```bash
wrangler secret put STEADFAST_API_KEY
wrangler secret put STEADFAST_SECRET_KEY
# Optional: only set this if you want an additional callback bearer guard.
wrangler secret put STEADFAST_WEBHOOK_TOKEN
wrangler secret put ADMIN_API_TOKEN
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
```

The optional base URL defaults to `https://portal.packzy.com/api/v1`; set `STEADFAST_BASE_URL` as a non-secret variable only after confirming the active endpoint with the merchant account. Configure the courier callback to `POST https://<your-worker-host>/api/webhooks/steadfast`. The callback accepts the status fields documented by Steadfast (`invoice`, `consignment_id`, `tracking_code`, `status` or `delivery_status`, and `updated_at`). If `STEADFAST_WEBHOOK_TOKEN` is set, send `Authorization: Bearer <STEADFAST_WEBHOOK_TOKEN>`; otherwise the documented `Api-Key` and `Secret-Key` headers are accepted when Steadfast sends them. The supplied PDF defines outbound API authentication but does not define a separate inbound webhook signature. The public customer endpoint is `/api/customer-tracking`, while booking and manual status lookup require the admin bearer token.

The courier adapter uses the documented order creation and status lookup paths and records consignment ID, tracking code, last status, last update time, package weight, and status history. It does not send any live request until the merchant secrets are present.

## Customer support and AI

The storefront floating support launcher provides two dynamic choices: Cloudflare Workers AI-backed shop support and a WhatsApp redirect to `+880 1738-745949`. The customer assistant is limited to product, price, stock, usage, delivery, orders, returns, payments, and store policy. The private `/admin` assistant receives operational summaries for staff, owner, and administrator support, but it cannot execute irreversible mutations or reveal credentials. Cloudflare Workers AI is called through the bound `AI` service using configurable `AI_MODEL`; if it fails and Gemini secrets are configured, the Worker tries the configured Gemini keys in sequence.

Customer-facing account, checkout, and printable invoice entry points are `/account.html`, `/checkout.html`, and `/invoice.html?order=...`. The hidden Clothing category is seeded as inactive so it remains prepared for a future sector without appearing in the current storefront. POS receipt printing is browser-based and uses the existing barcode/SKU data.

## Verification

```bash
pnpm build
```

The build command validates the storefront and typechecks the Worker. The current dashboard, commerce-support expansion, invoice/return views, CMS, POS, customer accounts, hidden clothing foundation, and dual chatbot surfaces are implemented. Remaining hardening includes direct R2 uploads, payment-gateway settlement/refund automation, native barcode-label generation, inbound Messenger/WhatsApp order automation, and a full Playwright regression suite. R2 remains optional until it is enabled at the Cloudflare account level; local repository assets continue to serve the storefront.
