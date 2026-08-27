(() => {
  const host = window.location.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  const workerOrigin = 'https://rinovabd-worker.abdussalam8480.workers.dev';
  window.RINOVA_API_BASE = local ? `${window.location.protocol}//${host}:8787/api` : (host.endsWith('workers.dev') ? '/api' : `${workerOrigin}/api`);
})();
