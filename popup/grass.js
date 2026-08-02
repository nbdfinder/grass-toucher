// Grass Toucher — an oddly satisfying pocket lawn.
// Hover to brush: blades are spring-loaded quadratic curves that part around
// the pointer and wobble back. Hold + drag to mow: blades under the pointer
// are chopped flat at the height you touch and regrow individually.
// Dandelions spread if allowed to seed and are killed for good when cut.
// The sky tracks your actual local time: sun arc by day, moon/stars/fireflies
// at night. Runs standalone in a browser tab too (chrome.* calls are guarded;
// add ?hour=22 to the URL to preview any time of day).
(() => {
  const W = 600;
  const H = 400;
  const canvas = document.getElementById('lawn');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

  // ---------- state ----------
  const blades = [];
  const dandelions = [];
  const particles = [];
  // clouds: each pre-rendered once to an offscreen sprite at full opacity —
  // flat-bottomed cumulus with a shaded belly painted inside the silhouette —
  // then drawn with transparency. Blob unions can't show seams this way.
  function makeCloud(x, y, s, v) {
    const SS = 2; // supersample for a crisp downscale
    const w = 140 + Math.random() * 60;
    const h = 64;
    const cv = document.createElement('canvas');
    cv.width = w * SS;
    cv.height = h * SS;
    const g = cv.getContext('2d');
    g.scale(SS, SS);
    const baseY = h * 0.82;

    // silhouette: rounded slab base + a dome of puffs, tallest in the middle
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(w / 2, baseY - 9, w * 0.45, 12, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const f = (i + 0.5) / 5;
      const r = h * 0.3 * (0.55 + 0.65 * Math.sin(Math.PI * f)) * (0.9 + Math.random() * 0.25);
      g.beginPath();
      g.arc(w * 0.1 + f * w * 0.8, baseY - 10 - r * 0.7, r, 0, Math.PI * 2);
      g.fill();
    }

    // belly shading, clipped to the silhouette
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(186, 203, 222, 0.75)';
    g.beginPath();
    g.ellipse(w / 2, baseY + 10, w * 0.5, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';

    return { x, y, s, v, sprite: cv, w, h };
  }

  const clouds = [
    makeCloud(80, 30, 1, 4),
    makeCloud(400, 70, 0.75, 6),
    makeCloud(240, 14, 0.5, 3),
  ];
  const pointer = { x: -999, y: -999, vx: 0, lastX: 0, lastT: 0, down: false };

  const REGROW = 0.0035;       // grass regrowth per second — buzz cut to full in ~4 min
  const STUB = 0.12;           // shortest a blade can be cut, fraction of full length
  const CUT_RADIUS = 32;       // horizontal reach of the pointer while mowing
  const MOWED_FRAC = 0.65;     // fraction of blades cut short = "lawn mowed"
  let mowLatch = false;        // blocks repeat mow events until the lawn regrows
  let mowCheckT = 0;
  let frontStart = 0;          // first front-layer blade (dandelions draw underneath)

  const stats = { mowCount: 0, minutesToday: 0, soundOn: true };
  let dirty = false;

  // The narrator. Sarcastic, fake-congratulatory, and aware of what you're
  // doing with your day. Contextual pools win over generic when they apply.
  const MOW_LINES = {
    generic: [
      'Lawn mowed. The grass felt nothing. Hopefully you did.',
      'Beautiful work. None of this is real.',
      "Congratulations. You've technically touched grass.",
      'Fresh cut. It grows back. It always grows back.',
      'Immaculate. Somewhere outside, real grass grows unsupervised.',
      'Well mowed. The neighbors would be jealous, if they existed.',
      'You mowed a lawn inside your browser. Take a moment.',
      'Another lawn conquered. The void applauds politely.',
      'Great job. Real grass remains undefeated and untouched.',
      'Mowed. You may now return to whatever you were avoiding.',
      'A perfect cut. Your ancestors tended fields. You have this.',
      'Splendid. This is what fresh air must feel like.',
    ],
    online: [
      "Mowed. That's {m} minutes online today. This was the productive part.",
      '{m} minutes online. At least the lawn has something to show for it.',
      "You've been here {m} minutes. The grass grew. Did you?",
      "{m} minutes today. The lawn isn't judging you. It can't. It's fake.",
    ],
    lateNight: [
      'Midnight lawn care. Bold. Iconic. Concerning.',
      "It's late. The lawn looks great. Go to bed.",
      'Even the fireflies think you should log off.',
      'Mowing by moonlight. The moon has questions.',
    ],
    earlyMorning: [
      'An early cut. Real sunlight is also available today.',
      'Mowing before breakfast. The dew had barely settled.',
    ],
    milestone: [
      'Mow #{n}. The grass forgets every time. You never do.',
      "That's {n} lawns mowed. Real grass touched: still zero.",
      '{n} mows. Somewhere, a real mower rusts, unloved.',
    ],
    dandelions: [
      'The lawn is cut. The dandelions remain. A truce, then.',
      "Nicely mowed around the dandelions. They're winning.",
    ],
  };
  let lastMowLine = '';

  function pickMowLine() {
    const h = tod.h;
    const pool = [];
    if (stats.mowCount > 0 && stats.mowCount % 10 === 0) pool.push(...MOW_LINES.milestone);
    if (h >= 23 || h < 5) pool.push(...MOW_LINES.lateNight);
    else if (h >= 5 && h < 8) pool.push(...MOW_LINES.earlyMorning);
    const standing = dandelions.filter((d) => d.delay <= 0 && d.growth > 0.3).length;
    if (standing >= 6) pool.push(...MOW_LINES.dandelions);
    if (stats.minutesToday >= 60 && Math.random() < 0.6) pool.push(...MOW_LINES.online);
    if (!pool.length || Math.random() < 0.35) pool.push(...MOW_LINES.generic);
    let line;
    do {
      line = pool[(Math.random() * pool.length) | 0];
    } while (line === lastMowLine && pool.length > 1);
    lastMowLine = line;
    return line.replace('{m}', stats.minutesToday).replace('{n}', stats.mowCount);
  }

  // ---------- time of day ----------
  const SUNRISE = 6.5;
  const SUNSET = 20;
  const hourParam = new URLSearchParams(location.search).get('hour');
  const hourOverride = hourParam !== null && !isNaN(parseFloat(hourParam))
    ? ((parseFloat(hourParam) % 24) + 24) % 24
    : null;

  function getHour() {
    if (hourOverride !== null) return hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  // a: sun altitude (-1..1), L: light level for shading the lawn
  let tod = { h: 12, a: 1, dayFrac: 0.5, L: 1 };
  let todT = Infinity; // forces compute on first frame

  function updateTOD(dt) {
    todT += dt;
    if (todT < 5) return;
    todT = 0;
    const h = getHour();
    const dayFrac = (h - SUNRISE) / (SUNSET - SUNRISE);
    const a = Math.sin(dayFrac * Math.PI);
    const L = 0.55 + 0.45 * Math.min(1, Math.max(0, (a + 0.12) / 0.37));
    tod = { h, a, dayFrac, L };
    if (Math.abs(L - shadeL) > 0.02) {
      shadeL = L;
      shadeMap = {};
    }
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mixHex(h1, h2, t) {
    const a = hexRgb(h1);
    const b = hexRgb(h2);
    const k = Math.min(1, Math.max(0, t));
    return `rgb(${(a[0] + (b[0] - a[0]) * k) | 0}, ${(a[1] + (b[1] - a[1]) * k) | 0}, ${(a[2] + (b[2] - a[2]) * k) | 0})`;
  }

  // night shading: dimmed and pulled slightly blue
  let shadeMap = {};
  let shadeL = 1;

  function shaded(hex) {
    if (shadeL > 0.97) return hex;
    let s = shadeMap[hex];
    if (!s) {
      const [r, g, b] = hexRgb(hex);
      s = `rgb(${(r * shadeL * 0.85) | 0}, ${(g * shadeL) | 0}, ${Math.min(255, b * shadeL * 1.12) | 0})`;
      shadeMap[hex] = s;
    }
    return s;
  }

  const NIGHT_SKY = ['#151c36', '#2a3854'];
  const TWILIGHT_SKY = ['#5a6ea6', '#f7b977'];
  const DAY_SKY = ['#aee3ff', '#e6fbee'];

  function skyColors(a) {
    if (a <= -0.15) return NIGHT_SKY;
    if (a < 0.06) {
      const t = (a + 0.15) / 0.21;
      return [mixHex(NIGHT_SKY[0], TWILIGHT_SKY[0], t), mixHex(NIGHT_SKY[1], TWILIGHT_SKY[1], t)];
    }
    if (a < 0.3) {
      const t = (a - 0.06) / 0.24;
      return [mixHex(TWILIGHT_SKY[0], DAY_SKY[0], t), mixHex(TWILIGHT_SKY[1], DAY_SKY[1], t)];
    }
    return DAY_SKY;
  }

  // real lunar phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last
  // quarter (reference: the new moon of 2000-01-06 18:14 UTC)
  const MOON_PHASE = (() => {
    const mp = new URLSearchParams(location.search).get('moon');
    if (mp !== null && !isNaN(parseFloat(mp))) return ((parseFloat(mp) % 1) + 1) % 1;
    const days = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
    return (((days / 29.530588853) % 1) + 1) % 1;
  })();

  const stars = [];
  for (let i = 0; i < 45; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.55,
      r: 0.6 + Math.random() * 1.1,
      tw: Math.random() * Math.PI * 2,
    });
  }

  const fireflies = [];
  for (let i = 0; i < 6; i++) {
    fireflies.push({
      bx: 40 + Math.random() * (W - 80),
      by: H * 0.6 + Math.random() * H * 0.25,
      ph: Math.random() * Math.PI * 2,
      sp: 0.3 + Math.random() * 0.4,
    });
  }

  // the bee: daytime counterpart to the fireflies. Wanders through roughly
  // once every 3 minutes and pauses at a dandelion flower if one's in bloom.
  // (?bee in the URL makes it show up almost immediately, for testing)
  const BEE_TEST = new URLSearchParams(location.search).has('bee');
  let bee = null;

  function stepBee(dt) {
    if (bee && tod.a < 0.05) {
      bee = null; // dusk sends it home
      return;
    }
    if (!bee) {
      if (tod.a > 0.1 && (BEE_TEST || Math.random() < dt / 180)) {
        const fromLeft = Math.random() < 0.5;
        bee = {
          x: fromLeft ? -20 : W + 20,
          vx: (fromLeft ? 1 : -1) * (45 + Math.random() * 25),
          baseY: H * (0.42 + Math.random() * 0.22),
          wob: Math.random() * Math.PI * 2,
          state: 'fly',
          target: null,
          visitT: 0,
          visited: false,
        };
      }
      return;
    }

    if (!bee.visited && bee.state === 'fly') {
      const fl = dandelions.find(
        (d) => d.stage === 'flower' && d.delay <= 0 && Math.abs(d.x - bee.x) < 30
      );
      if (fl) {
        bee.state = 'visit';
        bee.target = fl;
        bee.visitT = 2 + Math.random() * 1.5;
        bee.visited = true;
      }
    }

    if (bee.state === 'visit') {
      const d = bee.target;
      if (d.stage !== 'flower' || !dandelions.includes(d)) {
        bee.state = 'fly'; // the flower moved on (or got mowed out from under it)
      } else {
        const hx = d.x;
        const hy = d.baseY - d.maxStem * Math.min(1, d.growth) - 9;
        bee.x += (hx - bee.x) * Math.min(1, dt * 6);
        bee.baseY += (hy - bee.baseY) * Math.min(1, dt * 6);
        bee.visitT -= dt;
        if (bee.visitT <= 0) bee.state = 'fly';
      }
    } else {
      bee.x += bee.vx * dt;
    }

    if (bee.x < -30 || bee.x > W + 30) bee = null;
  }

  // ---------- lawn ----------
  const PALETTES = [
    ['#2c7d3a', '#256c32'], // back layer, darkest
    ['#3aa04a', '#318b40'],
    ['#4fbe58', '#42aa4d'], // front layer, brightest
  ];
  const CLIPPING_GREENS = ['#4fbe58', '#3aa04a', '#6fd478'];

  function mulberry32(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seeded, so the identical lawn regenerates every open — that's what lets
  // saved per-blade heights (your actual cut pattern) survive close/reopen.
  function makeLawn(seed) {
    const rnd = mulberry32(seed);
    blades.length = 0;
    for (let layer = 0; layer < 3; layer++) {
      if (layer === 2) frontStart = blades.length;
      const count = 85 + layer * 20;
      for (let i = 0; i < count; i++) {
        const fullLen = H * 0.28 * (0.7 + rnd() * 0.6) * (0.82 + layer * 0.13);
        blades.push({
          x: rnd() * W,
          baseY: H - 6 - (2 - layer) * 8 + rnd() * 6,
          fullLen,
          len: fullLen,
          w: 2.2 + rnd() * 2.2 + layer * 0.6,
          lean: (rnd() - 0.5) * 0.24,
          bend: 0,
          vel: 0,
          phase: rnd() * Math.PI * 2,
          color: PALETTES[layer][rnd() < 0.5 ? 0 : 1],
          cutFlatLen: -1, // length at last cut; top narrows back to a point as it regrows
        });
      }
    }
  }

  function startFullyCut() {
    for (const b of blades) {
      b.len = b.fullLen * (STUB + Math.random() * 0.04);
      b.cutFlatLen = b.len;
    }
    mowLatch = true; // a lawn that starts cut shouldn't chime
  }

  // ---------- dandelions ----------
  // lifecycle: growing (2x grass speed) → flower → puff → blowing → wilting → dead.
  // A puff that finishes blowing seeds 3 new plants; a cut kills the plant outright.
  const DANDELION_GROW = REGROW * 2;
  const FLOWER_TIME = 36; // long dwell — this lives in the background of a workday
  const PUFF_TIME = 30;
  const BLOW_TIME = 1.8;
  const WILT_TIME = 4;
  const MAX_DANDELIONS = 24;
  const OFFLINE_SCALE = 0.1;   // lifecycle runs at 1/10 speed while the popup is closed
  let windSeedIn = 40 + Math.random() * 40; // empty lawn: a seed drifts in eventually

  function makeDandelion() {
    return {
      x: W * (0.1 + Math.random() * 0.8),
      baseY: H - 10 - Math.random() * 10,
      maxStem: 150 + Math.random() * 35, // heads clear the grass line (tallest blade ≈ 157)
      growth: 0,
      stage: 'growing',
      stageT: 0,
      delay: 5 + Math.random() * 10,
      // per-plant stage durations desync siblings — growth RATE stays 2x grass
      flowerFor: FLOWER_TIME * (0.6 + Math.random()),
      puffFor: PUFF_TIME * (0.6 + Math.random()),
    };
  }

  // Seeds don't all germinate at once: dormancy spans minutes, so a brood
  // from one puff arrives as scattered individuals, not a generation.
  function seedDormancy() {
    return 5 + Math.random() * 240;
  }

  // fresh-install lawn: one in bloom, one gone to seed, one on the way
  function defaultDandelions() {
    dandelions.length = 0;
    dandelions.push(
      Object.assign(makeDandelion(), { delay: 0, growth: 1, stage: 'flower', stageT: Math.random() * 5 }),
      Object.assign(makeDandelion(), { delay: 0, growth: 1, stage: 'puff', stageT: Math.random() * 6 }),
      Object.assign(makeDandelion(), { delay: 0, growth: 0.35 })
    );
  }

  // as an extension, the world is built once storage loads (see persistence);
  // standalone in a tab it's the fully-grown dev/tuning lawn
  if (!hasChrome) {
    makeLawn((Math.random() * 0xffffffff) | 0);
    defaultDandelions();
    // ?mowed: pre-cut a wavy swath — for demos and store screenshots
    if (new URLSearchParams(location.search).has('mowed')) {
      for (const b of blades) {
        if (b.x > 140 && b.x < 460) {
          const cutLen = b.fullLen * (0.16 + 0.1 * Math.sin(b.x * 0.02));
          if (b.len > cutLen) {
            b.len = cutLen;
            b.cutFlatLen = cutLen;
          }
        }
      }
    }
  }

  function spawnSeedlings() {
    const brood = 2 + (Math.random() < 0.5 ? 1 : 0);
    let spawned = 0;
    while (spawned < brood && dandelions.length < MAX_DANDELIONS) {
      const child = makeDandelion();
      child.delay = seedDormancy();
      dandelions.push(child);
      spawned++;
    }
    if (spawned) saveWorld();
  }

  function startBlowing(d) {
    d.stage = 'blowing';
    d.stageT = 0;
    emitSeeds(d, 8);
    Sfx.whoosh();
    spawnSeedlings();
  }

  function emitSeeds(d, n) {
    const g = Math.min(1, d.growth);
    const headX = d.x;
    const headY = d.baseY - d.maxStem * g;
    for (let i = 0; i < n; i++) {
      if (particles.length > 240) return;
      particles.push({
        x: headX + (Math.random() - 0.5) * 10,
        y: headY + (Math.random() - 0.5) * 10,
        vx: 30 + Math.random() * 90,
        vy: -20 - Math.random() * 35,
        g: 18, // seeds float, they don't fall
        r: 1.3 + Math.random() * 1.1,
        life: 1.6 + Math.random() * 1.2,
        color: '#ffffff',
      });
    }
  }

  // Advance one plant by `s` seconds analytically (for time passed while the
  // popup was closed). Returns 'alive', 'seeded' (blew — plant is dead, and
  // d.leftover holds the seconds remaining after the blow), or 'dead'.
  function advancePlant(d, s) {
    if (d.delay > 0) {
      if (s <= d.delay) { d.delay -= s; return 'alive'; }
      s -= d.delay;
      d.delay = 0;
    }
    if (d.stage === 'growing') {
      const need = (1 - d.growth) / DANDELION_GROW;
      if (s <= need) { d.growth += DANDELION_GROW * s; return 'alive'; }
      s -= need;
      d.growth = 1;
      d.stage = 'flower';
      d.stageT = 0;
    }
    if (d.stage === 'flower') {
      const need = (d.flowerFor || FLOWER_TIME) - d.stageT;
      if (s <= need) { d.stageT += s; return 'alive'; }
      s -= need;
      d.stage = 'puff';
      d.stageT = 0;
    }
    if (d.stage === 'puff') {
      const need = (d.puffFor || PUFF_TIME) - d.stageT;
      if (s <= need) { d.stageT += s; return 'alive'; }
      d.leftover = s - need;
      return 'seeded';
    }
    if (d.stage === 'blowing') {
      // already seeded when the blow started in-session
      const need = BLOW_TIME - d.stageT;
      if (s <= need) { d.stageT += s; return 'alive'; }
      s -= need;
      d.stage = 'wilting';
      d.stageT = 0;
    }
    if (d.stage === 'wilting') {
      const need = WILT_TIME - d.stageT;
      if (s <= need) { d.stageT += s; return 'alive'; }
      return 'dead';
    }
    return 'alive';
  }

  function simulateOffline(saved, secs) {
    const queue = saved.map((p) => ({ p, s: secs }));
    const alive = [];
    let guard = 200; // seeding cascades; the cap bounds it, this is a backstop
    while (queue.length && guard-- > 0) {
      const { p, s } = queue.shift();
      const res = advancePlant(p, s);
      if (res === 'alive') {
        if (alive.length < MAX_DANDELIONS) alive.push(p);
      } else if (res === 'seeded') {
        const rem = p.leftover || 0;
        const brood = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < brood && alive.length + queue.length < MAX_DANDELIONS; i++) {
          const c = makeDandelion();
          c.delay = seedDormancy();
          queue.push({ p: c, s: rem });
        }
      }
    }
    if (!alive.length) {
      // the wind always brings one back
      const c = makeDandelion();
      if (secs > 120) c.growth = Math.random() * 0.6;
      else c.delay = 20 + Math.random() * 30;
      alive.push(c);
    }
    return alive;
  }

  // A truly neglected lawn should already be a mess of dandelions, not just
  // tall grass — real lawns fill with weeds well before the grass itself
  // finishes regrowing. simulateOffline() cascades generations through the
  // full growth→flower→puff→dormancy chain, which realistically takes many
  // hours to reach a full population; this tops the result up toward max
  // based on real (unscaled) time away, so "a while" reads as an infestation
  // the way it would outside. Ramps from a light scattering to fully overrun.
  const INFESTATION_STARTS = 15 * 60;  // 15 real minutes: weeds start piling up
  const FULL_INFESTATION = 90 * 60;    // 90 real minutes: lawn is fully overrun

  function spawnNeglectDandelion() {
    const d = makeDandelion();
    d.delay = 0;
    const roll = Math.random();
    if (roll < 0.3) {
      d.growth = 0.3 + Math.random() * 0.65;
    } else if (roll < 0.65) {
      d.growth = 1;
      d.stage = 'flower';
      d.stageT = Math.random() * d.flowerFor;
    } else {
      d.growth = 1;
      d.stage = 'puff';
      d.stageT = Math.random() * d.puffFor;
    }
    return d;
  }

  function topUpForNeglect(elapsedReal) {
    if (elapsedReal < INFESTATION_STARTS) return;
    const t = Math.min(1, (elapsedReal - INFESTATION_STARTS) / (FULL_INFESTATION - INFESTATION_STARTS));
    const target = Math.round(dandelions.length + t * (MAX_DANDELIONS - dandelions.length));
    while (dandelions.length < target && dandelions.length < MAX_DANDELIONS) {
      dandelions.push(spawnNeglectDandelion());
    }
  }

  function saveWorld() {
    if (!hasChrome || !blades.length) return;
    chrome.storage.local.set({
      grass: blades.map((b) => [
        Math.round((b.len / b.fullLen) * 1000) / 1000,
        b.cutFlatLen > 0 ? Math.round((b.cutFlatLen / b.fullLen) * 1000) / 1000 : 0,
      ]),
      dandelions: dandelions.map((d) => ({
        x: d.x, baseY: d.baseY, maxStem: d.maxStem,
        growth: d.growth, stage: d.stage, stageT: d.stageT, delay: d.delay,
        flowerFor: d.flowerFor, puffFor: d.puffFor,
      })),
      worldSavedAt: Date.now(),
    });
  }

  // ---------- physics ----------
  const SPRING = 14;
  const DAMP = 5.2;

  function wind(t, x, phase) {
    return 0.06 * Math.sin(t * 0.9 + x * 0.015 + phase) +
           0.03 * Math.sin(t * 2.3 + x * 0.045);
  }

  function step(dt, t) {
    updateTOD(dt);

    const px = pointer.x;
    const py = pointer.y;
    const speed = Math.abs(pointer.vx);
    let nearLen = 0; // average grass height under the pointer drives rustle volume
    let nearN = 0;

    for (const b of blades) {
      let target = b.lean + wind(t, b.x, b.phase);

      const dx = b.x - px;
      const adx = Math.abs(dx);
      if (adx < 70) {
        nearLen += b.len / b.fullLen;
        nearN++;
      }
      const overBlade = py > b.baseY - b.len - 20 && py < b.baseY + 14;
      if (adx < 70 && overBlade) {
        const fall = 1 - adx / 70;
        // part around the cursor
        target += Math.sign(dx || 1) * 0.5 * fall * fall;
        // brushing pushes blades with pointer velocity
        if (speed > 40) b.vel += pointer.vx * 0.012 * fall;
      }

      const acc = SPRING * (target - b.bend) - DAMP * b.vel;
      b.vel += acc * dt;
      b.bend += b.vel * dt;
      if (b.bend > 1.4) { b.bend = 1.4; b.vel *= -0.3; }
      else if (b.bend < -1.4) { b.bend = -1.4; b.vel *= -0.3; }

      if (b.len < b.fullLen) {
        b.len = Math.min(b.fullLen, b.len + b.fullLen * REGROW * dt);
      }
    }

    if (pointer.down && px >= 0 && px <= W && py >= 0) mowAt(px, py);

    // continuous rustle while sweeping through the grass zone; the volume
    // curve soft-saturates so fast flicks get louder gently, never blast.
    // Tall grass rustles, fresh stubble is almost silent.
    if (speed > 60 && px >= 0 && px <= W && py > H * 0.5) {
      const avg = nearN ? nearLen / nearN : 0;
      const lenAmp = Math.pow(Math.max(0, (avg - 0.15) / 0.85), 1.2);
      Sfx.brush((speed / (speed + 900)) * lenAmp);
    }

    pointer.vx *= Math.pow(0.05, dt);

    stepDandelions(dt);
    stepBee(dt);

    // buzz follows the bee: fades at the edges, pans with its position, and
    // stops while it's landed on a flower (wings folded, nothing to hear)
    if (bee) {
      const edge = Math.min(1, Math.max(0, Math.min(bee.x + 20, W + 20 - bee.x) / 80));
      Sfx.beeBuzz(bee.state === 'visit' ? 0 : edge, (bee.x / W) * 2 - 1);
    } else {
      Sfx.beeBuzz(0, 0);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > H) particles.splice(i, 1);
    }

    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > W + 10) c.x = -c.w * c.s - 10;
    }

    mowCheckT += dt;
    if (mowCheckT > 0.5) {
      mowCheckT = 0;
      checkMowState();
    }
  }

  // Chop everything under the pointer flat at the height of the touch.
  function mowAt(px, py) {
    let cuts = 0;
    for (const b of blades) {
      if (Math.abs(b.x - px) > CUT_RADIUS) continue;
      const cutLen = Math.max(b.fullLen * STUB, b.baseY - py);
      if (b.len > cutLen + 2) {
        b.len = cutLen;
        b.cutFlatLen = cutLen;
        b.vel += (Math.random() - 0.5) * 5;
        cuts++;
        if (particles.length < 240 && Math.random() < 0.5) {
          particles.push({
            x: b.x + (Math.random() - 0.5) * 6,
            y: b.baseY - cutLen - 4,
            vx: pointer.vx * 0.12 + (Math.random() - 0.5) * 60,
            vy: -40 - Math.random() * 70,
            g: 500,
            r: 1.6 + Math.random() * 1.6,
            life: 0.5 + Math.random() * 0.4,
            color: CLIPPING_GREENS[(Math.random() * CLIPPING_GREENS.length) | 0],
          });
        }
      }
    }

    // cutting a dandelion kills it — root and all
    for (let i = dandelions.length - 1; i >= 0; i--) {
      const d = dandelions[i];
      if (d.delay > 0 || d.growth <= 0.05 || d.stage === 'wilting') continue;
      if (Math.abs(d.x - px) > CUT_RADIUS) continue;
      const stemH = d.maxStem * Math.min(1, d.growth);
      const cutH = Math.max(8, d.baseY - py);
      if (stemH > cutH + 4) {
        const headY = d.baseY - stemH;
        if (d.stage === 'flower') {
          burst(d.x, headY, ['#ffd93d', '#ffc300', '#ff9f1c'], 10, 180);
        } else if (d.stage === 'puff' || d.stage === 'blowing') {
          // seeds fall harmlessly — no spread from a cut puff
          burst(d.x, headY, ['#ffffff', '#e8e4da'], 12, 160);
        } else {
          burst(d.x, headY, ['#3a7d44', '#4fbe58'], 6, 140);
        }
        Sfx.pop();
        dandelions.splice(i, 1);
        saveWorld();
        cuts++;
      }
    }

    if (cuts > 0) Sfx.rustle(Math.min(1, 0.3 + cuts * 0.05));
  }

  function stepDandelions(dt) {
    for (let i = dandelions.length - 1; i >= 0; i--) {
      const d = dandelions[i];
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      if (d.stage === 'growing') {
        d.growth += DANDELION_GROW * dt;
        if (d.growth >= 1) {
          d.growth = 1;
          d.stage = 'flower';
          d.stageT = 0;
        }
      } else if (d.stage === 'flower') {
        d.stageT += dt;
        if (d.stageT > (d.flowerFor || FLOWER_TIME)) {
          d.stage = 'puff';
          d.stageT = 0;
        }
      } else if (d.stage === 'puff') {
        d.stageT += dt;
        if (d.stageT > (d.puffFor || PUFF_TIME)) startBlowing(d);
      } else if (d.stage === 'blowing') {
        d.stageT += dt;
        if (Math.random() < dt * 8) emitSeeds(d, 1);
        if (d.stageT > BLOW_TIME) {
          d.stage = 'wilting';
          d.stageT = 0;
        }
      } else if (d.stage === 'wilting') {
        d.stageT += dt;
        if (d.stageT > WILT_TIME) {
          dandelions.splice(i, 1);
          saveWorld();
        }
      }
    }

    if (!dandelions.length) {
      windSeedIn -= dt;
      if (windSeedIn <= 0) {
        const c = makeDandelion();
        c.delay = 2;
        dandelions.push(c);
        windSeedIn = 40 + Math.random() * 40;
        saveWorld();
      }
    }
  }

  function checkMowState() {
    if (!blades.length) return;
    let cut = 0;
    for (const b of blades) {
      if (b.len <= b.fullLen * 0.55) cut++;
    }
    const frac = cut / blades.length;
    if (!mowLatch && frac > MOWED_FRAC) {
      mowLatch = true;
      lawnMowed();
    } else if (mowLatch && frac < 0.25) {
      mowLatch = false;
    }
  }

  function lawnMowed() {
    stats.mowCount++;
    dirty = true;
    Sfx.ding();
    toast(pickMowLine());
    if (hasChrome && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'mowed' }).catch(() => {});
    }
  }

  // ---------- events ----------
  function burst(x, y, colors, n, spread) {
    for (let i = 0; i < n; i++) {
      if (particles.length > 240) return;
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.4 + Math.random() * 0.6);
      particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - spread * 0.7,
        g: 480,
        r: 1.5 + Math.random() * 2.2,
        life: 0.6 + Math.random() * 0.5,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dt = e.timeStamp - pointer.lastT;
    if (dt > 0 && dt < 100 && pointer.x > -900) {
      const vx = ((x - pointer.lastX) / dt) * 1000;
      pointer.vx = 0.7 * vx + 0.3 * pointer.vx;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.lastX = x;
    pointer.lastT = e.timeStamp;
    Sfx.ensure();
  });

  canvas.addEventListener('pointerdown', (e) => {
    Sfx.ensure();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    pointer.x = px;
    pointer.y = py;

    // clicking a puff blows it yourself — spreading the seeds on purpose
    for (const d of dandelions) {
      if (d.stage !== 'puff' || d.delay > 0) continue;
      const headY = d.baseY - d.maxStem;
      if (Math.hypot(px - d.x, py - headY) < 16) {
        startBlowing(d);
        return;
      }
    }
    pointer.down = true;
  });

  window.addEventListener('pointerup', () => { pointer.down = false; });

  canvas.addEventListener('pointerleave', () => {
    pointer.x = -999;
    pointer.y = -999;
    pointer.vx = 0;
    pointer.down = false;
  });

  // ---------- render ----------
  function drawBee(t) {
    if (!bee) return;
    const wobAmp = bee.state === 'visit' ? 3 : 12;
    const x = bee.x;
    const y = bee.baseY + Math.sin(t * 4 + bee.wob) * wobAmp;
    const dir = bee.vx >= 0 ? 1 : -1;

    // wings flutter fast in flight, fold while landed on a flower
    const flap = bee.state === 'visit'
      ? 0.15
      : 0.4 + 0.6 * Math.abs(Math.sin(t * 40 + bee.wob));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.ellipse(x - 1 * dir, y - 4.5, 2.6, 3.6 * flap, -0.5 * dir, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - 3.5 * dir, y - 3.8, 2.2, 3 * flap, -0.7 * dir, 0, Math.PI * 2);
    ctx.fill();

    // body + stripes + head
    ctx.fillStyle = '#ffce3a';
    ctx.beginPath();
    ctx.ellipse(x, y, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3b18';
    ctx.fillRect(x - 1.6, y - 3, 1.5, 6);
    ctx.fillRect(x + 1.2, y - 2.6, 1.3, 5.2);
    ctx.beginPath();
    ctx.arc(x + 5.2 * dir, y - 0.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSky(t) {
    const { a, dayFrac, h } = tod;
    const [top, bottom] = skyColors(a);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, top);
    sky.addColorStop(0.75, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (a < 0.05) {
      const sa = Math.min(1, (0.05 - a) / 0.3);
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = sa * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.tw)));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (a > -0.06) {
      const sunX = 50 + (W - 100) * Math.min(1, Math.max(0, dayFrac));
      const sunY = H * 0.66 - Math.max(0, a) * H * 0.55;
      const warm = Math.min(1, Math.max(0, (0.35 - a) / 0.35)); // redder near the horizon
      ctx.fillStyle = mixHex('#ffec96', '#ffb45e', warm);
      ctx.beginPath();
      ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 40 + warm * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (a < 0) {
      const nightLen = 24 - (SUNSET - SUNRISE);
      const nh = ((h - SUNSET) + 24) % 24;
      const mf = Math.min(1, nh / nightLen);
      const mx = 50 + (W - 100) * mf;
      const my = H * 0.6 - Math.sin(mf * Math.PI) * H * 0.5;
      const r = 20;
      ctx.globalAlpha = Math.min(1, -a * 5);

      // dark side: barely lighter than the sky, so a new moon is a ghost disc
      ctx.fillStyle = '#2f3850';
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();

      // lit side: a semicircle plus an elliptical terminator. k runs from
      // 1 (new) to -1 (full); the ellipse's x-radius is r·|k|, and which way
      // it bulges decides crescent vs gibbous.
      const waxing = MOON_PHASE < 0.5;
      const k = Math.cos(MOON_PHASE * Math.PI * 2);
      if (k < 0.98) {
        ctx.fillStyle = '#f2eede';
        ctx.beginPath();
        ctx.arc(mx, my, r, -Math.PI / 2, Math.PI / 2, !waxing);
        ctx.ellipse(mx, my, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2,
          waxing ? k > 0 : k < 0);
        ctx.fill();
        // craters once the disc is mostly lit
        if (k < -0.3) {
          ctx.fillStyle = 'rgba(190, 182, 160, 0.55)';
          for (const [ox, oy, cr] of [[-6, -4, 4], [5, 3, 3], [-2, 8, 2.2]]) {
            ctx.beginPath();
            ctx.arc(mx + ox, my + oy, cr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // clouds fade way down at night
    const cloudAlpha = 0.9 * (0.2 + 0.8 * Math.min(1, Math.max(0, (tod.L - 0.55) / 0.45)));
    ctx.globalAlpha = cloudAlpha;
    for (const c of clouds) {
      ctx.drawImage(c.sprite, c.x, c.y, c.w * c.s, c.h * c.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawBlade(b) {
    // A cut blade has a flat top that narrows back to a point as it regrows —
    // one continuous shape, so there's no visual jump at any moment.
    let tipW = 0;
    if (b.cutFlatLen > 0) {
      const regrown = (b.len - b.cutFlatLen) / (b.fullLen * 0.18);
      if (regrown < 1) tipW = b.w * 0.8 * (1 - Math.max(0, regrown));
    }
    const tipX = b.x + b.bend * b.len * 0.65;
    const tipY = b.baseY - b.len * (1 - 0.18 * b.bend * b.bend);
    const cx = b.x + b.bend * b.len * 0.22;
    const cy = b.baseY - b.len * 0.5;
    ctx.fillStyle = shaded(b.color);
    ctx.beginPath();
    ctx.moveTo(b.x - b.w, b.baseY);
    ctx.quadraticCurveTo(cx - b.w * 0.4, cy, tipX - tipW, tipY);
    if (tipW > 0.05) ctx.lineTo(tipX + tipW, tipY);
    ctx.quadraticCurveTo(cx + b.w * 0.4, cy, b.x + b.w, b.baseY);
    ctx.closePath();
    ctx.fill();
  }

  function drawDandelion(d, t) {
    if (d.delay > 0 || d.growth <= 0.02) return;
    const g = Math.min(1, d.growth);
    const stemH = d.maxStem * g;
    const sway = wind(t, d.x, 0) * 18 * g;
    let headX = d.x + sway;
    let headY = d.baseY - stemH;

    let alpha = 1;
    let stemColor = '#2c7d3a';
    if (d.stage === 'wilting') {
      const w = d.stageT / WILT_TIME;
      alpha = Math.max(0, 1 - w);
      stemColor = '#9a7b4f';
      headX += w * 14;
      headY += w * 30;
    }
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = shaded(stemColor);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(d.x, d.baseY);
    ctx.quadraticCurveTo(d.x + sway * 0.3, d.baseY - stemH * 0.55, headX, headY);
    ctx.stroke();

    // Heads morph between stages: the bud scales in as the plant grows, melts
    // away as the flower opens, the flower folds shut as the puff swells, and
    // the puff empties as it blows. No state ever pops into place.
    const ease = (v) => {
      const k = Math.min(1, Math.max(0, v));
      return k * k * (3 - 2 * k);
    };
    let budS = 0;
    let flowerS = 0;
    let puffS = 0;   // head size (grows in as the puff forms)
    let puffRem = 1; // fraction of seeds still attached (drops while blowing)
    if (d.stage === 'growing') {
      budS = ease((g - 0.5) / 0.15);
    } else if (d.stage === 'flower') {
      const open = ease(d.stageT / 1.5);
      budS = 1 - open;
      flowerS = open;
    } else if (d.stage === 'puff') {
      const open = ease(d.stageT / 1.5);
      flowerS = 1 - open;
      puffS = open;
    } else if (d.stage === 'blowing') {
      puffS = 1;
      puffRem = Math.max(0, 1 - d.stageT / BLOW_TIME);
    }
    // wilting: all zero — bare drooping stem

    if (budS > 0.03) {
      ctx.fillStyle = shaded('#3a7d44');
      ctx.beginPath();
      ctx.ellipse(headX, headY, 3.2 * budS, 4.4 * budS, sway * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }

    if (flowerS > 0.03) {
      ctx.globalAlpha = alpha * flowerS;
      ctx.strokeStyle = shaded('#ffd93d');
      ctx.lineWidth = 2.4 * flowerS;
      for (let k = 0; k < 10; k++) {
        const ang = (k * Math.PI) / 5 + sway * 0.02;
        ctx.beginPath();
        ctx.moveTo(headX + Math.cos(ang) * 3 * flowerS, headY + Math.sin(ang) * 3 * flowerS);
        ctx.lineTo(headX + Math.cos(ang) * 7.5 * flowerS, headY + Math.sin(ang) * 7.5 * flowerS);
        ctx.stroke();
      }
      ctx.fillStyle = shaded('#ffc300');
      ctx.beginPath();
      ctx.arc(headX, headY, 4.2 * flowerS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shaded('#ff9f1c');
      ctx.beginPath();
      ctx.arc(headX, headY, 2 * flowerS, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    if (puffS > 0.03 && puffRem > 0.02) {
      // a dandelion clock is mostly air: a faint halo, thin radial filaments,
      // and a speck of fluff at each tip. Blowing removes filaments one by
      // one rather than shrinking the head.
      const R = 10 * puffS;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * puffRem})`;
      ctx.beginPath();
      ctx.arc(headX, headY, R * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // white reads against the night sky, but washes out against a pale day
      // sky — so daylight gets grey-tinted filaments and ringed specks
      const daylight = tod.L > 0.85;
      const filament = daylight ? 'rgba(150, 172, 176, 0.6)' : 'rgba(250, 250, 245, 0.55)';
      for (let k = 0; k < 14; k++) {
        // each seed has a stable random draw-order, so the head balds in a
        // scattered pattern instead of sweeping around like a clock hand
        const order = 0.5 + 0.5 * Math.sin(k * 78.233 + d.x * 7.13);
        if (order > puffRem) continue;
        const ang = (k * Math.PI * 2) / 14 + sway * 0.02 + d.x * 0.1;
        const len = R * (0.9 + 0.1 * Math.sin(k * 12.9898 + d.x));
        const tx = headX + Math.cos(ang) * len;
        const ty = headY + Math.sin(ang) * len;
        ctx.strokeStyle = filament;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(headX + Math.cos(ang) * 2, headY + Math.sin(ang) * 2);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.1, 0, Math.PI * 2);
        ctx.fill();
        if (daylight) {
          ctx.strokeStyle = 'rgba(140, 162, 166, 0.55)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      // receptacle
      ctx.fillStyle = shaded('#cfc5b2');
      ctx.beginPath();
      ctx.arc(headX, headY, 2.2 * puffS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  function draw(t) {
    drawSky(t);

    // ground base under the blades
    ctx.fillStyle = shaded('#236130');
    ctx.fillRect(0, H - 24, W, 24);

    for (let i = 0; i < frontStart; i++) drawBlade(blades[i]);
    for (const d of dandelions) drawDandelion(d, t);
    for (let i = frontStart; i < blades.length; i++) drawBlade(blades[i]);

    drawBee(t);

    if (tod.a < -0.05) {
      // fireflies ease in with the darkness rather than switching on
      const fA = Math.min(1, (-tod.a - 0.05) / 0.08);
      for (const f of fireflies) {
        const fx = f.bx + Math.sin(t * f.sp + f.ph) * 46;
        const fy = f.by + Math.sin(t * f.sp * 1.37 + f.ph * 2.1) * 16;
        const pulse = Math.max(0, Math.sin(t * 1.8 + f.ph * 3)) * fA;
        if (pulse < 0.05) continue;
        ctx.globalAlpha = 0.25 * pulse;
        ctx.fillStyle = '#ffe97a';
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * pulse;
        ctx.fillStyle = '#fff4b8';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = shaded(p.color);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- UI ----------
  const timeChip = document.getElementById('timeChip');
  const soundBtn = document.getElementById('soundBtn');
  const toastEl = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  let toastTimer = 0;

  function toast(msg) {
    toastMsg.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 10000);
  }

  document.getElementById('toastClose').addEventListener('click', () => {
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
  });

  // ?clean hides the UI — for promo shots
  if (new URLSearchParams(location.search).has('clean')) {
    document.getElementById('chips').style.display = 'none';
    soundBtn.style.display = 'none';
    document.getElementById('coffeeBtn').style.display = 'none';
  }

  function updateChips() {
    timeChip.textContent = `⏱ ${stats.minutesToday}m online today`;
  }

  function updateSoundBtn() {
    soundBtn.textContent = stats.soundOn ? '🔊' : '🔇';
    Sfx.setEnabled(stats.soundOn);
  }

  soundBtn.addEventListener('click', () => {
    stats.soundOn = !stats.soundOn;
    updateSoundBtn();
    if (stats.soundOn) Sfx.ensure();
    if (hasChrome) chrome.storage.local.set({ soundOn: stats.soundOn });
  });

  // ---------- persistence ----------
  if (hasChrome) {
    chrome.storage.local.get(
      {
        mowCount: 0, minutesToday: 0, soundOn: true,
        lawnSeed: null, grass: null, dandelions: null,
        worldSavedAt: 0, dandySavedAt: 0,
      },
      (data) => {
        stats.mowCount = data.mowCount;
        stats.minutesToday = data.minutesToday;
        stats.soundOn = data.soundOn;
        updateChips();
        updateSoundBtn();

        let seed = data.lawnSeed;
        if (typeof seed !== 'number') {
          seed = (Math.random() * 0xffffffff) | 0;
          chrome.storage.local.set({ lawnSeed: seed });
        }
        makeLawn(seed);

        const savedAt = data.worldSavedAt || data.dandySavedAt || Date.now();
        const elapsedReal = Math.min(86400, Math.max(0, (Date.now() - savedAt) / 1000));
        const offline = elapsedReal * OFFLINE_SCALE;

        if (Array.isArray(data.grass) && data.grass.length === blades.length) {
          for (let i = 0; i < blades.length; i++) {
            const b = blades[i];
            const [lenR, cutR] = data.grass[i];
            b.len = Math.min(b.fullLen, b.fullLen * lenR + b.fullLen * REGROW * offline);
            b.cutFlatLen = cutR > 0 ? b.fullLen * cutR : -1;
          }
        } else {
          startFullyCut(); // first run: the lawn begins freshly mowed
        }
        // arm the latch from the restored state so reopening a short lawn
        // doesn't immediately chime
        let cut = 0;
        for (const b of blades) if (b.len <= b.fullLen * 0.55) cut++;
        mowLatch = cut / blades.length > MOWED_FRAC;

        if (Array.isArray(data.dandelions)) {
          const revived = simulateOffline(data.dandelions, offline);
          dandelions.length = 0;
          dandelions.push(...revived);
          topUpForNeglect(elapsedReal);
          // plants saved under older tuning adopt the current ranges
          for (const d of dandelions) {
            if (!(d.maxStem >= 150)) d.maxStem = 150 + Math.random() * 35;
            if (!(d.flowerFor >= FLOWER_TIME * 0.6)) {
              d.flowerFor = FLOWER_TIME * (0.6 + Math.random());
            }
            if (!(d.puffFor >= PUFF_TIME * 0.6)) {
              d.puffFor = PUFF_TIME * (0.6 + Math.random());
            }
          }
        } else {
          defaultDandelions();
        }
        saveWorld();
      }
    );

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.minutesToday) {
        stats.minutesToday = changes.minutesToday.newValue;
        updateChips();
      }
    });

    let saveTick = 0;
    setInterval(() => {
      if (dirty) {
        dirty = false;
        chrome.storage.local.set({ mowCount: stats.mowCount });
      }
      if (++saveTick % 5 === 0) saveWorld(); // capture cut pattern + lifecycle
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (dirty) chrome.storage.local.set({ mowCount: stats.mowCount });
        saveWorld();
      }
    });
  } else {
    updateChips();
    updateSoundBtn();
  }

  // ---------- main loop ----------
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    step(dt, t);
    draw(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
