# Rinova Admin Dashboard v5 Audit and Design Map

## Audit conclusion

The Cloudflare connector is enabled and can read both configured accounts. The main account hosts the `rinovabd-worker`, production D1 database, and the `rinovabd-api` Pages project. The member account hosts `rinovaimagesbuket` and `rinovabd-v2-media`. The Worker is configured to use the member-account R2 bucket through `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, and masked S3-compatible runtime credentials.

The frontend API base points to `https://rinovabd-worker.abdussalam8480.workers.dev/api`. The CI/CD workflow deploys the Worker with the main account ID and syncs runtime secrets. The separate GitHub Pages workflow publishes `./web`. Both latest workflows completed successfully.

## Missing or incomplete tracking items

| Item | Current state | Classification | Required action |
|---|---|---|---|
| Meta Pixel ID | Admin settings route stores `tracking_meta_pixel_id`; campaign landing page reads it and injects browser Pixel PageView/ViewContent | Implemented for campaign landing page | Verify the D1 value and use the existing admin verification screen |
| Meta Conversions API token | Worker code reads `META_CAPI_TOKEN` and sends Purchase events plus a test PageView verification | Worker runtime binding exists in deployed settings | The CI/CD workflow does **not** sync `META_CAPI_TOKEN`; add it to GitHub secret environment and `sync_secret` list |
| Meta test event code | Worker supports optional `META_TEST_EVENT_CODE` and otherwise uses a default test code | Optional but currently not workflow-synced | Add only if the owner supplies an approved test code; do not invent production values |
| Meta Pixel on main storefront | Search found client Pixel wiring in `web/campaign.js` and admin premium UI, but not a general storefront-wide Pixel bootstrap | Potentially missing for non-campaign storefront traffic | Confirm whether Pixel should cover the main storefront before adding it |
| Meta CAPI events | Purchase is emitted after checkout; failures create admin notifications | Implemented for Purchase only | Add other event types only with explicit event mapping approval |
| GitHub secret list visibility | `gh secret list` returns HTTP 403 for this token | Cannot independently enumerate repository secret settings | Workflow logs and deployed Worker bindings provide indirect verification; owner should visually confirm GitHub Actions secrets if needed |

## Campaign landing page and upload audit

The separate campaign page is implemented at `/campaign.html` and dynamic routes at `/campaign/:slug`. The admin Campaign Studio creates and activates landing pages through `/api/admin/campaigns`. The page supports a hero image, CTA, product cards, GTM, GA4, and browser Meta Pixel events. Its product list currently loads active products from the Worker and campaign `product_ids_json` is stored, but the current campaign create UI does not expose a product-selection control; the landing page currently falls back to the active catalogue rather than explicitly choosing multiple campaign products.

The product editor supports one product record at a time with a primary image and multiple gallery image files. There is no bulk product CSV/JSON import flow. CMS media supports one uploaded file at a time, while gallery upload supports multiple image files for the current product only. A separate multiple-product upload system therefore remains missing and should be treated as a later, isolated feature rather than silently added to the dashboard redesign.

## Final dashboard top-grid architecture

The top grid will have one unique source of truth for each metric and will not repeat the same KPI in multiple cards.

| Position | Component | Unique data | Purpose |
|---|---|---|---|
| Row 1 | Revenue | Period revenue | Primary sales health |
| Row 1 | Gross profit | Period gross profit | Margin health |
| Row 1 | Orders | Period order count | Volume |
| Row 1 | Avg order value | Revenue divided by orders | Basket size |
| Row 1 | Stock on hand | Current units | Inventory quantity |
| Row 1 | Stock at cost | Current cost value | Capital tied in stock |
| Row 1 | Unrealised profit | Retail value minus cost value | Inventory opportunity |
| Row 1 | Needs restocking | Current low-stock count | Action queue |
| Row 2 | Demography graphic | Customer share by district | Geographic customer concentration |
| Row 2 | Product trend graphic | Top product revenue/units trend | Product movement |
| Row 2 | Return client list | Customers attached to return requests | Service recovery |
| Row 2 | Cancel client list | Customers attached to cancelled orders | Churn/cancellation review |
| Row 3 | Revenue/orders line chart | Daily period buckets | Time trend |
| Row 3 | Order flow chart | Existing pipeline statuses | Operational flow; preserve source and behavior |
| Row 4 | Unified client search | Invoice number, phone, email | Direct lookup without duplicating the Orders page |

## Data rules

All new dashboard metrics must come from existing database records or a new authenticated read-only aggregate endpoint. No simulated percentages or guessed locations are allowed. District rows use actual customer districts and preserve raw stored values until a separate data-cleanup task is approved. Return and cancel lists must use unique customers and show an empty state when there are no records.

The existing top KPI IDs and the existing `#pipeline` container remain stable. The redesigned graphics and lists use new IDs. Search should route to the existing order result or Orders view and should not create a second order table.

## Implementation todo

1. Add an authenticated read-only insights response containing product trend aggregates, unique return clients, unique cancelled clients, and unified search results by invoice/phone/email.
2. Add the new top-grid sections and visual elements without renaming navigation or pipeline IDs.
3. Render metric cards once, then render unique demography, product trend, return clients, cancel clients, line chart, and flow chart sections.
4. Add a search form that accepts invoice number, customer phone, or customer email and shows one result list.
5. Add Meta CAPI secret sync to CI/CD only; do not add secret values to source control or public configuration.
6. Add a campaign product-selection control only if it can reuse the existing campaign schema safely; otherwise record it as a separate follow-up.
7. Keep the multiple-product uploader as a separate scoped feature and do not conflate it with the dashboard redesign.
8. Run build, typecheck, syntax checks, workflow checks, and live read-only verification.
