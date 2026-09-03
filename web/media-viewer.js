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
  let originEl = null;
  let homeFlight = null;   // how to map the open image back onto the thumbnail it came from
  let flight = 0;          // 0 = fully open, 1 = sitting exactly on the origin
  let wheelReset;
  let lockedScrollY = 0;
  let isLocked = false;
  let lastFocused = null;

  const safeUrl = (value) => {
    const url = String(value ?? '').trim();
    return /^(https:\/\/|\/assets\/|\/media\/)/i.test(url) ? url : '';
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  /* ------------------------------------------------------------------
     SCROLL LOCK
     The old version toggled `overflow:hidden` only. Removing the
     scrollbar reflows the page ~15px wider, which is the visible
     "jump / lock" when an image is clicked. We now pin the body at its
     current offset AND compensate for the scrollbar width, then restore
     the exact scroll position on close.
  ------------------------------------------------------------------ */
  function lockScroll() {
    if (isLocked) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    body.classList.add('media-viewer-open');
    document.documentElement.classList.add('media-viewer-open');
    isLocked = true;
  }

  function unlockScroll() {
    if (!isLocked) return;
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.paddingRight = '';
    body.classList.remove('media-viewer-open');
    document.documentElement.classList.remove('media-viewer-open');
    // restore without smooth-scroll animation
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, lockedScrollY);
    document.documentElement.style.scrollBehavior = previous;
    isLocked = false;
  }

  function activeImage() { return track?.querySelector(`[data-slide-index="${current}"] img`); }

  function clampPan() {
    const image = activeImage();
    if (!image || zoom <= 1) { panX = 0; panY = 0; return; }
    const maxX = Math.max(0, image.clientWidth * (zoom - 1) / 2);
    const maxY = Math.max(0, image.clientHeight * (zoom - 1) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  /* ------------------------------------------------------------------
     GROWING OUT OF THE THUMBNAIL, AND SHRINKING BACK INTO IT
     Opening used to fade a full-screen panel in over the page, which gives
     no sense of where the big image came from. We measure the thumbnail the
     customer tapped and the image once it is laid out, work out the single
     transform that puts the second exactly on top of the first, and animate
     between them. The same numbers run backwards on close, so the image
     returns to its own place in the grid instead of vanishing.

     If the origin has scrolled out of view, or was never given, there is no
     honest place to fly from — the viewer falls back to the plain fade.
  ------------------------------------------------------------------ */
  function originRect() {
    if (!originEl || !document.contains(originEl)) return null;
    const node = originEl.querySelector('img, video') || originEl;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
    return rect;
  }

  function measureHome() {
    // The rect of a transformed element is its transformed rect, so measuring part-way through
    // a flight would fold the current transform into the next one. Only measure at rest.
    if (flight > 0 && homeFlight) return;
    homeFlight = null;
    const image = activeImage();
    const from = originRect();
    if (!image || !from) return;
    const to = image.getBoundingClientRect();
    // An image that has not loaded yet has a placeholder box a few pixels across. Measuring
    // against that produced a scale of eighteen and an image that arrived the size of a wall.
    if (to.width < 24 || to.height < 24) return;
    // One uniform scale, so the image never stretches on the way home. Taking the larger of the
    // two ratios fills the thumbnail's box the way the thumbnail itself does.
    const scale = Math.max(from.width / to.width, from.height / to.height);
    homeFlight = {
      scale,
      x: (from.left + from.width / 2) - (to.left + to.width / 2),
      y: (from.top + from.height / 2) - (to.top + to.height / 2),
    };
  }

  /** 0 leaves the image where it opened; 1 puts it exactly on its thumbnail. */
  function setFlight(progress) {
    flight = homeFlight ? Math.max(0, Math.min(1, progress)) : 0;
    viewer?.style.setProperty('--media-flight', String(flight));
    applyTransform();
  }

  function applyTransform() {
    const image = activeImage();
    if (!image) return;
    clampPan();
    if (homeFlight && flight > 0) {
      const scale = 1 + (homeFlight.scale - 1) * flight;
      image.style.transform = `translate3d(${homeFlight.x * flight}px, ${homeFlight.y * flight}px, 0) scale(${scale})`;
    } else {
      image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    }
    image.style.touchAction = zoom > 1 ? 'none' : 'manipulation';
    image.style.cursor = zoom > 1 ? (dragState ? 'grabbing' : 'grab') : 'zoom-in';
  }

  /* Snap without the smooth-scroll animation (used on open / resize). */
  function jumpTo(index) {
    if (!track) return;
    const width = track.clientWidth;
    if (!width) return;
    const previous = track.style.scrollBehavior;
    track.style.scrollBehavior = 'auto';
    track.scrollLeft = index * width;
    // force reflow so the assignment lands before smooth is restored
    void track.offsetWidth;
    track.style.scrollBehavior = previous || '';
  }

  function ensureViewer() {
    if (viewer) return;
    viewer = document.createElement('section');
    viewer.className = 'media-viewer';
    viewer.hidden = true;
    viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = `<div class="media-viewer-backdrop" data-media-close></div><div class="media-viewer-dialog" role="dialog" aria-modal="true" aria-label="Product image viewer"><header class="media-viewer-head"><strong class="media-viewer-title"></strong><button type="button" class="media-viewer-close" data-media-close aria-label="Close image viewer"><span data-rinova-icon="close"></span><span class="media-viewer-close-text">Close</span></button></header><div class="media-viewer-stage"><button type="button" class="media-viewer-arrow media-viewer-prev" aria-label="Previous image"><span data-rinova-icon="arrowLeft"></span></button><div class="media-viewer-track"></div><button type="button" class="media-viewer-arrow media-viewer-next" aria-label="Next image"><span data-rinova-icon="arrowRight"></span></button></div><footer class="media-viewer-tools"><button type="button" data-media-zoom="out" aria-label="Zoom out"><span data-rinova-icon="minus"></span></button><span class="media-viewer-zoom">100%</span><button type="button" data-media-zoom="in" aria-label="Zoom in"><span data-rinova-icon="plus"></span></button><button type="button" data-media-zoom="reset">Reset</button><span class="media-viewer-hint">Swipe between images \u00b7 double-tap to zoom</span></footer></div>`;
    document.body.appendChild(viewer);
    // icons.js only hydrates [data-rinova-icon] once, at DOMContentLoaded. This markup is
    // built lazily on first open, so without this call the close, arrow and zoom buttons
    // render as empty shapes and the viewer looks like it has trapped the page.
    window.RinovaIcons?.hydrate(viewer);
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
          homeFlight = null;
          setZoom('reset', false);
          updateControls();
          preloadNeighbours();
        }
      }, 120);
    }, { passive: true });
    /* ------------------------------------------------------------------
       DISMISSING BY DRAGGING DOWN
       The viewer used to slide the whole dialog down a few pixels and fade,
       which reads as a panel being pushed away rather than an image going
       back where it came from. A vertical drag now runs the opening flight
       backwards: the image shrinks towards the thumbnail it grew out of and
       the chrome fades with it, so letting go finishes a movement the finger
       already started. A horizontal drag is left to the track, which pages
       between images.
    ------------------------------------------------------------------ */
    const resetDismiss = () => {
      dismissState = null;
      viewer.classList.remove('media-viewer-dismissing');
      setFlight(0);
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
      if (!dismissState.active) measureHome();
      dismissState.active = true;
      dismissState.deltaY = deltaY;
      event.preventDefault();
      viewer.classList.add('media-viewer-dismissing');
      // Stop a hair short of 1 so the image is still visible when the finger lifts;
      // releasing then finishes the last of the journey rather than snapping.
      setFlight(Math.min(0.88, deltaY / (window.innerHeight * 0.45)));
    }, { passive: false });
    dialog.addEventListener('touchend', () => {
      if (!dismissState) return;
      const shouldClose = dismissState.active && dismissState.deltaY > 96;
      resetDismiss();
      if (shouldClose) close();
    }, { passive: true });
    dialog.addEventListener('touchcancel', resetDismiss, { passive: true });

    // The same gesture with a wheel or trackpad, so scrolling down dismisses on a laptop too.
    dialog.addEventListener('wheel', (event) => {
      if (zoom > 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (!flight) measureHome();
      const next = Math.max(0, Math.min(0.88, flight + event.deltaY / (window.innerHeight * 0.6)));
      viewer.classList.add('media-viewer-dismissing');
      setFlight(next);
      clearTimeout(wheelReset);
      if (next >= 0.5) { viewer.classList.remove('media-viewer-dismissing'); close(); return; }
      // A short nudge springs back rather than leaving the image stranded mid-flight.
      wheelReset = setTimeout(() => { viewer.classList.remove('media-viewer-dismissing'); setFlight(0); }, 160);
    }, { passive: false });

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
      if (!viewer.hidden) { jumpTo(current); applyTransform(); }
    });
  }

  function updateControls() {
    viewer.querySelector('.media-viewer-prev').disabled = current <= 0;
    viewer.querySelector('.media-viewer-next').disabled = current >= slides.length - 1;
    // "Click" and "Esc" mean nothing on a phone, which is where most customers are.
    const touch = window.matchMedia('(hover: none)').matches;
    const dismiss = touch ? 'Tap Close when you are done' : 'Click outside or press Esc to close';
    viewer.querySelector('.media-viewer-hint').textContent = slides.length > 1
      ? `Image ${current + 1} of ${slides.length} \u00b7 ${touch ? 'Swipe or double-tap to zoom' : 'Use the arrows or double-click to zoom'}`
      : dismiss;
  }

  /* Warm the adjacent images so paging never shows a decode flash. */
  function preloadNeighbours() {
    [current - 1, current + 1].forEach((index) => {
      const item = slides[index];
      if (!item || item.type !== 'image') return;
      const img = new Image();
      img.decoding = 'async';
      img.src = item.url;
    });
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
    // A different picture is a different shape, so the way home has to be worked out again.
    homeFlight = null;
    setZoom('reset', false);
    track.scrollTo({ left: current * track.clientWidth, behavior: 'smooth' });
    updateControls();
    preloadNeighbours();
  }

  function close() {
    if (!viewer) return;
    clearTimeout(closeTimer);
    clearTimeout(wheelReset);
    dismissState = null;
    dragState = null;
    viewer.classList.remove('media-viewer-dismissing');
    viewer.setAttribute('aria-hidden', 'true');
    // Measure before unlocking: unlocking restores the page's scroll offset, and the origin has
    // to be measured in the same coordinate space the image is currently sitting in.
    if (zoom > 1) setZoom('reset', false);
    if (!homeFlight) measureHome();
    if (homeFlight) {
      // Let the image finish its journey before the viewer is torn down; `closing` fades the
      // backdrop and chrome around it and stops the viewer taking any more clicks.
      viewer.classList.add('media-viewer-closing');
      setFlight(1);
    } else {
      viewer.classList.remove('open');
    }
    unlockScroll();
    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
    closeTimer = setTimeout(() => {
      if (!viewer.classList.contains('media-viewer-closing') && viewer.classList.contains('open')) return;
      viewer.classList.remove('open', 'media-viewer-closing');
      viewer.hidden = true;
      homeFlight = null;
      originEl = null;
      setFlight(0);
    }, 320);
  }

  function open(items, index = 0, productTitle = 'Product images', origin = null) {
    ensureViewer();
    viewer.classList.remove('media-viewer-closing');
    originEl = origin instanceof Element ? origin : null;
    slides = (Array.isArray(items) ? items : []).map((item) => ({ type: item?.type === 'video' ? 'video' : 'image', url: safeUrl(typeof item === 'string' ? item : item?.url), alt: item?.alt || productTitle })).filter((item) => item.url);
    if (!slides.length) return;
    clearTimeout(closeTimer);
    lastFocused = document.activeElement;
    current = Math.max(0, Math.min(slides.length - 1, Number(index) || 0));
    title.textContent = productTitle;
    track.innerHTML = slides.map((item, slideIndex) => `<div class="media-viewer-slide is-loading" data-slide-index="${slideIndex}">${item.type === 'video' ? `<video controls playsinline preload="metadata"><source src="${escapeHtml(item.url)}">Your browser does not support this video.</video>` : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt)}" draggable="false" decoding="async" />`}</div>`).join('');

    // Fade each slide in as it decodes rather than swapping a bare src.
    track.querySelectorAll('.media-viewer-slide').forEach((slide) => {
      const img = slide.querySelector('img');
      if (!img) { slide.classList.remove('is-loading'); return; }
      if (img.complete) { slide.classList.remove('is-loading'); return; }
      img.addEventListener('load', () => slide.classList.remove('is-loading'), { once: true });
      img.addEventListener('error', () => slide.classList.remove('is-loading'), { once: true });
    });

    viewer.hidden = false;
    viewer.setAttribute('aria-hidden', 'false');
    lockScroll();
    setZoom('reset', false);
    updateControls();

    // Two frames: the first lets the dialog get its real width so
    // scrollLeft lands on the right slide instead of snapping back.
    // Start the image sitting exactly on the thumbnail, with no transition, then release it on
    // the next frame so the browser animates the whole distance in one movement.
    const takeOff = () => {
      measureHome();
      viewer.classList.add('media-viewer-arriving');
      setFlight(1);
      viewer.classList.add('open');
      preloadNeighbours();
      requestAnimationFrame(() => {
        viewer.classList.remove('media-viewer-arriving');
        setFlight(0);
        applyTransform();
        viewer.querySelector('.media-viewer-close')?.focus({ preventScroll: true });
      });
    };

    requestAnimationFrame(() => {
      jumpTo(current);
      requestAnimationFrame(() => {
        jumpTo(current);
        // Wait for the picture to have a real size before measuring the journey — but never let
        // a slow image keep the viewer invisible; after a moment it opens without the flight.
        const image = activeImage();
        if (!image || (image.complete && image.naturalWidth)) { takeOff(); return; }
        let launched = false;
        const go = () => { if (!launched) { launched = true; takeOff(); } };
        image.addEventListener('load', go, { once: true });
        image.addEventListener('error', go, { once: true });
        setTimeout(go, 400);
      });
    });
  }

  window.RinovaMediaViewer = { open, close };
})();
