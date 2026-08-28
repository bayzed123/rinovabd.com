# Rinova — Premium Redesign (v1)

Branch: `redesign/premium-theme-v1`. Nothing in `styles.css` was deleted — the new
theme is an override layer, so you can revert by removing two lines.

---

## 1. Wire it up

In every page under `web/` (`index.html`, `product.html`, `blog.html`,
`checkout.html`, `account.html`, `track.html`, `sitemap.html`, `404.html`),
add the theme **after** the existing stylesheet:

```html
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/theme.css">   <!-- add this -->
```

And before `</body>`:

```html
<script src="/theme-init.js" defer></script>
```

Order matters. `theme.css` is written as an override layer and will do nothing
if it loads first.

---

## 2. What changed and why

### The pink problem

The old tokens made pink the **canvas**: `--paper:#fffbfd`, `--cream:#FFF7FE`,
`--blush:#F8E5F7`, `--accent:#DA70D6` (orchid). Every surface in the site was
tinted, so nothing could stand out and the whole page read as noise.

None of the reference brands do this. Glossier, Rhode and Fenty Skin all sit on
near-white or warm cream and spend their entire colour budget on one or two
moments per screen.

| Token | Was | Now | Role |
|---|---|---|---|
| `--paper` | `#fffbfd` pink-white | `#FBF9F7` warm off-white | page canvas |
| `--cream` | `#FFF7FE` pink | `#F6F2EE` warm | alternating sections |
| `--blush` | `#F8E5F7` | `#F2DCD6` | wash blocks only |
| `--accent` | `#DA70D6` orchid | `#C4776B` clay rose | links, badges, active |
| `--ink` | `#2b1724` plum | `#16130F` near-black | headings, primary buttons |
| `--line` | `#f0d6e2` pink | `#EAE4DF` warm grey | hairlines |

Pink now covers roughly 15% of any viewport. That restraint is the premium
signal — not more pink, less.

### Space

Section padding moves to `clamp(64px, 9vw, 128px)` on an 8pt grid, and body copy
is capped at `65ch`. Most "messy" beauty sites are simply under-spaced; this is
the single biggest lever in the whole change.

### Buttons

One system, three variants, no emoji anywhere:

- `.button.button-dark` — 52px pill, near-black fill, 1px lift on hover. Primary.
- `.button.button-ghost` — transparent, hairline border. Secondary.
- `.button.button-accent` — clay rose. Reserve for one moment per page.

No gradients, no drop shadows on buttons, **one filled button per viewport
section**. Focus rings are visible (2px, 3px offset) — the old buttons had none
outside the media viewer.

### Icons

`.rinova-icon` is now monochrome, 20px, 1.5px stroke, inheriting `currentColor`.
The existing `icons.js` registry already injects by `data-rinova-icon`, so
nothing needs rewiring — but any emoji glyphs still sitting in markup should be
replaced with `<span data-rinova-icon="…"></span>`. Emoji in UI chrome is the
fastest way to make a store look amateur.

### Navigation

Header transitions from translucent over the hero to solid `--paper` with a
hairline bottom border after 40px of scroll (`theme-init.js`). Nav links get a
scale-X underline on hover and a real `aria-current="page"` state.

**Recommended IA change** (markup edit, not in this branch): cut the top level
to five items — Shop / Skincare / Bestsellers / About / Journal — and organise
the Shop panel by **concern** (Acne, Brightening, Barrier Repair) rather than
product type. Beauty shoppers search by problem, not category.

---

## 3. The image-click bug — fixed

**Cause.** `media-viewer.js` locked scrolling with a bare
`document.body.classList.add('media-viewer-open')` → `overflow:hidden`. Removing
the scrollbar reflows the page ~15px wider, so everything visibly snaps sideways
the instant an image is clicked. On close, `overflow` was restored but the
scroll position was not preserved, which is the second half of the jump.

