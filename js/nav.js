// Sticky header: solid after scrolling, reading progress, mobile menu, active section.

export function initNav() {
  const header = document.querySelector('.site-header');
  const toggle = header.querySelector('.menu-toggle');
  const menu = document.getElementById('site-menu');
  const bar = header.querySelector('.progress span');
  const links = [...menu.querySelectorAll('a[href^="#"]')];
  const wide = matchMedia('(min-width: 64rem)');

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      header.classList.toggle('is-scrolled', y > 24);
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();

  function setOpen(open) {
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    document.body.classList.toggle('no-scroll', open);
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  links.forEach((a) => a.addEventListener('click', () => setOpen(false)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('menu-open')) { setOpen(false); toggle.focus(); }
  });
  wide.addEventListener('change', (e) => { if (e.matches) setOpen(false); });

  // Active section: the one crossing a thin band just above the middle of the screen.
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      const a = byId.get(en.target.id);
      if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'true'); }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  // Clear the highlight while the hero or the summary is on screen.
  const clear = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  ['basa', 'ozet'].forEach((id) => { const s = document.getElementById(id); if (s) clear.observe(s); });
}

export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((el) => io.observe(el));
}
