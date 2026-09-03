(function () {
  const paths = {
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16" />',
    chat: '<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.1A7.5 7.5 0 1 1 20 12Z" />',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.4a11 11 0 0 0 5.6 5.6L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4 6.2 2 2 0 0 1 6 4Z" />',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 5.5L20 7" />',
    search: '<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />',
    account: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5" />',
    bag: '<path d="M5.5 8.5h13l1 12h-15l1-12Z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" />',
    heart: '<path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" />',
    arrowLeft: '<path d="M20 12H5" /><path d="m11 6-6 6 6 6" />',
    arrowRight: '<path d="M4 12h15" /><path d="m13 6 6 6-6 6" />',
    arrowUpRight: '<path d="M5 19 19 5" /><path d="M9 5h10v10" />',
    close: '<path d="m6 6 12 12M18 6 6 18" />',
    refresh: '<path d="M20 11a8 8 0 0 0-14.8-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 4L20 15" /><path d="M20 20v-5h-5" />',
    chevronDown: '<path d="m6 9 6 6 6-6" />',
    chevronRight: '<path d="m9 6 6 6-6 6" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    minus: '<path d="M5 12h14" />',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />',
    play: '<path d="m9 6 8 6-8 6V6Z" />',
    sparkle: '<path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />',
  };
  const svg = (name, className = '') => `<svg class="rinova-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  const fill = (node) => { if (node.firstElementChild) return; node.innerHTML = svg(node.dataset.rinovaIcon, node.dataset.rinovaIconClass || ''); node.setAttribute('aria-hidden', 'true'); };
  const hydrate = (root = document) => { if (root.matches?.('[data-rinova-icon]')) fill(root); root.querySelectorAll?.('[data-rinova-icon]').forEach(fill); };
  window.RinovaIcons = { svg, hydrate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate()); else hydrate();

  /**
   * Icons used to be drawn once, at DOMContentLoaded. Anything rendered after that — the
   * checkout basket, the account panels, the blog pager, the image viewer — came out as empty
   * boxes, which is how the viewer's close button went missing and how the checkout stepper
   * lost its minus. Watching the document fills them in whichever script writes them, so a
   * page never has to remember to ask.
   */
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) hydrate(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}());