A third contributor: `html{scroll-behavior:smooth}` is global, so the restore
animated instead of landing instantly.

**Fix**, in `lockScroll()` / `unlockScroll()`:

1. Record `window.scrollY`, pin the body with `position:fixed; top:-Ypx; width:100%`.
2. Compensate the scrollbar with `padding-right: innerWidth - clientWidth`.
3. On close, clear the styles and `window.scrollTo(0, Y)` with `scroll-behavior`
   temporarily forced to `auto`.
4. `html { scrollbar-gutter: stable; }` in `theme.css` so the gutter never
   collapses in the first place.

**Also fixed** in the same pass:

- Opening on slide *n* used a single `requestAnimationFrame` before setting
  `scrollLeft`, so the track often had no width yet and the viewer opened on
  image 1. Now double-rAF with a non-smooth `jumpTo()`.
- Slides fade in on decode (`.is-loading` → opacity) instead of showing a raw
  src flash.
- Neighbouring images preload on every page change.
- Focus moves to the close button on open and returns to the trigger on close.

---

## 4. Cloudflare R2 across two accounts

This one is a platform boundary, not a config mistake:

> **An R2 bucket binding only resolves when the bucket and the Worker live in
> the same Cloudflare account.**

`rinovabd-worker` cannot bind a bucket owned by a different member account.
No amount of `wrangler.toml` tuning changes that. Two ways out:

**Option A — move the bucket (cleanest).** Recreate the bucket in the Worker's
account and copy objects across with `rclone` or the S3 API. One binding, no
credentials in the Worker, lowest latency, no egress path to misconfigure.

**Option B — keep them split, talk S3.** Mint an R2 API token in the bucket's
account and call the S3-compatible endpoint from the Worker:

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET>
```

Store `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` as Worker
secrets (`wrangler secret put`), never in `runtime-config.js` — that file ships
to the browser.

For public product images, don't proxy through the Worker at all. Attach a
custom domain to the bucket (`cdn.rinovabd.com`), serve images straight from it,
and set bucket CORS to allow the storefront origin:

```json
[{
  "AllowedOrigins": ["https://rinovabd.com"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

A missing or wrong CORS policy here produces exactly the flaky, intermittent
image loading that makes the lightbox feel broken even after the scroll fix.

Note that `media-viewer.js` only accepts URLs matching
`^(https://|/assets/|/media/)`, so a `cdn.rinovabd.com` origin passes, but any
protocol-relative or relative path will be silently dropped.

---

## 5. Admin dashboard IA

`web/admin/index.html` is ~39KB of markup with a flat navigation surface — the
messiness is structural, not cosmetic. Collapse to six top-level groups; every
other screen becomes a child route:

| Group | Contains |
|---|---|
| **Overview** | KPIs, today's orders, low stock |
| **Orders** | All orders, tracking, invoices, returns |
| **Catalog** | Products, categories, inventory, media |
| **Customers** | Accounts, support threads |
| **Content** | Blog, doctor reports, offers, popups |
| **Settings** | Users, integrations, R2, analytics |

Persistent 260px left rail, exactly one active state at a time, breadcrumbs on
every detail view. Most sprawling admin panels sprawl because every feature was
given a top-level slot as it shipped.

---

## 6. Security — do this first

The admin username and password were shared in plain text in a chat transcript.
Rotate them, and rotate any R2 or deployment credentials that account can reach.
If the admin login is a single shared credential, that is worth replacing with
per-user accounts and 2FA regardless.

---

## 7. Verify before merge

- Open a product image on iOS Safari and Android Chrome — the page must not
  shift horizontally, and must return to the same scroll offset on close.
- Open image 3 of 5 directly — the viewer must open on image 3.
- Tab through the header — every control shows a visible focus ring.
- Check contrast: `--muted` `#6B635C` on `--paper` `#FBF9F7` passes AA for body text.
- Load a product image from `cdn.rinovabd.com` with devtools open — no CORS errors.
