# Rinova Admin Dashboard Research Notes

## Live inspection

- The live public site is served by the Cloudflare Worker at `https://rinovabd-worker.abdussalam8480.workers.dev/`.
- The admin app route is `/admin/`; the old `/admin.html` path redirects there.
- The admin app already has a dedicated authenticated dashboard under `web/admin/index.html`, with `web/admin/app.js` and `web/admin/styles.css`.
- The mobile screenshot problem is consistent with the current CSS: the sidebar becomes a fixed, always-visible, three-column grid at the top of the mobile viewport, while the dashboard assistant is also presented as a fixed floating action plus a popover view. This creates a visually heavy header area and competes with the content.
- The current assistant view uses a 360px/330px fixed-height message area, a large white panel, a round close button, and a floating star launcher. The user screenshot shows the conversation text can become a long unstructured block with weak separation and no visible conversation states.
- The admin navigation currently lists 12 items in one flat sequence: Dashboard, Products, Orders, Inventory, Settings, Returns, Reviews, POS & Barcodes, Content CMS, Admin Assistant, বাংলা গাইড, Storefront. There are no visible groups or section labels.

## Repository findings

- The project is a custom Cloudflare Worker + D1 + static HTML/CSS/JavaScript app, not WordPress/WooCommerce.
- The repository already includes authenticated admin login/session flow (`/api/admin/login`, `/api/admin/session`) and the user-provided credentials should not be written into source code or committed.
- `web/admin/app.js` contains the view router, dashboard metrics, morning checklist, product/order/inventory/returns/reviews/POS/CMS loading, and admin chat rendering.
- `web/admin/index.html` contains the sidebar, topbar, view sections, and admin assistant markup.
- `web/admin/styles.css` contains several appended responsive overrides. Later rules force the sidebar to remain fixed and visible on mobile; this is a likely source of the messy mobile experience.
- The repository’s own `rinovabd-theme-dashboard-audit.md` identifies the app as a custom admin CMS with existing dashboard, product, inventory, orders, returns, reviews, POS, CMS, and assistant features.

## External UX/accessibility research

- W3C WCAG 2.2 is the primary accessibility reference. The redesign should preserve keyboard access, visible focus, sufficient target sizes, reflow on small screens, and should not rely on color alone for meaning. Source: https://www.w3.org/TR/WCAG22/
- W3C chatbot accessibility research reports that chat controls need visible text labels, a discoverable heading, clear distinction between user and assistant messages, and predictable keyboard focus. It also notes that users can miss one side of a left/right chat layout, so message distinction should not depend only on position. Source: https://www.w3.org/WAI/pages/about/projects/wai-coop/paper107.html
- Dashboard UX research recommends surfacing the most actionable items first, keeping a global overview as the default, and allowing detail via interaction rather than forcing every detail into the initial view. Source: https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards

## Redesign direction

- Keep the existing custom Cloudflare architecture and API contracts intact.
- Use a calm, warm off-white canvas with a restrained baby-pink accent, dark plum ink, muted rose borders, and green success states. Avoid pink text on pale pink backgrounds.
- Replace the flat mobile navigation grid with a compact top bar and slide-down/overlay navigation drawer grouped into `Overview`, `Catalogue`, `Operations`, `Growth`, and `Workspace`.
- Keep the desktop sidebar but add visual grouping, active-state clarity, and a compact user/session footer.
- Treat the assistant as a first-class workspace view rather than a floating star competing with content. Preserve a labelled quick-access button, but use a clean docked chat panel with visible title, privacy note, suggested prompts, conversation log semantics, empty state, loading state, and consistent message cards.
- Ensure the chat input and send button have accessible labels, status messaging, visible focus styles, and touch targets of at least roughly 44px where practical.
- Fix mobile overflow by removing the always-visible 12-item grid and using a real menu toggle, while keeping the current view routing and data functions working.
