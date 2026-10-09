// The scrub test as a real 3D car, drawn with three.js.
// Mud lives in textures on the car's surface, so it turns with the car.

const ui = {
  section: document.getElementById('scrub'),
  stage: document.getElementById('bayStage'),
  status: document.getElementById('bayStatus'),
  fx: document.getElementById('fx'),
  tip: document.getElementById('bayTip'),
  hint: document.getElementById('bayHint'),
  meter: document.getElementById('meter'),
  meterFill: document.getElementById('meterFill'),
  meterValue: document.getElementById('meterValue'),
  autoBtn: document.getElementById('autoWash'),
  muddyBtn: document.getElementById('muddy'),
  doneText: document.getElementById('bayDone'),
  turnBox: document.getElementById('bayTurn'),
  turnLeft: document.getElementById('turnLeft'),
  turnRight: document.getElementById('turnRight'),
};

function showCarUnavailable(reason) {
  console.warn('3D car unavailable:', reason);
  ui.stage.querySelector('.car3d')?.remove();
  ui.status.hidden = false;
  ui.status.textContent = 'The interactive car is unavailable on this browser. You can still view prices and book a wash below.';
  ui.tip.hidden = true;
  ui.turnBox.hidden = true;
  ui.autoBtn.disabled = true;
  ui.muddyBtn.hidden = true;
  ui.meter.hidden = true;
}

let THREE = null;
try {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('this browser cannot draw 3D');
  THREE = await import('./vendor/three.module.min.js');
} catch (err) {
  showCarUnavailable(err.message || err);
}
if (THREE) {
  try {
    const { carParts } = await import('./assets/car/index.js');
    start(THREE, carParts);
  } catch (err) {
    showCarUnavailable(err.message || err);
  }
}

