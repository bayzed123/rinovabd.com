import { access, readdir } from 'node:fs/promises';

for (const file of ['index.html', 'styles.css', 'app.js']) await access(new URL(`./${file}`, import.meta.url));
await readdir(new URL('./assets', import.meta.url));
console.log('Rinova BD storefront build passed.');

