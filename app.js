// Secret haunted-carwash mode: Up, Down, Right, then code 987.
(() => {
  const sequence = ['ArrowUp', 'ArrowDown', 'ArrowRight'];
  let progress = 0;
  let timer = null;
  let layer = null;
  let previousFocus = null;
  const messages = [
    'We know what is hiding under the mud.',
    'Something is watching from the back seat.',
    'The footprints stop inside your car.',
    'You washed it. It came back.',
    'Do not look in the rearview mirror.'
  ];

  function stop() {
    clearInterval(timer);
    timer = null;
    layer?.remove();
    layer = null;
    previousFocus?.focus();
  }

  function start() {
    if (layer) return;
    previousFocus = document.activeElement;
    layer = document.createElement('div');
    layer.className = 'haunted-layer';
    const exit = document.createElement('button');
    exit.className = 'haunted-exit';
    exit.textContent = 'End spooky mode (Esc)';
    exit.addEventListener('click', stop);
    layer.append(exit);
    document.body.append(layer);
    exit.focus();

    function popup() {
      // Keep the prank bounded even if it is left running.
      if (layer.querySelectorAll('.haunted-popup').length >= 5) {
        layer.querySelector('.haunted-popup').remove();
      }
      const card = document.createElement('section');
      card.className = 'haunted-popup';
      card.style.left = `${5 + Math.random() * 55}%`;
      card.style.top = `${15 + Math.random() * 55}%`;
      const title = document.createElement('strong');
      title.textContent = '☠ THE CARWASH IS HAUNTED ☠';
      const message = document.createElement('p');
      message.textContent = messages[Math.floor(Math.random() * messages.length)];
      const close = document.createElement('button');
      close.textContent = 'Close';
      close.addEventListener('click', () => card.remove());
      card.append(title, message, close);
      layer.append(card);
    }
    popup();
    timer = setInterval(popup, 1800);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && layer) { stop(); return; }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest('input, textarea, select, [contenteditable]')) {
      progress = 0;
      return;
    }
    if (layer) return;
    if (event.key === sequence[progress]) {
      event.preventDefault();
      progress++;
    } else {
      progress = event.key === sequence[0] ? 1 : 0;
    }
    if (progress === sequence.length) {
      progress = 0;
      if (window.prompt('Enter the secret carwash code:')?.trim() === '987') start();
    }
  });
})();

