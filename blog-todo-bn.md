# Rinova BD Blog Publishing Todo

## Completed sequentially

| Todo | Status | Verification |
|---|---|---|
| Admin blog editor fields | সম্পন্ন | Title, summary, category, subcategory, stored-as type, full article, publish date, duration, priority, SEO settings, rights and draft/publish controls live |
| Bengali and English support | সম্পন্ন | Unicode text, plain text, line breaks and supported Markdown headings/lists/bold/links render safely |
| SEO readiness score | সম্পন্ন | Eight checks appear live; seeded article reached 100 and server blocks publishing while any required SEO check is incomplete |
| Cover image URL and preview | সম্পন্ন | URL field, live preview and public cover image work |
| Media library | সম্পন্ন | Existing product/blog media appears in an authenticated reusable dropdown |
| Image/video upload | সম্পন্ন in code | JPG, PNG, WebP, MP4, WebM and MOV accepted; files above 64 MB use R2 multipart chunks |
| Public article page | সম্পন্ন | `/blog.html?slug=...` renders metadata, cover, article body, media, links, rights and robots/canonical tags |
| Requested article | সম্পন্ন | “A gentler way to build your morning routine” published with cover and complete SEO metadata |
| Production smoke checks | সম্পন্ন | Public article/API/cover returned 200; admin media endpoints returned 401 without authentication; CI/CD run `32892055526` succeeded |

## Owner action remaining

R2 storage is still optional and not enabled in the Cloudflare account. After enabling R2 and binding bucket `rinovabd-product-images` as `PRODUCT_IMAGES`, the already-deployed direct and chunked upload paths can be exercised for real. Until then, Admin can use image URLs, existing media-library entries and deployed `/assets/` files.
