(() => {
  const host = window.location.hostname;
  const port = window.location.port;
  const local = host === 'localhost' || host === '127.0.0.1';
  const workerOrigin = 'https://rinovabd-worker.abdussalam8480.workers.dev';
  // In local development the Worker usually serves the page and the API from the same
  // origin on whatever port `wrangler dev` picked, so prefer same-origin. Port 5173 is
  // the separate Vite dev server, which still has to reach the Worker on 8787.
  const localApi = !port || port === '5173' ? `${window.location.protocol}//${host}:8787/api` : '/api';
  window.RINOVA_API_BASE = local ? localApi : (host.endsWith('workers.dev') ? '/api' : `${workerOrigin}/api`);
})();
