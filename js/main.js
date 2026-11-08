/* ==========================================================================
   main.js – interakce a animace webu „Otevření e-sportové učebny“
   --------------------------------------------------------------------------
   Používá knihovny GSAP + ScrollTrigger (animace) a Lenis (plynulý scroll).
   Když se knihovny nenačtou, web zůstane plně čitelný – jen bez animací.

   Obsah:
     1.  Nastavení a pomocné funkce
     2.  Pixelové ikony a „sprity“ postav
     3.  Preloader a úvodní animace
     4.  Plynulý scroll a odkazy na sekce
     5.  Hlavička: XP lišta, aktivní sekce, mobilní menu
     6.  Úvod: brána a odpočet
     7.  Animace při scrollu
     8.  Harmonogram
     9.  Výběr hrdiny
     10. Učebna (propojení s 3D scénou)
     11. Drobnosti: kurzor, magnetická tlačítka, scramble, kalendář, ohňostroj
     12. Spuštění
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
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobileLayout = () => matchMedia('(max-width: 899px)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  // Čas konání akce (středoevropský čas, UTC+1)
  const EVENT_START = new Date('2026-11-07T08:00:00+01:00');
  const EVENT_END = new Date('2026-11-07T20:00:00+01:00');

  const pad2 = (n) => String(n).padStart(2, '0');

  let lenis = null;          // instance plynulého scrollu
  let closeMenu = () => {};  // nastaví se v initMenu()

  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  // Po obnovení stránky začínáme vždy nahoře (kvůli úvodní animaci)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';


  /* ========================================================================
     2. PIXELOVÉ IKONY A SPRITY POSTAV
     ------------------------------------------------------------------------
     Ikony jsou nakreslené jako textové mapy: každý znak = jeden pixel.
       #  = barva textu    +  = limetková    *  = bílá    o  = červená
     ======================================================================== */
  const PIXEL_ICONS = {
    beer: [
      '............',
      '..***.**....',
      '.********...',
      '.########...',
      '.#++++++####',
      '.#++++++#..#',
      '.#++++++#..#',
      '.#++++++####',
      '.#++++++#...',
      '.#++++++#...',
      '.########...',
      '............',
    ],
    hotdog: [
      '............',
      '............',
      '............',
      '...######...',
      '.##########.',
      'oooooooooooo',
      'o+oo+oo+oo+o',
      'oooooooooooo',
      '.##########.',
      '..########..',
      '............',
      '............',
    ],
    mic: [
      '....####....',
      '...#+#+##...',
      '...##+#+#...',
      '...#+#+##...',
      '...##+#+#...',
      '....####....',
      '.#...##...#.',
      '.#...##...#.',
      '..#..##..#..',
      '...######...',
      '.....##.....',
      '...######...',
    ],
    firework: [
      '.....+.....',
      '.+...+...+.',
      '..+..+..+..',
      '...+.#.+...',
      '....###....',
      '++++#*#++++',
      '....###....',
      '...+.#.+...',
      '..+..+..+..',
      '.+...+...+.',
      '.....+.....',
    ],
  };

  const PIXEL_CLASSES = { '#': 'px-a', '+': 'px-b', '*': 'px-c', o: 'px-d' };

  /** Vykreslí všechny prvky s atributem data-pixel jako SVG z textové mapy. */
  function renderPixelIcons() {
    $$('[data-pixel]').forEach((el) => {
      const map = PIXEL_ICONS[el.dataset.pixel];
      if (!map) return;

      let rects = '';
      map.forEach((row, y) => {
        [...row].forEach((char, x) => {
          if (PIXEL_CLASSES[char]) {
            rects += `<rect class="${PIXEL_CLASSES[char]}" x="${x}" y="${y}" width="1.02" height="1.02"/>`;
          }
        });
      });
      el.innerHTML = `<svg viewBox="0 0 ${map[0].length} ${map.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
    });
  }

  /** Jednoduchý generátor pseudonáhodných čísel – stejné „semínko“ = stejný výsledek. */
  function seededRandom(text) {
    let seed = 0;
    for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 2654435761);
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Nakreslí do plátna 11×11 px symetrickou „herní postavičku“.
   * Tvar se odvozuje od jména, takže každá postava vypadá jinak, ale pořád stejně.
   */
  function drawSprite(canvas, seed, hue) {
    const N = 11;
    const half = Math.ceil(N / 2);
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(seed);
    const body = `hsl(${hue} 92% 60%)`;
    const accent = `hsl(${(hue + 40) % 360} 95% 74%)`;

    canvas.width = canvas.height = N;
    ctx.clearRect(0, 0, N, N);

    // Náhodné pixely v levé polovině, zrcadlené doprava
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < half; x++) {
        const chance = 0.25 + (x / half) * 0.5; // ke středu hustší
        if (rand() > chance) continue;
        ctx.fillStyle = rand() < 0.2 ? accent : body;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(N - 1 - x, y, 1, 1);
      }
    }

    // Hlava – vždy plná, aby měly oči na čem být
    ctx.fillStyle = body;
    ctx.fillRect(2, 3, N - 4, 3);

    // Oči
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 4, 2, 1);
    ctx.fillRect(N - 5, 4, 2, 1);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(4, 4, 1, 1);
    ctx.fillRect(N - 5, 4, 1, 1);
  }


  /* ========================================================================
     3. PRELOADER A ÚVODNÍ ANIMACE
     ======================================================================== */

  /**
   * Načítací obrazovka. Procenta ukazují skutečný postup načítání 3D scény
   * (window.Ucebna.progress), ale zobrazí se minimálně ~1,4 s a maximálně 7 s.
   */
  function runLoader() {
    const loader = $('.loader');
    if (!loader) return Promise.resolve();

    const countEl = $('[data-loader-count]', loader);
    const barEl = $('[data-loader-bar]', loader);
    const labelEl = $('[data-loader-label]', loader);
    const labels = ['Načítání učebny…', 'Zapojování 117 periferií…', 'Ladění RGB podsvícení…', 'Otevírání brány…'];
    const MIN_TIME = reduceMotion ? 200 : 1400;
    const MAX_TIME = 7000;
    const start = performance.now();
    let last = start;
    let shown = 0;

    return new Promise((resolve) => {
      function tick(now) {
        const elapsed = now - start;
        const dt = (now - last) / 1000;
        last = now;
        const scene = window.Ucebna || {};
        const sceneDone = scene.status === 'ready' || scene.status === 'error';
        const sceneProgress = sceneDone ? 1 : scene.progress || 0;

        // Cíl = menší z „uplynulého času“ a „skutečného postupu“ (po limitu vždy 100 %)
        const goal = elapsed > MAX_TIME ? 1 : Math.min(elapsed / MIN_TIME, sceneProgress);
        // plynulé dotahování nezávislé na počtu snímků za sekundu
        shown += (goal - shown) * (1 - Math.exp(-dt * 7));
        if (goal === 1 && shown > 0.995) shown = 1;

        countEl.textContent = String(Math.round(shown * 100)).padStart(3, '0');
        barEl.style.transform = `scaleX(${shown})`;
        labelEl.textContent = labels[Math.min(labels.length - 1, Math.floor(shown * labels.length))];

        if (shown >= 1) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /** Výška štěrbiny brány v pixelech (na mobilu menší). */
  const slitSize = () => Math.round(window.innerHeight * (isMobileLayout() ? 0.13 : 0.16));

  /** Úvodní animace po skončení preloaderu: loader odjede, brána se pootevře. */
  function playIntro() {
    const loader = $('.loader');
    const hero = $('.hero');

    const finish = () => {
      root.classList.remove('is-loading');
      lenis?.start();
      loader?.remove();
      // Pokud adresa obsahuje #sekci, dojedeme na ni
      if (location.hash.length > 1) scrollToTarget(location.hash, true);
    };

    if (!hasGsap || reduceMotion) {
      hero.style.setProperty('--slit', `${slitSize()}px`);
      finish();
      return;
    }

    gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish })
      .to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut' })
      .fromTo(hero, { '--slit': '0px' }, { '--slit': `${slitSize()}px`, duration: 1.6, ease: 'expo.inOut' }, '-=0.55')
      .from('.gate__word--top > span', { yPercent: 105, duration: 1.4 }, '<0.15')
      .from('.gate__word--bottom > span', { yPercent: -105, duration: 1.4 }, '<')
      .from('.header > *', { y: -24, autoAlpha: 0, duration: 0.9, stagger: 0.07 }, '<0.3')
      .from('[data-intro]', { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.06 }, '<0.1');
  }


  /* ========================================================================
     4. PLYNULÝ SCROLL A ODKAZY NA SEKCE
     ======================================================================== */
  function initSmoothScroll() {
    if (reduceMotion || typeof window.Lenis === 'undefined') return;

    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.stop(); // během preloaderu stojí

    if (hasGsap) {
      // Lenis a ScrollTrigger musí běžet ve stejném „taktu“
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /** Posune stránku na prvek podle selektoru (např. "#program"). */
  function scrollToTarget(hash, instant = false) {
    const target = hash === '#uvod' ? 0 : document.querySelector(hash);
    if (target === null) return;

    if (lenis) {
      lenis.scrollTo(target, { duration: instant ? 0 : 1.6, immediate: instant });
    } else {
      const top = target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: instant || reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function initAnchors() {
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const hash = link.getAttribute('href');
        if (hash.length < 2 || !document.querySelector(hash)) return;
        event.preventDefault();
        closeMenu();
        scrollToTarget(hash);
        history.replaceState(null, '', hash === '#uvod' ? location.pathname : hash);
      });
    });
  }


  /* ========================================================================
     5. HLAVIČKA: XP LIŠTA, AKTIVNÍ SEKCE, MOBILNÍ MENU
     ======================================================================== */
  function initHeader() {
    const xpBar = $('[data-xp-bar]');
    const xpLevel = $('[data-xp-level]');
    const links = $$('.header__nav a');
    const sectionIds = ['udalost', 'program', 'hvezdy', 'ucebna', 'partneri', 'kontakt'];

    const setActive = (id, level) => {
      links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`));
      xpLevel.textContent = pad2(level);
    };

    if (!hasGsap) return;

    // XP lišta = jak daleko je uživatel na stránce
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => { xpBar.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
    });

    // Aktivní odkaz v menu + „level“ podle sekce uprostřed obrazovky
    sectionIds.forEach((id, index) => {
      const section = document.getElementById(id);
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => {
          if (self.isActive) setActive(id, index + 1);
          else if (index === 0 && self.direction < 0) setActive(null, 0);
        },
      });
    });
  }

  function initMenu() {
    const button = $('.burger');
    const menu = $('#menu');
    const label = $('.burger__text', button);

    const setOpen = (open) => {
      root.classList.toggle('is-menu-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
      label.textContent = open ? 'Zavřít' : 'Menu';
      menu.inert = !open;
      menu.setAttribute('aria-hidden', String(!open));
      if (open) lenis?.stop(); else lenis?.start();
    };

    closeMenu = () => { if (root.classList.contains('is-menu-open')) setOpen(false); };

    button.addEventListener('click', () => setOpen(!root.classList.contains('is-menu-open')));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    // Při zvětšení okna na desktop se menu samo zavře
    matchMedia('(min-width: 1025px)').addEventListener('change', (event) => { if (event.matches) closeMenu(); });
  }


  /* ========================================================================
     6. ÚVOD: BRÁNA A ODPOČET
     ======================================================================== */

  /**
   * Přizpůsobí velikost písma prvků [data-fit] tak, aby text přesně vyplnil šířku.
   * data-fit-max = maximální výška písma jako podíl výšky okna (např. 0.23).
   */
  function fitText() {
    $$('[data-fit]').forEach((el) => {
      const inner = el.firstElementChild;
      const style = getComputedStyle(el);
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

      el.style.fontSize = '100px';
      let size = (100 * available) / inner.getBoundingClientRect().width;

      if (el.dataset.fitMax) size = Math.min(size, window.innerHeight * parseFloat(el.dataset.fitMax));
      el.style.fontSize = `${Math.floor(size * 0.995)}px`;
    });
  }

  function initHero() {
    const hero = $('.hero');
    const reveal = $('.hero__reveal');

    if (!hasGsap || reduceMotion) {
      if (reveal) reveal.style.display = 'none';
      return;
    }

    gsap.set(reveal, { autoAlpha: 0, y: 40 });

    // Při scrollu se úvod „přišpendlí“ a křídla brány se rozjedou
    gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=140%',
        scrub: 0.6,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => window.Ucebna?.setHeroProgress(self.progress),
      },
    })
      .to('.gate--top', { yPercent: -102, ease: 'power2.in', duration: 0.6 }, 0)
      .to('.gate--bottom', { yPercent: 102, ease: 'power2.in', duration: 0.6 }, 0)
      .to(reveal, { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.25 }, 0.5)
      .to({}, { duration: 0.15 }); // krátká pauza před další sekcí

    // Při změně velikosti okna přepočítáme štěrbinu (jen když je brána zavřená)
    window.addEventListener('resize', () => {
      if (window.scrollY < 10) hero.style.setProperty('--slit', `${slitSize()}px`);
    });
  }

  /** Odpočet do začátku akce (aktualizace každou sekundu). */
  function initCountdown() {
    const wrap = $('.countdown');
    const label = $('[data-countdown-label]');
    const parts = {
      d: $('[data-cd="d"]'),
      h: $('[data-cd="h"]'),
      m: $('[data-cd="m"]'),
      s: $('[data-cd="s"]'),
    };

    function update() {
      const now = Date.now();

      if (now >= EVENT_END) {
        wrap.classList.add('is-live');
        label.textContent = 'Učebna je otevřená · díky, že jste dorazili';
        return;
      }
      if (now >= EVENT_START) {
        wrap.classList.add('is-live');
        label.textContent = '● Právě probíhá – přijďte!';
        return;
      }

      const diff = Math.floor((EVENT_START - now) / 1000);
      parts.d.textContent = pad2(Math.floor(diff / 86400));
      parts.h.textContent = pad2(Math.floor((diff % 86400) / 3600));
      parts.m.textContent = pad2(Math.floor((diff % 3600) / 60));
      parts.s.textContent = pad2(diff % 60);
    }

    update();
    setInterval(update, 1000);
  }


  /* ========================================================================
     7. ANIMACE PŘI SCROLLU
     ======================================================================== */

  /** Rozdělí text prvku na slova (span.w) – vnořené značky jako <mark> zůstanou. */
  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      // dělíme jen podle běžných mezer – nezlomitelná mezera (&nbsp;) slova drží spolu
      node.textContent.split(/([ \t\n\r]+)/).forEach((part) => {
        if (!part) return;
        if (/^[ \t\n\r]+$/.test(part)) {
          fragment.append(' ');
        } else {
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = part;
          fragment.append(span);
        }
      });
      node.replaceWith(fragment);
    });
    return $$('.w', el);
  }

  function initScrollAnimations() {
    if (!hasGsap || reduceMotion) return;

    // Nadpisy: řádky vyjedou zespodu z masky
    $$('.title').forEach((title) => {
      gsap.from($$('.line > span', title), {
        yPercent: 115,
        rotate: 2,
        duration: 1.3,
        ease: 'expo.out',
        stagger: 0.09,
        scrollTrigger: { trigger: title, start: 'top 85%' },
      });
    });

    // Obecné prvky: plynulé objevení zespodu
    gsap.set('[data-reveal]', { autoAlpha: 0, y: 50 });
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.07,
        overwrite: true,
      }),
    });

    // Úvodní odstavec: slova se postupně „rozsvěcují“ podle scrollu
    $$('[data-words]').forEach((el) => {
      gsap.fromTo(splitWords(el), { opacity: 0.14 }, {
        opacity: 1,
        ease: 'none',
        stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 50%', scrub: true },
      });
    });

    // Čísla se „napočítají“ od nuly
    $$('[data-count]').forEach((el) => {
      const counter = { value: 0 };
      const end = Number(el.dataset.count);
      el.textContent = '0';
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => gsap.to(counter, {
          value: end,
          duration: 1.8,
          ease: 'power3.out',
          onUpdate: () => { el.textContent = Math.round(counter.value); },
        }),
      });
    });

    // Obří text v patičce se při scrollu mírně posouvá (paralaxa)
    gsap.fromTo('.footer__big span', { xPercent: 8 }, {
      xPercent: 0,
      ease: 'none',
      scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  }


  /* ========================================================================
     8. HARMONOGRAM
     ======================================================================== */
  function initSchedule() {
    const pin = $('.schedule__pin');
    const track = $('.timeline');
    const progress = $('[data-tl-progress]');
    const cards = $$('.tl-card', track);

    if (hasGsap && !reduceMotion) {
      const mm = gsap.matchMedia();

      // Počítač: karty jedou vodorovně, zatímco je sekce přišpendlená
      mm.add('(min-width: 900px)', () => {
        const distance = () => Math.max(0, track.scrollWidth - pin.clientWidth);

        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: pin,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => { progress.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
          },
        });

        // Karta uprostřed obrazovky se zvýrazní
        cards.forEach((card) => ScrollTrigger.create({
          trigger: card,
          containerAnimation: tween,
          start: 'left 65%',
          end: 'right 35%',
          toggleClass: 'is-current',
        }));
      });

      // Mobil: svislý seznam, zvýrazní se karta uprostřed
      mm.add('(max-width: 899px)', () => {
        cards.forEach((card) => ScrollTrigger.create({
          trigger: card,
          start: 'top 60%',
          end: 'bottom 40%',
          toggleClass: 'is-current',
        }));
      });
    }

    // Štítek „Právě probíhá“ podle aktuálního času
    const updateLive = () => {
      const now = Date.now();
      $$('[data-live-start]').forEach((card) => {
        const start = Date.parse(card.dataset.liveStart);
        const end = Date.parse(card.dataset.liveEnd);
        card.classList.toggle('is-live', now >= start && now < end);
        card.classList.toggle('is-done', now >= end);
      });
    };
    updateLive();
    setInterval(updateLive, 30000);
  }


  /* ========================================================================
     9. VÝBĚR HRDINY (interpreti)
     Ovládání jako „záložky“: klik, nebo šipky na klávesnici.
     ======================================================================== */
  function initCharacterSelect() {
    const tabs = $$('.char');
    const panel = $('.select__stage');
    if (!tabs.length || !panel) return;

    const sprite = $('.select__sprite', panel);
    const sheet = $('.select__sheet', panel);
    const readyBar = $('.select__ready-bar i', panel);

    // Každé dlaždici nastavíme barvu a nakreslíme postavičku
    tabs.forEach((tab) => {
      tab.style.setProperty('--hue', tab.dataset.hue);
      drawSprite($('canvas', tab), tab.dataset.char, Number(tab.dataset.hue));
    });

    function select(tab, moveFocus = false) {
      tabs.forEach((t) => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
      });

      const template = document.getElementById(`char-${tab.dataset.char}`);
      sheet.replaceChildren(template.content.cloneNode(true));
      panel.style.setProperty('--hue', tab.dataset.hue);
      panel.setAttribute('aria-labelledby', tab.id);
      drawSprite(sprite, tab.dataset.char, Number(tab.dataset.hue));

      if (hasGsap && !reduceMotion) {
        gsap.fromTo(sprite, { scale: 0.7, filter: 'brightness(3)' }, { scale: 1, filter: 'brightness(1)', duration: 0.7, ease: 'expo.out' });
        gsap.from(sheet.children, { y: 16, autoAlpha: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05 });
        gsap.fromTo(readyBar, { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'expo.out' });
      }
      if (moveFocus) tab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));

      tab.addEventListener('keydown', (event) => {
        const columns = getComputedStyle(tab.parentElement).gridTemplateColumns.split(' ').length;
        const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
        let next = null;

        if (event.key in moves) next = tabs[(index + moves[event.key] + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];

        if (next) {
          event.preventDefault();
          select(next, true);
        }
      });
    });

    select(tabs[0]);

    // Sprite na kartě pořadatele v kontaktech
    $$('[data-sprite]').forEach((canvas) => drawSprite(canvas, canvas.dataset.sprite, Number(canvas.dataset.hue)));
  }


  /* ========================================================================
     10. UČEBNA – propojení seznamu vybavení a tlačítek s 3D scénou
     ======================================================================== */
  function initClassroom() {
    const rows = $$('.gear');
    const viewButtons = $$('[data-view]');
    const rgbButton = $('[data-rgb]');
    const stage = $('[data-stage]');

    // Vhodný pohled kamery pro danou položku (ostatní jsou na herních stanicích)
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

      // Kliknutí: zvýraznění + přesun kamery k položce
      button.addEventListener('click', () => {
        highlight(row);
        window.Ucebna?.setView(VIEW_FOR_GEAR[row.dataset.gear] || 'stanice');
        // Na mobilu je seznam pod scénou – vrátíme uživatele nahoru ke scéně
        if (isMobileLayout()) scrollToTarget('[data-stage]');
      });
    });

    viewButtons.forEach((button) => {
      button.addEventListener('click', () => window.Ucebna?.setView(button.dataset.view));
    });

    // Scéna hlásí změnu pohledu (i po kliknutí na hotspot) → přepneme tlačítka
    document.addEventListener('ucebna:view', (event) => {
      viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === event.detail)));
    });

    rgbButton.addEventListener('click', () => {
      const on = rgbButton.getAttribute('aria-pressed') !== 'true';
      rgbButton.setAttribute('aria-pressed', String(on));
      window.Ucebna?.setRgb(on);
    });

    // Na mobilu nemá smysl ukazovat „táhni myší“ v kurzoru
    if (!finePointer) stage.removeAttribute('data-cursor');
  }


  /* ========================================================================
     11. DROBNOSTI
     ======================================================================== */

  /** Vlastní kurzor – kroužek se zpožděním následuje myš. */
  function initCursor() {
    if (!finePointer || reduceMotion) return;

    const cursor = $('.cursor');
    const dot = $('.cursor__dot', cursor);
    const ring = $('.cursor__ring', cursor);
    const label = $('.cursor__label', cursor);
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let ringX = x;
    let ringY = y;

    root.classList.add('has-cursor');

    window.addEventListener('pointermove', (event) => {
      x = event.clientX;
      y = event.clientY;
      cursor.classList.add('is-visible');
    });
    document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));

    // Nad odkazem/tlačítkem se kroužek zvětší, prvky s data-cursor ukážou popisek
    document.addEventListener('pointerover', (event) => {
      const target = event.target.closest('a, button, [data-cursor]');
      const text = target?.closest('[data-cursor]')?.dataset.cursor || '';
      const isInteractive = target && target.matches('a, button');

      cursor.classList.toggle('is-hover', Boolean(isInteractive));
      cursor.classList.toggle('has-label', Boolean(text) && !isInteractive);
      label.textContent = isInteractive ? '' : text;
    });

    // Nad mapou (iframe) kurzor schováme – uvnitř iframe se nehýbe
    $('.map')?.addEventListener('pointerenter', () => cursor.classList.remove('is-visible'));

    const loop = () => {
      ringX += (x - ringX) * 0.18;
      ringY += (y - ringY) * 0.18;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      label.style.transform = ring.style.transform;
      requestAnimationFrame(loop);
    };
    loop();
  }

  /** Magnetická tlačítka – lehce se „přitahují“ ke kurzoru. */
  function initMagnetic() {
    if (!finePointer || reduceMotion || !hasGsap) return;

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        gsap.to(el, { x: dx * 0.25, y: dy * 0.35, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /** Efekt „dešifrování“ textu při najetí na odkaz v navigaci. */
  function initScramble() {
    if (reduceMotion) return;
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+<>/';

    $$('[data-scramble]').forEach((el) => {
      const original = el.textContent;
      let frame = 0;
      let raf = 0;

      const tick = () => {
        el.textContent = [...original]
          .map((char, i) => (i < frame / 2 ? char : CHARS[Math.floor(Math.random() * CHARS.length)]))
          .join('');
        frame += 1;
        if (frame <= original.length * 2) raf = requestAnimationFrame(tick);
        else el.textContent = original;
      };

      el.addEventListener('pointerenter', () => {
        cancelAnimationFrame(raf);
        frame = 0;
        tick();
      });
    });
  }

  /** Stáhne událost ve formátu .ics (Google Kalendář, Outlook, Apple…). */
  function downloadCalendar() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SOS IS Kolin//Otevreni e-sportove ucebny//CS',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:otevreni-esport-ucebny-2026@sos-is-kolin',
      `DTSTAMP:${stamp}`,
      'DTSTART:20261107T070000Z', // 8:00 středoevropského času
      'DTEND:20261107T190000Z',   // 20:00 středoevropského času
      'SUMMARY:Otevření e-sportové učebny',
      'LOCATION:SOŠ informatiky a spojů\\, Jaselská 826\\, 280 02 Kolín',
      'DESCRIPTION:Celodenní program pro veřejnost – slavnostní otevření v 8:00\\, prohlídka učebny\\, zápasy\\, doprovodný program\\, afterparty a ohňostroj ve 20:00.',
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

  /** Ohňostroj na plátně přes celou obrazovku (tlačítko u 20:00 nebo Konami kód). */
  function launchFireworks() {
    if ($('.fireworks')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'fireworks';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const colors = ['#d4ff3d', '#3d7bff', '#ff3b3b', '#ffffff', '#ffb13d'];
    const rockets = [];
    const sparks = [];
    const total = reduceMotion ? 3 : 10;
    let launched = 0;
    let lastLaunch = 0;

    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const burst = (x, y) => {
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 90; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 5;
        sparks.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 1.2 + Math.random() * 2,
          color: Math.random() < 0.2 ? '#ffffff' : color,
        });
      }
    };

    const loop = (time) => {
      // Průhledné „mazání“ vytváří stopy za jiskrami
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = 'lighter';

      if (launched < total && time - lastLaunch > 260) {
        rockets.push({
          x: innerWidth * (0.15 + Math.random() * 0.7),
          y: innerHeight,
          vy: -(10 + Math.random() * 4),
          targetY: innerHeight * (0.12 + Math.random() * 0.3),
        });
        launched += 1;
        lastLaunch = time;
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy;
        r.vy *= 0.985;
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(r.x - 1, r.y, 2, 10);
        if (r.y <= r.targetY) {
          burst(r.x, r.y);
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + 0.06; // gravitace
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.012;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (launched >= total && !rockets.length && !sparks.length) canvas.remove();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Tajný Konami kód ↑↑↓↓←→←→BA = ohňostroj + RGB mód v učebně. */
  function initKonami() {
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let position = 0;

    document.addEventListener('keydown', (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      position = key === code[position] ? position + 1 : key === code[0] ? 1 : 0;
      if (position === code.length) {
        position = 0;
        launchFireworks();
        window.Ucebna?.setRgb(true);
        $('[data-rgb]')?.setAttribute('aria-pressed', 'true');
      }
    });
  }


  /* ========================================================================
     12. SPUŠTĚNÍ
     ======================================================================== */
  root.classList.add('is-loading');
  window.scrollTo(0, 0);

  renderPixelIcons();
  initSmoothScroll();
  initMenu();
  initAnchors();
  initCountdown();
  initCharacterSelect();
  initClassroom();
  initCursor();
  initMagnetic();
  initScramble();
  initKonami();

  $$('[data-ics]').forEach((button) => button.addEventListener('click', downloadCalendar));
  $$('[data-fireworks]').forEach((button) => button.addEventListener('click', launchFireworks));
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // Animace závislé na rozměrech spustíme až s načtenými písmy.
  // Pořadí je důležité: ScrollTriggery s „pinem“ musí vzniknout jako první.
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

  fontsReady.then(() => {
    fitText();
    initHero();
    initSchedule();
    initHeader();
    initScrollAnimations();
    if (hasGsap) ScrollTrigger.refresh();
  });

  Promise.all([fontsReady, runLoader()]).then(playIntro);

  // Po změně šířky okna přepočítáme obří texty. Samotnou změnu výšky ignorujeme –
  // na mobilu ji způsobuje schovávání adresního řádku při scrollu.
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
