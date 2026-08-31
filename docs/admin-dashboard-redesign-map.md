# Rinova Admin Dashboard Redesign Map

## Scope

Create a genuinely redesigned owner dashboard while keeping the current navigation views and the existing order pipeline markup and behavior intact. The redesign is limited to the overview experience plus data-safe supporting endpoints and rendering logic. Existing product, order, stock, courier, Cloudflare Worker, R2, and account-separation behavior must remain unchanged.

## Current architecture findings

The admin frontend is a server-served vanilla HTML/CSS/JavaScript dashboard at `web/admin/index.html`, `web/admin/styles.css`, and `web/admin/app.js`. It is not currently a React/Vite/Tailwind/shadcn application. The current JavaScript owns navigation, login, overview loading, order loading, notifications, SmartGen, and all existing form behavior. A full framework migration would create unnecessary risk for this design-only request.

The overview currently loads one authenticated endpoint: `GET /api/admin/overview?days=7|30|90`. The response contains `revenue`, `grossProfit`, `stock`, `pipeline`, and `topProducts`. The order pipeline is rendered from the response `pipeline` array and must not be removed or semantically changed.

The authenticated orders endpoint is `GET /api/admin/orders`, returning order and customer fields including `status`, `subtotal`, `deliveryFee`, `createdAt`, `name`, `phone`, `district`, `upazila`, and `address`. The customer table includes a `district` column, and the location directory migration seeds all 64 Bangladesh districts plus Dhaka upazila/neighbourhood entries. This supports a real district-based demographic summary rather than simulated values.

## Redesign information architecture

| Area | New experience | Data source | Safety constraint |
|---|---|---|---|
| Overview header | Owner command center with period switcher and compact action summary | Existing overview response | Keep existing controls and navigation |
| KPI row | Revenue, orders, average order value, stock health | Existing overview response | No metric meaning changes |
| Alert rail | Green success, amber warning, and red critical alert cards with plain-language actions | Existing overview, notifications, and derived counts | No alert should invent a condition; empty states explain unavailable data |
| Customer demographics | District insight card with a map-style Bangladesh silhouette/grid treatment and ranked district rows | Orders/customer districts plus `location_directory` coverage | Use only observed order/customer data; unknown districts are grouped as “Other / not mapped” |
| District share cards | Dynamic cards showing top district, percentage of customers/orders, and order count | Authenticated customer/order data | Percentages use a clearly stated denominator and round to one decimal |
| Trend chart | Responsive revenue/orders line chart for selected period | New aggregated overview trend response | Use real daily buckets and show an honest empty state |
| Order flow | Existing pipeline card remains present and recognizable | Existing `pipeline` response | Do not change pipeline query, statuses, or action mapping |
| Product infographic | Top products with rank, revenue share, units, and stock signal | Existing `topProducts` plus product stock data where available | Visual enhancement only |

## Planned implementation todo

1. Add an authenticated read-only analytics endpoint returning daily revenue/order buckets and district aggregates, using the existing orders/customers tables and the seeded location directory where appropriate.
2. Extend overview markup with stable new containers for alert cards, district demographics, district share cards, a trend chart, and infographic summaries. Do not rename existing IDs or `data-view` values.
3. Extend overview loading/rendering so new cards are populated from real endpoint data and degrade gracefully when no records or location data are available.
4. Render charts with lightweight SVG/CSS or an already available project dependency; do not migrate the dashboard to React solely for charting. Preserve current deployment and Worker integration.
5. Apply a new composition: asymmetric overview grid, alert rail, large customer insight card, compact district cards, and trend visualization. Keep the order pipeline component unchanged in content and behavior.
6. Add Bengali + English plain-language microcopy for new labels and alert explanations.
7. Validate desktop/mobile screenshots, navigation, existing pipeline output, protected identifiers, backend typecheck, and deployment.

## Acceptance criteria

The redesign is complete when the overview feels structurally different from the previous card grid, the order pipeline remains intact, alert cards are color-coded and data-backed, the demographics section shows district shares from real data, the trend chart responds to the 7/30/90-day control, mobile layout remains usable, and no existing protected integrations or navigation contracts are modified.
