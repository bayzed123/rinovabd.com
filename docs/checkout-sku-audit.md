# Checkout SKU Audit

Source inspected: https://rinovabd.com/checkout.html

The Worker checkout route requires every incoming item to contain a non-empty `sku` and then looks up the product by SKU. The current `web/checkout.js` sends `{ sku: String(item.sku || '').trim(), quantity }`.

The current `web/product.js` cart writer stores `{ id, name, price, imageUrl, quantity, stock, minOrderQty, categoryName, categorySlug }` but does not store `sku`. Therefore cart items created through the storefront lose the product SKU before checkout and the Worker correctly returns `Each order item must include a product SKU.`

The safe fix is to preserve the product SKU in the cart object. Existing carts without a SKU need a read-only product lookup or a clear recovery message; the backend must not guess a SKU from a product name. The order pipeline already returns an invoice number and the invoice route already renders an invoice barcode from the invoice number and item SKU from the product join.
