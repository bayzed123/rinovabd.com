# Rinova — Premium Theme Redesign

Branch: `redesign/premium-theme-v1`

This is an **override layer**. Nothing in `web/styles.css` is deleted. Reverting
the visual change means removing two lines from each page; the old stylesheet is
still there underneath.

---

## 0. Before anything else

The admin username and password were shared in plain text. **Rotate them**, and
rotate any R2 or deployment keys that account can reach.

---

## 1. Wiring it up

On every page under `web/` — `index.html`, `product.html`, `blog.html`,
`account.html`, `checkout.html`, `track.html`, `invoice.html`, `sitemap.html`,
`404.html` — add these **after** the existing `styles.css` link:

```html
<link rel="stylesheet" href="/theme.css">
<script src="/theme-init.js" defer></script>
```

Order matters. `theme.css` must come second or the old tokens win.

`web/media-viewer.js` was rewritten in place — no markup change needed.

To preview on one page first, add the two lines to `product.html` only. That page
exercises the palette, the buttons, and the lightbox fix together.

---

## 2. What changed visually

### Palette

The old tokens made pink the **canvas**:

```css
--paper:#fffbfd;  --cream:#FFF7FE;  --blush:#F8E5F7;  --accent:#DA70D6;
```

Every surface was tinted, so nothing could stand out against anything. That is
the "messy, overpowering" feeling — it is a contrast problem, not a taste problem.

None of the brands worth benchmarking do this. Glossier, Rhode, and Fenty Skin
all sit on near-white or warm cream and spend their entire colour budget on one
or two moments per screen.

| Role | Value | Use |
|---|---|---|
| Canvas | `#FBF9F7` | Page background |
| Surface | `#FFFFFF` | Cards, sheets, modals |
| Ink | `#16130F` | Headings, primary buttons |
| Muted | `#6B635C` | Body copy, captions |
| Blush | `#F2DCD6` | Section washes only — never full-page |
| Accent | `#C4776B` | Links, active states, badges |
| Line | `#EAE4DF` | 1px hairlines instead of shadows |

Pink now covers roughly 15% of any given viewport. That restraint *is* the
premium signal.

### Space

The single biggest lever, and the one that costs nothing. Section padding moves
to `clamp(64px, 9vw, 128px)` on an 8pt grid; body copy caps at 65ch. Most sites
that read as "messy" are simply under-spaced.

### Type

Playfair Display for headings at `-0.02em` tracking and `1.06` line-height;
DM Sans for everything else at `1.65`. Product names in the serif, prices in the
grotesk.

---

## 3. Buttons and icons

52px pills. Three variants, and only ever **one filled button per viewport
section**:

```html
<a class="button button-dark">Shop the routine</a>
<a class="button button-ghost">Learn more</a>
<a class="button button-accent">Save 20%</a>
```

No gradients, no drop shadows on buttons, no emoji anywhere in UI chrome — emoji
are the fastest way to make a store look amateur. Use monochrome SVG at 20px with
a 1.5px stroke, inheriting `currentColor` (the `.rinova-icon` rule in `theme.css`
enforces this). The existing `data-rinova-icon` hooks in `icons.js` already work
with it.

Every interactive element gets a visible `:focus-visible` ring. The old
stylesheet only had one on the media viewer.

---

## 4. The image-click bug

### What was wrong

The lightbox locked the page with a bare `overflow:hidden` on `<body>`. Removing
the scrollbar reflows the whole page ~15px wider — that sideways snap is the
"lock" you were seeing. Closing restored `overflow` but never restored the scroll
position, and the global `scroll-behavior:smooth` animated whatever restore did
happen.

### The fix

Pin the body at its current offset and compensate for the scrollbar:

```js
const y = window.scrollY;
const gutter = window.innerWidth - document.documentElement.clientWidth;
document.body.style.position = 'fixed';
document.body.style.top = `-${y}px`;
document.body.style.width = '100%';
if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
```

On unlock, force `scroll-behavior:auto` before `window.scrollTo(0, y)` so the
restore is instant. `html { scrollbar-gutter: stable; }` in `theme.css` stops the
gutter collapsing in the first place.

### Three more bugs found in the same file

1. **Wrong opening image.** A single `requestAnimationFrame` before setting
   `scrollLeft` often ran while the track still had zero width, so opening image
   3 of 5 landed on image 1. Now double-rAF with a non-smooth jump.
2. **Decode flash on paging.** Slides now fade in on `load` instead of showing a
   raw `src` swap, and neighbouring images preload when the index changes.
3. **Focus was lost.** Focus moves to the close button on open and returns to the
   triggering thumbnail on close.

---

## 5. R2 across two Cloudflare accounts

This one matters more than it sounds.

**An R2 binding only resolves when the bucket and the Worker live in the same
Cloudflare account.** If the bucket sits under a different member account than
`rinovabd-worker`, no binding will ever work. That is a platform boundary, not a
config mistake, and no amount of `wrangler.toml` editing fixes it.

Two ways out.

### Option A — move the bucket (cleanest)

Put the bucket in the Worker's account and keep the native binding:

```toml
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "rinova-media"
```

Zero egress, no credentials to rotate, no CORS.

### Option B — keep them split, use the S3 API

Generate an R2 API token in the bucket's account, store it as Worker secrets
(`wrangler secret put R2_ACCESS_KEY_ID`, etc.), and reach the bucket over its
S3-compatible endpoint:

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<BUCKET>
```

The `<ACCOUNT_ID>` here is the account that **owns the bucket**, not the Worker's.
That mismatch is the usual reason this setup fails silently.

Then expose the bucket on a custom domain — `cdn.rinovabd.com` — and set CORS to
allow only your storefront origins:

```json
[{
  "AllowedOrigins": ["https://rinovabd.com", "https://www.rinovabd.com"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 86400
}]
```

A missing or wildcard-mismatched CORS policy here produces exactly the kind of
flaky, sometimes-loads-sometimes-doesn't image behaviour that is easy to blame on
the gallery code.

### One thing to check either way

`media-viewer.js` validates URLs against:

```js
/^(https:\/\/|\/assets\/|\/media\/)/i
```

A `https://cdn.rinovabd.com/...` URL passes. A relative path like
`media/foo.jpg` (no leading slash) is **silently dropped** and the slide never
renders. If images are vanishing rather than loading slowly, check this first —
it fails without an error.

---

## 6. Admin dashboard IA

`web/admin/index.html` is ~39KB of markup and `web/admin/app.js` is ~73KB. The
navigation reads as messy because nearly every feature claimed a top-level slot.

Proposed structure — six groups, everything else becomes a child route:

| Group | Contains |
|---|---|
| **Overview** | KPIs, recent activity, alerts |
| **Orders** | All orders, tracking, invoices, returns |
| **Catalog** | Products, categories, inventory, media |
| **Customers** | Accounts, segments, support threads |
| **Content** | Blog, homepage blocks, offers, banners |
| **Settings** | Account, users, integrations, R2 config |

Persistent left rail at 260px, one active state at a time, breadcrumbs on every
detail view, and a single primary action per screen in the top-right.

**Not implemented in this PR.** Restructuring 39KB of markup deserves its own
branch where the diff can actually be reviewed.

---

## 7. Suggested order of work

1. Rotate credentials.
2. Merge this branch, wire the two lines into `product.html`, confirm the
   lightbox no longer jumps.
3. Roll the two lines out to the remaining pages.
4. Resolve the R2 account split — Option A if you can move the bucket.
5. Admin IA as a separate PR.
