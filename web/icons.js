(function () {
  const paths = {
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16" />',
    search: '<circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />',
    account: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.3 3.1-5 7-5s6.2 1.7 7 5" />',
    bag: '<path d="M5.5 8.5h13l1 12h-15l1-12Z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" />',
    heart: '<path d="M20.8 8.7c0 5.1-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" />',
    arrowRight: '<path d="M4 12h15" /><path d="m13 6 6 6-6 6" />',
    arrowUpRight: '<path d="M5 19 19 5" /><path d="M9 5h10v10" />',
    close: '<path d="m6 6 12 12M18 6 6 18" />',
    chevronDown: '<path d="m6 9 6 6 6-6" />',
    chevronRight: '<path d="m9 6 6 6-6 6" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    minus: '<path d="M5 12h14" />',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />',
    play: '<path d="m9 6 8 6-8 6V6Z" />',
    sparkle: '<path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" /><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />',
  };
  const svg = (name, className = '') => `<svg class="rinova-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  const hydrate = (root = document) => root.querySelectorAll('[data-rinova-icon]').forEach((node) => { const name = node.dataset.rinovaIcon; node.innerHTML = svg(name, node.dataset.rinovaIconClass || ''); node.setAttribute('aria-hidden', 'true'); });
  window.RinovaIcons = { svg, hydrate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate()); else hydrate();
}());
