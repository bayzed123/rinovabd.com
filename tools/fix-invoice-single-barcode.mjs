import fs from 'node:fs';
const path = 'web/admin/app.js';
const source = fs.readFileSync(path, 'utf8');
const pattern = /const invoiceBars = .*?; const footerLinks/;
const replacement = "const barcodeSkus = Array.from(new Set(items.map((item) => itemSku(item)).filter(Boolean))); const invoiceBarcodePayload = `INV:${invoiceCode}|SKU:${barcodeSkus.join(',')}`; const invoiceBars = `<div class=\\\"barcode-pair invoice-barcodes single-invoice-barcode\\\"><div><small>INVOICE + SKU</small><svg data-barcode=\\\"${escapeHtml(invoiceBarcodePayload)}\\\"></svg><small>${escapeHtml(invoiceBarcodePayload)}</small></div></div>`; const footerLinks";
if (!pattern.test(source)) throw new Error('Invoice barcode block not found');
fs.writeFileSync(path, source.replace(pattern, replacement));
