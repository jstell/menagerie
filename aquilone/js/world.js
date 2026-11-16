'use strict';
// The world: five tableaux that blend into one another along an endless road and through one long day —
// morning countryside, midday village, afternoon garden, sunset riviera, and a seaside festa by night.
// Rolling terrain, parallax layers of hills, sea and sky, the scenery spawners, and the night lighting.
(() => {
  const A = window.A, C = A.C, TAU = A.TAU;
  const H = 720, BASE = 580, HORIZON = 408, BL = 1200;
  const BACK_SC = 1.25;   // roadside scenery is drawn larger so its people and details read
  const ZONES = A.ZONES = [
    { k: 'c', len: 15000, name: ['I', 'La Campagne'] },
    { k: 't', len: 13000, name: ['II', 'Le Village'] },
    { k: 'j', len: 12500, name: ['III', 'Le Jardin'] },
    { k: 'r', len: 14000, name: ['IV', 'La Riviera'] },
    { k: 'f', len: 13500, name: ['V', 'La Festa'] },
  ];
  const N = ZONES.length, KEYS = ZONES.map(z => z.k), START = [];
  let CYC = 0; for (const z of ZONES) { START.push(CYC); CYC += z.len; }
  A.H = H; A.CYC = CYC; A.ZONE_NAMES = ZONES.map(z => z.name);
  A.zoneStart = k => START[Math.max(0, KEYS.indexOf(k))];

  // Blend weights {c,t,j,r,f} at world x (they sum to 1), plus sea = r + f and i = index of the zone we are in
  A.zone = x => {
    const p = ((x % CYC) + CYC) % CYC, z = { c: 0, t: 0, j: 0, r: 0, f: 0 };
    let i = 0; while (i < N - 1 && p >= START[i + 1]) i++;
    const d0 = p - START[i], d1 = START[i] + ZONES[i].len - p, k = KEYS[i];
    if (d0 < BL) { const s = A.smooth(0.5 + d0 / (2 * BL)); z[k] = s; z[KEYS[(i + N - 1) % N]] = 1 - s; }
    else if (d1 < BL) { const s = A.smooth(0.5 + d1 / (2 * BL)); z[k] = s; z[KEYS[(i + 1) % N]] = 1 - s; }
    else z[k] = 1;
    z.sea = z.r + z.f; z.i = i; z.u = i + d0 / ZONES[i].len;      // u: position through the day, 0..5
    return z;
  };
  A.zoneIndex = x => A.zone(x).i;
  // how much night has fallen at world x: dusk gathers early in the festa and lifts just after dawn
  const nightU = u => (u >= 4 ? A.smooth((u - 4.04) / 0.32) : 1 - A.smooth(u / 0.07));
  A.nightAt = x => nightU(A.zone(x).u);

  A.ground = x => {
    const z = A.zone(x);
    return BASE - z.c * ((A.fbm(x / 640, 3, 2) - 0.5) * 2 * 118 + Math.sin(x / 210) * 7) - z.t * Math.sin(x / 330) * 5
      - z.j * ((A.fbm(x / 720, 5, 2) - 0.5) * 2 * 34) - z.sea * Math.sin(x / 260) * 6;
  };
  A.slope = x => (A.ground(x + 6) - A.ground(x - 6)) / 12;

  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const pal = o => { for (const k in o) o[k] = rgb(o[k]); return o; };
  const PAL = {
    far: pal({ c: '#b4b0d2', t: '#bdb6d0', j: '#b6b8d6', r: '#b6c6d8', f: '#a4a8cc' }),
    mid: pal({ c: '#b4c67c', t: '#c6c796', j: '#a6c886', r: '#cfd3a0', f: '#c0c0a4' }),
    near: pal({ c: '#8fb060', t: '#d9ccb8', j: '#9ac672', r: '#efd99c', f: '#e8d4a0' }),
    verge: pal({ c: '#9cb964', t: '#cdbea2', j: '#a4c670', r: '#ecd79a', f: '#e6d29c' }),
    road: pal({ c: '#ead6a4', t: '#e0d3ba', j: '#f0e2ba', r: '#efe2c4', f: '#ece0c8' }),
  };
  // wash of strength a over white paper, as one opaque colour
  const mixZ = (p, z, a) => {
    let r = 0, g = 0, b = 0; for (const k of KEYS) { const w = z[k]; if (w) { r += p[k][0] * w; g += p[k][1] * w; b += p[k][2] * w; } }
    const q = 255 * (1 - a); return `rgb(${Math.round(q + a * r)},${Math.round(q + a * g)},${Math.round(q + a * b)})`;
  };

  // ridge heights; lx = layer coordinate, z = zone weights of the screen column
  const yFar = (lx, z) => A.lerp(388 - 190 * Math.max(0, A.fbm(lx / 330, 31, 4) - 0.3) * (1 - 0.3 * z.j), 720, A.smooth(z.sea * 1.5));
  const yMid = (lx, z) => A.lerp(452 - 125 * (A.fbm(lx / 390, 21, 3) - 0.25) + z.t * 14 + z.j * 12, 730, A.smooth(z.sea * 1.35));
  const yNear = (lx, z) => z.c * (512 - 74 * (A.fbm(lx / 430, 11, 2) - 0.3)) + z.t * 548 + z.j * (536 - 18 * (A.fbm(lx / 310, 13, 2) - 0.5))
    + z.r * (524 + Math.sin(lx / 170) * 3) + z.f * (528 + Math.sin(lx / 170) * 3);
  const yIsle = lx => HORIZON + 2 - Math.max(0, A.fbm(lx / 250, 41, 3) - 0.47) * 230;

  // the sky through the day, keyed to position along the road: [u, zenith, horizon]
  const SKY = [[0, '#9cc9d2', '#f7e3bf'], [1.5, '#86bcd2', '#f5e8cc'], [2.5, '#8fc0cf', '#f8e2b4'], [3.3, '#b4b8cc', '#f8d49a'], [3.85, '#e2a58e', '#f8c479'],
    [4.12, '#8a7fb4', '#e0989c'], [4.4, '#56639f', '#8e88b8'], [4.92, '#56639f', '#9a8cb8'], [5, '#9cc9d2', '#f7e3bf']];
  const NIGHT = [70, 84, 150];
  const onTop = it => /beachset|cabana|rowboat|strongman|pond/.test(it.name);   // near-layer things that sit on the sand or lawn

  const Wd = A.W = {
    camX: 0, t: 0, boil: 0, W: 1280, layers: null, sea: [], clouds: [], rockets: [], sparks: [], fwT: 0,
    reset(x0) {
      this.camX = x0; this.sea = []; this.clouds = []; this.rockets = []; this.sparks = [];
      const mk = (key, par, lead) => ({ key, par, items: [], next: x0 * par - 200, lead });
      this.layers = { mid: mk('mid', 0.38, 200), near: mk('near', 0.66, 360), back: mk('back', 1, 320), front: mk('front', 1.32, 200) };
      this.seaNext = x0 - 900; this.cloudNext = x0 * 0.08 - 300; this.r = A.rng(12345);
      this.fill();
    },
    sx(lx, par) { return lx - this.camX * par; },
    fill() {
      const r = this.r, W = this.W;
      for (const L of Object.values(this.layers)) {
        while (L.next < this.camX * L.par + W + L.lead) {
          const xf = this.camX + (L.next - this.camX * L.par), z = A.zone(xf);
          let u = r(), zk = KEYS[z.i]; for (const k of KEYS) { u -= z[k]; if (u <= 0) { zk = k; break; } }
          const tab = A.TABLES[L.key][zk];
          let tot = 0; for (const e of tab) tot += e[1];
          let pick = r() * tot, e = tab[0]; for (const q of tab) { pick -= q[1]; if (pick <= 0) { e = q; break; } }
          const d = A.SPR.defs[e[0]], gap = r.range(e[2], e[3]) * (L.key === 'back' ? BACK_SC : 1), ital = zk === 'r' || zk === 'f';
          let v = r.int(0, (d.v || 1) - 1);
          L.recent = L.recent || [];
          // big set pieces should not repeat back to back
          if (d.rare && L.recent.some(q => q.startsWith(e[0]))) { L.next += 60; continue; }
          for (let tries = 0; tries < 8 && (d.v || 1) > 2; tries++) {
            if (e[0] === 'cafe') v = r.int(0, (d.v >> 1) - 1) * 2 + (ital ? 1 : 0);
            if (!L.recent.includes(e[0] + v)) break;
            v = r.int(0, d.v - 1);
          }
          if (e[0] === 'cafe') v = (v & ~1) | (ital ? 1 : 0);
          L.recent.push(e[0] + v); if (L.recent.length > 7) L.recent.shift();
          const it = { name: e[0], v, lx: L.next + gap * 0.5, flip: !d.noflip && !/house|cafe|sign|gelato|rowboat|skyline|church|kiosk|stall|guignol|striker|carousel|bandstand|ferris|bigtop/.test(e[0]) && r.chance(0.5), id: (r() * 1e6) | 0 };
          L.items.push(it);
          if (L.key === 'back') {
            if (/house|cafe|stall/.test(e[0]) && r.chance(zk === 'f' ? 0.6 : 0.3)) L.items.push({ name: zk === 'f' ? 'lanterns' : 'bunting', v: r.int(0, 2), lx: it.lx + gap * 0.5, flip: false, id: 1 });
            if (A.actors) A.actors.onScenery(it, zk, gap, r);
          }
          L.next += gap;
        }
        while (L.items.length && this.sx(L.items[0].lx, L.par) < -560) L.items.shift();
      }
      // boats out on the water
      while (this.seaNext < this.camX + W + 400) {
        if (A.zone(this.seaNext).sea > 0.75) { const d = r(), s = { name: r.chance(0.16) ? 'steamer' : 'sailboat', v: r.int(0, 3), d, par: 0.14 + d * 0.3, lx: 0, ph: r() * 9 }; s.lx = this.camX * s.par + (this.t === 0 ? r() * W * 1.2 : W + 120 + r() * 200); this.sea.push(s); }
        this.seaNext += r.range(260, 620);
      }
      while (this.sea.length && this.sea[0].lx - this.camX * this.sea[0].par < -300) this.sea.shift();
      // clouds drift on their own
      while (this.cloudNext < this.camX * 0.08 + W + 300) { this.clouds.push({ lx: this.cloudNext, y: r.range(70, 300), v: r.int(0, 4), sc: r.range(0.6, 1.25), par: 0.08, drift: r.range(4, 10) }); this.cloudNext += r.range(170, 420); }
      while (this.clouds.length && this.clouds[0].lx - this.camX * 0.08 < -400) this.clouds.shift();
    },
    update(dt) {
      this.t += dt; this.boil = Math.floor(this.t * 7.5); for (const c of this.clouds) c.lx -= c.drift * dt; this.fill();
      for (const s of this.sea) s.lx -= (s.name === 'steamer' ? 5 : 9) * dt;
      this.fireworks(dt);
    },

    // ───── fireworks over the festa ─────
    fireworks(dt) {
      const W = this.W, nf = A.nightAt(this.camX + W * 0.5), z = A.zone(this.camX + W * 0.5);
      this.fwT -= dt;
      if (nf > 0.85 && z.f > 0.6 && this.fwT <= 0) {
        this.fwT = 0.5 + Math.random() * 1.7;
        this.rockets.push({ x: W * (0.12 + Math.random() * 0.8), y: HORIZON + 30, vy: -330 - Math.random() * 120, ty: 80 + Math.random() * 170, col: ['#ffd27a', '#ff8a6a', '#8fe0d0', '#f3a0d0', '#ffffff', '#b6c8ff'][(Math.random() * 6) | 0], wob: Math.random() * 9 });
      }
      for (const k of this.rockets) {
        k.y += k.vy * dt; k.x += Math.sin(this.t * 9 + k.wob) * 14 * dt - this.camSpeed * 0.06 * dt;
        if (k.y <= k.ty) {
          k.dead = true; const n = 22 + ((Math.random() * 14) | 0), ring = Math.random() < 0.35;
          for (let i = 0; i < n; i++) { const a = i / n * TAU + Math.random() * 0.2, sp = ring ? 150 : 50 + Math.random() * 150; this.sparks.push({ x: k.x, y: k.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.1 + Math.random() * 0.7, col: k.col }); }
          this.sparks.push({ x: k.x, y: k.y, vx: 0, vy: 0, life: 0, max: 0.35, col: k.col, flash: true });
          if (A.G && A.G.state !== 'title') A.G.sfx('firework', 0.22, 0.9 + Math.random() * 0.25);
        }
      }
      this.rockets = this.rockets.filter(k => !k.dead);
      for (const s of this.sparks) { s.life += dt; s.x += s.vx * dt - this.camSpeed * 0.06 * dt; s.y += s.vy * dt; s.vy += 70 * dt; s.vx *= Math.pow(0.25, dt); s.vy *= Math.pow(0.35, dt); }
      this.sparks = this.sparks.filter(s => s.life < s.max);
    },
    camSpeed: 0,

    // sample a ridge across the screen at world-anchored positions
    ridge(par, step, fn) {
      const out = [], off = this.camX * par, W = this.W;
      for (let lx = Math.floor((off - 30) / step) * step; lx <= off + W + 30 + step; lx += step) { const sx = lx - off; out.push([sx, fn(lx, A.zone(this.camX + sx)), lx]); }
      return out;
    },
    zoneGrad(c, pal, a) {
      const g = c.createLinearGradient(0, 0, this.W, 0);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, mixZ(pal, A.zone(this.camX + this.W * i / 8), a));
      return g;
    },
    // ink a world-anchored polyline: jitter keyed to layer position so it boils without crawling
    inkRidge(g, pts, w, a, amp, col) {
      const c = g.c, b = this.boil;
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const k = Math.round(pts[i][2]) * 3 + b * 131 + pass * 17, x = pts[i][0] + (A.hash(k) - 0.5) * amp, y = pts[i][1] + (A.hash(k + 1) - 0.5) * 2 * amp * (pass ? 1.5 : 1);
          if (i === 0) c.moveTo(x, y); else { const px = pts[i - 1]; c.quadraticCurveTo(px[0], px[1] + (A.hash(k - 2) - 0.5) * 2 * amp * (pass ? 1.5 : 1), (px[0] + x) / 2, (px[1] + y) / 2); }
        }
        c.strokeStyle = col || C.ink; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = pass ? w * 0.5 : w; c.globalAlpha = pass ? a * 0.45 : a; c.stroke();
      }
      c.globalAlpha = 1;
    },
    // opaque paper + layered wash under a ridge
    hill(g, pts, pal, a, band, o = {}) {
      const c = g.c, n = pts.length, bot = o.bottom ?? H + 10;
      c.globalAlpha = 1; c.beginPath(); c.moveTo(pts[0][0], bot); for (const p of pts) c.lineTo(p[0], p[1]); c.lineTo(pts[n - 1][0], bot); c.closePath();
      c.fillStyle = this.zoneGrad(c, pal, a); c.fill();
      if (!band) return;
      // second, shorter wash hugging the ridge — the layered look of a real watercolor
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1] + 1.5);
      for (let i = n - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + band * (0.55 + 0.7 * A.hash(Math.round(pts[i][2]) + 9)));
      c.closePath(); c.fillStyle = this.zoneGrad(c, pal, 1 - (1 - a) * (1 - a * 0.75)); c.fill();
      // and a third, darker lick right under the ridge line
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1] + 1);
      for (let i = n - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + band * 0.28 * (0.3 + A.hash(Math.round(pts[i][2]) + 3)));
      c.closePath(); c.fillStyle = 'rgba(70,90,80,0.07)'; c.fill();
    },

    drawSky(g) {
      const c = g.c, W = this.W, z = A.zone(this.camX + W * 0.3), u = z.u;
      let i = 0; while (i < SKY.length - 2 && u > SKY[i + 1][0]) i++;
      const f = A.clamp((u - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]), 0, 1), top = A.mix(SKY[i][1], SKY[i + 1][1], f), low = A.mix(SKY[i][2], SKY[i + 1][2], f);
      // the wash changes slowly, so paint it small now and then and stretch it over the sky
      const SK = 4, sw = Math.ceil(W / SK), sh = 140;
      if (!this.skyCv || this.skyCv.width !== sw) { this.skyCv = document.createElement('canvas'); this.skyCv.width = sw; this.skyCv.height = sh; this.skyAge = 99; }
      if (++this.skyAge > 12) {
        this.skyAge = 0; const k2 = this.skyCv.getContext('2d'); k2.setTransform(1 / SK, 0, 0, 1 / SK, 0, 0);
        k2.fillStyle = '#fff'; k2.fillRect(0, 0, W + SK, 560);
        const gr = k2.createLinearGradient(0, 20, 0, 540);
        gr.addColorStop(0, A.rgba(top, 0.74)); gr.addColorStop(0.5, A.rgba(top, 0.36)); gr.addColorStop(0.75, A.rgba(low, 0.52)); gr.addColorStop(1, A.rgba(low, 0.12));
        k2.fillStyle = gr; k2.fillRect(0, 0, W + SK, 560);
        const blob = (x, y, rx, sq, col) => { const rg = k2.createRadialGradient(x, y, 0, x, y, rx); rg.addColorStop(0, col); rg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)')); k2.save(); k2.translate(0, y); k2.scale(1, sq); k2.translate(0, -y); k2.fillStyle = rg; k2.fillRect(x - rx, y - rx, rx * 2, rx * 2); k2.restore(); };
        const span = W + 700, wrap = v => ((v % span) + span) % span - 350;
        // unpainted, cloud-soft gaps in the wash
        for (let k = 0; k < 7; k++) blob(wrap(A.hash(k * 7 + 3) * span - this.camX * 0.03 - this.t * 3), 60 + A.hash(k * 7 + 4) * 300, 180 + A.hash(k * 7 + 5) * 240, 0.45, 'rgba(255,255,255,0.75)');
        // long loaded-brush streaks: warm near the horizon, cool and pale higher up
        const lo = rgb(low), hi = rgb(top);
        for (let k = 0; k < 11; k++) {
          const y = 70 + A.hash(k * 5 + 31) * 330, warm = y > 250, q = warm ? lo : hi;
          blob(wrap(A.hash(k * 5 + 32) * span - this.camX * (0.02 + k * 0.004) - this.t * (2 + k * 0.4)), y, 200 + A.hash(k * 5 + 33) * 300, 0.045 + A.hash(k * 5 + 34) * 0.05, `rgba(${q[0]},${q[1]},${q[2]},${warm ? 0.55 : 0.4})`);
        }
      }
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'; c.drawImage(this.skyCv, 0, 0, sw, sh, 0, 0, sw * SK, sh * SK);
      const nf = nightU(u); this.nf = nf;
      if (nf < 0.98) this.sun(g, Math.min(1.08, u / 4.12), 1 - nf);
      for (const cl of this.clouds) A.drawSprite(c, 'cloud', cl.v, cl.lx - this.camX * cl.par, cl.y, this.boil + cl.v, cl.sc);
    },
    sun(g, p, al) {
      const c = g.c, W = this.W, x = W * (0.8 - 0.42 * p), y = 112 + 320 * Math.pow(p, 2.3), R = 30 + 12 * p, t = this.t;
      const col = A.mix(C.ochre, C.red, A.smooth((p - 0.62) / 0.3));
      c.globalAlpha = al;
      const halo = c.createRadialGradient(x, y, R * 0.6, x, y, R * 4.4); halo.addColorStop(0, A.rgba(col, 0.44)); halo.addColorStop(1, A.rgba(col, 0));
      c.fillStyle = halo; c.fillRect(x - R * 4.5, y - R * 4.5, R * 9, R * 9); c.globalAlpha = 1;
      g.al = al; g.seed(this.boil * 31 + 3, 77);
      g.paintEll(x, y, R, R, col, { a: 0.8 }); g.ell(x, y, R, R, { w: 1.6 });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU + t * 0.12, l = i % 2 ? 14 : 24, r0 = R + 7, wv = Math.sin(t * 2 + i) * 2;
        g.line([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a + 0.06) * (r0 + l * 0.5) + wv * Math.sin(a), y + Math.sin(a + 0.06) * (r0 + l * 0.5) - wv * Math.cos(a)], [x + Math.cos(a) * (r0 + l), y + Math.sin(a) * (r0 + l)]], { w: 1.2, c: i % 2 ? C.ink : C.brick, step: 99, a: 0.8 });
      }
      // a drowsy, kindly face
      const blink = (t % 5) > 4.8;
      for (const k of [-1, 1]) { if (blink) g.seg(x + k * 11 - 4, y - 5, x + k * 11 + 4, y - 5, { w: 1.2, over: 0 }); else g.arc(x + k * 11, y - 4, 4.5, 3.5, Math.PI, TAU, { w: 1.3 }); g.washEll(x + k * 15, y + 6, 5, 3.5, C.red, { a: 0.3, edge: false, mottle: false }); }
      g.arc(x, y + 5, 10, 7, 0.2, Math.PI - 0.2, { w: 1.4 }); g.line([[x - 1, y - 2], [x + 2.5, y + 3], [x - 1, y + 4]], { w: 1, dbl: false, wob: 0.4 });
      g.al = 1;
    },

    drawSea(g) {
      const c = g.c, W = this.W, t = this.t;
      // islands on the horizon
      const isl = this.ridge(0.06, 16, yIsle);
      c.beginPath(); c.moveTo(isl[0][0], HORIZON + 4); for (const p of isl) c.lineTo(p[0], p[1]); c.lineTo(isl[isl.length - 1][0], HORIZON + 4); c.closePath();
      c.fillStyle = 'rgb(207,207,230)'; c.fill();
      this.inkRidge(g, isl.filter(p => p[1] < HORIZON + 1.5), 1, 0.45, 0.8, C.inkSoft);
      // water: deep at the horizon, pale and green in the shallows
      const y1 = 600, gr = c.createLinearGradient(0, HORIZON, 0, y1);
      gr.addColorStop(0, 'rgb(113,164,179)'); gr.addColorStop(0.3, 'rgb(149,196,200)'); gr.addColorStop(0.75, 'rgb(193,225,218)'); gr.addColorStop(1, 'rgb(226,242,232)');
      c.fillStyle = gr; c.fillRect(0, HORIZON, W, y1 - HORIZON);
      // broad horizontal bands of a second wash, drifting
      for (let k = 0; k < 6; k++) { const y = HORIZON + 8 + k * 19 + Math.sin(t * 0.5 + k) * 2, x = ((A.hash(k * 3 + 50) * (W + 600) - this.camX * (0.1 + k * 0.05)) % (W + 600) + (W + 600)) % (W + 600) - 300, w = 260 + A.hash(k + 60) * 340; c.fillStyle = k % 2 ? 'rgba(60,130,150,0.13)' : 'rgba(255,255,255,0.16)'; c.beginPath(); c.ellipse(x, y, w, 5 + k * 1.3, 0, 0, TAU); c.fill(); }
      const hz = []; for (let x = -20; x <= W + 20; x += 40) hz.push([x, HORIZON, Math.round(x + this.camX * 0.02)]);
      this.inkRidge(g, hz, 1.1, 0.6, 0.7, C.prussian);
      // little wave marks, denser and larger toward the shore
      g.seed(this.boil * 53 + 9, 3);
      for (let row = 0; row < 7; row++) {
        const d = (row + 0.5) / 7, y = HORIZON + 6 + d * d * 150, par = 0.1 + d * 0.5, gap = 70 + d * 90, off = this.camX * par + t * (6 + d * 16);
        for (let k = Math.floor(off / gap) - 1; k * gap < off + W + gap; k++) {
          const hsh = A.hash(k * 13 + row * 101); if (hsh < 0.35) continue;
          const x = k * gap - off + A.hash(k + row * 7) * gap * 0.7, s = 4 + d * 9, yy = y + Math.sin(t * 1.6 + k) * (1 + d * 2);
          g.line([[x - s * 2, yy], [x - s, yy - s * 0.45], [x, yy], [x + s, yy - s * 0.45], [x + s * 2, yy]], { w: 0.9 + d * 0.5, c: hsh > 0.8 ? '#ffffff' : C.prussian, a: hsh > 0.8 ? 0.9 : 0.5, dbl: false, step: 99, wob: 0.5, taper: false });
        }
      }
      // the moon's path across the water (painted here so the shore and everything on it stays in front)
      const nf = this.nf || 0;
      if (nf > 0.05) for (let k = 0; k < 18; k++) {
        const d = k / 18, y = HORIZON + 4 + d * d * 150, w = (10 + d * 70) * (0.55 + 0.45 * Math.sin(t * 2 + k * 1.7));
        c.globalAlpha = nf * (1 - d * 0.3); c.fillStyle = '#ffffff'; c.fillRect(W * 0.7 - w + Math.sin(t + k) * 6, y, w * 2, 2.4 + d * 3.4);
      }
      c.globalAlpha = 1;
      for (const s of this.sea) {
        const x = s.lx - this.camX * s.par, y = HORIZON + 14 + s.d * 76 + Math.sin(t * 1.3 + s.ph) * 2, sc = 0.3 + s.d * 0.55;
        c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.1 + s.ph) * 0.04); A.drawSprite(c, s.name, s.v, 0, 0, this.boil, sc); c.restore();
      }
    },

    items(g, L, yOf, sc = 1, only) {
      const c = g.c, W = this.W;
      for (const it of L.items) {
        if (only && !only(it)) continue;
        const sx = it.lx - this.camX * L.par; if (sx < -380 || sx > W + 380) continue;
        const y = yOf(it, sx); it.sy = y; it.ssc = sc;
        const d = A.SPR.defs[it.name];
        if (d.liveBack) d.liveBack(g, sx, y, sc, this.t, it);
        A.drawSprite(c, it.name, it.v, sx, y, this.boil + it.id, sc, it.flip);
        if (d.hub) A.drawSails(g, sx + (it.flip ? -1 : 1) * d.hub[0] * sc, y + d.hub[1] * sc, (d.hubR || 66) * sc, this.t * 0.9 + it.id, sc);
        if (d.live) d.live(g, sx, y, sc, this.t, it);
      }
    },

    // everything behind the road
    drawBack(g) {
      const W = this.W;
      this.drawSky(g);
      let anySea = 0; for (let i = 0; i <= 4; i++) anySea = Math.max(anySea, A.zone(this.camX + W * i / 4).sea);
      this.anySea = anySea;
      if (anySea > 0.01) this.drawSea(g);
      // far mountains
      let pts = this.ridge(0.13, 14, yFar);
      this.hill(g, pts, PAL.far, 0.5, 26); this.inkRidge(g, pts, 1.1, 0.5, 1, C.inkSoft);
      // a few contour strokes down the flanks
      g.seed(this.boil * 7 + 1, 1);
      for (const p of pts) { if (A.hash(Math.round(p[2]) * 5) > 0.82 && p[1] < 400) g.line([[p[0], p[1] + 4], [p[0] - 9, p[1] + 26 + A.hash(p[2]) * 22]], { w: 0.7, a: 0.35, dbl: false, c: C.inkSoft }); }
      // mid hills with their patchwork of fields
      this.items(g, this.layers.mid, (it, sx) => yMid(it.lx, A.zone(this.camX + sx)) + 4, 0.8);
      pts = this.ridge(0.38, 14, yMid);
      this.hill(g, pts, PAL.mid, 0.6, 30);
      this.fields(g, pts);
      this.inkRidge(g, pts, 1.3, 0.65, 1.2);
      // near backdrop: treelines, skyline, park railings, beach, fairground
      this.items(g, this.layers.near, (it, sx) => yNear(it.lx, A.zone(this.camX + sx)) + 5, 1, it => !onTop(it));
      pts = this.ridge(0.66, 13, yNear);
      this.hill(g, pts, PAL.near, 0.62, 22);
      this.inkRidge(g, pts, 1.3, 0.7, 1.1);
      this.items(g, this.layers.near, (it, sx) => yNear(it.lx, A.zone(this.camX + sx)) + 14 + (it.id % 9), 1, onTop);
      // back props standing along the far side of the road
      this.items(g, this.layers.back, it => Math.max(A.ground(it.lx - 50), A.ground(it.lx + 50)) - 21, BACK_SC);
    },
    fields(g, pts) {
      const c = g.c, cell = 9, cols = ['rgba(219,163,60,0.3)', 'rgba(150,180,95,0.34)', 'rgba(232,201,121,0.36)', 'rgba(120,150,80,0.3)', 'rgba(201,116,74,0.16)', 'rgba(169,156,194,0.3)'];
      for (let i = 0; i + cell < pts.length; i++) {
        const k = Math.round(pts[i][2] / 14); if (k % cell) continue;
        const z = A.zone(this.camX + pts[i][0]); if (z.sea > 0.4 || z.j > 0.6) continue;
        const hsh = A.hash(k * 3 + 1), depth = 70 + hsh * 50, skew = -46;
        c.beginPath(); c.moveTo(pts[i][0], pts[i][1] + 3);
        for (let j = i; j <= i + cell; j++) c.lineTo(pts[j][0], pts[j][1] + 3);
        for (let j = i + cell; j >= i; j--) c.lineTo(pts[j][0] + skew, pts[j][1] + depth);
        c.closePath(); c.fillStyle = cols[Math.floor(hsh * cols.length)]; c.fill();
        g.seed(this.boil * 3 + k, k);
        g.line(A.quadPts([pts[i][0], pts[i][1] + 3], [pts[i][0] + skew * 0.3, pts[i][1] + depth * 0.6], [pts[i][0] + skew, pts[i][1] + depth], 5), { w: 0.8, a: 0.4, dbl: false, c: C.inkSoft });
        if (hsh > 0.45) for (let j = i + 2; j < i + cell; j += 2) g.line([[pts[j][0] - 4, pts[j][1] + 12], [pts[j][0] + skew * 0.7, pts[j][1] + depth * 0.8]], { w: 0.6, a: 0.25, dbl: false, c: C.inkSoft });
      }
    },

    // the road and the bank in front of it
    drawGround(g) {
      const c = g.c, W = this.W, cam = this.camX, b = this.boil;
      const top = [], low = [];
      for (let x = Math.floor((cam - 30) / 12) * 12; x <= cam + W + 42; x += 12) { const y = A.ground(x), sx = x - cam; top.push([sx, y - 21, x]); low.push([sx, y + 13, x]); }
      this.hill(g, top, PAL.road, 0.6, 0);
      // soft contact shadows where the roadside things meet the ground
      c.fillStyle = 'rgba(96,84,134,0.17)';
      for (const it of this.layers.back.items) {
        const sx = it.lx - cam; if (sx < -300 || sx > W + 300) continue; const d = A.SPR.defs[it.name]; if (d.b === 0) continue;
        c.beginPath(); c.ellipse(sx + d.w * 0.06 * BACK_SC, (it.sy ?? A.ground(it.lx) - 21) + 3, d.w * (d.sw ?? 0.4) * BACK_SC, 5.5, 0, 0, TAU); c.fill();
      }
      this.hill(g, low, PAL.verge, 0.62, 30);
      this.inkRidge(g, top, 1.1, 0.6, 0.9);
      this.inkRidge(g, low, 1.7, 0.85, 1.1);
      // surface marks: ruts and pebbles, cobbles, raked gravel, boardwalk planks
      g.seed(b * 17 + 5, 5);
      const mk = { taper: false, dbl: false };
      for (let x = Math.floor((cam - 40) / 26) * 26; x <= cam + W + 40; x += 26) {
        const z = A.zone(x), y = A.ground(x), sx = x - cam, h1 = A.hash(x), h2 = A.hash(x + 7);
        if (z.c > 0.5) {
          if (h1 > 0.4) g.line([[sx, y - 7 + h2 * 3], [sx + 18, A.ground(x + 18) - 7 + h2 * 3]], { w: 0.8, a: 0.35, ...mk });
          if (h1 < 0.3) g.dot(sx + 8, y + 3 + h2 * 6, 1.2, { a: 0.5 });
          if (h2 > 0.35) { const tx = sx + h1 * 20, ty = A.ground(x + h1 * 20) + 15 + h2 * 4; for (let k = -1; k <= 1; k++) g.line([[tx + k * 2.5, ty], [tx + k * 6 + (h1 - 0.5) * 4, ty - 8 - h2 * 8]], { w: 1.1, c: C.olive, a: 0.85, ...mk }); }
          if (h1 > 0.88) { const fx = sx + 13, fy = A.ground(x + 13) + 24; g.seg(fx, fy + 10, fx + 1, fy, { w: 0.9, c: C.olive }); g.paintEll(fx + 1, fy - 2, 3.4, 3.2, h2 > 0.5 ? C.red : C.ochre, { a: 0.95, mottle: false }); }
        } else if (z.t > 0.5) {
          for (let k = 0; k < 2; k++) { const cx = sx + k * 13 + (h1 - 0.5) * 4, cy = y - 14 + k * 9 + h2 * 5; if (A.hash(x + k * 3) > 0.3) g.arc(cx, cy, 5.5, 2.6, Math.PI * 1.05, Math.PI * 1.95, { w: 0.8, a: 0.4, ...mk }); }
          g.seg(sx, y + 44, sx + 26, A.ground(x + 26) + 44, { w: 0.8, a: 0.26, over: 0, ...mk });
          if ((x / 26) % 2 === 0) g.seg(sx + (h1 - 0.5) * 6, y + 15, sx - 9, y + 44, { w: 0.8, a: 0.26, over: 0, ...mk }); else g.seg(sx - 8, y + 44, sx - 22, y + 96, { w: 0.9, a: 0.24, over: 0, ...mk });
        } else if (z.j > 0.5) {
          // raked gravel, a clipped box edging, and daisies in the lawn
          if (h1 > 0.35) g.dot(sx + h2 * 22, y - 12 + h1 * 18, 0.9, { a: 0.4 });
          if (h2 > 0.5) g.dot(sx + h1 * 22, y - 4 + h2 * 10, 0.8, { a: 0.35 });
          const ey = A.ground(x + 13) + 13; g.scribble(sx + 13, ey - 2, 13, 4.5, 7, { c: C.leaf, a: 0.75, w: 1.2, taper: false });
          if (h1 > 0.55) { const fx = sx + h2 * 24, fy = y + 30 + h1 * 40; g.paintEll(fx, fy, 2.6, 2.2, '#ffffff', { a: 1, mottle: false, edge: false }); g.dot(fx, fy, 0.9, { c: C.ochre }); }
        } else {
          g.seg(sx, y - 20, sx - 2, y + 12, { w: 0.7, a: 0.3, over: 0, ...mk });
          if (h1 > 0.3) g.dot(sx + h2 * 20, y + 22 + h1 * 30, 0.9, { a: 0.4 });
          if (h1 > 0.6) g.dot(sx + h1 * 20, y + 18 + h2 * 50, 0.9, { a: 0.35 });
        }
      }
    },
    drawFront(g) {
      this.items(g, this.layers.front, () => H - A.FRAME.M + 4, 1.25);
    },

    // ───── night ─────
    // A cool blue glaze laid over the finished painting; it thickens column by column as dusk comes on.
    drawNight(g) {
      const c = g.c, W = this.W; let any = 0; const st = [];
      for (let i = 0; i <= 8; i++) { const n = A.nightAt(this.camX + W * i / 8); st.push(n); any = Math.max(any, n); }
      this.anyNight = any; if (any < 0.01) return;
      const gr = c.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 8; i++) { const k = st[i] * 0.84; gr.addColorStop(i / 8, `rgb(${Math.round(255 - (255 - NIGHT[0]) * k)},${Math.round(255 - (255 - NIGHT[1]) * k)},${Math.round(255 - (255 - NIGHT[2]) * k)})`); }
      c.globalCompositeOperation = 'multiply'; c.fillStyle = gr; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
    },
    glow(c, x, y, r, a) { c.globalAlpha = a; c.drawImage(A.glowCv, x - r, y - r, r * 2, r * 2); },
    // Everything that shines: moon and stars, lamps and lit windows, lanterns, the big wheel, fireworks.
    drawLights(g) {
      if (!(this.anyNight > 0.01)) return;
      const c = g.c, W = this.W, t = this.t, nf = this.nf, cam = this.camX;
      c.save(); c.globalCompositeOperation = 'lighter';
      // stars
      for (let i = 0; i < 70; i++) {
        const x = A.hash(i * 11 + 1) * W, y = 34 + A.hash(i * 11 + 2) * 330, n = A.nightAt(cam + x); if (n < 0.3) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + A.hash(i) * 3) + i), s = 1 + A.hash(i * 11 + 3) * 2.2;
        c.globalAlpha = n * tw * 0.9; c.fillStyle = '#fff3cf';
        c.fillRect(x - s, y - 0.5, s * 2, 1); c.fillRect(x - 0.5, y - s, 1, s * 2);
      }
      // moon, rising over the water, and its path on the sea
      if (nf > 0.05) {
        const u = A.zone(cam + W * 0.3).u, rise = u >= 4 ? A.smooth((u - 4.1) / 0.45) : 1, mx = W * 0.7, my = 330 - 205 * rise, R = 34;
        this.glow(c, mx, my, R * 4.5, nf * 0.55); this.glow(c, mx, my, R * 1.9, nf * 0.9);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = nf;
        c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(mx, my, R, 0, TAU); c.fill();
        c.fillStyle = 'rgba(190,180,170,0.28)'; for (const [dx, dy, rr] of [[-10, -8, 9], [9, 6, 7], [-4, 14, 5], [14, -12, 4]]) { c.beginPath(); c.arc(mx + dx, my + dy, rr, 0, TAU); c.fill(); }
        c.globalAlpha = 1; g.al = nf * 0.7; g.seed(this.boil * 3 + 44, 44); g.ell(mx, my, R, R, { w: 1.2, c: C.umber }); g.al = 1;
        c.globalCompositeOperation = 'lighter';
      }
      // lamps, windows and lanterns on the scenery
      const lay = [[this.layers.near, 0.75], [this.layers.back, 1], [this.layers.front, 1]];
      for (const [L, k] of lay) for (const it of L.items) {
        if (it.sy === undefined) continue;
        const sx = it.lx - cam * L.par; if (sx < -380 || sx > W + 380) continue;
        const n = A.nightAt(cam + sx); if (n < 0.08) continue;
        const sp = A.SPR.cache.get(it.name + ':' + it.v), d = A.SPR.defs[it.name], sc = it.ssc || 1, fl = it.flip ? -1 : 1;
        const list = sp && sp.lights; if (list) for (const q of list) {
          const fx = sx + q[0] * sc * fl, fy = it.sy + q[1] * sc, fr = q[2] * sc, fk = 0.9 + 0.1 * Math.sin(t * 7 + q[0] + it.id);
          this.glow(c, fx, fy, fr * 2.6, n * 0.5 * k * fk); this.glow(c, fx, fy, fr * 0.8, n * 0.85 * k);
        }
        if (d.liveLights) for (const q of d.liveLights(sx, it.sy, sc, t, it)) { this.glow(c, q[0], q[1], q[2] * 2.4, n * 0.5 * k); this.glow(c, q[0], q[1], q[2] * 0.8, n * 0.9 * k); }
      }
      // a lantern on every boat
      for (const s of this.sea) { const x = s.lx - cam * s.par, y = HORIZON + 14 + s.d * 76, sc = 0.3 + s.d * 0.55, n = A.nightAt(cam + x); if (n > 0.1) { this.glow(c, x, y - 34 * sc, 22 * sc, n * 0.7); this.glow(c, x, y - 34 * sc, 6 * sc, n); c.globalAlpha = n * 0.35; c.fillStyle = '#ffd98a'; c.fillRect(x - 2 * sc, y + 4, 4 * sc, 14 * sc); } }
      // fireworks: rising rockets, then chrysanthemums of sparks
      c.lineCap = 'round';
      for (const k of this.rockets) { c.globalAlpha = 0.8; c.strokeStyle = '#ffe2a0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(k.x, k.y); c.lineTo(k.x - Math.sin(t * 9 + k.wob) * 3, k.y + 22); c.stroke(); }
      for (const s of this.sparks) {
        const u = s.life / s.max;
        if (s.flash) { this.glow(c, s.x, s.y, 130 * (0.4 + u), (1 - u) * 0.5); continue; }
        c.globalAlpha = (1 - u * u) * 0.95; c.strokeStyle = s.col; c.lineWidth = 2.1 * (1 - u * 0.6);
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.09, s.y - s.vy * 0.09); c.stroke();
        if (u < 0.5) this.glow(c, s.x, s.y, 7, (0.5 - u) * 0.8);
      }
      c.restore(); c.globalAlpha = 1;
    },
  };

  // a soft warm blob of light, stamped wherever something glows
  A.makeGlow = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const k = cv.getContext('2d'), gr = k.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,226,150,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,0.55)'); gr.addColorStop(0.6, 'rgba(255,170,80,0.16)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
    k.fillStyle = gr; k.fillRect(0, 0, 128, 128); return cv;
  };

  // windmill sails, redrawn live so they turn
  A.drawSails = (g, x, y, R, ang, sc) => {
    g.seed(A.W.boil * 13 + 2, 2);
    const lw = sc < 0.9 ? 0.8 : 1.3;
    for (let i = 0; i < 4; i++) {
      const a = ang + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, wv = R * 0.2;
      g.seg(x, y, x + ca * R, y + sa * R, { w: lw * 1.2 });
      const q = [[x + ca * R * 0.22, y + sa * R * 0.22], [x + ca * R, y + sa * R], [x + ca * R + nx * wv, y + sa * R + ny * wv], [x + ca * R * 0.22 + nx * wv, y + sa * R * 0.22 + ny * wv]];
      g.wash(q, C.cream, { a: 0.5, spread: 1, mottle: false }); g.poly(q, { w: lw * 0.8, dbl: false });
      if (R > 40) for (let k = 0.4; k < 1; k += 0.2) g.seg(x + ca * R * k, y + sa * R * k, x + ca * R * k + nx * wv, y + sa * R * k + ny * wv, { w: 0.6, dbl: false, over: 0, a: 0.6 });
    }
    g.dot(x, y, 2.2 * sc);
  };

  // clouds live with the sky, so they are defined here: soft paint first, a few loose ink contours after
  A.SPR.defs.cloud = { name: 'cloud', w: 230, h: 100, b: 30, v: 5, far: true, draw(g, r) {
    const blobs = r.int(3, 5), pts = [], top = [], bot = [];
    for (let i = 0; i < blobs; i++) { const cx = -80 + i * 160 / (blobs - 1), rr = r.range(24, 44) * (1 - Math.abs(i - (blobs - 1) / 2) / blobs * 0.8); top.push(...A.arcPts(cx, -28, rr, rr * r.range(0.8, 1.2), Math.PI * 1.05, Math.PI * 1.95, 6)); }
    for (let x = 100; x >= -100; x -= 28) bot.push([x, -20 + r.range(-3, 5)]);
    pts.push(...top, ...bot);
    g.wash(pts, '#ffffff', { a: 0.9, step: 99, under: true, mottle: false, edge: false, glaze: false });
    // warm light on the crowns, cool violet shadow pooling underneath
    g.wash(top.filter((p, i) => i % 2 === 0).concat([[70, -34], [-70, -34]]), C.straw, { a: 0.16, step: 99, edge: false, glaze: false, spread: 4 });
    g.wash(bot.concat(top.filter((p, i) => i % 3 === 0).map(p => [p[0], p[1] * 0.25 - 16]).reverse()), C.lavender, { a: 0.34, step: 99, edge: false, glaze: false });
    g.wash(bot.concat(bot.slice().reverse().map(p => [p[0] * 0.8, p[1] - 9])), C.slate, { a: 0.2, step: 99, edge: false, glaze: false, spread: 3 });
    g.line(top, { w: 1.3, step: 99, a: 0.65 }); g.line(bot.slice(1, -1), { w: 0.9, step: 99, a: 0.35, dbl: false });
    for (let i = 0; i < 3; i++) { const cx = r.range(-60, 60); g.arc(cx, -30 - r.range(0, 14), r.range(9, 18), r.range(6, 11), Math.PI * 1.1, Math.PI * 1.8, { w: 0.8, a: 0.35, dbl: false }); }
    g.curl(top[top.length - 1][0] - 4, -24, 7, -1, { w: 1, a: 0.6, dbl: false, turns: 1 });
  } };
})();