function start(T, carParts) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RUBS = 3;           // rubs it takes to get a spot fully clean
  const DONE_AT = 0.9;      // how clean overall before the last bits rinse off
  const BRUSH = 0.2;        // sponge radius, meters
  const SWEEP_MS = 1300;    // one "Wash it for me" sweep

  /* ---------- Shape: the 2D side profile, in meters ---------- */
  const S = 4.6 / 437;                    // meters per drawing unit (the drawing is 437 units long)
  const MID = 242.5, GROUND = 232;        // drawing x of the car's middle, drawing y of the ground
  const toX = (sx) => (sx - MID) * S;     // drawing x -> meters along the car; the front is +x
  const toY = (sy) => (GROUND - sy) * S;  // drawing y -> meters above the ground
  const toSY = (y) => GROUND - y / S;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Top and bottom edge of an SVG shape for every x, found by drawing it and scanning columns.
  function edges(d) {
    const K = 2, W = 480 * K, H = 250 * K;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.scale(K, K);
    g.fill(new Path2D(d));
    const a = g.getImageData(0, 0, W, H).data;
    const top = new Float32Array(W).fill(NaN), bot = new Float32Array(W).fill(NaN);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) if (a[(y * W + x) * 4 + 3] > 127) { top[x] = y / K; break; }
      for (let y = H - 1; y >= 0; y--) if (a[(y * W + x) * 4 + 3] > 127) { bot[x] = (y + 1) / K; break; }
    }
    const smooth = (arr) => arr.map((v, i) => {
      let s = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const w = arr[i + k]; if (w !== undefined && w === w) { s += w; n++; } }
      return n ? s / n : v;
    });
    const tS = smooth(top), bS = smooth(bot);
    const at = (arr, sx) => {
      const f = sx * K, i = Math.floor(f), t = f - i;
      const a0 = arr[clamp(i, 0, W - 1)], a1 = arr[clamp(i + 1, 0, W - 1)];
      return a0 + (a1 - a0) * t;
    };
    return { top: (sx) => at(tS, sx), bot: (sx) => at(bS, sx) };
  }
  // Profiles are modeling data for the 3D loft, not a rendered fallback car.
  const bodyEdge = edges('M40 124Q76 116 112 118L338 118Q392 122 446 134Q462 140 461 160L459 180Q457 194 440 196L406 196A38 38 0 1 0 330 196L156 196A38 38 0 1 0 80 196L44 196Q28 194 26 180L24 150Q24 128 40 124Z');
  const cabinEdge = edges('M108 120L168 74Q178 64 196 62Q236 57 276 62Q290 64 300 72L352 120Z');

  // Each part is a loft of cross-sections along the car. A body section has a tucked-in rocker,
  // a wide shoulder, a crisp edge where the side meets the hood or trunk, and a slightly crowned top.
  // The cabin's sides lean in toward the roof. The body's ends get rounded caps.
  const BODY = {
    sx0: 25, sx1: 460, steps: 180, ring: 112, w: 0.92, endR: 0.42, minPlan: 0.62, dome: 0.12, capT: 0.05, edge: bodyEdge,
    shape: (w, yb, yt) => [[0, yb, 0], [w * 0.93, yb, 0.06], [w, yb + 0.62 * (yt - yb), 0.3], [w * 0.9, yt, 0.075], [0, yt + 0.015, 0.5]],
  };
  const CABIN = {
    sx0: 110, sx1: 350, steps: 120, ring: 80, w: 0.82, endR: 0.06, minPlan: 0.03, dome: 0, capT: 0, edge: cabinEdge, bottom: toY(124),
    shape: (w, yb, yt) => [[0, yb, 0], [w, yb, 0.03], [w * 0.76, yt, 0.08], [0, yt + 0.02, 0.45]],
  };

  function section(spec, t) {
    let tt = t, dome = 0, end = 0;
    if (spec.capT && t < spec.capT) { dome = 1 - t / spec.capT; tt = 0; end = -1; }
    else if (spec.capT && t > 1 - spec.capT) { dome = (t - (1 - spec.capT)) / spec.capT; tt = 1; end = 1; }
    else if (spec.capT) tt = (t - spec.capT) / (1 - 2 * spec.capT);
    const sxA = spec.sx0 + spec.dome / S, sxB = spec.sx1 - spec.dome / S;
    const sx = sxA + (sxB - sxA) * tt;
    let yb = spec.bottom !== undefined ? spec.bottom : toY(spec.edge.bot(sx));
    if (!(yb === yb)) yb = toY(196);
    let yt = toY(spec.edge.top(sx));
    if (!(yt > yb + 0.004)) yt = yb + 0.004;
    const d = Math.min(tt, 1 - tt) * (sxB - sxA) * S;   // meters to the nearer end
    const plan = d < spec.endR ? Math.sqrt(Math.max(0, 1 - ((spec.endR - d) / spec.endR) ** 2)) : 1;
    // Slightly fuller fenders and a tucked waist keep the sides from looking extruded.
    const fender = spec === BODY ? 1 + 0.018 * (Math.exp(-(((sx - 118) / 34) ** 2)) + Math.exp(-(((sx - 368) / 34) ** 2))) : 1;
    const w = spec.w * Math.max(plan, spec.minPlan) * fender;
    let k = 1, x = toX(sx);
    if (dome > 0) {   // shrink toward the middle of the end, like the front of an egg
      const phi = dome * Math.PI / 2;
      k = Math.cos(phi);
      x += end * spec.dome * Math.sin(phi);
    }
    const yc = (yt + yb) / 2;
    return { sx, x, yt, yb, yc, w, k, end: dome > 0 ? end : 0, outline: outline(spec.shape(w, yb, yt)) };
  }

  // Rounds the corners of the half outline, mirrors it, and resamples it evenly by length:
  // v = 0 bottom middle, 0.25 the +z side, 0.5 top middle, 0.75 the -z side.
  const SAMPLES = 256;
  function outline(half) {
    const poly = half.concat(half.slice(1, -1).reverse().map(([z, y, r]) => [-z, y, r]));
    const n = poly.length, pts = [];
    for (let i = 0; i < n; i++) {
      const [z, y, r] = poly[i], prev = poly[(i + n - 1) % n], next = poly[(i + 1) % n];
      const li = Math.hypot(z - prev[0], y - prev[1]), lo = Math.hypot(next[0] - z, next[1] - y);
      const cut = Math.min(r, li * 0.45, lo * 0.45);
      if (cut < 1e-4) { pts.push([z, y]); continue; }
      const a = [z + (prev[0] - z) * cut / li, y + (prev[1] - y) * cut / li];
      const b = [z + (next[0] - z) * cut / lo, y + (next[1] - y) * cut / lo];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8, u = 1 - t;
        pts.push([u * u * a[0] + 2 * u * t * z + t * t * b[0], u * u * a[1] + 2 * u * t * y + t * t * b[1]]);
      }
    }
    pts.push(pts[0]);
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = len[len.length - 1] || 1e-6;
    const z = new Float32Array(SAMPLES + 1), y = new Float32Array(SAMPLES + 1);
    let seg = 1;
    for (let s = 0; s <= SAMPLES; s++) {
      const target = (s / SAMPLES) * total;
      while (seg < len.length - 1 && len[seg] < target) seg++;
      const f = (target - len[seg - 1]) / ((len[seg] - len[seg - 1]) || 1e-6);
      z[s] = pts[seg - 1][0] + (pts[seg][0] - pts[seg - 1][0]) * f;
      y[s] = pts[seg - 1][1] + (pts[seg][1] - pts[seg - 1][1]) * f;
    }
    // Outward normal's upward part: -1 underneath, 0 on the sides, +1 on top.
    const up = new Float32Array(SAMPLES + 1);
    for (let s = 0; s <= SAMPLES; s++) {
      const a = (s + SAMPLES - 1) % SAMPLES, b = (s + 1) % SAMPLES;
      const dz = z[b] - z[a], dy = y[b] - y[a], l = Math.hypot(dz, dy) || 1;
      up[s] = -dz / l;
    }
    return { z, y, up, total };
  }
  function ringPoint(sec, v) {
    const o = sec.outline, f = clamp(v, 0, 1) * SAMPLES, i = Math.min(SAMPLES - 1, Math.floor(f)), t = f - i;
    const z = o.z[i] + (o.z[i + 1] - o.z[i]) * t, y = o.y[i] + (o.y[i + 1] - o.y[i]) * t;
    return { y: sec.yc + (y - sec.yc) * sec.k, z: z * sec.k, s: o.up[i] + (o.up[i + 1] - o.up[i]) * t };
  }
  function loft(spec) {
    const { steps, ring } = spec, cols = ring + 1;
    const pos = new Float32Array((steps + 1) * cols * 3), uv = new Float32Array((steps + 1) * cols * 2), idx = [];
    for (let i = 0; i <= steps; i++) {
      const sec = section(spec, i / steps);
      for (let j = 0; j <= ring; j++) {
        const p = ringPoint(sec, j / ring), k = i * cols + j;
        pos[k * 3] = sec.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        uv[k * 2] = i / steps; uv[k * 2 + 1] = j / ring;
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < ring; j++) {
        const a = i * cols + j, b = a + cols;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ---------- Colors and surfaces, painted into textures in UV space ---------- */
  const css = getComputedStyle(document.documentElement);
  const hex = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  const rgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const shade = (c, f) => c.map((v) => clamp(Math.round(v * f), 0, 255));
  const YELLOW = rgb(hex('--yellow', '#f5c814'));
  const BLACK = [0, 0, 0];
  // [color, roughness, clearcoat, glow, metalness]
  const PAINT = [YELLOW, 0.23, 1, BLACK, 0.42], PAINT_EDGE = [shade(YELLOW, 0.8), 0.3, 1, BLACK, 0.42], SEAM = [shade(YELLOW, 0.22), 0.5, 0.4, BLACK];
  const CLAD = [rgb('#24292d'), 0.74, 0, BLACK], UNDER = [rgb('#121517'), 0.9, 0, BLACK];
  const LAMP = [rgb('#e9eff2'), 0.05, 1, rgb('#7f8a90')], LAMP_RIM = [rgb('#8e9aa1'), 0.12, 1, BLACK];
  const PROJECTOR = [rgb('#4f5a61'), 0.08, 1, BLACK], PROJECTOR_LENS = [rgb('#f7fbfd'), 0.03, 1, rgb('#c7d2d8')];
  const TAIL = [rgb('#b5101a'), 0.12, 1, rgb('#6e0710')];
  const GRILLE = [rgb('#111416'), 0.55, 0.3, BLACK], GRILLE_BAR = [rgb('#3d464c'), 0.3, 0.8, BLACK];
  const CHROME = [rgb('#e1e7ea'), 0.1, 1, BLACK, 1];
  const GLASS = [rgb('#253b48'), 0.045, 1, BLACK, 0.32], PILLAR = [rgb('#0f1215'), 0.12, 1, BLACK];
  const ARCHES = [[118, 196], [368, 196]];

  function bodySurface(sec, p) {
    const sx = sec.sx, ys = toSY(p.y), az = Math.abs(p.z);
    if (p.s < -0.6 && !sec.end) return UNDER;   // on the rounded ends, height decides instead
    if (p.y < 0.47) return CLAD;
    const front = sec.end === 1 || sx > 430, rear = sec.end === -1 || sx < 42;
    if (sec.end === 1 && p.y > 0.52 && p.y < 0.78 && az < 0.44) return Math.floor(p.y / 0.026) % 2 ? GRILLE_BAR : GRILLE;
    if (front && p.y > 0.8 && p.y < 0.96 && az > 0.24 && az < 0.84) {   // headlight: a clear lens with two projectors
      for (const cz of [0.5, 0.68]) {
        const dd = Math.hypot(az - cz, p.y - 0.88);
        if (dd < 0.02) return PROJECTOR_LENS;
        if (dd < 0.042) return PROJECTOR;
      }
      return (p.y < 0.814 || p.y > 0.946 || az < 0.255 || az > 0.825) ? LAMP_RIM : LAMP;
    }
    if (rear && p.y > 0.86 && p.y < 1.03 && az > 0.28 && az < 0.86) return TAIL;
    if (p.s > 0.7) {   // seams on the hood and trunk lid
      if (Math.abs(sx - 444) < 0.45 || Math.abs(sx - 354) < 0.45 || Math.abs(sx - 112) < 0.45 || Math.abs(sx - 44) < 0.45) return SEAM;
      return PAINT;
    }
    if (Math.abs(p.s) < 0.75) {
      if (ys > 121 && ys < 188 && Math.abs(sx - 243) < 0.45) return SEAM;
      const frontEdge = 348 - (ys - 122) * (14 / 64), rearEdge = 128 + (ys - 122) * (32 / 62);
      if (ys > 121 && ys < 186 && (Math.abs(sx - frontEdge) < 0.45 || Math.abs(sx - rearEdge) < 0.45)) return SEAM;
      if (ys > 139 && ys < 143.5 && ((sx > 298 && sx < 316) || (sx > 196 && sx < 214))) return CHROME;
      for (const [cx, cy] of ARCHES) {
        const dd = Math.hypot(sx - cx, ys - cy);
        if (ys < cy && dd > 38 && dd < 40.5) return PAINT_EDGE;
      }
    }
    return PAINT;
  }
  function cabinSurface(sec, p) {
    const sx = sec.sx, ys = toSY(p.y);
    if (p.s < -0.4) return PAINT;                                  // tucked inside the body
    if (p.s > 0.72) return sx > 188 && sx < 284 ? PAINT : GLASS;   // roof, or windshield and rear window
    if (ys < cabinEdge.top(sx) + 7) return PAINT;                  // roof rail
    if (Math.abs(sx - 243) < 7) return PILLAR;                     // middle pillar
    if (cabinEdge.top(sx + 11) > ys - 1 || cabinEdge.top(sx - 11) > ys - 1) return PAINT;   // front and back pillars
    return GLASS;
  }
  function surfaceTextures(spec, W, H, surfaceAt, trimGlass) {
    let grid = new Array(W * H);
    for (let i = 0; i < W; i++) {
      const sec = section(spec, (i + 0.5) / W);
      for (let j = 0; j < H; j++) grid[j * W + i] = surfaceAt(sec, ringPoint(sec, (j + 0.5) / H));
    }
    if (trimGlass) {   // a thin chrome line where glass meets paint
      const out = grid.slice();
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const k = j * W + i;
          if (grid[k] === GLASS && (grid[k - 1] !== GLASS || grid[k + 1] !== GLASS || grid[k - W] !== GLASS || grid[k + W] !== GLASS)) out[k] = CHROME;
        }
      }
      grid = out;
    }
    const color = new ImageData(W, H), props = new ImageData(W, H), glow = new ImageData(W, H);
    const cd = color.data, pd = props.data, gd = glow.data;
    for (let k = 0; k < W * H; k++) {
      const [c, rough, coat, e, metal = 0] = grid[k], o = k * 4;
      cd[o] = c[0]; cd[o + 1] = c[1]; cd[o + 2] = c[2]; cd[o + 3] = 255;
      pd[o] = Math.round(coat * 255); pd[o + 1] = Math.round(rough * 255); pd[o + 2] = Math.round(metal * 255); pd[o + 3] = 255;
      gd[o] = e[0]; gd[o + 1] = e[1]; gd[o + 2] = e[2]; gd[o + 3] = 255;
    }
    return { color: texture(color, true), props: texture(props, false), glow: texture(glow, true) };
  }
  function texture(imageData, isColor) {
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    const t = new T.CanvasTexture(c);
    t.flipY = false;
    if (isColor) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* ---------- Mud: painted once in side view, then wrapped onto each part ---------- */
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function blob(x, y, rx, ry, r) {
    const n = 8 + Math.floor(r() * 5), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, k = 0.65 + r() * 0.55;
      pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
    }
    const p = new Path2D(), end = pts[n - 1];
    p.moveTo((end[0] + pts[0][0]) / 2, (end[1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    p.closePath();
    return p;
  }
  const MUD = { dust: '156 134 104', dried: '128 101 70', mud: '100 73 46', wet: '72 52 32' };
  const sideMud = (() => {
    const K = 2, c = document.createElement('canvas');
    c.width = 480 * K; c.height = 250 * K;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.scale(K, K);
    const r = rng(20261004);
    const film = g.createLinearGradient(0, 50, 0, 232);
    film.addColorStop(0, `rgb(${MUD.dust} / .32)`);
    film.addColorStop(0.45, `rgb(${MUD.dried} / .48)`);
    film.addColorStop(1, `rgb(${MUD.mud} / .84)`);
    g.fillStyle = film;
    g.fillRect(0, 0, 480, 250);
    for (let i = 0; i < 2600; i++) {
      const x = r() * 480, y = 40 + r() * 200;
      g.fillStyle = `rgb(${r() < 0.5 ? MUD.wet : MUD.dust} / ${0.1 + r() * 0.35 * (y / 240)})`;
      g.fillRect(x, y, 0.6 + r() * 1.1, 0.6 + r() * 1.1);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = r() * 470, y0 = 116 + r() * 14, len = 18 + r() * 52;
      const lg = g.createLinearGradient(0, y0, 0, y0 + len);
      lg.addColorStop(0, `rgb(${MUD.dried} / ${0.35 + r() * 0.25})`);
      lg.addColorStop(1, `rgb(${MUD.dried} / 0)`);
      g.strokeStyle = lg;
      g.lineWidth = 1 + r() * 2.2;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 3, y0 + len); g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * 480, y = 132 + Math.pow(r(), 0.6) * 66, rad = 3 + r() * r() * 15, a = 0.5 + r() * 0.4;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad * 1.2);
      rg.addColorStop(0, `rgb(${MUD.dried} / ${a * 0.85})`);
      rg.addColorStop(0.75, `rgb(${MUD.mud} / ${a})`);
      rg.addColorStop(1, `rgb(${MUD.wet} / ${a})`);
      g.fillStyle = rg;
      g.fill(blob(x, y, rad, rad * 0.8, r));
    }
    for (const [wx, wy] of [[118, 200], [368, 200]]) {   // spray thrown back by each tire
      g.lineWidth = 9;
      g.strokeStyle = `rgb(${MUD.wet} / .55)`;
      g.beginPath(); g.arc(wx, wy - 4, 41, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      for (let i = 0; i < 170; i++) {
        const ang = Math.PI * (1 + r() * 0.42), dist = 20 + Math.pow(r(), 1.8) * 95;
        const x = wx - 6 + Math.cos(ang) * dist, y = wy - 8 + Math.sin(ang) * dist * 0.7;
        const size = Math.max(0.5, (3.4 - dist / 34) * (0.4 + r() * 0.8));
        g.fillStyle = `rgb(${r() < 0.6 ? MUD.wet : MUD.mud} / ${0.45 + r() * 0.45})`;
        g.beginPath(); g.ellipse(x, y, size * (1.2 + r()), size, ang, 0, Math.PI * 2); g.fill();
      }
    }
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return (sx, ys) => {
      const x = clamp(Math.round(sx * K), 0, c.width - 1), y = clamp(Math.round(ys * K), 0, c.height - 1), k = (y * c.width + x) * 4;
      return [d[k], d[k + 1], d[k + 2], d[k + 3]];
    };
  })();
  function mudTexture(spec, W, H, keep) {
    const img = new ImageData(W, H);
    for (let i = 0; i < W; i++) {
      const sec = section(spec, (i + 0.5) / W);
      for (let j = 0; j < H; j++) {
        const p = ringPoint(sec, (j + 0.5) / H);
        if (!keep(sec, p)) continue;
        const m = sideMud(sec.sx + (p.z < 0 ? 37 : 0), toSY(p.y));   // the far side gets a different pattern
        img.data.set(m, (j * W + i) * 4);
      }
    }
    return texture(img, true);
  }

  /* ---------- Scene, light and reflections ---------- */
  const canvas = document.createElement('canvas');
  canvas.className = 'car3d';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(26, 480 / 250, 0.1, 60);
  camera.position.set(0, 1.9, 7.3);
  camera.lookAt(0, 0.62, 0);

  // A photo studio for reflections: a grey room with big softboxes, so the paint and glass catch real highlights.
  (() => {
    const room = new T.Scene();
    const walls = new T.Mesh(new T.BoxGeometry(14, 9, 14), new T.MeshStandardMaterial({ color: 0x7d8287, side: T.BackSide, roughness: 1 }));
    walls.position.y = 3.5;
    room.add(walls);
    const floor = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshStandardMaterial({ color: 0x34383b, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.99;
    room.add(floor);
    room.add(new T.HemisphereLight(0xffffff, 0x444444, 2));
    const panel = (w, h, pos, rot, power) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(power, power, power) }));
      m.position.set(...pos);
      m.rotation.set(...rot);
      room.add(m);
    };
    panel(7, 1.4, [0, 7.8, 0], [Math.PI / 2, 0, 0], 7);           // long strip overhead
    panel(3, 3.6, [-6.8, 3.2, 1], [0, Math.PI / 2, 0], 4);         // softbox on the left
    panel(3, 3.6, [6.8, 3.2, -1], [0, -Math.PI / 2, 0], 3);        // softbox on the right
    panel(5, 2.2, [0, 3, 6.8], [0, Math.PI, 0], 2.5);              // behind the camera
    panel(7, 0.35, [0, 1.8, -6.8], [0, 0, 0], 5);                // narrow reflection along the shoulder
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(room, 0.03).texture;
    pmrem.dispose();
  })();
  scene.add(new T.HemisphereLight(0xffffff, 0x4a4540, 0.45));
  const sun = new T.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3.5, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rimLight = new T.DirectionalLight(0xc6deff, 1.1);
  rimLight.position.set(-4, 3, -5);
  scene.add(rimLight);
  const ground = new T.Mesh(new T.PlaneGeometry(16, 16), new T.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const car = new T.Group();
  car.rotation.y = -0.6;
  scene.add(car);

  // A soft dark patch right under the car, where the floor sees the least light.
  (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.translate(128, 64); g.scale(1, 0.5);
    const rg = g.createRadialGradient(0, 0, 10, 0, 0, 124);
    rg.addColorStop(0, 'rgb(0 0 0 / .6)'); rg.addColorStop(0.55, 'rgb(0 0 0 / .32)'); rg.addColorStop(1, 'rgb(0 0 0 / 0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 124, 0, Math.PI * 2); g.fill();
    const shadow = new T.Mesh(new T.PlaneGeometry(5.2, 2.5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    car.add(shadow);
  })();

  /* ---------- The car ---------- */
  const bodyGeo = loft(BODY), cabinGeo = loft(CABIN);
  const bodyTex = surfaceTextures(BODY, 1536, 640, bodySurface, false);
  const cabinTex = surfaceTextures(CABIN, 768, 384, cabinSurface, true);
  const surface = (tex) => new T.MeshPhysicalMaterial({
    map: tex.color, roughnessMap: tex.props, clearcoatMap: tex.props, emissiveMap: tex.glow, emissive: 0xffffff, emissiveIntensity: 0.25,
    roughness: 1, metalness: 1, metalnessMap: tex.props, clearcoat: 1, clearcoatRoughness: 0.075,
    envMapIntensity: 1.15,
  });
  const bodyMesh = new T.Mesh(bodyGeo, surface(bodyTex));
  const cabinMesh = new T.Mesh(cabinGeo, surface(cabinTex));
  bodyMesh.castShadow = cabinMesh.castShadow = true;
  car.add(bodyMesh, cabinMesh);
  const blockers = [];
  const addPart = (mesh, shadow = true) => { mesh.castShadow = shadow; car.add(mesh); blockers.push(mesh); return mesh; };

  const paintMat = new T.MeshPhysicalMaterial({ color: new T.Color(`rgb(${YELLOW.join(',')})`), metalness: 0.42, roughness: 0.23, clearcoat: 1, clearcoatRoughness: 0.075 });
  const trimMat = new T.MeshStandardMaterial({ color: 0x1c2023, roughness: 0.62 });
  const chromeMat = new T.MeshStandardMaterial({ color: 0xe2e8eb, metalness: 1, roughness: 0.14 });
  const mirrorGlassMat = new T.MeshStandardMaterial({ color: 0x9fb2bd, metalness: 1, roughness: 0.04 });

  // Find a point on the loft itself so raised details follow the curved sheet metal.
  function sidePoint(sx, sy, side, spec = BODY, offset = 0.008) {
    const t = spec.capT ? spec.capT + (1 - 2 * spec.capT) * (sx - spec.sx0 - spec.dome / S) / (spec.sx1 - spec.sx0 - 2 * spec.dome / S) : (sx - spec.sx0) / (spec.sx1 - spec.sx0);
    const sec = section(spec, clamp(t, 0, 1));
    const targetY = toY(sy);
    let best = null, distance = Infinity;
    for (let i = 0; i <= 128; i++) {
      const p = ringPoint(sec, 0.1 + i / 128 * 0.3);
      const d = Math.abs(p.y - targetY);
      if (d < distance) { best = p; distance = d; }
    }
    return new T.Vector3(sec.x, best.y, side * (best.z + offset));
  }
  function detailLine(points, radius, material) {
    const curve = new T.CatmullRomCurve3(points);
    return addPart(new T.Mesh(new T.TubeGeometry(curve, Math.max(16, points.length * 3), radius, 6, false), material), false);
  }
  for (const side of [1, -1]) {
    // Real panel gaps, beltline trim, and an inset lower sill.
    for (const seam of [
      [[128, 124], [138, 143], [150, 164], [160, 184]],
      [[243, 123], [243, 144], [243, 165], [243, 184]],
      [[348, 123], [343, 144], [339, 165], [334, 184]],
      [[160, 184], [205, 186], [265, 186], [324, 184]]
    ]) detailLine(seam.map(([x, y]) => sidePoint(x, y, side)), 0.003, trimMat);
    detailLine([130, 170, 215, 260, 305, 342].map(x => sidePoint(x, 123, side)), 0.006, chromeMat);
    detailLine([164, 200, 250, 290, 322].map(x => sidePoint(x, 187, side)), 0.012, trimMat);
    for (const sx of [205, 307]) {
      const recess = new T.Mesh(new T.SphereGeometry(1, 20, 12), trimMat);
      recess.scale.set(0.115, 0.025, 0.007);
      recess.position.copy(sidePoint(sx, 141, side));
      addPart(recess, false);
      detailLine([sx - 8, sx, sx + 8].map(x => sidePoint(x, 140, side, BODY, 0.026)), 0.012, chromeMat);
    }
    // Fuel flap on the rear quarter panel.
    detailLine([[68, 139], [79, 139], [79, 151], [68, 151], [68, 139]].map(([x, y]) => sidePoint(x, y, side)), 0.0025, trimMat);
  }

  // Stamped hood ridges break up the broad paint reflections like real sheet metal.
  for (const v of [0.41, 0.59]) {
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const sx = 356 + i / 20 * 67;
      const t = BODY.capT + (1 - 2 * BODY.capT) * (sx - BODY.sx0 - BODY.dome / S) / (BODY.sx1 - BODY.sx0 - 2 * BODY.dome / S);
      const sec = section(BODY,t), p = ringPoint(sec,v);
      points.push(new T.Vector3(sec.x,p.y + 0.006,p.z));
    }
    detailLine(points,0.007,paintMat);
  }

  // Black plastic lips around the wheel arches.
  for (const ax of [toX(118), toX(368)]) {
    for (const side of [1, -1]) {
      const lip = new T.Mesh(new T.TorusGeometry(0.405, 0.03, 12, 48, Math.PI), trimMat);
      lip.position.set(ax, toY(196), side * 0.875);
      addPart(lip);
    }
  }

  // Side mirrors: a painted housing on a short black arm, with the mirror glass facing back.
  for (const side of [1, -1]) {
    const housing = new T.Mesh(new T.SphereGeometry(1, 28, 18), paintMat);
    housing.scale.set(0.075, 0.06, 0.12);
    housing.position.set(toX(344), toY(116) + 0.03, side * 0.985);
    addPart(housing);
    const glass = new T.Mesh(new T.CircleGeometry(1, 28), mirrorGlassMat);
    glass.scale.set(0.05, 0.1, 1);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(toX(344) - 0.072, toY(116) + 0.03, side * 0.99);
    addPart(glass, false);
    const arm = new T.Mesh(new T.BoxGeometry(0.05, 0.03, 0.1), trimMat);
    arm.position.set(toX(344) + 0.01, toY(116) + 0.0, side * 0.89);
    addPart(arm);
  }

  // License plates.
  const plateTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, 512, 112);
    g.strokeStyle = '#1d2a33'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 100);
    g.fillStyle = '#1d2a33';
    g.font = '800 70px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('COOL DUDE', 256, 60);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const plateMat = new T.MeshStandardMaterial({ map: plateTex, roughness: 0.4, metalness: 0.1 });
  const frontTip = section(BODY, 1), rearTip = section(BODY, 0);
  for (const [x, y, face] of [[frontTip.x - 0.03, 0.46, 1], [rearTip.x + 0.006, 0.66, -1]]) {
    const plate = new T.Mesh(new T.PlaneGeometry(0.46, 0.1), plateMat);
    plate.position.set(x, y, 0);
    plate.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    addPart(plate, false);
  }

  // A chrome exhaust tip under the back bumper.
  const exhaust = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.16, 24, 1, true), chromeMat);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(rearTip.x + 0.06, 0.3, 0.45);
  addPart(exhaust);

  // Each corner loads its own wheel and tire asset, keeping them independently editable.
  const wheels = [];
  const wellMat = new T.MeshStandardMaterial({ color: 0x101214, roughness: 0.96, side: T.DoubleSide });
  for (const part of carParts) {
    const assembly = new T.Group();
    assembly.name = part.name + '-assembly';
    assembly.add(part.wheel(T), part.tire(T, renderer));
    assembly.rotation.x = part.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    assembly.position.set(toX(part.front ? 368 : 118), 0.339, part.side * 0.8);
    car.add(assembly);
    wheels.push(assembly);
  }
  for (const x of [toX(118), toX(368)]) {
    const well = new T.Mesh(new T.CylinderGeometry(0.39,0.39,1.62,64,1,true),wellMat);
    well.rotation.x = Math.PI / 2; well.position.set(x,toY(196),0); car.add(well);
  }

  /* ---------- Mud layers, with a mask for how much is left on each spot ---------- */
  const muddable = [];
  function mudLayer({ geometry, mudTex, MU, MV, lenU, lenV, countable }) {
    const mask = document.createElement('canvas');
    mask.width = MU; mask.height = MV;
    const ctx = mask.getContext('2d');
    const img = ctx.createImageData(MU, MV);
    const tex = new T.CanvasTexture(mask);
    tex.flipY = false;
    const mat = new T.MeshStandardMaterial({
      map: mudTex, alphaMap: tex, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const mesh = new T.Mesh(geometry, mat);
    mesh.renderOrder = 1;
    const layer = {
      MU, MV, ctx, img, tex, mat, mesh,
      ru: BRUSH / (lenU / MU), rv: BRUSH / (lenV / MV),
      rubs: new Uint8Array(MU * MV), lastDab: new Int32Array(MU * MV).fill(-2),
      countable: new Uint8Array(MU * MV), dirty: true, autoCol: 0,
    };
    for (let j = 0; j < MV; j++) for (let i = 0; i < MU; i++) layer.countable[j * MU + i] = countable((i + 0.5) / MU, (j + 0.5) / MV) ? 1 : 0;
    muddable.push(layer);
    return layer;
  }
  const sectionCache = new Map();   // the mask grids ask about the same columns over and over
  const sectionAt = (spec, u) => {
    const key = (spec === BODY ? 'b' : 'c') + u;
    if (!sectionCache.has(key)) sectionCache.set(key, section(spec, u));
    return sectionCache.get(key);
  };
  const visibleBody = (u, v) => {
    const sec = sectionAt(BODY, u), p = ringPoint(sec, v);
    if (p.s < -0.6 && !sec.end) return false;                        // underside
    return !(p.s > 0.5 && sec.sx > 112 && sec.sx < 350);             // top of the body under the cabin
  };
  const visibleCabin = (u, v) => {
    const sec = sectionAt(CABIN, u), p = ringPoint(sec, v);
    return p.s > -0.4 && toSY(p.y) < 121;
  };
  const midBody = section(BODY, 0.5), midCabin = section(CABIN, 0.5);
  const bodyMud = mudLayer({
    geometry: bodyGeo, MU: 256, MV: 256, lenU: (BODY.sx1 - BODY.sx0) * S, lenV: midBody.outline.total, countable: visibleBody,
    mudTex: mudTexture(BODY, 384, 384, (sec, p) => p.s >= -0.6 || sec.end !== 0),
  });
  const cabinMud = mudLayer({
    geometry: cabinGeo, MU: 192, MV: 128, lenU: (CABIN.sx1 - CABIN.sx0) * S, lenV: midCabin.outline.total, countable: visibleCabin,
    mudTex: mudTexture(CABIN, 256, 192, (sec, p) => p.s > -0.4),
  });
  bodyMesh.userData.mud = bodyMud;
  cabinMesh.userData.mud = cabinMud;
  car.add(bodyMud.mesh, cabinMud.mesh);

  // The puddle on the floor.
  const puddle = (() => {
    const W = 512, H = 256, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = rng(77);
    g.fillStyle = `rgb(${MUD.mud} / .62)`;
    for (const [x, y, rx, ry] of [[256, 128, 200, 62], [120, 140, 70, 40], [390, 118, 80, 44], [256, 90, 120, 34]]) g.fill(blob(x, y, rx, ry, r));
    g.fillStyle = `rgb(${MUD.wet} / .5)`;
    g.fill(blob(250, 130, 130, 34, r));
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgb(${MUD.mud} / .7)`;
      g.beginPath(); g.ellipse(30 + r() * 452, 40 + r() * 176, 4 + r() * 9, 2 + r() * 4, 0, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgb(255 255 255 / .28)';
    g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(150, 112); g.quadraticCurveTo(250, 104, 350, 114); g.stroke();
    const d = g.getImageData(0, 0, W, H).data;
    const layer = mudLayer({
      geometry: new T.PlaneGeometry(3.6, 1.8), mudTex: texture(g.getImageData(0, 0, W, H), true),
      MU: 160, MV: 80, lenU: 3.6, lenV: 1.8,
      countable: (u, v) => d[(Math.floor(v * H) * W + Math.floor(u * W)) * 4 + 3] > 50,
    });
    layer.mesh.rotation.x = -Math.PI / 2;
    layer.mesh.position.y = 0.004;
    layer.mesh.renderOrder = 0;
    layer.mesh.receiveShadow = true;
    layer.mesh.userData.mud = layer;
    car.add(layer.mesh);
    return layer;
  })();

  let countTotal = 0;
  for (const m of muddable) for (const c of m.countable) countTotal += c;
  let rubTotal = 0;
  let dab = 0;
  let done = false;
  let autoRun = null;
  let fade = null;

  function paintMask(m) {
    const d = m.img.data;
    for (let k = 0; k < m.MU * m.MV; k++) {
      const v = Math.round(255 * (1 - m.rubs[k] / RUBS));
      d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v;
      d[k * 4 + 3] = 255;
    }
    m.dirty = true;
  }
  function resetMud() {
    for (const m of muddable) {
      m.rubs.fill(0);
      m.lastDab.fill(-2);
      paintMask(m);
      m.mat.opacity = 1;
    }
    rubTotal = 0;
  }

  // One dab of the sponge where it touches a part. A spot the sponge has just arrived on gets one more rub.
  function rubAt(m, u, v) {
    const cu = u * m.MU, cv = v * m.MV;
    const i0 = Math.max(0, Math.floor(cu - m.ru)), i1 = Math.min(m.MU - 1, Math.ceil(cu + m.ru));
    const j0 = Math.max(0, Math.floor(cv - m.rv)), j1 = Math.min(m.MV - 1, Math.ceil(cv + m.rv));
    const d = m.img.data;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const du = (i + 0.5 - cu) / m.ru, dv = (j + 0.5 - cv) / m.rv;
        if (du * du + dv * dv > 1) continue;
        const k = j * m.MU + i;
        if (m.lastDab[k] !== dab - 1 && m.rubs[k] < RUBS) {
          m.rubs[k]++;
          if (m.countable[k]) rubTotal++;
          const val = Math.round(255 * (1 - m.rubs[k] / RUBS));
          d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = val;
          m.dirty = true;
        }
        m.lastDab[k] = dab;
      }
    }
  }

  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  const targets = [bodyMesh, cabinMesh, puddle.mesh, ...wheels, ...blockers];
  function dabAt(x, y, rect) {
    dab++;
    ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(targets, true)[0];
    const layer = hit && hit.object.userData.mud;
    if (layer && hit.uv) rubAt(layer, hit.uv.x, hit.uv.y);
  }

  /* ---------- Meter, finishing and starting over (same controls as the 2D car) ---------- */
  function setProgress(p) {
    const pct = Math.min(100, Math.round(p * 100));
    ui.meterFill.style.width = pct + '%';
    ui.meterValue.textContent = pct + '%';
    ui.meter.setAttribute('aria-valuenow', String(pct));
  }
  function finish() {
    if (done) return;
    done = true;
    autoRun = null;
    setProgress(1);
    fade = { t0: performance.now() };
    ui.section.classList.add('is-clean');
    const hadFocus = document.activeElement === ui.autoBtn;
    ui.autoBtn.disabled = false;
    ui.autoBtn.hidden = true;
    ui.muddyBtn.hidden = false;
    ui.doneText.hidden = false;
    ui.tip.classList.add('is-gone');
    if (hadFocus) ui.muddyBtn.focus();
    const r = canvas.getBoundingClientRect();
    for (let i = 0; i < 40; i++) addSuds(r.width * (0.1 + Math.random() * 0.8), r.height * (0.25 + Math.random() * 0.55));
    requestRender();
  }
  function reset() {
    done = false;
    fade = null;
    resetMud();
    setProgress(0);
    ui.section.classList.remove('is-clean');
    const hadFocus = document.activeElement === ui.muddyBtn;
    ui.autoBtn.hidden = false;
    ui.muddyBtn.hidden = true;
    ui.doneText.hidden = true;
    if (hadFocus) ui.autoBtn.focus();
    requestRender();
  }
  function progress() { return countTotal ? rubTotal / (countTotal * RUBS) : 1; }

  // "Wash it for me": three sweeps along the car while it turns once, so the mud fades in three steps.
  function autoWash() {
    if (done || autoRun) return;
    if (reduceMotion) { finish(); return; }
    ui.autoBtn.disabled = true;
    for (const m of muddable) m.autoCol = 0;
    autoRun = { pass: 1, t0: performance.now() };
    requestRender();
  }
  function stepAuto(now) {
    const f = Math.min(1, (now - autoRun.t0) / SWEEP_MS);
    for (const m of muddable) {
      const upTo = Math.floor(f * m.MU);
      for (let i = m.autoCol; i < upTo; i++) {
        for (let j = 0; j < m.MV; j++) {
          const k = j * m.MU + i;
          if (m.rubs[k] < autoRun.pass) {
            m.rubs[k]++;
            if (m.countable[k]) rubTotal++;
          }
        }
      }
      if (upTo > m.autoCol) { m.autoCol = upTo; paintMask(m); }
    }
    const r = canvas.getBoundingClientRect();
    addSuds(r.width * (0.12 + 0.76 * f), r.height * (0.35 + Math.random() * 0.4));
    setProgress(progress());
    if (f >= 1) {
      autoRun.pass++;
      autoRun.t0 = now;
      for (const m of muddable) m.autoCol = 0;
      if (autoRun.pass > RUBS) { ui.autoBtn.disabled = false; finish(); }
    }
  }

  /* ---------- Turning the car ---------- */
  let yawTarget = car.rotation.y;
  function turn(dir) {
    yawTarget += dir * Math.PI / 4;
    if (reduceMotion) car.rotation.y = yawTarget;
    requestRender();
  }

  /* ---------- Suds that float up from the sponge (2D, on top of the 3D view) ---------- */
  const fctx = ui.fx.getContext('2d');
  const suds = [];
  let dpr = 1;
  function addSuds(x, y) {
    if (reduceMotion) return;
    for (let i = 0; i < 2; i++) {
      suds.push({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 16, r: 2 + Math.random() * 7,
        vx: (Math.random() - 0.5) * 0.6, vy: -(0.4 + Math.random() * 0.9), life: 1 });
    }
    if (suds.length > 180) suds.splice(0, suds.length - 180);
    requestRender();
  }
  function drawSuds() {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, ui.fx.width, ui.fx.height);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = suds.length - 1; i >= 0; i--) {
      const b = suds[i];
      b.x += b.vx; b.y += b.vy; b.life -= 0.016;
      if (b.life <= 0) { suds.splice(i, 1); continue; }
      fctx.globalAlpha = Math.min(1, b.life * 1.4);
      fctx.beginPath(); fctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      fctx.fillStyle = 'rgb(255 255 255 / .7)'; fctx.fill();
      fctx.lineWidth = 1.2; fctx.strokeStyle = 'rgb(23 34 27 / .45)'; fctx.stroke();
      fctx.beginPath(); fctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2);
      fctx.fillStyle = 'rgb(255 255 255 / .95)'; fctx.fill();
    }
    fctx.globalAlpha = 1;
  }

  /* ---------- Haunted mode: The entity peeks out from behind the car ---------- */
  // A flat cutout standing behind the car (the portrait uses a 200 x 260 coordinate system, assets/entity.png). Before each
  // peek he looks at the frame just drawn and picks a spot where the car hides him up to the eyes
  // and there's room above it for his head and hood, so it works however the car is turned.
  const entity = (() => {
    const W = 1.8, H = W * 260 / 200;
    const Z = -2.7;                                // behind the car's far side at every angle
    const above = (y) => H * (0.5 - y / 260);      // how far a point of the drawing sits above the cutout's middle
    const EYE_Y = 81;
    const EYES = above(EYE_Y), TOP = above(0);
    const HEAD = 0.375 * W, EYE_SPAN = 0.21 * W;   // half-widths: ear to ear, and across both eyes
    const RISE = 1300, HOLD = 1900, SINK = 650;
    const mat = new T.MeshBasicMaterial({
      transparent: true, alphaTest: 0.05, toneMapped: false,
      clippingPlanes: [new T.Plane(new T.Vector3(0, 1, 0), 0)],   // nothing of him shows below the floor
    });
    const mesh = new T.Mesh(new T.PlaneGeometry(W, H), mat);
    mesh.visible = false;
    scene.add(mesh);
    renderer.localClippingEnabled = true;

    let on = false, ready = false, looking = false, peek = null, nextAt = 0, timer = 0;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 600; c.height = 780;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
      ready = true;
      requestRender();
    };

    const v = new T.Vector3();
    // Finds a spot from the frame just drawn (with him hidden): x, and how high to rise.
    // He comes up until the drawing down to `showTo` (a y in the drawing) clears the car.
    // Returns null if no spot fits right now.
    function plan(showTo) {
      const show = H * (showTo - EYE_Y) / 260 + 0.04;          // how far his eyes rise above the car, meters
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!w || !h) return null;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const solid = (x, row) => px[((h - 1 - row) * w + x) * 4 + 3] > 250;   // rows count down from the top

      // The car's outline in every third column: its top row, and how far down it stays solid
      // (-1 where there's no car). Small gaps, like under the side mirror, don't count as open.
      const STEP = 3, cols = Math.floor(w / STEP), GAP = Math.max(3, Math.round(h * 0.025));
      const top = new Int32Array(cols).fill(-1), bottom = new Int32Array(cols).fill(-1);
      for (let c = 0; c < cols; c++) {
        const x = c * STEP;
        let r = 0;
        while (r < h && !solid(x, r)) r++;
        if (r === h) continue;
        let b = r;
        for (let y = r + 1, gap = 0; y < h; y++) {
          if (solid(x, y)) { b = y; gap = 0; } else if (++gap > GAP) break;
        }
        top[c] = r; bottom[c] = b;
      }

      // His size on screen at his depth.
      const toScreen = (x, y) => { v.set(x, y, Z).project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; };
      const [sx0, sy0] = toScreen(0, 1), [sx1] = toScreen(1, 1), [, sy2] = toScreen(0, 2);
      const perX = sx1 - sx0, perY = sy0 - sy2;              // pixels per meter, across and up
      const headCols = Math.ceil(HEAD * perX / STEP), eyeCols = Math.ceil(EYE_SPAN * perX / STEP);

      const spots = [];
      for (let c = headCols; c < cols - headCols; c += 2) {
        const feet = toScreen((c * STEP - sx0) / perX, 0)[1];   // where the floor under him is on screen
        let line = Infinity, low = -Infinity, ok = true;
        for (let k = c - headCols; k <= c + headCols; k++) {
          // The car must cover him all the way down to his feet in every column of his head.
          if (top[k] < 0 || top[k] > feet - 8 || bottom[k] < feet + 2) { ok = false; break; }
          if (Math.abs(k - c) <= eyeCols) line = Math.min(line, top[k]);
          low = Math.max(low, top[k]);
        }
        if (!ok) continue;
        const eyeRow = line - show * perY;
        if (eyeRow - (TOP - EYES) * perY < h * 0.02) continue;    // its hood would stick out of the picture
        spots.push({ x: c * STEP, eyeRow, low });
      }
      if (!spots.length) return null;

      const spot = spots[Math.floor(Math.random() * spots.length)];
      const toPlane = (sx, sy) => {                          // screen pixel -> point on his plane
        v.set(sx / w * 2 - 1, 1 - sy / h * 2, 0.5).unproject(camera);
        const c = camera.position, t = (Z - c.z) / (v.z - c.z);
        return [c.x + (v.x - c.x) * t, c.y + (v.y - c.y) * t];
      };
      const [x, eyesY] = toPlane(spot.x, spot.eyeRow);
      const lowY = toPlane(spot.x, spot.low)[1];
      // Up: eyes over the car. Down: even its hood is below the lowest edge of the car in front of him.
      return { x, up: eyesY - EYES, down: Math.min(lowY - 0.15 - TOP, eyesY - EYES - 0.3) };
    }

    function waitFor(ms) {
      nextAt = performance.now() + ms;
      clearTimeout(timer);
      timer = setTimeout(requestRender, ms + 20);
    }
    function set(value) {
      on = value;
      if (on && !img.src) img.src = 'assets/entity.png';   // only fetched once haunted mode starts
      clearTimeout(timer);
      looking = false;
      peek = null;
      mesh.visible = false;
      if (on) waitFor(1500);
      requestRender();
    }
    // Before drawing: moves him. Returns true while he needs more frames.
    function step(now) {
      if (!on || !ready) return false;
      if (!peek) {
        if (now < nextAt) return false;
        if (autoRun) { waitFor(1000); return false; }      // not while the car is spinning
        looking = true;                                    // pick a spot from the next frame
        return true;
      }
      const t = now - peek.t0;
      let k;
      if (t < RISE) k = reduceMotion ? 1 : 1 - (1 - t / RISE) ** 3;
      else if (t < RISE + HOLD) k = 1;
      else if (t < RISE + HOLD + SINK) k = reduceMotion ? 1 : 1 - ((t - RISE - HOLD) / SINK) ** 2;
      else { peek = null; mesh.visible = false; waitFor(2500 + Math.random() * 4000); return true; }
      mesh.position.set(peek.x, peek.down + (peek.up - peek.down) * k, Z);
      mesh.rotation.z = reduceMotion ? 0 : Math.sin(t / 420) * 0.07 * k;   // a slow, creepy head tilt
      return true;
    }
    // After drawing: if he was looking for a spot, read this frame and start the peek.
    function afterRender(now) {
      if (!looking) return false;
      looking = false;
      // Usually just his eyes (the bottom of the eyes is y 104 in the drawing); sometimes his nose too (y 131).
      const spot = (Math.random() < 0.35 && plan(131)) || plan(104);
      if (!spot) { waitFor(1500); return false; }
      peek = { t0: now, ...spot };
      mesh.position.set(spot.x, spot.down, Z);
      mesh.rotation.z = 0;
      mesh.visible = true;
      return true;
    }
    return { set, step, afterRender };
  })();

  /* ---------- Drawing: only when something changed ---------- */
  let queued = false;
  function requestRender() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }
  function frame(now) {
    queued = false;
    let again = false;
    if (autoRun) {
      stepAuto(now);
      if (autoRun) {
        car.rotation.y += (Math.PI * 2) / (RUBS * SWEEP_MS) * 16.7;
        yawTarget = car.rotation.y;
        again = true;
      }
    }
    const dy = yawTarget - car.rotation.y;
    if (Math.abs(dy) > 0.0005) { car.rotation.y += dy * 0.18; again = true; }
    if (fade) {
      const k = Math.min(1, (now - fade.t0) / 700);
      for (const m of muddable) m.mat.opacity = 1 - k;
      if (k < 1) again = true;
    }
    for (const m of muddable) {
      if (m.dirty) { m.ctx.putImageData(m.img, 0, 0); m.tex.needsUpdate = true; m.dirty = false; }
    }
    if (entity.step(now)) again = true;
    renderer.render(scene, camera);
    if (entity.afterRender(now)) again = true;
    if (suds.length) { drawSuds(); again = true; } else if (ui.fx.width) { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, ui.fx.width, ui.fx.height); }
    if (again) requestRender();
  }
  function resize() {
    const w = ui.stage.clientWidth, h = ui.stage.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ui.fx.width = Math.round(w * dpr);
    ui.fx.height = Math.round(h * dpr);
    requestRender();
  }

  /* ---------- Rubbing with a mouse or finger ---------- */
  let pressing = false, last = null;
  const stepPx = () => Math.max(4, canvas.clientWidth * 0.012);
  function scrubTo(e) {
    if (done || autoRun) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (last) {
      const dx = x - last.x, dy = y - last.y, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / stepPx()));
      for (let s = 1; s <= steps; s++) dabAt(last.x + (dx * s) / steps, last.y + (dy * s) / steps, rect);
    } else {
      dab++;   // the sponge was lifted, so wherever it lands is a fresh rub
      dabAt(x, y, rect);
    }
    last = { x, y };
    addSuds(x, y);
    ui.tip.classList.add('is-gone');
    const p = progress();
    setProgress(p);
    if (p >= DONE_AT) finish();
    requestRender();
  }

  /* ---------- Show the 3D car ---------- */
  resetMud();
  ui.status.hidden = true;
  ui.tip.hidden = false;
  ui.autoBtn.disabled = false;
  ui.stage.insertBefore(canvas, ui.fx);
  ui.turnBox.hidden = false;
  ui.hint.textContent = 'Rub over each spot three times to wash off the mud. It gets lighter every time. Use the arrows to turn the car and wash every side.';
  setProgress(0);

  canvas.addEventListener('pointerdown', (e) => {
    pressing = true;
    last = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
    scrubTo(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pressing && e.pointerType !== 'mouse') return;   // a mouse scrubs on hover, touch scrubs on drag
    scrubTo(e);
  });
  const lift = () => { pressing = false; last = null; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', () => { if (!pressing) last = null; });
  ui.autoBtn.addEventListener('click', autoWash);
  ui.muddyBtn.addEventListener('click', reset);
  ui.turnLeft.addEventListener('click', () => turn(-1));
  ui.turnRight.addEventListener('click', () => turn(1));

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(ui.stage);
  else window.addEventListener('resize', resize);
  resize();

  // Haunted mode (app.js) says when to let The entity out.
  const haunted = () => document.documentElement.classList.contains('is-haunted');
  document.addEventListener('hauntedchange', () => entity.set(haunted()));
  if (haunted()) entity.set(true);
}
