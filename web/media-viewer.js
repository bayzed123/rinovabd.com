(() => {
  let viewer;
  let track;
  let title;
  let zoomLabel;
  let slides = [];
  let current = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragState;
  let scrollTimer;
  let lastTap = 0;
  let dismissState;
  let closeTimer;

  const safeUrl = (value) => {
    const url = String(value ?? '').trim();
    return /^(https:\/\/|\/assets\/|\/media\/)/i.test(url) ? url : '';
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  function activeImage() { return track?.querySelector(`[data-slide-index="${current}"] img`); }

  function clampPan() {
    const image = activeImage();
    if (!image || zoom <= 1) { panX = 0; panY = 0; return; }
    const maxX = Math.max(0, image.clientWidth * (zoom - 1) / 2);
    const maxY = Math.max(0, image.clientHeight * (zoom - 1) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function applyTransform() {
    const image = activeImage();
    if (!image) return;
    clampPan();
    image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    image.style.touchAction = zoom > 1 ? 'none' : 'manipulation';
    image.style.cursor = zoom > 1 ? (dragState ? 'grabbing' : 'grab') : 'zoom-in';
  }

  function ensureViewer() {
    if (viewer) return;
    viewer = document.createElement('section');
    viewer.className = 'media-viewer';
    viewer.hidden = true;
    viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = `<div class="media-viewer-backdrop" data-media-close></div><div class="media-viewer-dialog" role="dialog" aria-modal="true" aria-label="Product image viewer"><header class="media-viewer-head"><strong class="media-viewer-title"></strong><button type="button" class="media-viewer-close" data-media-close aria-label="Close image viewer"><span data-rinova-icon="close"></span></button></header><div class="media-viewer-stage"><button type="button" class="media-viewer-arrow media-viewer-prev" aria-label="Previous image"><span data-rinova-icon="arrowLeft"></span></button><div class="media-viewer-track"></div><button type="button" class="media-viewer-arrow media-viewer-next" aria-label="Next image"><span data-rinova-icon="arrowRight"></span></button></div><footer class="media-viewer-tools"><button type="button" data-media-zoom="out" aria-label="Zoom out"><span data-rinova-icon="minus"></span></button><span class="media-viewer-zoom">100%</span><button type="button" data-media-zoom="in" aria-label="Zoom in"><span data-rinova-icon="plus"></span></button><button type="button" data-media-zoom="reset">Reset</button><span class="media-viewer-hint">Swipe between images · double-tap to zoom</span></footer></div>`;
    document.body.appendChild(viewer);
    track = viewer.querySelector('.media-viewer-track');
    title = viewer.querySelector('.media-viewer-title');
    zoomLabel = viewer.querySelector('.media-viewer-zoom');
    const dialog = viewer.querySelector('.media-viewer-dialog');
    viewer.addEventListener('click', (event) => {
      if (event.target.closest('[data-media-close]')) close();
      const zoomButton = event.target.closest('[data-media-zoom]');
      if (zoomButton) setZoom(zoomButton.dataset.mediaZoom);
      if (event.target.closest('.media-viewer-prev')) move(-1);
      if (event.target.closest('.media-viewer-next')) move(1);
    });
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const width = track.clientWidth || 1;
        const next = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
        if (next !== current) {
          current = next;
          setZoom('reset', false);
          updateControls();
        }
      }, 120);
    }, { passive: true });
    const resetDismiss = () => {
      dismissState = null;
      viewer.classList.remove('media-viewer-dismissing');
      viewer.style.removeProperty('--media-dismiss-y');
    };
    dialog.addEventListener('touchstart', (event) => {
      if (zoom > 1) return;
      const touch = event.changedTouches[0];
      if (touch) dismissState = { x: touch.clientX, y: touch.clientY, deltaY: 0, active: false };
    }, { passive: true });
    dialog.addEventListener('touchmove', (event) => {
      if (!dismissState || zoom > 1) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - dismissState.x;
      const deltaY = touch.clientY - dismissState.y;
      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        if (dismissState.active) resetDismiss();
        return;
      }
      dismissState.active = true;
      dismissState.deltaY = deltaY;
      event.preventDefault();
      viewer.classList.add('media-viewer-dismissing');
      viewer.style.setProperty('--media-dismiss-y', `${Math.min(deltaY, window.innerHeight)}px`);
    }, { passive: false });
    dialog.addEventListener('touchend', () => {
      if (!dismissState) return;
      const shouldClose = dismissState.active && dismissState.deltaY > 96;
      resetDismiss();
      if (shouldClose) close();
    }, { passive: true });
    dialog.addEventListener('touchcancel', resetDismiss, { passive: true });

    track.addEventListener('pointerdown', (event) => {
      const image = event.target.closest('.media-viewer-slide img');
      if (!image || zoom <= 1) return;
      dragState = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, moved: false };
      image.setPointerCapture?.(event.pointerId);
      applyTransform();
    });
    track.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.id !== event.pointerId) return;
      event.preventDefault();
      dragState.moved = Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y) > 6;
      panX = dragState.panX + event.clientX - dragState.x;
      panY = dragState.panY + event.clientY - dragState.y;
      applyTransform();
    }, { passive: false });
    const stopDrag = (event) => {
      if (dragState?.id === event.pointerId) {
        const moved = dragState.moved;
        dragState = null;
        if (moved) lastTap = 0;
        applyTransform();
      }
    };
    track.addEventListener('pointerup', stopDrag);
    track.addEventListener('pointercancel', stopDrag);
    track.addEventListener('pointerup', (event) => {
      if (!event.target.closest('.media-viewer-slide img')) return;
      const now = Date.now();
      if (now - lastTap < 280) setZoom(zoom > 1 ? 'reset' : 'in');
      lastTap = now;
    });
    document.addEventListener('keydown', (event) => {
      if (viewer.hidden) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === '+' || event.key === '=') setZoom('in');
      if (event.key === '-') setZoom('out');
      if (event.key === '0') setZoom('reset');
    });
    window.addEventListener('resize', () => {
      if (!viewer.hidden) { track.scrollLeft = current * track.clientWidth; applyTransform(); }
    });
  }

  function updateControls() {
    viewer.querySelector('.media-viewer-prev').disabled = current <= 0;
    viewer.querySelector('.media-viewer-next').disabled = current >= slides.length - 1;
    viewer.querySelector('.media-viewer-hint').textContent = slides.length > 1 ? `Image ${current + 1} of ${slides.length} · Swipe or double-tap to zoom` : 'Click outside or press Esc to close';
  }

  function setZoom(direction, updateLabel = true) {
    if (direction === 'in') zoom = Math.min(3, zoom + 0.25);
    else if (direction === 'out') zoom = Math.max(1, zoom - 0.25);
    else zoom = 1;
    if (zoom === 1) { panX = 0; panY = 0; dragState = null; }
    applyTransform();
    if (updateLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    else zoomLabel.textContent = '100%';
  }

  function move(direction) {
    const next = Math.max(0, Math.min(slides.length - 1, current + direction));
    if (next === current) return;
    current = next;
    setZoom('reset', false);
    track.scrollTo({ left: current * track.clientWidth, behavior: 'smooth' });
    updateControls();
  }

  function close() {
    if (!viewer) return;
    clearTimeout(closeTimer);
    dismissState = null;
    dragState = null;
    viewer.classList.remove('media-viewer-dismissing');
    viewer.style.removeProperty('--media-dismiss-y');
    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('media-viewer-open');
    document.documentElement.classList.remove('media-viewer-open');
    closeTimer = setTimeout(() => { if (!viewer.classList.contains('open')) viewer.hidden = true; }, 220);
  }

  function open(items, index = 0, productTitle = 'Product images') {
    ensureViewer();
    slides = (Array.isArray(items) ? items : []).map((item) => ({ type: item?.type === 'video' ? 'video' : 'image', url: safeUrl(typeof item === 'string' ? item : item?.url), alt: item?.alt || productTitle })).filter((item) => item.url);
    if (!slides.length) return;
    clearTimeout(closeTimer);
    current = Math.max(0, Math.min(slides.length - 1, Number(index) || 0));
    title.textContent = productTitle;
    track.innerHTML = slides.map((item, slideIndex) => `<div class="media-viewer-slide" data-slide-index="${slideIndex}">${item.type === 'video' ? `<video controls playsinline preload="metadata"><source src="${escapeHtml(item.url)}">Your browser does not support this video.</video>` : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" draggable="false" />`}</div>`).join('');
    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('media-viewer-open');
    document.documentElement.classList.add('media-viewer-open');
    setZoom('reset', false);
    updateControls();
    requestAnimationFrame(() => { track.scrollLeft = current * track.clientWidth; viewer.classList.add('open'); applyTransform(); });
  }

  window.RinovaMediaViewer = { open, close };
})();
