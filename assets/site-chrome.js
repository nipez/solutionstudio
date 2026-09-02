/* Shared site chrome behavior — pairs with partials/site-nav.html */
(function () {
  const hdr = document.getElementById('siteHdr');
  const mnav = document.getElementById('siteMnav');
  const burger = document.getElementById('siteBurger');
  const closeBtn = document.getElementById('siteMnavClose');
  if (!hdr || !mnav || !burger || !closeBtn) return;

  document.body.classList.add('has-site-hdr');
  if (hdr.classList.contains('site-hdr--over-hero')) {
    document.body.classList.add('site-hdr-over-hero');
    const onScroll = () => hdr.classList.toggle('is-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const open = () => {
    mnav.classList.add('is-open');
    mnav.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    mnav.classList.remove('is-open');
    mnav.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  mnav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mnav.classList.contains('is-open')) close();
  });
})();
