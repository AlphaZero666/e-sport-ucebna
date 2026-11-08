/* ==========================================================================
   main.js – chování webu „Otevření e-sportové učebny“
   --------------------------------------------------------------------------
   Knihovna GSAP + ScrollTrigger se používá jen na otevírání brány v úvodu.
   Když se nenačte, stránka normálně funguje, brána jen zůstane pootevřená.

   Obsah:
     1. Nastavení a pomocné funkce
     2. Mobilní menu a aktivní odkaz v navigaci
     3. Úvod: obří text, odpočet, otevírání brány
     4. Harmonogram: štítek „právě probíhá“
     5. Učebna: propojení seznamu vybavení s 3D modelem
     6. Kalendář (.ics) a ohňostroj
     7. Spuštění
   ========================================================================== */
(() => {
  'use strict';

  /* ========================================================================
     1. NASTAVENÍ A POMOCNÉ FUNKCE
     ======================================================================== */
  const $ = (selector, ctx = document) => ctx.querySelector(selector);
  const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobileLayout = () => matchMedia('(max-width: 899px)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  // Čas konání akce (středoevropský čas, UTC+1)
  const EVENT_START = new Date('2026-11-07T08:00:00+01:00');
  const EVENT_END = new Date('2026-11-07T20:00:00+01:00');

  /** České skloňování: plural(5, ['den', 'dny', 'dní']) → „dní“. */
  const plural = (n, [one, few, many]) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);


  /* ========================================================================
     2. MOBILNÍ MENU A AKTIVNÍ ODKAZ
     ======================================================================== */
  function initMenu() {
    const button = $('.burger');
    const menu = $('#menu');

    const setOpen = (open) => {
      root.classList.toggle('is-menu-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Zavřít' : 'Menu';
      menu.inert = !open;
      menu.setAttribute('aria-hidden', String(!open));
    };

    button.addEventListener('click', () => setOpen(!root.classList.contains('is-menu-open')));
    $$('a', menu).forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
    // Při zvětšení okna se menu samo zavře
    matchMedia('(min-width: 1101px)').addEventListener('change', (event) => { if (event.matches) setOpen(false); });
  }

  /** Podtrhne v navigaci odkaz sekce, která je právě uprostřed obrazovky. */
  function initActiveLink() {
    const links = $$('.header__nav a');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => link.classList.toggle('is-active', link.hash === `#${entry.target.id}`));
      });
    }, { rootMargin: '-50% 0px -50% 0px' });

    links.forEach((link) => {
      const section = document.querySelector(link.hash);
      if (section) observer.observe(section);
    });
  }


  /* ========================================================================
     3. ÚVOD
     ======================================================================== */

  /**
   * Nastaví velikost písma prvků [data-fit] tak, aby text vyplnil šířku.
   * data-fit-max = maximální velikost jako podíl výšky okna (např. 0.24).
   */
  function fitText() {
    $$('[data-fit]').forEach((el) => {
      const inner = el.firstElementChild;
      const style = getComputedStyle(el);
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

      el.style.fontSize = '100px';
      let size = (100 * available) / inner.getBoundingClientRect().width;
      if (el.dataset.fitMax) size = Math.min(size, window.innerHeight * parseFloat(el.dataset.fitMax));
      el.style.fontSize = `${Math.floor(size * 0.99)}px`;
    });
  }

  /** Odpočet napsaný větou, např. „Začínáme za 5 dní a 10 hodin.“ */
  function initCountdown() {
    const el = $('[data-countdown]');

    function update() {
      const now = Date.now();
      if (now >= EVENT_END) {
        el.textContent = 'Učebna je od 7. 11. 2026 otevřená.';
        return;
      }
      if (now >= EVENT_START) {
        el.textContent = 'Právě teď probíhá – přijďte!';
        return;
      }
      const minutesLeft = Math.floor((EVENT_START - now) / 60000);
      const days = Math.floor(minutesLeft / 1440);
      const hours = Math.floor((minutesLeft % 1440) / 60);
      const minutes = minutesLeft % 60;

      el.textContent = days > 0
        ? `Začínáme za ${days} ${plural(days, ['den', 'dny', 'dní'])} a ${hours} ${plural(hours, ['hodinu', 'hodiny', 'hodin'])}.`
        : `Začínáme za ${hours} h ${minutes} min.`;
    }

    update();
    setInterval(update, 30000);
  }

  /** Při scrollu se úvod „přišpendlí“ a obě poloviny brány se rozjedou. */
  function initGate() {
    const hero = $('.hero');
    const caption = $('.hero__caption');
    if (!hasGsap || reduceMotion) return;

    gsap.set(caption, { autoAlpha: 0 });

    gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=120%',
        scrub: 0.5,
        pin: true,
        onUpdate: (self) => window.Ucebna?.setHeroProgress(self.progress),
      },
    })
      .to('.gate--top', { yPercent: -101, ease: 'power1.in', duration: 0.7 }, 0)
      .to('.gate--bottom', { yPercent: 101, ease: 'power1.in', duration: 0.7 }, 0)
      .to(caption, { autoAlpha: 1, duration: 0.15 }, 0.6)
      .to({}, { duration: 0.15 }); // chvilka klidu před další sekcí
  }


  /* ========================================================================
     4. HARMONOGRAM – v den akce označí, co právě probíhá
     ======================================================================== */
  function initLiveSlots() {
    const update = () => {
      const now = Date.now();
      $$('[data-live-start]').forEach((slot) => {
        const start = Date.parse(slot.dataset.liveStart);
        const end = Date.parse(slot.dataset.liveEnd);
        slot.classList.toggle('is-live', now >= start && now < end);
      });
    };
    update();
    setInterval(update, 30000);
  }


  /* ========================================================================
     5. UČEBNA – seznam vybavení a tlačítka ovládají 3D model (classroom.js)
     ======================================================================== */
  function initClassroom() {
    const rows = $$('.gear');
    const viewButtons = $$('[data-view]');
    const rgbButton = $('[data-rgb]');

    // Kam se má kamera podívat, když kliknete na položku (ostatní = herní stanice)
    const VIEW_FOR_GEAR = { mic: 'pult', arm: 'pult', speaker: 'projekce' };

    const highlight = (row) => {
      rows.forEach((r) => r.classList.toggle('is-active', r === row));
      window.Ucebna?.highlight(row ? row.dataset.gear : null);
    };

    rows.forEach((row) => {
      const button = $('.gear__btn', row);
      row.addEventListener('mouseenter', () => highlight(row));
      row.addEventListener('mouseleave', () => highlight(null));
      button.addEventListener('focus', () => highlight(row));
      button.addEventListener('blur', () => highlight(null));
      button.addEventListener('click', () => {
        highlight(row);
        window.Ucebna?.setView(VIEW_FOR_GEAR[row.dataset.gear] || 'stanice');
        // Na mobilu je seznam pod modelem – posuneme stránku zpátky k modelu
        if (isMobileLayout()) $('[data-stage]').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });

    viewButtons.forEach((button) => {
      button.addEventListener('click', () => window.Ucebna?.setView(button.dataset.view));
    });

    // Model hlásí změnu pohledu (i po kliknutí na štítek ve 3D)
    document.addEventListener('ucebna:view', (event) => {
      viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === event.detail)));
    });

    rgbButton.addEventListener('click', () => {
      const on = rgbButton.getAttribute('aria-pressed') !== 'true';
      rgbButton.setAttribute('aria-pressed', String(on));
      window.Ucebna?.setRgb(on);
    });
  }


  /* ========================================================================
     6. KALENDÁŘ A OHŇOSTROJ
     ======================================================================== */

  /** Stáhne událost ve formátu .ics (Google Kalendář, Outlook, Apple…). */
  function downloadCalendar() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SOS IS Kolin//Otevreni e-sportove ucebny//CS',
      'BEGIN:VEVENT',
      'UID:otevreni-esport-ucebny-2026@sos-is-kolin',
      `DTSTAMP:${stamp}`,
      'DTSTART:20261107T070000Z', // 8:00 středoevropského času
      'DTEND:20261107T190000Z',   // 20:00
      'SUMMARY:Otevření e-sportové učebny',
      'LOCATION:SOŠ informatiky a spojů\\, Jaselská 826\\, 280 02 Kolín',
      'DESCRIPTION:Celodenní program pro veřejnost od 8:00 do 20:00.',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'otevreni-esport-ucebny.ics' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Krátký ohňostroj na plátně přes celou obrazovku. */
  function launchFireworks() {
    if ($('.fireworks')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'fireworks';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = ['#e0401c', '#ffd23f', '#ffffff', '#3d7bff'];
    const rockets = [];
    const sparks = [];
    const total = reduceMotion ? 2 : 8;
    let launched = 0;
    let lastLaunch = 0;

    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const burst = (x, y) => {
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 80; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
      }
    };

    const loop = (time) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);

      if (launched < total && time - lastLaunch > 300) {
        rockets.push({ x: innerWidth * (0.15 + Math.random() * 0.7), y: innerHeight, vy: -(10 + Math.random() * 4), targetY: innerHeight * (0.15 + Math.random() * 0.3) });
        launched += 1;
        lastLaunch = time;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy;
        r.vy *= 0.985;
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(r.x - 1, r.y, 2, 10);
        if (r.y <= r.targetY) { burst(r.x, r.y); rockets.splice(i, 1); }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + 0.06; // gravitace
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.013;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, 3, 3);
      }
      ctx.globalAlpha = 1;

      if (launched >= total && !rockets.length && !sparks.length) canvas.remove();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }


  /* ========================================================================
     7. SPUŠTĚNÍ
     ======================================================================== */
  initMenu();
  initActiveLink();
  initCountdown();
  initLiveSlots();
  initClassroom();

  $$('[data-ics]').forEach((button) => button.addEventListener('click', downloadCalendar));
  $$('[data-fireworks]').forEach((button) => button.addEventListener('click', launchFireworks));

  // Obří texty a brána potřebují znát rozměry písma → až po načtení fontů
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => {
    fitText();
    initGate();
    if (hasGsap) ScrollTrigger.refresh();
  });

  // Při změně šířky okna přepočítáme obří texty (změnu výšky na mobilu ignorujeme)
  let lastWidth = window.innerWidth;
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitText();
      if (hasGsap) ScrollTrigger.refresh();
    }, 200);
  });
})();
