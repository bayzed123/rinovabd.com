/**
 * The Silky Beauty Combo landing page.
 *
 * The selling copy is written into the page by hand; everything that has to behave the same as
 * every other ad page — pricing confirmed by the shop, the order form, GA4 and the Meta pixel
 * with a de-duplicated Purchase — comes from the shared engine in lp-order.js.
 */
(() => {
  let data = {};
  try { data = JSON.parse(document.getElementById('lp-data')?.textContent || '{}'); } catch { data = {}; }
  const product = data.product || null;

  window.RinovaLanding.start({
    tracking: data.tracking || {},
    products: [{
      sku: product?.sku || 'RNV-LP-COMBO-01',
      name: product?.name || 'Beauty Spray + Episoft Serum + Laneige Lip Balm — 3 in 1 Combo',
      price: Number(product?.salePrice ?? product?.price ?? 850),
    }],
    soldOut: product ? product.inStock === false : false,
    callNumber: '+8801738745949',
    note: 'Ad landing page — Silky Beauty Combo',
  });
})();
