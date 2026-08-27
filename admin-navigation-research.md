# Rinova Admin Navigation Redesign Research

## Playwright baseline

The authenticated production admin dashboard was inspected at a 390 x 844 mobile viewport before edits. The mobile drawer was 320px wide inside a 390px viewport, showed 5 navigation groups and 13 navigation items, and used mixed text symbols such as `⌂`, `✦`, `▦`, `⌁`, `▣`, `◌`, `↩`, `★`, `✎`, `↗`, `⚙`, and `?`. The drawer content included Overview, Catalogue, Operations, Growth, and Workspace, followed by a private workspace note and Sign out.

The user reference screenshots show the intended direction: a dark plum drawer, blush/pink active state, concise labels, cleaner spacing, and a premium admin-studio identity. The main issues to address are inconsistent symbol/icon weight, large vertical gaps, weak grouping rhythm, and the drawer competing visually with the dashboard behind it.

## External UX guidance

W3C WCAG 2.2 Success Criterion 2.4.3 states that focusable components should receive focus in an order that preserves meaning and operability. The redesign should keep DOM order aligned with the visual group order and retain a logical keyboard sequence.

Nielsen Norman Group's mobile navigation primer states that mobile navigation must be discoverable, accessible, and use little screen space. Hidden hamburger navigation is space-efficient but less discoverable, so the open-navigation control should remain clear and the drawer should use recognizable labels, strong active state, and compact grouping.

## Redesign direction

Keep the current routes and data-view contract unchanged. Replace decorative text symbols with a consistent lightweight icon treatment using inline SVG/CSS-compatible marks or a normalized icon box. Use a strong active row with blush gradient and left accent, 44px+ touch targets, predictable 16-20px group rhythm, a compact brand header, and a visually separate workspace/footer utility area. Preserve the current 320px mobile drawer behavior unless screenshots show a better fit; avoid overflow and keep the close/backdrop behavior intact.
