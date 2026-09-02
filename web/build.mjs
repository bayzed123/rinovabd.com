import { access, readdir } from 'node:fs/promises';

for (const file of ['index.html', 'styles.css', 'app.js', 'checkout.html', 'checkout.js', 'account.html', 'account.js', 'invoice.html', 'invoice.js', 'product.html', 'product.js', 'sitemap.html', 'campaign-template.html']) await access(new URL(`./${file}`, import.meta.url));
for (const file of ['admin/index.html', 'admin/app.js', 'admin/styles.css', 'admin/guide/index.html']) await access(new URL(`./${file}`, import.meta.url));
await readdir(new URL('./assets', import.meta.url));
console.log('Rinova BD storefront build passed.');

