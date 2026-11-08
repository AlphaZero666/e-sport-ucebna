/* ==========================================================================
   classroom.js – 3D vizualizace nové e-sportové učebny
   --------------------------------------------------------------------------
   Knihovna Three.js se načítá dynamicky z CDN (adresy jsou v „import map“
   v index.html), takže stránka nečeká, až se stáhne.

   Scéna je „diorama“: podlahová deska, dvě stěny, 16 herních stanic ve dvou
   ostrovech (tým modrý / tým červený), komentátorský pult a velká projekce.
   Plátno leží za celou stránkou (position: fixed) a prosvítá na dvou místech:
     • v úvodu – kamera při scrollu vyletí z pohledu „ve dveřích“ nad učebnu,
     • v sekci Učebna – scénu jde otáčet tažením a přepínat pohledy.

   Veřejné rozhraní pro main.js (window.Ucebna):
     .status / .progress      – stav načítání ('loading' | 'ready' | 'error')
     .setHeroProgress(0–1)    – postup scrollu v úvodu
     .highlight('mouse')      – zvýrazní kategorii vybavení (null = nic)
     .setView('pult')         – přesune kameru na předdefinovaný pohled
     .setRgb(true)            – zapne duhové RGB podsvícení
   Událost 'ucebna:view' oznamuje změnu pohledu (kvůli tlačítkům v HUD).
   ========================================================================== */