(() => {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scrub test: wipe the mud off the car ---------- */
  // The flat 2D car. The 3D car (scrub3d.js) runs instead when the browser can draw 3D,
  // and calls this if it can't.
  let scrub2dStarted = false;
  function startScrub2D() {
    if (scrub2dStarted) return;
    scrub2dStarted = true;
    const VB_W = 480, VB_H = 250;          // the car SVG's viewBox
    const CELL = 2;                        // scrub grid cell, in viewBox units
    const BRUSH = 20;                      // sponge radius, in viewBox units
    const RUBS = 3;                        // rubs it takes to get a spot fully clean
    const DONE_AT = 0.9;                   // how clean overall before the last bits rinse off

    const section = document.getElementById('scrub');
    const stage = document.getElementById('bayStage');
    const mud = document.getElementById('mud');
    const fx = document.getElementById('fx');
    const tip = document.getElementById('bayTip');
    const meter = document.getElementById('meter');
    const meterFill = document.getElementById('meterFill');
    const meterValue = document.getElementById('meterValue');
    const autoBtn = document.getElementById('autoWash');
    const muddyBtn = document.getElementById('muddy');
    const doneText = document.getElementById('bayDone');
    const mctx = mud.getContext('2d');
    const fctx = fx.getContext('2d');

    // One path for the whole car, built from the SVG shapes marked data-mask.
    const carShape = new Path2D();
    stage.querySelectorAll('[data-mask]').forEach((el) => {
      if (el.tagName.toLowerCase() === 'circle') {
        const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy'), r = +el.getAttribute('r');
        carShape.moveTo(cx + r, cy);
        carShape.arc(cx, cy, r, 0, Math.PI * 2);
      } else {
        carShape.addPath(new Path2D(el.getAttribute('d')));
      }
    });

    // A muddy puddle on the floor under the car. It scrubs off like the rest.
    const floorMud = new Path2D('M86 233C110 227 152 229 192 230C232 232 262 228 300 229C338 231 374 227 398 231C414 234 412 240 392 241C356 243 322 239 284 241C246 243 208 240 170 242C132 244 100 242 86 239C76 237 78 234 86 233Z');
    const floorWet = new Path2D('M140 234C168 232 204 233 238 234C268 235 296 232 324 234C338 235 336 238 320 238C290 239 262 237 232 238C200 239 168 238 146 237C134 236 132 235 140 234Z');
    const floorShine = new Path2D('M156 232C192 231 228 233 258 232M298 231C326 230 352 231 372 232');
    const floorSplats = [[66, 238, 6, 2], [52, 235, 2.6, 1], [422, 236, 5.5, 1.8], [438, 240, 3, 1.1], [246, 245, 4.5, 1.4]];

    // Everything that can get muddy: the car plus the floor puddle and splats.
    const dirtShape = new Path2D(carShape);
    dirtShape.addPath(floorMud);
    floorSplats.forEach(([x, y, rx, ry]) => {
      dirtShape.moveTo(x + rx, y);
      dirtShape.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    });

    // The scrub grid: which cells start muddy, and how many times each has been rubbed.
    const GW = Math.ceil(VB_W / CELL), GH = Math.ceil(VB_H / CELL);
    const muddy = new Uint8Array(GW * GH);
    let muddyCells = 0;
    const probe = document.createElement('canvas').getContext('2d');
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (probe.isPointInPath(dirtShape, gx * CELL + CELL / 2, gy * CELL + CELL / 2)) {
          muddy[gy * GW + gx] = 1;
          muddyCells++;
        }
      }
    }
    let rubs = new Uint8Array(GW * GH);         // 0 to RUBS for each cell
    let rubTotal = 0;                           // rubs on muddy cells, for the Clean-o-meter
    // Every dab of the sponge gets a number. A cell that was under the previous dab is still
    // the same rub; a cell the sponge has just arrived on gets one more rub.
    const lastDab = new Int32Array(GW * GH).fill(-2);
    let dab = 0;

    // How much mud is left in each cell, as an alpha mask one pixel per cell.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = GW;
    maskCanvas.height = GH;
    const maskCtx = maskCanvas.getContext('2d');
    const mask = maskCtx.createImageData(GW, GH);

    // The untouched mud is drawn once, off screen. What you see is that mud faded by the mask.
    const fullMud = document.createElement('canvas');
    const fullCtx = fullMud.getContext('2d');

    let done = false;
    let last = null;
    let sx = 1, sy = 1;

    function rng(seed) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function sizeCanvases() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [mud, fx, fullMud]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      sx = mud.width / VB_W;
      sy = mud.height / VB_H;
      return true;
    }

    // Road grime colors, from dusty tan to wet mud.
    const MUD = { dust: '156 134 104', dried: '128 101 70', mud: '100 73 46', wet: '72 52 32' };
    const glassShapes = [...stage.querySelectorAll('.car-glass')].map((el) => new Path2D(el.getAttribute('d')));
    const wheels = [...stage.querySelectorAll('circle[data-mask]')].map((el) => ({
      x: +el.getAttribute('cx'), y: +el.getAttribute('cy'), r: +el.getAttribute('r'),
    }));

    // An irregular, rounded blob: the shape a splash of mud dries into.
    function blob(x, y, rad, r) {
      const n = 8 + Math.floor(r() * 5);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const k = rad * (0.65 + r() * 0.55);
        pts.push([x + Math.cos(a) * k, y + Math.sin(a) * k * 0.8]);
      }
      const p = new Path2D();
      const end = pts[n - 1];
      p.moveTo((end[0] + pts[0][0]) / 2, (end[1] + pts[0][1]) / 2);
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
      p.closePath();
      return p;
    }

    // Draws the untouched mud onto the off-screen canvas; render() shows it through the scrub mask.
    function drawMud() {
      const mctx = fullCtx;
      const r = rng(20261002);
      mctx.setTransform(sx, 0, 0, sy, 0, 0);
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, VB_W, VB_H);

      // A film of road grime: light dust up top, heavier toward the sills.
      const film = mctx.createLinearGradient(0, 50, 0, 232);
      film.addColorStop(0, `rgb(${MUD.dust} / .3)`);
      film.addColorStop(0.45, `rgb(${MUD.dried} / .46)`);
      film.addColorStop(1, `rgb(${MUD.mud} / .8)`);
      mctx.fillStyle = film;
      mctx.fill(carShape);

      // Dusty windows.
      mctx.fillStyle = `rgb(${MUD.dust} / .42)`;
      glassShapes.forEach((p) => mctx.fill(p));

      // Fine grit, denser low down.
      for (let i = 0; i < 1600; i++) {
        const x = 20 + r() * 440, y = 48 + r() * 190;
        mctx.fillStyle = `rgb(${r() < 0.5 ? MUD.wet : MUD.dust} / ${0.1 + r() * 0.35 * (y / 240)})`;
        mctx.fillRect(x, y, 0.6 + r() * 1.1, 0.6 + r() * 1.1);
      }

      // Streaks where rain ran down through the dust.
      mctx.lineCap = 'round';
      for (let i = 0; i < 30; i++) {
        const x = 34 + r() * 412, y0 = 118 + r() * 14, len = 18 + r() * 52;
        const g = mctx.createLinearGradient(0, y0, 0, y0 + len);
        g.addColorStop(0, `rgb(${MUD.dried} / ${0.35 + r() * 0.25})`);
        g.addColorStop(1, `rgb(${MUD.dried} / 0)`);
        mctx.strokeStyle = g;
        mctx.lineWidth = 1 + r() * 2.2;
        mctx.beginPath();
        mctx.moveTo(x, y0);
        mctx.lineTo(x + (r() - 0.5) * 3, y0 + len);
        mctx.stroke();
      }

      // Dried splotches, mostly low on the doors and sills: pale centers, dark rims.
      for (let i = 0; i < 70; i++) {
        const x = 30 + r() * 420;
        const y = 132 + Math.pow(r(), 0.6) * 70;
        const rad = 3 + r() * r() * 15;
        const a = 0.5 + r() * 0.4;
        const g = mctx.createRadialGradient(x, y, 0, x, y, rad * 1.2);
        g.addColorStop(0, `rgb(${MUD.dried} / ${a * 0.85})`);
        g.addColorStop(0.75, `rgb(${MUD.mud} / ${a})`);
        g.addColorStop(1, `rgb(${MUD.wet} / ${a})`);
        mctx.fillStyle = g;
        mctx.fill(blob(x, y, rad, r));
      }

      // Spray flung back and up by each tire (the car faces right), and caked-on tire mud.
      for (const w of wheels) {
        mctx.lineWidth = 9;
        mctx.strokeStyle = `rgb(${MUD.wet} / .55)`;
        mctx.beginPath();
        mctx.arc(w.x, w.y, w.r + 8, Math.PI * 1.05, Math.PI * 1.95);
        mctx.stroke();
        for (let i = 0; i < 170; i++) {
          const ang = Math.PI * (1 + r() * 0.42);
          const dist = w.r * 0.6 + Math.pow(r(), 1.8) * 95;
          const x = w.x - 6 + Math.cos(ang) * dist;
          const y = w.y - 8 + Math.sin(ang) * dist * 0.7;
          const size = Math.max(0.5, (3.4 - dist / 34) * (0.4 + r() * 0.8));
          mctx.fillStyle = `rgb(${r() < 0.6 ? MUD.wet : MUD.mud} / ${0.45 + r() * 0.45})`;
          mctx.beginPath();
          mctx.ellipse(x, y, size * (1.2 + r()), size, ang, 0, Math.PI * 2);
          mctx.fill();
        }
        for (let i = 0; i < 26; i++) {
          const ang = r() * Math.PI * 2, d = w.r * (0.55 + r() * 0.45);
          mctx.fillStyle = `rgb(${MUD.mud} / ${0.55 + r() * 0.35})`;
          mctx.fill(blob(w.x + Math.cos(ang) * d, w.y + Math.sin(ang) * d, 2 + r() * 5, r));
        }
      }

      // The puddle on the floor, darker where it's wet, with a little shine.
      mctx.fillStyle = `rgb(${MUD.mud} / .55)`;
      mctx.fill(floorMud);
      mctx.fillStyle = `rgb(${MUD.wet} / .45)`;
      mctx.fill(floorWet);
      mctx.strokeStyle = 'rgb(255 255 255 / .3)';
      mctx.lineWidth = 1.5;
      mctx.stroke(floorShine);
      mctx.fillStyle = `rgb(${MUD.mud} / .7)`;
      floorSplats.forEach(([x, y, rx, ry]) => {
        mctx.beginPath();
        mctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        mctx.fill();
      });

      // Keep the mud on the car and the floor puddle only.
      mctx.globalCompositeOperation = 'destination-in';
      mctx.fillStyle = '#000';
      mctx.fill(dirtShape);
      mctx.globalCompositeOperation = 'source-over';
    }

    function setProgress(p) {
      const pct = Math.min(100, Math.round(p * 100));
      meterFill.style.width = pct + '%';
      meterValue.textContent = pct + '%';
      meter.setAttribute('aria-valuenow', String(pct));
    }

    function resetMask() {
      rubs = new Uint8Array(GW * GH);
      rubTotal = 0;
      for (let i = 0; i < GW * GH; i++) mask.data[i * 4 + 3] = 255;
    }

    // Show the untouched mud through the mask: full where unrubbed, 2/3 after one rub, 1/3 after two, none after three.
    let renderQueued = false;
    function render() {
      renderQueued = false;
      if (!mud.width) return;
      maskCtx.putImageData(mask, 0, 0);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'copy';
      mctx.drawImage(fullMud, 0, 0);
      mctx.globalCompositeOperation = 'destination-in';
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = 'high';
      mctx.drawImage(maskCanvas, 0, 0, GW * CELL * sx, GH * CELL * sy);
      mctx.globalCompositeOperation = 'source-over';
    }
    function queueRender() {
      if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
    }

    // One dab of the sponge. Each cell under it that the sponge has just arrived on gets one more rub.
    function rubAt(x, y) {
      dab++;
      const gx0 = Math.max(0, Math.floor((x - BRUSH) / CELL)), gx1 = Math.min(GW - 1, Math.floor((x + BRUSH) / CELL));
      const gy0 = Math.max(0, Math.floor((y - BRUSH) / CELL)), gy1 = Math.min(GH - 1, Math.floor((y + BRUSH) / CELL));
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const dx = gx * CELL + CELL / 2 - x, dy = gy * CELL + CELL / 2 - y;
          if (dx * dx + dy * dy > BRUSH * BRUSH) continue;
          const i = gy * GW + gx;
          if (lastDab[i] !== dab - 1 && rubs[i] < RUBS) {
            rubs[i]++;
            if (muddy[i]) rubTotal++;
            mask.data[i * 4 + 3] = Math.round(255 * (1 - rubs[i] / RUBS));
          }
          lastDab[i] = dab;
        }
      }
    }

    function scrubTo(x, y) {
      if (done) return;
      if (last) {
        const dx = x - last.x, dy = y - last.y;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (BRUSH / 3)));
        for (let s = 1; s <= steps; s++) rubAt(last.x + (dx * s) / steps, last.y + (dy * s) / steps);
      } else {
        dab++;  // the sponge was lifted, so wherever it lands is a fresh rub
        rubAt(x, y);
      }
      last = { x, y };
      queueRender();
      addSuds(x, y, 2);
      tip.classList.add('is-gone');
      const p = rubTotal / (muddyCells * RUBS);
      setProgress(p);
      if (p >= DONE_AT) finish();
    }

    // Soap suds that float up from the sponge.
    const suds = [];
    let fxRunning = false;
    function addSuds(x, y, n) {
      if (reduceMotion) return;
      for (let i = 0; i < n; i++) {
        suds.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 14,
          r: 2 + Math.random() * 6,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -(0.3 + Math.random() * 0.8),
          life: 1,
        });
      }
      if (suds.length > 160) suds.splice(0, suds.length - 160);
      if (!fxRunning) { fxRunning = true; requestAnimationFrame(tick); }
    }
    function tick() {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, fx.width, fx.height);
      fctx.setTransform(sx, 0, 0, sy, 0, 0);
      for (let i = suds.length - 1; i >= 0; i--) {
        const b = suds[i];
        b.x += b.vx; b.y += b.vy; b.life -= 0.016;
        if (b.life <= 0) { suds.splice(i, 1); continue; }
        fctx.globalAlpha = Math.min(1, b.life * 1.4);
        fctx.beginPath();
        fctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        fctx.fillStyle = 'rgb(255 255 255 / .7)';
        fctx.fill();
        fctx.lineWidth = 1.2;
        fctx.strokeStyle = 'rgb(23 34 27 / .45)';
        fctx.stroke();
        fctx.beginPath();
        fctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.28, 0, Math.PI * 2);
        fctx.fillStyle = 'rgb(255 255 255 / .95)';
        fctx.fill();
      }
      fctx.globalAlpha = 1;
      if (suds.length) requestAnimationFrame(tick);
      else fxRunning = false;
    }

    function finish() {
      if (done) return;
      done = true;
      last = null;
      setProgress(1);
      mud.classList.add('is-clean');
      section.classList.add('is-clean');
      const hadFocus = document.activeElement === autoBtn;
      autoBtn.disabled = false;
      autoBtn.hidden = true;
      muddyBtn.hidden = false;
      doneText.hidden = false;
      tip.classList.add('is-gone');
      if (hadFocus) muddyBtn.focus();
      for (let i = 0; i < 40; i++) addSuds(40 + Math.random() * 400, 60 + Math.random() * 160, 1);
    }

    function reset() {
      done = false;
      last = null;
      resetMask();
      render();
      setProgress(0);
      mud.classList.remove('is-clean');
      section.classList.remove('is-clean');
      const hadFocus = document.activeElement === muddyBtn;
      autoBtn.hidden = false;
      muddyBtn.hidden = true;
      doneText.hidden = true;
      if (hadFocus) autoBtn.focus();
    }

    function autoWash() {
      if (done) return;
      if (reduceMotion) { finish(); return; }
      // Three sweeps over the car, so the mud fades in three steps. The rows are 2 × BRUSH apart,
      // so one sweep rubs each spot once.
      const rows = [66, 106, 146, 186, 226];
      const pts = [];
      rows.forEach((y, i) => {
        const a = i % 2 ? 452 : 28, b = i % 2 ? 28 : 452;
        pts.push({ x: a, y }, { x: b, y });
      });
      const segs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segs.push(len);
        total += len;
      }
      const sweepTime = 1500;
      let sweep = 0;
      let t0 = performance.now();
      last = null;
      autoBtn.disabled = true;
      const step = (now) => {
        if (done) return;
        const d = Math.min(1, (now - t0) / sweepTime) * total;
        let acc = 0, i = 0;
        while (i < segs.length - 1 && acc + segs[i] < d) { acc += segs[i]; i++; }
        const t = segs[i] ? Math.min(1, (d - acc) / segs[i]) : 1;
        scrubTo(pts[i].x + (pts[i + 1].x - pts[i].x) * t, pts[i].y + (pts[i + 1].y - pts[i].y) * t);
        if (d < total) { requestAnimationFrame(step); return; }
        sweep++;
        if (sweep >= RUBS) { finish(); return; }
        last = null;  // lift the sponge and start the next sweep from the top
        t0 = now;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    function toViewBox(e) {
      const r = mud.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * VB_W, y: ((e.clientY - r.top) / r.height) * VB_H };
    }
    let pressing = false;
    mud.addEventListener('pointerdown', (e) => {
      pressing = true;
      last = null;
      try { mud.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
      const p = toViewBox(e);
      scrubTo(p.x, p.y);
    });
    mud.addEventListener('pointermove', (e) => {
      if (!pressing && e.pointerType !== 'mouse') return;   // a mouse scrubs on hover, touch scrubs on drag
      const p = toViewBox(e);
      scrubTo(p.x, p.y);
    });
    const lift = () => { pressing = false; last = null; };
    mud.addEventListener('pointerup', lift);
    mud.addEventListener('pointercancel', lift);
    mud.addEventListener('pointerleave', () => { if (!pressing) last = null; });
    autoBtn.addEventListener('click', autoWash);
    muddyBtn.addEventListener('click', reset);

    let lastWidth = 0;
    function layout() {
      const w = stage.clientWidth;
      if (!w || w === lastWidth) return;
      lastWidth = w;
      if (!sizeCanvases()) return;
      drawMud();   // redraw the mud at the new size; the rubs so far are kept
      render();
    }
    resetMask();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(stage);
    else window.addEventListener('resize', layout);
    layout();
  }
  window.startScrub2D = startScrub2D;
  // If the 3D code never loads at all, fall back to the 2D car.
  setTimeout(() => { if (!window.scrub3dStarted) startScrub2D(); }, 6000);

  /* ---------- Booking: write the text message ---------- */
  const WASHES = {
    silver: { name: 'Silver', price: 8 },
    gold: { name: 'Gold', price: 12 },
    premium: { name: 'Premium', price: 20 },
    premiumplus: { name: 'Premium+', price: 24 },
    membership: { name: 'Membership', price: 8, monthly: true },
  };
  const PHONE_CLEANING = 4;
  const SMS_NUMBER = '+16503093989';
  const TEXT_NUMBER = '650-309-3989';

  const form = document.getElementById('booker');
  const msgEl = document.getElementById('msg');
  const totalEl = document.getElementById('total');
  const smsLink = document.getElementById('smsLink');
  const addPhone = document.getElementById('addPhone');
  const phoneRow = document.getElementById('phoneRow');
  const phoneLabel = phoneRow.querySelector('span');
  const whenInput = document.getElementById('when');
  const nameInput = document.getElementById('name');
  const note = document.getElementById('bookNote');
  const copyBtn = document.getElementById('copyBtn');
  const noteDefault = note.textContent;
  let messageText = '';

  function blank(text) {
    const s = document.createElement('span');
    s.className = 'blank';
    s.textContent = text;
    return s;
  }

  function compose() {
    const key = form.elements.wash.value || 'premium';
    const wash = WASHES[key];
    const included = key === 'premiumplus';
    const member = Boolean(wash.monthly);
    phoneRow.hidden = member;
    addPhone.disabled = included || member;
    if (included || member) addPhone.checked = false;
    phoneRow.classList.toggle('is-included', included);
    phoneLabel.innerHTML = included
      ? 'Phone cleaning comes with Premium+'
      : 'Add phone cleaning <em>+$4</em>';
    const extra = addPhone.checked && !included && !member;
    const total = wash.price + (extra ? PHONE_CLEANING : 0);
    const totalText = member ? `$${total} a month` : `$${total}`;
    const when = whenInput.value.trim();
    const name = nameInput.value.trim();

    const first = member
      ? `Hi Super Cool Dude Carwash! I'd like to sign up for the membership ($${wash.price} a month, one clean per week).`
      : `Hi Super Cool Dude Carwash! I'd like a ${wash.name} wash ($${wash.price})` +
        (extra ? ` plus phone cleaning ($${PHONE_CLEANING})` : '') + '.';
    const lines = [first];
    if (when) lines.push(`When: ${when}`);
    if (name) lines.push(`Name: ${name}`);
    lines.push(`Total: ${totalText}`);
    messageText = lines.join('\n');

    msgEl.replaceChildren(first + '\nWhen: ', when || blank('pick a time'), '\nName: ', name || blank('your name'), `\nTotal: ${totalText}`);
    totalEl.textContent = member ? `$${total}/mo` : `$${total}`;
    smsLink.href = `sms:${SMS_NUMBER}?&body=${encodeURIComponent(messageText)}`;
  }

  function setNote(text, ok) {
    note.textContent = text;
    note.classList.toggle('is-ok', !!ok);
  }

  function flash(btn, label) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = label;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
  }

  function selectNode(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function copy(text) {
    try {
      return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
    } catch (err) {
      return Promise.reject(err);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    compose();
    copy(messageText).then(() => {
      flash(copyBtn, 'Copied!');
      setNote(`Copied. Paste it into a text to ${TEXT_NUMBER}.`, true);
    }).catch(() => {
      selectNode(msgEl);
      setNote('Copying was blocked, so the text is selected. Press Ctrl+C (or ⌘C on a Mac) to copy it.', false);
    });
  });

  form.addEventListener('input', () => { compose(); setNote(noteDefault, false); });
  form.addEventListener('change', compose);

  document.querySelectorAll('[data-when]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.when;
      whenInput.value = v.charAt(0).toUpperCase() + v.slice(1);
      compose();
      setNote(noteDefault, false);
    });
  });

  document.querySelectorAll('[data-choose]').forEach((link) => {
    link.addEventListener('click', () => {
      const radio = document.getElementById('wash-' + link.dataset.choose);
      if (radio) { radio.checked = true; compose(); }
    });
  });

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      copy(btn.dataset.copy).then(() => flash(btn, 'Copied!')).catch(() => {
        const target = btn.previousElementSibling;
        if (target) selectNode(target);
        flash(btn, 'Press Ctrl+C');
      });
    });
  });

  compose();
  window.addEventListener('pageshow', compose);
})();
