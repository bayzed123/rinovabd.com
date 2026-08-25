# Live browser verification

Date: 25 August 2026

The deployed Worker storefront at `https://rinovabd-worker.abdussalam8480.workers.dev/` loaded successfully. The product section rendered 15 seeded products, visible Add to Cart and Shop Now actions, automatic delivery copy, WhatsApp CTA, and Track your order link.

The hidden dashboard route at `https://rinovabd-worker.abdussalam8480.workers.dev/admin/` loaded successfully and rendered the private login screen. The page exposed only username/password fields and a Sign in action before authentication; no dashboard data appeared publicly.

Admin credentials were not entered during this smoke test because secret values must remain private.
The live unauthenticated `GET /api/admin/session` returned HTTP 401 with `{"authenticated":false}` when checked directly, confirming the private API boundary. The deployed `/admin/guide/` page rendered successfully with Bengali sign-in, dashboard, products, inventory, orders, settings, security, and roadmap instructions.
Expansion deployment browser verification: live storefront rendered the Account link at `/account.html`, updated WhatsApp links targeting `https://wa.me/8801738745949`, visible Add to Cart/Shop Now buttons, and a floating `Need help?` launcher. Clicking the launcher opened the dynamic popup with `AI support` and `WhatsApp` choices, customer-only support note, Bangla greeting, message input, and the updated WhatsApp link.
Live expansion browser verification: `/account.html` rendered sign-in and create-account forms plus tracking-page link. `/checkout.html` rendered customer/address fields, district/upazila inputs, COD/bKash/Nagad/Rocket choices, transaction-ID field, automatic delivery-fee summary, and Place order action. Empty-cart state correctly prevented accidental checkout.
Live API verification after commit `00ca30b`: `GET /api/health` returned ok; `POST /api/chat/customer` with a shop-related Bangla delivery question returned HTTP 200 with a Bangla answer and `provider: cloudflare-ai`; `POST /api/admin/chat` without a token returned HTTP 401. Public `/api/content/home` returned seeded CMS blocks, `/api/content/pages/delivery-returns` returned the published page, and `/api/categories` did not expose the inactive Clothing category. Unauthorized/nonexistent invoice lookup returned HTTP 404 without invoice data, and invalid account registration returned HTTP 400 without creating an account.
