# Rinova BD

Rinova BD is a mobile-first beauty and personal-care storefront built for Bangladesh, with a premium pastel visual system and Meta/Facebook Ads-ready product presentation. The repository contains a static storefront and a Hono-based Cloudflare Worker API backed by D1, KV, R2, and Workers AI bindings.

## Current build

The current build includes a responsive storefront with local image assets, category navigation, product filtering, product cards, bag drawer, visible **Add to Cart** and **Shop Now** CTAs, WhatsApp CTA, newsletter CTA, analytics-ready events, and conversion-focused hero/product layouts. The catalog now includes the user-provided makeup, skincare, blush, serum, and gift-set images as seeded products with barcodes and package weights. The Worker API includes product and category reads, searchable district/upazila locations, automatic delivery fees, order creation, order lookup, order status history, and internal customer trust scoring.

Courier fees are not customer-selectable. The API automatically applies **৳90 inside Dhaka** and **৳150 outside Dhaka** after district/upazila selection. Emergency delivery is configured as **৳250** but is deliberately not exposed as a customer selection; it is reserved for authorised admin workflow.

Customer trust scoring distinguishes delivered, customer-cancelled, refused, delivery-failed, returned, and admin-cancelled orders. Admin-facing trust data can be consumed from `GET /api/customers/:phone/trust` and includes success rate, cancel rate, recent orders, and a `trusted`, `regular`, `review-required`, or `high-risk` rating.

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
| GET | `/api/orders/:orderCode` | Retrieve order summary and items |
| PATCH | `/api/orders/:orderCode/status` | Update order status and history |
| GET | `/api/customers/:phone/trust` | Internal order success/cancel profile |
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
```

The optional base URL defaults to `https://portal.packzy.com/api/v1`; set `STEADFAST_BASE_URL` as a non-secret variable only after confirming the active endpoint with the merchant account. Configure the courier callback to `POST https://<your-worker-host>/api/webhooks/steadfast`. The callback accepts the status fields documented by Steadfast (`invoice`, `consignment_id`, `tracking_code`, `status` or `delivery_status`, and `updated_at`). If `STEADFAST_WEBHOOK_TOKEN` is set, send `Authorization: Bearer <STEADFAST_WEBHOOK_TOKEN>`; otherwise the documented `Api-Key` and `Secret-Key` headers are accepted when Steadfast sends them. The supplied PDF defines outbound API authentication but does not define a separate inbound webhook signature. The public customer endpoint is `/api/customer-tracking`, while booking and manual status lookup require the admin bearer token.

The courier adapter uses the documented order creation and status lookup paths and records consignment ID, tracking code, last status, last update time, package weight, and status history. It does not send any live request until the merchant secrets are present.

## Verification

```bash
pnpm build
```

The build command validates the storefront and typechecks the Worker. The next production steps are to enable R2, configure real payment/courier values, connect the production domain, and complete mobile checkout testing with real business data.
