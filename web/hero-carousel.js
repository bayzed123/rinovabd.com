(() => {
  const initHeroCarousel = () => {
    document.querySelectorAll('[data-hero-carousel]').forEach((carousel) => {
      const slides = [...carousel.querySelectorAll('[data-hero-slide]')];
      const dots = [...carousel.querySelectorAll('[data-hero-index]')];
      const counter = carousel.parentElement?.querySelector('[data-hero-counter]');
      if (slides.length < 2) return;

      let current = slides.findIndex((slide) => slide.classList.contains('is-active'));
      let timer;
      let touchStartX = null;
      let touchStartY = null;
      let isAnimating = false;

      const setSlide = (nextIndex, immediate = false) => {
        const next = (nextIndex + slides.length) % slides.length;
        if (next === current && !immediate) return;
        const previous = current;
        current = next;
        isAnimating = !immediate;
        slides.forEach((slide, index) => {
          const active = index === current;
          slide.classList.toggle('is-active', active);
          slide.classList.toggle('is-previous', index === previous && previous !== current);
          slide.setAttribute('aria-hidden', String(!active));
        });
        dots.forEach((dot, index) => {
          const active = index === current;
          dot.classList.toggle('is-active', active);
          dot.setAttribute('aria-selected', String(active));
        });
        if (counter) counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
        window.setTimeout(() => { isAnimating = false; }, 620);
      };

      const restart = () => {
        window.clearInterval(timer);
        timer = window.setInterval(() => setSlide(current + 1), 5600);
      };

      carousel.querySelectorAll('[data-hero-direction]').forEach((button) => button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSlide(current + (button.dataset.heroDirection === 'prev' ? -1 : 1));
        restart();
      }));
      dots.forEach((dot) => dot.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSlide(Number(dot.dataset.heroIndex));
        restart();
      }));
      carousel.addEventListener('mouseenter', () => window.clearInterval(timer));
      carousel.addEventListener('mouseleave', restart);
      carousel.addEventListener('focusin', () => window.clearInterval(timer));
      carousel.addEventListener('focusout', (event) => { if (!carousel.contains(event.relatedTarget)) restart(); });
      carousel.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0]?.clientX ?? null;
        touchStartY = event.changedTouches[0]?.clientY ?? null;
        window.clearInterval(timer);
      }, { passive: true });
      carousel.addEventListener('touchend', (event) => {
        if (touchStartX === null || touchStartY === null || isAnimating) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const endY = event.changedTouches[0]?.clientY ?? touchStartY;
        const deltaX = endX - touchStartX;
        const deltaY = endY - touchStartY;
        touchStartX = null;
        touchStartY = null;
        if (Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY)) setSlide(current + (deltaX < 0 ? 1 : -1));
        restart();
      }, { passive: true });
      setSlide(current, true);
      restart();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeroCarousel, { once: true }); else initHeroCarousel();
})();
