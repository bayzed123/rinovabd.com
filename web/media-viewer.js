(() => {
  let viewer;
  let track;
  let title;
  let zoomLabel;
  let slides = [];
  let current = 0;
  let zoom = 1;
  let scrollFrame;

  const safeUrl = (value) => {
    const url = String(value ?? '').trim();
    return /^(https:\/\/|\/assets\/)/i.test(url) ? url : '';
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  function ensureViewer() {
    if (viewer) return;
    viewer = document.createElement('section');
    viewer.className = 'media-viewer';
    viewer.hidden = true;
    viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = `<div class="media-viewer-backdrop" data-media-close></div><div class="media-viewer-dialog" role="dialog" aria-modal="true" aria-label="Product image viewer"><header class="media-viewer-head"><strong class="media-viewer-title"></strong><button type="button" class="media-viewer-close" data-media-close aria-label="Close image viewer">×</button></header><div class="media-viewer-stage"><button type="button" class="media-viewer-arrow media-viewer-prev" aria-label="Previous image">‹</button><div class="media-viewer-track"></div><button type="button" class="media-viewer-arrow media-viewer-next" aria-label="Next image">›</button></div><footer class="media-viewer-tools"><button type="button" data-media-zoom="out" aria-label="Zoom out">−</button><span class="media-viewer-zoom">100%</span><button type="button" data-media-zoom="in" aria-label="Zoom in">+</button><button type="button" data-media-zoom="reset">Reset</button><span class="media-viewer-hint">Swipe or scroll for more images</span></footer></div>`;
    document.body.appendChild(viewer);
    track = viewer.querySelector('.media-viewer-track');
    title = viewer.querySelector('.media-viewer-title');
    zoomLabel = viewer.querySelector('.media-viewer-zoom');
    viewer.addEventListener('click', (event) => {
      if (event.target.closest('[data-media-close]')) close();
      const zoomButton = event.target.closest('[data-media-zoom]');
      if (zoomButton) setZoom(zoomButton.dataset.mediaZoom);
      if (event.target.closest('.media-viewer-prev')) move(-1);
      if (event.target.closest('.media-viewer-next')) move(1);
    });
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        const width = track.clientWidth || 1;
        const next = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
        if (next !== current) {
          current = next;
          setZoom(1, false);
          updateControls();
        }
      });
    });
    document.addEventListener('keydown', (event) => {
      if (viewer.hidden) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === '+' || event.key === '=') setZoom('in');
      if (event.key === '-') setZoom('out');
    });
    window.addEventListener('resize', () => {
      if (!viewer.hidden) track.scrollLeft = current * track.clientWidth;
    });
  }

  function updateControls() {
    viewer.querySelector('.media-viewer-prev').disabled = current <= 0;
    viewer.querySelector('.media-viewer-next').disabled = current >= slides.length - 1;
    viewer.querySelector('.media-viewer-hint').textContent = slides.length > 1 ? `Image ${current + 1} of ${slides.length} · Swipe or scroll` : 'Click outside or press Esc to close';
  }

  function setZoom(direction, updateLabel = true) {
    if (direction === 'in') zoom = Math.min(3, zoom + 0.25);
    else if (direction === 'out') zoom = Math.max(1, zoom - 0.25);
    else zoom = 1;
    const image = track.querySelector(`[data-slide-index="${current}"] img`);
    if (image) image.style.transform = `scale(${zoom})`;
    if (updateLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    else zoomLabel.textContent = '100%';
  }

  function move(direction) {
    const next = Math.max(0, Math.min(slides.length - 1, current + direction));
    if (next === current) return;
    current = next;
    setZoom(1, false);
    track.scrollTo({ left: current * track.clientWidth, behavior: 'smooth' });
    updateControls();
  }

  function close() {
    if (!viewer || viewer.hidden) return;
    viewer.classList.remove('open');
    document.body.classList.remove('media-viewer-open');
    setTimeout(() => { if (!viewer.classList.contains('open')) viewer.hidden = true; }, 180);
    viewer.setAttribute('aria-hidden', 'true');
  }

  function open(items, index = 0, productTitle = 'Product images') {
    ensureViewer();
    slides = (Array.isArray(items) ? items : []).map((item) => ({ type: item?.type === 'video' ? 'video' : 'image', url: safeUrl(typeof item === 'string' ? item : item?.url), alt: item?.alt || productTitle })).filter((item) => item.url);
    if (!slides.length) return;
    current = Math.max(0, Math.min(slides.length - 1, Number(index) || 0));
    title.textContent = productTitle;
    track.innerHTML = slides.map((item, slideIndex) => `<div class="media-viewer-slide" data-slide-index="${slideIndex}">${item.type === 'video' ? `<video controls playsinline preload="metadata"><source src="${escapeHtml(item.url)}">Your browser does not support this video.</video>` : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" draggable="false" />`}</div>`).join('');
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('media-viewer-open');
    setZoom(1, false);
    updateControls();
    requestAnimationFrame(() => { track.scrollLeft = current * track.clientWidth; viewer.classList.add('open'); });
  }

  window.RinovaMediaViewer = { open, close };
})();