(() => {
  'use strict';

  /* ========================================================================
     1. NASTAVENÍ
     ======================================================================== */
  const canvas = document.querySelector('.scene__canvas');
  const sceneWrap = document.querySelector('.scene');
  const heroEl = document.querySelector('.hero');
  const stageEl = document.querySelector('[data-stage]');
  const tooltipEl = document.querySelector('[data-stage-tooltip]');
  const hotspotEls = [...document.querySelectorAll('[data-hotspot]')];

  // Slabší zařízení (mobily, tablety) dostanou scénu bez stínů a bez záře
  const lowPower = matchMedia('(max-width: 899px), (pointer: coarse)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const COLORS = { bg: 0x08080a, acid: 0xd4ff3d, blue: 0x3d7bff, red: 0xff3b3b, white: 0xdfe6ff };
  const EVENT_START = new Date('2026-11-07T08:00:00+01:00').getTime();

  // Rozměry v metrech
  const ROOM = { w: 14, d: 9, h: 3.4 };
  const DESK = { w: 1.4, d: 0.72, h: 0.75 };
  const ISLANDS = [
    { team: 'blue', x: -0.9, z: -1.55 },
    { team: 'red', x: -0.9, z: 2.05 },
  ];
  const CASTER = { x: 4.7, z: -3.1, rotation: 1.87 };

  // Pohledy kamery – sférické souřadnice kolem bodu „target“
  // theta = otočení kolem učebny, phi = výška nad podlahou, radius = vzdálenost
  const VIEWS = {
    celek:    { target: [-1.2, 0.3, -0.4],  theta: 0.62, phi: 0.6,  radius: 21 },
    stanice:  { target: [-0.175, 1.0, 2.35], theta: 0.35, phi: 0.32, radius: 3.2 },
    pult:     { target: [4.6, 1.0, -3.0],    theta: 1.45, phi: 0.36, radius: 3.6 },
    projekce: { target: [0, 1.9, -4.1],      theta: 0.1,  phi: 0.12, radius: 7 },
    shora:    { target: [0, 0, 0.2],         theta: 0,    phi: 1.42, radius: 19 },
    brana:    { target: [-6.4, 1.2, 2.7],    theta: 1.35, phi: 0.25, radius: 5 },
  };
  const LIMITS = { theta: [-0.45, 1.8], phi: [0.06, 1.45] };

  // Body zájmu (HTML štítky nad scénou) – názvy odpovídají pohledům
  const HOTSPOTS = {
    stanice: [-0.9, 1.75, 2.05],
    pult: [4.7, 1.75, -3.1],
    projekce: [0, 3.55, -4.4],
    brana: [-6.95, 2.55, 2.7],
  };

  // Úvodní průlet kamery: z pohledu „ve dveřích“ nad učebnu
  const HERO_FROM = { pos: [0.6, 1.3, 11.5], look: [-0.4, 1.15, -3] };
  const HERO_TO = { pos: [10.5, 7.8, 12.5], look: [-0.3, 0.25, 0.3] };

  const state = {
    status: 'loading',
    progress: 0,
    heroProgress: 0,
    highlight: null,
    rgb: false,
    view: 'celek',
  };

  let THREE = null; // modul Three.js (doplní se po načtení)
  let app = null;   // objekt s funkcemi scény (vznikne v createApp)

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad2 = (n) => String(n).padStart(2, '0');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /** Pseudonáhodná čísla se „semínkem“ – scéna vypadá při každém načtení stejně. */
  function seededRandom(text) {
    let seed = 0;
    for (const char of String(text)) seed = Math.imul(seed ^ char.charCodeAt(0), 2654435761);
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Veřejné rozhraní – funguje i před načtením Three.js (hodnoty se jen uloží)
  window.Ucebna = {
    get status() { return state.status; },
    get progress() { return state.progress; },
    setHeroProgress(progress) { state.heroProgress = progress; },
    highlight(category) {
      state.highlight = category || null;
      app?.applyHighlight();
    },
    setView(name) {
      if (!VIEWS[name]) return;
      state.view = name;
      app?.goToView(name);
      emit('ucebna:view', name);
    },
    setRgb(on) { state.rgb = Boolean(on); },
  };


  /* ========================================================================
     2. NAČTENÍ KNIHOVNY A SPUŠTĚNÍ
     ======================================================================== */
  if (!canvas || !stageEl || !supportsWebGL()) {
    fail();
  } else {
    init().catch((error) => {
      console.warn('[Učebna] 3D scénu se nepodařilo spustit:', error);
      fail();
    });
  }

  function supportsWebGL() {
    try {
      const test = document.createElement('canvas');
      return Boolean(test.getContext('webgl2') || test.getContext('webgl'));
    } catch {
      return false;
    }
  }

  /** Bez WebGL zobrazí CSS záložní půdorys (třída .no-webgl). */
  function fail() {
    state.status = 'error';
    document.documentElement.classList.add('no-webgl');
  }

  async function init() {
    state.progress = 0.1;
    THREE = await import('three');
    state.progress = 0.5;

    const [rounded, environment, merge, post] = await Promise.all([
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
      // Záře (bloom) jen na výkonnějších zařízeních
      lowPower ? null : Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js'),
      ]),
    ]);
    state.progress = 0.75;

    // Texty na obrazovkách ve scéně používají webová písma – chvilku na ně počkáme
    await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(1500)]);

    app = createApp({
      RoundedBoxGeometry: rounded.RoundedBoxGeometry,
      RoomEnvironment: environment.RoomEnvironment,
      mergeGeometries: merge.mergeGeometries,
      post,
    });
    app.start();

    state.progress = 1;
    state.status = 'ready';
    document.documentElement.classList.add('is-scene-ready');
  }


  /* ========================================================================
     3. SCÉNA
     ======================================================================== */
  function createApp({ RoundedBoxGeometry, RoomEnvironment, mergeGeometries, post }) {

    /* --- Renderer, scéna, kamera ----------------------------------------- */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: lowPower, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75));
    renderer.setClearColor(COLORS.bg, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // scéna je statická → stíny stačí spočítat jednou

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COLORS.bg, 20, 45);

    // Jemné odlesky z virtuální místnosti (kov a lesklé plasty pak nejsou ploché)
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);

    // Post-processing: záře svítících prvků (RGB lišty, obrazovky)
    let composer = null;
    if (post) {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = post;
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, target);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.85));
      composer.addPass(new OutputPass());
    }


    /* --- Textury kreslené na plátno -------------------------------------- */
    function canvasTexture(width, height, draw) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      draw(c.getContext('2d'), width, height);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    }

    /** Podlaha – tmavé dlaždice 1 × 1 m s jemným šumem. */
    function makeFloorTexture() {
      const texture = canvasTexture(512, 512, (g, w, h) => {
        g.fillStyle = '#1b1b21';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6000; i++) {
          g.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.025})`;
          g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
        }
        // spáry (textura = 2 × 2 dlaždice)
        g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        g.lineWidth = 4;
        [0, w / 2].forEach((p) => {
          g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
          g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
        });
      });
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(ROOM.w / 2, ROOM.d / 2);
      texture.anisotropy = 8;
      return texture;
    }

    /** Obrazovka hráče – stylizovaný pohled na herní mapu s HUD. */
    function makeGameScreen(team, variant) {
      return canvasTexture(512, 288, (g, W, H) => {
        const rand = seededRandom(team + variant);
        const own = team === 'blue' ? '#3d7bff' : '#ff3b3b';
        const enemy = team === 'blue' ? '#ff3b3b' : '#3d7bff';

        // terén
        g.fillStyle = '#0c1813';
        g.fillRect(0, 0, W, H);
        for (let i = 0; i < 26; i++) {
          g.fillStyle = `hsla(${140 + rand() * 40}, 35%, ${7 + rand() * 10}%, 0.9)`;
          g.beginPath();
          g.ellipse(rand() * W, rand() * H, 20 + rand() * 60, 12 + rand() * 40, rand() * Math.PI, 0, Math.PI * 2);
          g.fill();
        }
        // řeka a cesta
        g.strokeStyle = 'rgba(40, 110, 170, 0.55)';
        g.lineWidth = 22;
        g.beginPath();
        g.moveTo(-10, H * 0.15);
        g.bezierCurveTo(W * 0.35, H * 0.35, W * 0.6, H * 0.65, W + 10, H * 0.85);
        g.stroke();
        g.strokeStyle = 'rgba(190, 170, 120, 0.35)';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(40, H - 20);
        g.lineTo(W - 40, 20);
        g.stroke();
        // jednotky obou týmů
        for (let i = 0; i < 16; i++) {
          g.fillStyle = i % 2 ? own : enemy;
          g.beginPath();
          g.arc(W * 0.28 + rand() * W * 0.44, H * 0.22 + rand() * H * 0.5, 3 + rand() * 3, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = own;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(W / 2, H / 2, 12, 0, Math.PI * 2);
        g.stroke();
        // HUD: schopnosti, zdraví, mana
        g.fillStyle = 'rgba(5, 5, 8, 0.88)';
        g.fillRect(W * 0.27, H - 48, W * 0.46, 42);
        for (let i = 0; i < 4; i++) {
          g.fillStyle = i === variant + 1 ? '#d4ff3d' : '#2a2a35';
          g.fillRect(W * 0.29 + i * 34, H - 42, 28, 28);
        }
        g.fillStyle = '#3ddc84';
        g.fillRect(W * 0.29 + 142, H - 40, 60 + rand() * 30, 8);
        g.fillStyle = '#3d9bff';
        g.fillRect(W * 0.29 + 142, H - 26, 40 + rand() * 40, 6);
        // minimapa
        g.fillStyle = 'rgba(5, 5, 8, 0.88)';
        g.fillRect(W - 86, H - 86, 78, 78);
        g.strokeStyle = own;
        g.lineWidth = 2;
        g.strokeRect(W - 86, H - 86, 78, 78);
        // skóre
        g.fillStyle = 'rgba(5, 5, 8, 0.88)';
        g.fillRect(W / 2 - 60, 0, 120, 26);
        g.font = '700 16px "JetBrains Mono", monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#3d7bff';
        g.fillText(String(Math.floor(rand() * 12)), W / 2 - 30, 13);
        g.fillStyle = '#ffffff';
        g.fillText(':', W / 2, 13);
        g.fillStyle = '#ff3b3b';
        g.fillText(String(Math.floor(rand() * 12)), W / 2 + 30, 13);
      });
    }

    /** Obrazovka komentátorů – živé vysílání. */
    function makeCasterScreen() {
      return canvasTexture(512, 288, (g, W, H) => {
        g.fillStyle = '#0b0b12';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#ff3b3b';
        g.fillRect(24, 24, 96, 34);
        g.font = '700 20px "JetBrains Mono", monospace';
        g.textBaseline = 'middle';
        g.fillStyle = '#ffffff';
        g.fillText('● LIVE', 34, 42);
        g.fillStyle = '#d4ff3d';
        g.font = '900 46px Archivo, sans-serif';
        g.fillText('KOMENTÁŘ', 24, 110);
        // zvuková vlna
        const rand = seededRandom('caster');
        for (let i = 0; i < 40; i++) {
          const barH = 10 + rand() * 80;
          g.fillStyle = i % 5 ? 'rgba(212, 255, 61, 0.7)' : '#ffffff';
          g.fillRect(24 + i * 11.5, 220 - barH / 2, 6, barH);
        }
      });
    }

    /** Velká projekce – na plátně běží živý odpočet do otevření. */
    function createBigScreen() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 576;
      const g = c.getContext('2d');
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;

      function draw() {
        const W = c.width;
        const H = c.height;
        const gradient = g.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#0a1440');
        gradient.addColorStop(0.55, '#0a0a12');
        gradient.addColorStop(1, '#3a0a14');
        g.fillStyle = gradient;
        g.fillRect(0, 0, W, H);

        g.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        g.lineWidth = 1;
        for (let x = 0; x <= W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let y = 0; y <= H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

        g.textBaseline = 'alphabetic';
        g.textAlign = 'left';
        g.fillStyle = '#d4ff3d';
        g.font = '700 24px "JetBrains Mono", monospace';
        g.fillText('SOŠ IS KOLÍN · E-SPORTOVÁ UČEBNA', 56, 78);
        g.textAlign = 'right';
        g.fillStyle = 'rgba(255, 255, 255, 0.6)';
        g.fillText('● LIVE', W - 56, 78);

        g.textAlign = 'left';
        g.fillStyle = '#ffffff';
        g.font = '900 116px Archivo, sans-serif';
        g.fillText('BRÁNY SE', 50, 228);
        g.fillText('OTEVÍRAJÍ', 50, 336);

        const diff = Math.max(0, Math.floor((EVENT_START - Date.now()) / 1000));
        const countdown = diff > 0
          ? [Math.floor(diff / 86400), Math.floor((diff % 86400) / 3600), Math.floor((diff % 3600) / 60), diff % 60].map(pad2).join(':')
          : 'PRÁVĚ TEĎ!';
        g.fillStyle = '#d4ff3d';
        g.font = '500 56px "JetBrains Mono", monospace';
        g.fillText(countdown, 54, 436);
        g.fillStyle = 'rgba(255, 255, 255, 0.55)';
        g.font = '500 20px "JetBrains Mono", monospace';
        g.fillText('DO OTEVŘENÍ · 07.11.2026 · 08:00', 58, 474);

        // spodní lišta: tým modrý vs. tým červený
        g.fillStyle = '#3d7bff';
        g.fillRect(0, H - 58, W / 2, 58);
        g.fillStyle = '#ff3b3b';
        g.fillRect(W / 2, H - 58, W / 2, 58);
        g.fillStyle = '#08080a';
        g.fillRect(W / 2 - 72, H - 58, 144, 58);
        g.fillStyle = '#ffffff';
        g.font = '800 26px Archivo, sans-serif';
        g.fillText('TÝM MODRÝ', 56, H - 20);
        g.textAlign = 'right';
        g.fillText('TÝM ČERVENÝ', W - 56, H - 20);
        g.textAlign = 'center';
        g.fillText('0 : 0', W / 2, H - 20);

        texture.needsUpdate = true;
      }

      draw();
      return { texture, draw };
    }

    /** Neonový nápis na stěnu. */
    function makeSignTexture() {
      return canvasTexture(1024, 360, (g, W) => {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#d4ff3d';
        g.shadowBlur = 36;
        g.fillStyle = '#f1ffc4';
        g.font = 'italic 900 176px Archivo, sans-serif';
        g.fillText('E-SPORT', W / 2, 150);
        g.shadowBlur = 16;
        g.fillStyle = '#d4ff3d';
        g.font = '700 44px "JetBrains Mono", monospace';
        g.fillText('SOŠ IS KOLÍN · 2026', W / 2, 296);
      });
    }

    /** Cedule „ON AIR“ nad komentátorským pultem. */
    function makeOnAirTexture() {
      return canvasTexture(320, 112, (g, W, H) => {
        g.fillStyle = '#1a0505';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = '#ff3b3b';
        g.lineWidth = 6;
        g.strokeRect(6, 6, W - 12, H - 12);
        g.shadowColor = '#ff3b3b';
        g.shadowBlur = 20;
        g.fillStyle = '#ffd6d6';
        g.font = '900 60px Archivo, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ON AIR', W / 2, H / 2 + 3);
      });
    }

    /** Měkký kužel světla ze dveří na podlahu. */
    function makeSpillTexture() {
      return canvasTexture(256, 128, (g, W, H) => {
        const gradient = g.createRadialGradient(0, H / 2, 0, 0, H / 2, W);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = gradient;
        g.fillRect(0, 0, W, H);
      });
    }


    /* --- Materiály ------------------------------------------------------- */
    const std = (color, roughness, metalness = 0, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.35, ...extra });

    // Svítící materiál – barva nad 1.0 „přetéká“ do záře (bloom)
    const glow = (color, intensity) => {
      const material = new THREE.MeshBasicMaterial({ color });
      material.color.multiplyScalar(intensity);
      material.userData.baseColor = material.color.clone();
      material.userData.intensity = intensity;
      return material;
    };

    const screenMaterial = (texture, brightness = 1.35) => {
      const material = new THREE.MeshBasicMaterial({ map: texture });
      material.color.setScalar(brightness);
      return material;
    };

    const bigScreen = createBigScreen();

    const M = {
      floor: std(0xffffff, 0.55, 0.1, { map: makeFloorTexture() }),
      slab: std(0x0d0d11, 0.8, 0.1),
      wall: std(0x15151a, 0.92),
      felt: std(0x1c1c24, 1),
      desk: std(0x1b1b22, 0.42, 0.3),
      deskFrame: std(0x0b0b0e, 0.35, 0.75),
      metal: std(0x16161b, 0.4, 0.7),
      pad: std(0x0a0a0d, 0.95),
      keyboard: std(0x15151a, 0.55, 0.2),
      mouse: std(0x1a1a20, 0.38, 0.2),
      bungee: std(0x26262d, 0.45, 0.5),
      headset: std(0x1a1a20, 0.5, 0.2),
      controller: std(0x1d1d24, 0.5, 0.1),
      webcam: std(0x101014, 0.35, 0.4),
      monitor: std(0x0f0f12, 0.45, 0.45),
      chair: std(0x131316, 0.72, 0.05),
      chairAccent: std(0xc8102e, 0.55, 0.05),
      chairBase: std(0x0c0c0f, 0.3, 0.8),
      pc: std(0x0c0c10, 0.3, 0.6),
      mic: std(0x2b2b33, 0.3, 0.85),
      arm: std(0x18181d, 0.4, 0.65),
      speaker: std(0x0e0e11, 0.5, 0.3),
      console: std(0x121217, 0.6, 0.2),
      plant: std(0x2d7a45, 0.8, 0, { flatShading: true }),
      pot: std(0xe8e6de, 0.6),

      blue: glow(COLORS.blue, 2.4),
      red: glow(COLORS.red, 2.4),
      blueDim: glow(COLORS.blue, 0.9),
      redDim: glow(COLORS.red, 0.9),
      acid: glow(COLORS.acid, 1.8),
      edge: glow(COLORS.acid, 0.9),
      white: glow(COLORS.white, 0.9),
      argb: glow(0xff00ff, 2.4),
      doorGlow: glow(0xf4ffd6, 0.85),
      ring: glow(COLORS.acid, 2),

      bigScreen: screenMaterial(bigScreen.texture, 1.25),
      sign: new THREE.MeshBasicMaterial({ map: makeSignTexture(), transparent: true, depthWrite: false }),
      onAir: screenMaterial(makeOnAirTexture(), 1.5),
      spill: new THREE.MeshBasicMaterial({
        map: makeSpillTexture(),
        color: COLORS.acid,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      hit: new THREE.MeshBasicMaterial({ visible: false }), // neviditelné, ale „trefitelné“ myší

      screens: {
        blue: [screenMaterial(makeGameScreen('blue', 0)), screenMaterial(makeGameScreen('blue', 1))],
        red: [screenMaterial(makeGameScreen('red', 0)), screenMaterial(makeGameScreen('red', 1))],
        cast: screenMaterial(makeCasterScreen()),
      },
    };
    M.sign.color.setScalar(1.8);

    // Kategorie vybavení ze seznamu → materiály, které se rozsvítí
    const CATEGORIES = {
      mouse: [M.mouse],
      keyboard: [M.keyboard],
      pad: [M.pad],
      headset: [M.headset],
      bungee: [M.bungee],
      controller: [M.controller],
      webcam: [M.webcam],
      mic: [M.mic],
      arm: [M.arm],
      speaker: [M.speaker],
      desk: [M.desk, M.deskFrame],
      chair: [M.chair, M.chairAccent],
    };
    // Velké plochy svítí méně, aby záře nepřebila celou scénu
    const HIGHLIGHT_GAIN = { desk: 0.25, chair: 0.35, pad: 0.3 };
    // Svítící části, které se při zvýraznění přebarví na limetkovou (podsvícení klávesnic)
    const HIGHLIGHT_GLOWS = { keyboard: [M.blueDim, M.redDim] };


    /* --- Pomocné funkce pro stavbu modelů -------------------------------- */
    const geometryCache = new Map();
    function cachedGeometry(key, create) {
      if (!geometryCache.has(key)) geometryCache.set(key, create());
      return geometryCache.get(key);
    }

    /** Přidá kvádr (volitelně se zaoblenými hranami). */
    function addBox(parent, [w, h, d], material, [x, y, z], { radius = 0, shadow = true } = {}) {
      const geometry = radius > 0
        ? cachedGeometry(`rb:${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 2, radius))
        : cachedGeometry(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
      return addMesh(parent, geometry, material, [x, y, z], shadow);
    }

    /** Přidá válec (osa Y). */
    function addCylinder(parent, [rTop, rBottom, h, segments = 24], material, [x, y, z], { shadow = true } = {}) {
      const geometry = cachedGeometry(`c:${rTop}:${rBottom}:${h}:${segments}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, segments));
      return addMesh(parent, geometry, material, [x, y, z], shadow);
    }

    function addMesh(parent, geometry, material, [x, y, z], shadow = true) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      parent.add(mesh);
      return mesh;
    }


    /* --- Místnost -------------------------------------------------------- */
    function buildRoom(parent) {
      const { w, d, h } = ROOM;

      // Podlahová deska „vznášející se“ ve tmě
      addBox(parent, [w, 0.3, d], M.slab, [0, -0.151, 0], { shadow: false });
      const floor = addMesh(parent, new THREE.PlaneGeometry(w, d), M.floor, [0, 0, 0]);
      floor.rotation.x = -Math.PI / 2;
      floor.castShadow = false;

      // Svítící hrany na otevřených stranách
      addBox(parent, [w, 0.02, 0.02], M.edge, [0, -0.012, d / 2], { shadow: false });
      addBox(parent, [0.02, 0.02, d], M.edge, [w / 2, -0.012, 0], { shadow: false });

      // Stěny (zadní a levá) + LED lišty u podlahy
      addBox(parent, [w + 0.25, h, 0.25], M.wall, [-0.125, h / 2, -d / 2 - 0.125]);
      addBox(parent, [0.25, h, d], M.wall, [-w / 2 - 0.125, h / 2, 0]);
      addBox(parent, [w, 0.03, 0.03], M.white, [0, 0.06, -d / 2 + 0.02], { shadow: false });
      addBox(parent, [0.03, 0.03, d], M.white, [-w / 2 + 0.02, 0.06, 0], { shadow: false });

      // Velká projekce na zadní stěně
      addBox(parent, [4.7, 2.75, 0.08], M.monitor, [0, 1.95, -d / 2 + 0.04]);
      addMesh(parent, new THREE.PlaneGeometry(4.5, 2.53), M.bigScreen, [0, 1.95, -d / 2 + 0.085], false);

      // Konzole + reproduktor Genesis Helium 800 BT ARGB
      addBox(parent, [3.4, 0.42, 0.5], M.console, [0, 0.21, -d / 2 + 0.3], { radius: 0.03 });
      addBox(parent, [1.0, 0.13, 0.15], M.speaker, [0, 0.485, -d / 2 + 0.3], { radius: 0.03 });
      addBox(parent, [0.96, 0.016, 0.02], M.argb, [0, 0.43, -d / 2 + 0.38], { shadow: false });

      // Akustické šestiúhelníkové panely v barvách týmů
      buildHexCluster(parent, -3.8, 2.0, M.blue);
      buildHexCluster(parent, 3.8, 2.0, M.red);

      // Neonový nápis na levé stěně
      const sign = addMesh(parent, new THREE.PlaneGeometry(3.2, 1.125), M.sign, [-w / 2 + 0.02, 2.25, -1.4], false);
      sign.rotation.y = Math.PI / 2;

      // Cedule ON AIR nad komentátorským pultem
      addBox(parent, [0.92, 0.34, 0.06], M.metal, [5.8, 2.5, -d / 2 + 0.03]);
      addMesh(parent, new THREE.PlaneGeometry(0.86, 0.3), M.onAir, [5.8, 2.5, -d / 2 + 0.065], false);

      buildDoor(parent);
      buildPlant(parent, -6.35, -d / 2 + 0.6);
      buildPlant(parent, 6.4, -d / 2 + 0.55);
    }

    /** Sedm šestiúhelníků ve tvaru plástve se svítícím okrajem. */
    function buildHexCluster(parent, cx, cy, rimMaterial) {
      const r = 0.3;
      const gap = 1.12;
      const z = -ROOM.d / 2 + 0.03;
      const hexGeometry = cachedGeometry('hex', () => new THREE.CylinderGeometry(r, r, 0.06, 6));
      const rimGeometry = cachedGeometry('hexRim', () => new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.02, 6));
      const cells = [[0, 0], [1, 0], [-1, 0], [0.5, 1], [-0.5, 1], [0.5, -1], [-0.5, -1]];

      cells.forEach(([u, v], i) => {
        const x = cx + u * Math.sqrt(3) * r * gap;
        const y = cy + v * 1.5 * r * gap;
        const rim = addMesh(parent, rimGeometry, rimMaterial, [x, y, z], false);
        const hex = addMesh(parent, hexGeometry, M.felt, [x, y, z + 0.04 + (i % 3) * 0.03]);
        rim.rotation.x = Math.PI / 2;
        hex.rotation.x = Math.PI / 2;
      });
    }

    /** Vstup do učebny – svítící rám, pootevřené dveře a světlo na podlaze. */
    function buildDoor(parent) {
      const x = -ROOM.w / 2 + 0.02;
      const z = 2.7;
      const w = 1.1;
      const h = 2.2;

      const opening = addMesh(parent, new THREE.PlaneGeometry(w - 0.05, h - 0.05), M.doorGlow, [x + 0.005, h / 2, z], false);
      opening.rotation.y = Math.PI / 2;

      addBox(parent, [0.05, h, 0.05], M.acid, [x, h / 2, z - w / 2], { shadow: false });
      addBox(parent, [0.05, h, 0.05], M.acid, [x, h / 2, z + w / 2], { shadow: false });
      addBox(parent, [0.05, 0.05, w + 0.05], M.acid, [x, h, z], { shadow: false });

      const leaf = new THREE.Group();
      leaf.position.set(x + 0.03, 0, z - w / 2 + 0.03);
      leaf.rotation.y = 0.9; // pootevřené do učebny
      addBox(leaf, [0.05, h - 0.06, w - 0.06], M.metal, [0, (h - 0.06) / 2, (w - 0.06) / 2]);
      parent.add(leaf);

      const spill = addMesh(parent, new THREE.PlaneGeometry(2.6, 1.6), M.spill, [x + 1.3, 0.004, z], false);
      spill.rotation.x = -Math.PI / 2;
    }

    function buildPlant(parent, x, z) {
      const plant = new THREE.Group();
      plant.position.set(x, 0, z);
      addCylinder(plant, [0.2, 0.15, 0.42], M.pot, [0, 0.21, 0]);
      const leafGeometry = cachedGeometry('leaf', () => new THREE.IcosahedronGeometry(0.22, 0));
      [[0, 0.62, 0, 1.2], [0.12, 0.85, 0.05, 0.9], [-0.1, 0.8, -0.08, 1], [0.02, 1.05, -0.02, 0.75], [-0.05, 0.7, 0.12, 0.8]]
        .forEach(([lx, ly, lz, scale]) => {
          const leaf = addMesh(plant, leafGeometry, M.plant, [lx, ly, lz]);
          leaf.scale.setScalar(scale);
          leaf.rotation.set(lx * 5, ly * 3, lz * 4);
        });
      parent.add(plant);
    }


    /* --- Herní stanice --------------------------------------------------- */

    /** Herní židle Genesis Nitro 720 (černo-červená). Sedí se směrem k −Z. */
    function buildChair() {
      const chair = new THREE.Group();

      // pětiramenný kříž s kolečky + píst
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const leg = addBox(chair, [0.28, 0.03, 0.04], M.chairBase, [Math.cos(angle) * 0.14, 0.07, Math.sin(angle) * 0.14], { radius: 0.01 });
        leg.rotation.y = -angle;
        addCylinder(chair, [0.025, 0.025, 0.04, 12], M.chairBase, [Math.cos(angle) * 0.27, 0.025, Math.sin(angle) * 0.27]);
      }
      addCylinder(chair, [0.028, 0.035, 0.32], M.chairBase, [0, 0.24, 0]);

      // sedák s červenými boky
      addBox(chair, [0.52, 0.09, 0.5], M.chair, [0, 0.45, 0], { radius: 0.035 });
      addBox(chair, [0.08, 0.1, 0.46], M.chairAccent, [-0.24, 0.47, 0], { radius: 0.03 });
      addBox(chair, [0.08, 0.1, 0.46], M.chairAccent, [0.24, 0.47, 0], { radius: 0.03 });

      // opěradlo mírně zakloněné dozadu
      const back = new THREE.Group();
      back.position.set(0, 0.5, 0.23);
      back.rotation.x = 0.14;
      addBox(back, [0.5, 0.84, 0.1], M.chair, [0, 0.42, 0], { radius: 0.045 });
      addBox(back, [0.07, 0.8, 0.106], M.chairAccent, [-0.17, 0.42, 0], { radius: 0.03 });
      addBox(back, [0.07, 0.8, 0.106], M.chairAccent, [0.17, 0.42, 0], { radius: 0.03 });
      addBox(back, [0.26, 0.12, 0.06], M.chairAccent, [0, 0.72, -0.075], { radius: 0.025 }); // polštář pod hlavu
      addBox(back, [0.3, 0.14, 0.06], M.chair, [0, 0.2, -0.075], { radius: 0.025 });         // bederní polštář
      chair.add(back);

      // područky
      [-1, 1].forEach((side) => {
        addBox(chair, [0.04, 0.2, 0.04], M.chairBase, [side * 0.29, 0.56, 0.04]);
        addBox(chair, [0.08, 0.03, 0.26], M.chair, [side * 0.29, 0.67, 0], { radius: 0.012 });
      });
      return chair;
    }

    /** Jedna herní stanice: stůl, monitor, periferie, PC a židle. Hráč sedí na straně +Z. */
    function buildStation(team, number) {
      const station = new THREE.Group();
      const { w, d, h } = DESK;
      const rand = seededRandom(`station${number}`);

      // Herní stůl Genesis Holm Modular + RGB lišta
      addBox(station, [w, 0.045, d], M.desk, [0, h - 0.0225, 0], { radius: 0.012 });
      [-1, 1].forEach((side) => {
        addBox(station, [0.06, h - 0.045, 0.06], M.deskFrame, [side * (w / 2 - 0.1), (h - 0.045) / 2, -0.1]);
        addBox(station, [0.07, 0.035, d - 0.1], M.deskFrame, [side * (w / 2 - 0.1), 0.0175, 0]);
      });
      addBox(station, [w - 0.26, 0.05, 0.04], M.deskFrame, [0, h - 0.1, -0.1]);
      addBox(station, [w - 0.06, 0.012, 0.012], M[team], [0, h - 0.05, d / 2 - 0.01], { shadow: false });

      // Podložka Genesis Boron 500 XXL RGB (svítící okraj)
      addBox(station, [0.84, 0.004, 0.37], M[team], [0.04, h + 0.002, 0.14], { shadow: false });
      addBox(station, [0.82, 0.006, 0.35], M.pad, [0.04, h + 0.005, 0.14], { shadow: false });

      // Klávesnice Genesis Thor 303 s podsvícením
      addBox(station, [0.44, 0.026, 0.14], M.keyboard, [-0.08, h + 0.021, 0.15], { radius: 0.008 });
      addBox(station, [0.41, 0.003, 0.11], M[`${team}Dim`], [-0.08, h + 0.0355, 0.15], { shadow: false });

      // Myš Genesis Krypton 750
      addBox(station, [0.064, 0.034, 0.118], M.mouse, [0.3, h + 0.025, 0.16], { radius: 0.016 });

      // Držák kabelu Genesis Vanad 500
      addCylinder(station, [0.035, 0.04, 0.02], M.bungee, [0.42, h + 0.018, 0]);
      addBox(station, [0.012, 0.1, 0.012], M.bungee, [0.42, h + 0.075, 0]);
      addBox(station, [0.012, 0.012, 0.1], M.bungee, [0.42, h + 0.12, 0.045]);

      // Monitor se hrou
      addBox(station, [0.64, 0.38, 0.03], M.monitor, [0, h + 0.42, -0.2], { radius: 0.01 });
      addMesh(station, cachedGeometry('screen', () => new THREE.PlaneGeometry(0.61, 0.345)), M.screens[team][number % 2], [0, h + 0.42, -0.184], false);
      addBox(station, [0.05, 0.24, 0.03], M.monitor, [0, h + 0.13, -0.235]);
      addBox(station, [0.24, 0.012, 0.16], M.monitor, [0, h + 0.006, -0.22], { radius: 0.005 });

      // Webkamera Natec Lori Plus na monitoru
      addBox(station, [0.09, 0.03, 0.035], M.webcam, [0, h + 0.625, -0.2], { radius: 0.01 });

      // Sluchátka Genesis Neon 613 na stojánku
      const headset = new THREE.Group();
      headset.position.set(-0.53, h, -0.15);
      headset.rotation.y = 0.3;
      addBox(headset, [0.09, 0.01, 0.09], M.metal, [0, 0.005, 0]);
      addBox(headset, [0.014, 0.24, 0.014], M.metal, [0, 0.12, 0]);
      addMesh(headset, cachedGeometry('band', () => new THREE.TorusGeometry(0.085, 0.013, 8, 24, Math.PI)), M.headset, [0, 0.15, 0]);
      [-1, 1].forEach((side) => {
        const cup = addCylinder(headset, [0.045, 0.045, 0.035], M.headset, [side * 0.088, 0.13, 0]);
        const ring = addCylinder(headset, [0.047, 0.047, 0.006], M[team], [side * 0.108, 0.13, 0], { shadow: false });
        cup.rotation.z = Math.PI / 2;
        ring.rotation.z = Math.PI / 2;
      });
      station.add(headset);

      // Ovladač Genesis Mangan 400
      const gamepad = new THREE.Group();
      gamepad.position.set(0.57, h + 0.022, 0.22);
      gamepad.rotation.y = -0.5 + rand() * 0.3;
      addBox(gamepad, [0.15, 0.03, 0.075], M.controller, [0, 0, 0], { radius: 0.014 });
      addBox(gamepad, [0.05, 0.03, 0.07], M.controller, [-0.055, -0.004, 0.035], { radius: 0.014 });
      addBox(gamepad, [0.05, 0.03, 0.07], M.controller, [0.055, -0.004, 0.035], { radius: 0.014 });
      station.add(gamepad);

      // PC skříň pod stolem s RGB ventilátory
      addBox(station, [0.21, 0.46, 0.44], M.pc, [w / 2 - 0.24, 0.25, -0.02], { radius: 0.012 });
      [0.33, 0.17].forEach((y) => {
        addMesh(station, cachedGeometry('fan', () => new THREE.TorusGeometry(0.06, 0.008, 6, 24)), M[team], [w / 2 - 0.24, y, 0.205], false);
      });

      // Herní židle – každá trochu jinak natočená, ať to nevypadá strojově
      const chair = buildChair();
      chair.position.set((rand() - 0.5) * 0.12, 0, d / 2 + 0.4);
      chair.rotation.y = (rand() - 0.5) * 0.4;
      station.add(chair);

      return station;
    }

    /** Dva ostrovy po 8 stanicích. Vrací neviditelné „hit boxy“ pro najetí myší. */
    function buildStations(parent) {
      const hitBoxes = [];
      let number = 1;

      ISLANDS.forEach((island) => {
        const length = 4 * 1.45;
        // přepážka mezi řadami stolů se svítící horní hranou
        addBox(parent, [length, 0.3, 0.03], M.deskFrame, [island.x, DESK.h + 0.15, island.z]);
        addBox(parent, [length, 0.018, 0.04], M[island.team], [island.x, DESK.h + 0.3, island.z], { shadow: false });

        [-1, 1].forEach((side) => {
          for (let i = 0; i < 4; i++) {
            const station = buildStation(island.team, number);
            station.position.set(island.x + (i - 1.5) * 1.45, 0, island.z + side * (DESK.d / 2 + 0.02));
            station.rotation.y = side === 1 ? 0 : Math.PI; // monitory jsou k sobě zády
            parent.add(station);

            const hit = addMesh(station, cachedGeometry('hit', () => new THREE.BoxGeometry(1.4, 1.4, 1.6)), M.hit, [0, 0.7, 0.4], false);
            hit.userData = { keep: true, number, team: island.team };
            hitBoxes.push(hit);
            number += 1;
          }
        });
      });
      return hitBoxes;
    }

    /** Komentátorský pult: 2 monitory, 2 mikrofony Radium 600 G2 na ramenech Thulium 700. */
    function buildCasterDesk(parent) {
      const desk = new THREE.Group();
      const { h } = DESK;
      const w = 2.0;
      const d = 0.8;
      desk.position.set(CASTER.x, 0, CASTER.z);
      desk.rotation.y = CASTER.rotation;

      addBox(desk, [w, 0.05, d], M.desk, [0, h - 0.025, 0], { radius: 0.014 });
      addBox(desk, [w - 0.1, 0.6, 0.03], M.deskFrame, [0, h - 0.35, -d / 2 + 0.06]);
      [-1, 1].forEach((side) => addBox(desk, [0.05, h - 0.05, d - 0.1], M.deskFrame, [side * (w / 2 - 0.05), (h - 0.05) / 2, 0]));
      addBox(desk, [w - 0.06, 0.012, 0.012], M.acid, [0, h - 0.05, d / 2 - 0.01], { shadow: false });

      [-0.48, 0.48].forEach((mx) => {
        const side = Math.sign(mx);

        // monitor + webkamera
        addBox(desk, [0.64, 0.38, 0.03], M.monitor, [mx, h + 0.42, -0.24], { radius: 0.01 });
        addMesh(desk, cachedGeometry('screen', () => new THREE.PlaneGeometry(0.61, 0.345)), M.screens.cast, [mx, h + 0.42, -0.224], false);
        addBox(desk, [0.05, 0.24, 0.03], M.monitor, [mx, h + 0.13, -0.275]);
        addBox(desk, [0.24, 0.012, 0.16], M.monitor, [mx, h + 0.006, -0.26], { radius: 0.005 });
        addBox(desk, [0.09, 0.03, 0.035], M.webcam, [mx, h + 0.625, -0.24], { radius: 0.01 });

        // klávesnice + myš
        addBox(desk, [0.44, 0.026, 0.14], M.keyboard, [mx - 0.05, h + 0.021, 0.18], { radius: 0.008 });
        addBox(desk, [0.064, 0.034, 0.118], M.mouse, [mx + 0.3, h + 0.025, 0.19], { radius: 0.016 });

        // rameno Genesis Thulium 700 s mikrofonem Genesis Radium 600 G2
        const arm = new THREE.Group();
        arm.position.set(mx + side * 0.38, h, -0.3);
        arm.rotation.y = -side * 0.35;
        addCylinder(arm, [0.025, 0.03, 0.05], M.arm, [0, 0.025, 0]);
        addBox(arm, [0.022, 0.42, 0.022], M.arm, [0, 0.23, 0]);
        const boom = addBox(arm, [0.022, 0.022, 0.5], M.arm, [0, 0.4, 0.22]);
        boom.rotation.x = 0.28;
        addCylinder(arm, [0.032, 0.032, 0.17], M.mic, [0, 0.27, 0.45]);
        addCylinder(arm, [0.034, 0.034, 0.012], M.white, [0, 0.33, 0.45], { shadow: false });
        desk.add(arm);

        // židle
        const chair = buildChair();
        chair.position.set(mx, 0, d / 2 + 0.42);
        chair.rotation.y = mx * 0.2;
        desk.add(chair);
      });

      parent.add(desk);
    }

    /**
     * Sloučí statické objekty se stejným materiálem do jedné geometrie.
     * Místo stovek samostatných objektů pak grafická karta kreslí jen pár desítek
     * – scéna běží plynule i na slabších počítačích.
     */
    function mergeStatic(group) {
      group.updateMatrixWorld(true);
      const buckets = new Map();
      const merged = [];

      group.traverse((object) => {
        if (!object.isMesh || object.userData.keep) return;
        const key = `${object.material.uuid}:${object.castShadow}`;
        if (!buckets.has(key)) buckets.set(key, { material: object.material, shadow: object.castShadow, meshes: [] });
        buckets.get(key).meshes.push(object);
      });

      buckets.forEach(({ material, shadow, meshes }) => {
        const geometries = meshes.map((mesh) => {
          const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          if (!geometry.index) geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
          return geometry;
        });
        const combined = mergeGeometries(geometries, false);
        if (!combined) return; // nejde sloučit → necháme původní objekty

        const mesh = new THREE.Mesh(combined, material);
        mesh.castShadow = shadow;
        mesh.receiveShadow = shadow || material === M.floor;
        merged.push(mesh);
        meshes.forEach((m) => m.removeFromParent());
      });

      merged.forEach((mesh) => group.add(mesh));
    }


    /* --- Sestavení scény ------------------------------------------------- */
    const world = new THREE.Group();
    scene.add(world);
    buildRoom(world);
    const hitBoxes = buildStations(world);
    buildCasterDesk(world);
    mergeStatic(world);

    // Kroužek pod stanicí, na kterou míří myš
    const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.88, 48), M.ring);
    hoverRing.rotation.x = -Math.PI / 2;
    hoverRing.visible = false;
    scene.add(hoverRing);


    /* --- Světla ---------------------------------------------------------- */
    scene.add(new THREE.AmbientLight(0x8a90b8, 0.35));
    scene.add(new THREE.HemisphereLight(0x8090ff, 0x101016, 0.4));

    const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.8);
    keyLight.position.set(9, 13, 10);
    keyLight.target.position.set(-1, 0, 0);
    keyLight.castShadow = !lowPower;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 2, far: 40 });
    keyLight.shadow.camera.updateProjectionMatrix();
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight, keyLight.target);

    const teamLights = {
      blue: new THREE.PointLight(COLORS.blue, 22, 9, 1.6),
      red: new THREE.PointLight(COLORS.red, 22, 9, 1.6),
    };
    teamLights.blue.position.set(ISLANDS[0].x, 2.6, ISLANDS[0].z);
    teamLights.red.position.set(ISLANDS[1].x, 2.6, ISLANDS[1].z);
    scene.add(teamLights.blue, teamLights.red);

    const screenLight = new THREE.PointLight(0x9fb4ff, 10, 8, 1.6);
    screenLight.position.set(0, 2, -3.6);
    const doorLight = new THREE.PointLight(COLORS.acid, 8, 5, 1.6);
    doorLight.position.set(-6.3, 1.6, 2.7);
    scene.add(screenLight, doorLight);


    /* --- Kamera: úvod (hero) a interaktivní pohled ----------------------- */
    const vec = (array) => new THREE.Vector3(...array);
    const heroFrom = { pos: vec(HERO_FROM.pos), look: vec(HERO_FROM.look) };
    const heroTo = { pos: vec(HERO_TO.pos), look: vec(HERO_TO.look) };
    const heroCam = { pos: heroFrom.pos.clone(), look: heroFrom.look.clone() };
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    // „rig“ = aktuální a cílová poloha kamery v interaktivním režimu
    const rig = {
      current: { theta: 0, phi: 0, radius: 1, target: new THREE.Vector3() },
      goal: { theta: 0, phi: 0, radius: 1, target: new THREE.Vector3() },
    };
    let fitFactor = 1;       // na úzkých displejích kamera odstoupí dál
    let lastInteraction = 0;
    let idleBlend = 0;
    let mode = 'off';        // 'hero' | 'stage' | 'off'

    function setGoalFromView(name) {
      const view = VIEWS[name];
      rig.goal.theta = view.theta;
      rig.goal.phi = view.phi;
      rig.goal.radius = view.radius;
      rig.goal.target.set(...view.target);
    }

    function goToView(name) {
      setGoalFromView(name);
      lastInteraction = performance.now();
    }

    const pointer = { x: 0, y: 0 };
    window.addEventListener('pointermove', (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    function updateHeroCamera(dt, time) {
      const p = state.heroProgress;
      const eased = p * p * (3 - 2 * p); // „smoothstep“ – plynulý rozjezd i dojezd

      desiredPos.lerpVectors(heroFrom.pos, heroTo.pos, eased);
      desiredLook.lerpVectors(heroFrom.look, heroTo.look, eased);
      desiredPos.sub(desiredLook).multiplyScalar(1 + (fitFactor - 1) * eased).add(desiredLook);

      // paralaxa podle myši + pomalé „dýchání“ kamery
      if (!reduceMotion) {
        desiredPos.x += pointer.x * 0.6 + Math.sin(time * 0.3) * 0.15;
        desiredPos.y -= pointer.y * 0.35;
      }

      const k = 1 - Math.exp(-dt * 5);
      heroCam.pos.lerp(desiredPos, k);
      heroCam.look.lerp(desiredLook, k);
      camera.position.copy(heroCam.pos);
      lookTarget.copy(heroCam.look);
      camera.lookAt(lookTarget);
    }

    function updateStageCamera(dt, time) {
      const { current, goal } = rig;
      const k = 1 - Math.exp(-dt * 4);
      current.theta += (goal.theta - current.theta) * k;
      current.phi += (goal.phi - current.phi) * k;
      current.radius += (goal.radius - current.radius) * k;
      current.target.lerp(goal.target, k);

      // Když uživatel chvíli nic nedělá, kamera se jemně pohupuje
      const idle = !reduceMotion && performance.now() - lastInteraction > 5000;
      idleBlend += ((idle ? 1 : 0) - idleBlend) * k * 0.5;
      const theta = current.theta + Math.sin(time * 0.25) * 0.18 * idleBlend;
      const radius = current.radius * fitFactor;

      camera.position.set(
        current.target.x + radius * Math.sin(theta) * Math.cos(current.phi),
        current.target.y + radius * Math.sin(current.phi),
        current.target.z + radius * Math.cos(theta) * Math.cos(current.phi),
      );
      lookTarget.copy(current.target);
      camera.lookAt(lookTarget);
    }

    /** Na počítači je vpravo seznam vybavení → scénu posuneme opticky doleva. */
    function updateViewOffset() {
      const width = sceneWrap.clientWidth;
      const height = sceneWrap.clientHeight;
      if (mode === 'stage' && width >= 900) camera.setViewOffset(width, height, width * 0.15, 0, width, height);
      else camera.clearViewOffset();
    }

    function resize() {
      const width = sceneWrap.clientWidth;
      const height = sceneWrap.clientHeight;
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);

      camera.aspect = width / height;
      camera.fov = camera.aspect < 1 ? 46 : 35;
      const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      fitFactor = clamp(0.5 / halfTan, 1, 1.6); // na mobilu raději mírný ořez než maličká učebna

      updateViewOffset();
      camera.updateProjectionMatrix();
    }


    /* --- Režimy: scéna se kreslí jen tehdy, když je vidět ---------------- */
    function setMode(next) {
      if (next === mode) return;
      mode = next;
      sceneWrap.classList.toggle('is-off', mode === 'off');
      updateViewOffset();
      hideHover();

      if (mode === 'stage') {
        // Při vstupu do sekce kamera plynule „přijede“ k učebně
        rig.current.theta = rig.goal.theta - 0.3;
        rig.current.phi = rig.goal.phi + 0.1;
        rig.current.radius = rig.goal.radius * 1.3;
        rig.current.target.copy(rig.goal.target);
        lastInteraction = performance.now();
      }
    }

    const visible = { hero: false, stage: false };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { visible[entry.target === heroEl ? 'hero' : 'stage'] = entry.isIntersecting; });
      setMode(visible.stage ? 'stage' : visible.hero ? 'hero' : 'off');
    });


    /* --- Ovládání tažením ------------------------------------------------ */
    let drag = null;

    stageEl.addEventListener('pointerdown', (event) => {
      if (mode !== 'stage' || event.target.closest('button, a')) return;
      drag = { x: event.clientX, y: event.clientY, type: event.pointerType };
      stageEl.classList.add('is-dragging');
      lastInteraction = performance.now();
    });

    window.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      rig.goal.theta = clamp(rig.goal.theta - dx * 0.006, ...LIMITS.theta);
      // svislý pohyb jen myší (prstem se svisle scrolluje stránka)
      if (drag.type === 'mouse') rig.goal.phi = clamp(rig.goal.phi + dy * 0.004, ...LIMITS.phi);
      lastInteraction = performance.now();
    });

    const endDrag = () => {
      drag = null;
      stageEl.classList.remove('is-dragging');
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);


    /* --- Najetí myší na stanici ------------------------------------------ */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tmp = new THREE.Vector3();
    let hoverEvent = null;

    if (finePointer) {
      stageEl.addEventListener('pointermove', (event) => { hoverEvent = event; });
      stageEl.addEventListener('pointerleave', () => { hoverEvent = null; hideHover(); });
    }

    function hideHover() {
      tooltipEl.classList.remove('is-visible');
      hoverRing.visible = false;
    }

    function updateHover() {
      if (!hoverEvent || drag || hoverEvent.target.closest('button, a')) {
        hideHover();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((hoverEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((hoverEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(hitBoxes, false)[0];
      if (!hit) {
        hideHover();
        return;
      }

      const { number, team } = hit.object.userData;
      const stageRect = stageEl.getBoundingClientRect();
      tooltipEl.textContent = `Stanice ${pad2(number)} · Tým ${team === 'blue' ? 'modrý' : 'červený'}`;
      tooltipEl.style.transform = `translate3d(${hoverEvent.clientX - stageRect.left + 18}px, ${hoverEvent.clientY - stageRect.top + 18}px, 0)`;
      tooltipEl.classList.add('is-visible');

      hit.object.getWorldPosition(tmp);
      hoverRing.position.set(tmp.x, 0.012, tmp.z);
      hoverRing.visible = true;
    }


    /* --- Body zájmu (HTML štítky promítnuté z 3D do 2D) ------------------- */
    const hotspots = hotspotEls.map((el) => ({ el, name: el.dataset.hotspot, world: vec(HOTSPOTS[el.dataset.hotspot]) }));
    hotspots.forEach(({ el, name }) => el.addEventListener('click', () => window.Ucebna.setView(name)));

    function updateHotspots() {
      const width = sceneWrap.clientWidth;
      const height = sceneWrap.clientHeight;
      const stageRect = stageEl.getBoundingClientRect();

      hotspots.forEach(({ el, name, world: point }) => {
        tmp.copy(point).project(camera);
        const x = (tmp.x * 0.5 + 0.5) * width - stageRect.left;
        const y = (-tmp.y * 0.5 + 0.5) * height - stageRect.top;
        const outside = tmp.z > 1 || x < 0 || x > stageRect.width || y < 0 || y > stageRect.height;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        el.classList.toggle('is-hidden', outside || state.view === name);
      });
    }


    /* --- Zvýraznění vybavení a RGB efekty -------------------------------- */
    function applyHighlight() {
      Object.values(CATEGORIES).flat().forEach((material) => {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 1;
      });
      Object.values(HIGHLIGHT_GLOWS).flat().forEach((material) => material.color.copy(material.userData.baseColor));
      (CATEGORIES[state.highlight] || []).forEach((material) => material.emissive.setHex(COLORS.acid));
    }

    function updateHighlight(time) {
      const materials = CATEGORIES[state.highlight];
      if (!materials) return;
      const gain = HIGHLIGHT_GAIN[state.highlight] ?? 1;
      const pulse = (0.75 + Math.sin(time * 6) * 0.25) * gain * 2.4;
      materials.forEach((material) => { material.emissiveIntensity = pulse; });
      (HIGHLIGHT_GLOWS[state.highlight] || []).forEach((material) => {
        material.color.setHex(COLORS.acid).multiplyScalar(pulse);
      });
    }

    // [materiál, posun odstínu] – stejný tým = stejná barva
    const RGB_MATERIALS = [[M.blue, 0], [M.blueDim, 0], [M.red, 0.5], [M.redDim, 0.5]];
    let rgbWasOn = false;

    function updateRgb(time) {
      // reproduktor Helium 800 BT ARGB hraje barvami pořád
      M.argb.color.setHSL((time * 0.12) % 1, 1, 0.55).multiplyScalar(2.4);

      if (state.rgb) {
        const hue = (time * 0.15) % 1;
        RGB_MATERIALS.forEach(([material, offset]) => {
          material.color.setHSL((hue + offset) % 1, 1, 0.55).multiplyScalar(material.userData.intensity);
        });
        teamLights.blue.color.setHSL(hue, 1, 0.55);
        teamLights.red.color.setHSL((hue + 0.5) % 1, 1, 0.55);
        rgbWasOn = true;
      } else if (rgbWasOn) {
        RGB_MATERIALS.forEach(([material]) => material.color.copy(material.userData.baseColor));
        teamLights.blue.color.setHex(COLORS.blue);
        teamLights.red.color.setHex(COLORS.red);
        rgbWasOn = false;
      }
    }


    /* --- Smyčka vykreslování --------------------------------------------- */
    const clock = new THREE.Clock();
    let lastScreenDraw = 0;

    function frame() {
      requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (mode === 'off') return; // scéna není vidět → nic nekreslíme

      const time = clock.elapsedTime;
      updateRgb(time);
      updateHighlight(time);

      // odpočet na projekci stačí překreslit jednou za sekundu
      if (time - lastScreenDraw > 1) {
        bigScreen.draw();
        lastScreenDraw = time;
      }

      if (mode === 'hero') updateHeroCamera(dt, time);
      else updateStageCamera(dt, time);

      // mlha se řídí vzdáleností kamery, aby vzdálené okraje zjemnila
      const distance = camera.position.distanceTo(lookTarget);
      scene.fog.near = distance * 1.15;
      scene.fog.far = distance * 2.6;

      if (composer) composer.render();
      else renderer.render(scene, camera);

      if (mode === 'stage') {
        updateHotspots();
        updateHover();
      }
    }

    function start() {
      setGoalFromView(state.view);
      resize();
      window.addEventListener('resize', resize);

      // Stíny spočítáme jednou a shadery připravíme dopředu (žádné záseky při scrollu)
      camera.position.copy(heroFrom.pos);
      camera.lookAt(heroFrom.look);
      renderer.shadowMap.needsUpdate = true;
      renderer.compile(scene, camera);

      observer.observe(heroEl);
      observer.observe(stageEl);
      frame();
    }

    return { start, applyHighlight, goToView };
  }
})();
