# Rinova BD blog live verification checkpoint

The deployed public article route `/blog.html?slug=a-gentler-way-to-build-your-morning-routine` initially returned Post not found because the seeded publish date was one day ahead of the Worker UTC clock. The live D1 row was corrected to `publish_date = NULL` and `published_at = CURRENT_TIMESTAMP`; the article then loaded successfully with its cover asset, title, category, summary, headings, lists, Bengali-safe page shell, outbound source links, and rights footer.

The deployed `/admin/?view=cms` route initially fell back to Dashboard because the existing deep-link allowlist only accepted Products. The admin `showApp` allowlist was corrected to include CMS and redeployed. The CMS view now loads directly and shows the expanded blog editor, media drop zone, upload button, video/file URL, cover URL, media library, SEO readiness checklist, Google preview, rights fields, and Save and publish / Save as draft buttons.

The authenticated CMS media library is populated with product media and the seeded blog cover. The seeded article is visible in the post list with its category and published status. No order or product inventory was changed during this verification.

## Authenticated CMS verification

The corrected deep link `/admin/?view=cms` now opens Content CMS directly. The seeded post edit state hydrated with its title, summary, category `Skin Care`, subcategory `Morning Routine`, cover `/assets/rinova-morning-routine.jpg`, slug, SEO title, meta description, keywords, rights and article body. The live checklist reports `SEO readiness 100` and all eight checks are green. The media library contains 23 reusable options from existing product and blog media. The post list shows the article as `published`.

## Final production smoke tests

The public article API returned HTTP 200 and the article appeared in the homepage CMS feed. The cover asset `/assets/rinova-morning-routine.jpg` returned HTTP 200. Unauthenticated requests to the admin media library, direct blog-media upload, and multipart-upload start endpoint returned HTTP 401. The direct and chunked upload code paths are deployed but cannot be exercised successfully until the optional `PRODUCT_IMAGES` R2 binding is enabled; the endpoints return a clear R2-waiting response rather than pretending storage is active.

The first production article check exposed a timezone issue: a seeded future ISO publish date was later than the Worker's UTC clock, so the route correctly withheld it. The article was corrected to publish immediately using the database timestamp, and the public route then passed.
