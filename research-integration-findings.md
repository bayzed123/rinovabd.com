# Integration findings

## Meta

Meta Webhooks deliver real-time HTTPS POST notifications with JSON payloads, so Messenger and WhatsApp inbound-message/status flows should be implemented as verified Worker webhook endpoints. Meta requires a secure HTTPS endpoint and app/product configuration; permissions and app review depend on the WhatsApp Business Platform use case. Source: https://developers.facebook.com/docs/graph-api/webhooks/ and https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview

Meta Conversions API sends server events from an advertiser's server/CRM to Meta for measurement, optimization, and reporting. Events are linked to a dataset ID; implementation should include event IDs and deduplication with browser Pixel events, plus a verification/testing step. Source: https://developers.facebook.com/documentation/ads-commerce/conversions-api

## TikTok

TikTok Events API supports advertiser marketing data from web, app, offline, store, and CRM channels. TikTok recommends using Events API together with Pixel and event deduplication for web conversions. Source: https://ads.tiktok.com/help/article/events-api

## Product decision

The Rinova BD system should provide provider-neutral webhook handlers and event adapters now, while keeping provider credentials and account-specific IDs in secrets/configuration. Live Messenger/WhatsApp, TikTok, Google Ads, courier, and SMS sending cannot be activated without the owner's approved business accounts, tokens, IDs, and templates.

## Google Ads

Google Ads supports server-side/offline conversion workflows through Google Ads API or server-side Tag Manager. The implementation requires account/admin setup, conversion action identifiers, click identifiers where available, consent handling, and normalized/hashed first-party data for enhanced conversions. Google’s current documentation also notes a 2026 transition affecting new offline-conversion import adopters, so the adapter should remain configurable rather than hard-coded to one upload path. Source: https://developers.google.com/google-ads/api/docs/conversions/upload-offline and https://developers.google.com/tag-platform/tag-manager/server-side/ads-setup

## Courier

The available Steadfast integration documentation describes parcel placement, status lookup by consignment/invoice/tracking code, and a webhook callback secured with a bearer token. Pathao integration documentation also describes a webhook callback URL and secret for status updates. These support a webhook-first return/delivery dashboard, with a scheduled fallback status check only where the selected courier account does not provide a usable callback. Sources: https://github.com/steadfast-it/SteadFast-Courier-Laravel-Package and https://fullstro.com/documentation/pathao/

## Steadfast implementation details

A public Steadfast integration source identifies the default API base URL as `https://portal.packzy.com/api/v1`, order creation as `POST /create_order`, bulk creation as `POST /create_order/bulk-order`, status lookups as `GET /status_by_cid/{id}`, `GET /status_by_invoice/{invoice}`, and `GET /status_by_trackingcode/{trackingCode}`, return creation as `POST /create_return_request`, and webhook authentication via a bearer token. Its base adapter sends `Api-Key` and `Secret-Key` headers. These values are treated as implementation references only; the merchant must provide current credentials and confirm the active endpoint with Steadfast before production activation. Source inspected: https://github.com/nayemuf/steadfast-courier

## Visual smoke test

The local storefront preview renders the hero, brand imagery, navigation, CTA, and tracking link correctly. The homepage shows a product-data refresh message in an API-less static preview because the product grid intentionally reads from `/api/products`; the production Worker must serve or proxy that route, or the Pages deployment must set the API base URL. The customer tracking page renders a clean Order ID/mobile lookup form and responsive status-result container.
