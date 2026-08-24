# Rinova BD

Rinova BD is a mobile-first beauty and personal-care storefront built for Bangladesh, with a premium pastel visual system and Meta/Facebook Ads-ready product presentation. The repository contains a static storefront and a Hono-based Cloudflare Worker API backed by D1, KV, R2, and Workers AI bindings.

## Current build

The current build includes a responsive storefront with local image assets, category navigation, product filtering, product cards, bag drawer, WhatsApp CTA, newsletter CTA, analytics-ready events, and conversion-focused hero/product layouts. The Worker API includes product and category reads, searchable district/upazila locations, automatic delivery fees, order creation, order lookup, order status history, and internal customer trust scoring.

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

## Cloudflare status

The GitHub repository is `bayzed123/rinovabd.com`. The Cloudflare D1 database `rinovabd-db` and KV namespace `rinovabd-cache` have been provisioned and seeded for this build. The existing Cloudflare Pages project `rinovabd-api` was detected during inspection. R2 is referenced in the Worker configuration but the account currently reports that R2 must first be enabled from the Cloudflare Dashboard; until that is enabled, the repository's local image assets continue to support the storefront.

Before production deployment, replace any environment-specific payment numbers, courier credentials, domain settings, and admin authentication secrets. Do not commit secrets to this repository.

## Verification

```bash
pnpm build
```

The build command validates the storefront and typechecks the Worker. The next production steps are to enable R2, configure real payment/courier values, connect the production domain, and complete mobile checkout testing with real business data.
