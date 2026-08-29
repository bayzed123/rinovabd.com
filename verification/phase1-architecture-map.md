# Phase 1 architecture map — Rinova BD

## Invoice identity and rendering

The Worker creates a customer order in `worker/src/index.ts` at the `/api/orders` route. Current invoice generation uses `RNV-INV-${Date.now().toString(36).toUpperCase()}` before inserting the order. The `orders.invoice_number` column was added by migration `0005-commerce-support-expansion.sql` and has a unique partial index; it is nullable for legacy rows.

The invoice document API is `GET /api/orders/:orderCode/invoice` in `worker/src/index.ts`. It authenticates either an admin session or the owning customer session, loads the order/customer record by order code, then loads order items with product SKU, barcode, slug, and weight.

The client invoice renderer is `web/invoice.js`, loaded by `web/invoice.html`. It fetches the invoice by order code and renders the invoice number, customer details, order details, line items, totals, and print control. It currently has no invoice barcode.

The admin invoice renderer is the `renderAdminInvoiceDocument()` function in `web/admin/app.js`, opened by `printInvoice()`. It currently creates a barcode payload in the form `INV:${invoiceCode}|SKU:${commaSeparatedSkus}` and renders it as an `INVOICE + SKU` Code128 barcode. This is the legacy concatenated payload that must be replaced with only the clean sequential invoice number.

## Category management

The database already has a `categories` table with `id`, unique `name`, unique `slug`, optional `image_url`, `sort_order`, and `active`. The public API has `GET /api/categories`. The admin API currently has only `GET /api/admin/categories`; product creation/editing accepts a numeric `categoryId`, but there is no admin Category management screen or create/update/archive API.

The admin product editor is in `web/admin/index.html`, with a numeric `Category ID` field. The admin view router in `web/admin/app.js` has an allow-list for existing views but no `categories` or `barcode-generator` views.

## Existing barcode surfaces

The admin POS view in `web/admin/index.html` supports searching/scanning product barcodes and printing product labels. `web/admin/app.js` renders one SKU barcode and one product-link barcode per product label using JsBarcode. This product-label flow is separate from invoice barcode generation and should remain available for offline labels.

The admin app already loads JsBarcode from jsDelivr. The requested SmartGen integration is a separate external script and should be isolated in a new Barcode Generator/Offline Labels view with `#client-product-form`, `#product-barcode`, and `#barcode-format` IDs.

## Product and order identity

Current admin product routes are keyed by numeric product ID (`/api/admin/products/:id` and `/api/admin/products/:id/stock`), while public product detail is keyed by slug (with numeric ID fallback). Product lists include SKU and barcode. Current order tracking accepts order ID, invoice number, or phone, but invoice-number lookup currently matches the stored `orders.invoice_number` value directly. Phase 3 must introduce canonical clean invoice matching and SKU-first product lookup/update paths while retaining safe compatibility where needed.

