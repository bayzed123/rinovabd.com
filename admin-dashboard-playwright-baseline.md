# Playwright baseline inspection

The live authenticated admin dashboard was opened at `https://rinovabd-worker.abdussalam8480.workers.dev/admin/?view=assistant` using the existing user-provided credentials only for inspection. Playwright captured baseline screenshots at desktop and at a 390×844 mobile viewport before any new design edits.

The mobile accessibility snapshot confirmed that the sidebar is closed and positioned off-canvas at approximately x=-325, while the main panel begins at y=70 and fills the 390px viewport. The navigation structure is grouped, but the baseline still has a visually heavy dark drawer treatment when opened and the assistant content occupies a large vertical area.

The remaining visible issue in the assistant is the input affordance at the lower right: the send control can appear like an isolated “A”/blank control in the phone capture. The fix should make the input a single obvious rounded field with a compact pink send button aligned inside the same row, remove any inherited conflicting chat styles, and give the control an explicit arrow/icon label.

The reference direction is a full-color but restrained Rinova theme: warm white/pale blush canvas, saturated baby-pink accent, deep plum navigation, rose borders, clear green online state, and strong contrast. The drawer should read as a deliberate full-height panel with aligned columns and adequate horizontal space, not as a compressed grid. The chat response should remain a scrollable conversation card with distinct assistant/user bubbles, readable Bangla line wrapping, and visible status/help text.

No design code was changed during this baseline capture.
