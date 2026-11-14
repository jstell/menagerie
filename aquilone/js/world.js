'use strict';
// The world: three tableaux that blend into one another along an endless road,
// rolling terrain, parallax layers of hills, sea and sky, and the scenery spawners.
(() => {
  const A = window.A, C = A.C, TAU = A.TAU;
  const H = 720, BASE = 580, HORIZON = 408;
  const ZL = [15000, 13000, 14000], CYC = ZL[0] + ZL[1] + ZL[2], B1 = ZL[0], B2 = ZL[0] + ZL[1], BL = 1200;
  const BACK_SC = 1.25;   // roadside scenery is drawn larger so its people and details read
  A.H = H; A.CYC = CYC;
  A.ZONE_NAMES = [['I', 'La Campagne'], ['II', 'Le Village'], ['III', 'La Riviera']];

  // Blend weights {c: countryside, t: town, r: riviera} at world x
  A.zone = x => {
    const p = ((x % CYC) + CYC) % CYC, s = A.smooth;
    const a = s((p - (B1 - BL)) / (2 * BL)), b = s((p - (B2 - BL)) / (2 * BL));
    const e = p < BL ? s((p + BL) / (2 * BL)) : p > CYC - BL ? s((p - (CYC - BL)) / (2 * BL)) : (p < CYC / 2 ? 1 : 0);
    let c, r;
    if (p < CYC / 2) { c = e * (1 - a); r = 1 - e; } else { c = e; r = b * (1 - e); }
    return { c, t: Math.max(0, 1 - c - r), r };
  };
  A.zoneIndex = x => { const z = A.zone(x); return z.c >= z.t && z.c >= z.r ? 0 : z.t >= z.r ? 1 : 2; };

  A.ground = x => {
    const z = A.zone(x);
    return BASE - z.c * ((A.fbm(x / 640, 3, 2) - 0.5) * 2 * 118 + Math.sin(x / 210) * 7) - z.t * Math.sin(x / 330) * 5 - z.r * Math.sin(x / 260) * 6;
  };
  A.slope = x => (A.ground(x + 6) - A.ground(x - 6)) / 12;

  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const PAL = {
    far: [rgb('#b4b0d2'), rgb('#bdb6d0'), rgb('#b6c6d8')],
    mid: [rgb('#b4c67c'), rgb('#c6c796'), rgb('#cfd3a0')],
    near: [rgb('#8fb060'), rgb('#d9ccb8'), rgb('#efd99c')],
    verge: [rgb('#9cb964'), rgb('#cdbea2'), rgb('#ecd79a')],
    road: [rgb('#ead6a4'), rgb('#e0d3ba'), rgb('#efe2c4')],
  };
  // wash of strength a over white paper, as one opaque colour (one fill instead of two)
  const mix3 = (p, z, a) => { const k = 255 * (1 - a); return `rgb(${Math.round(k + a * (p[0][0] * z.c + p[1][0] * z.t + p[2][0] * z.r))},${Math.round(k + a * (p[0][1] * z.c + p[1][1] * z.t + p[2][1] * z.r))},${Math.round(k + a * (p[0][2] * z.c + p[1][2] * z.t + p[2][2] * z.r))})`; };

  // ridge heights; lx = layer coordinate, z = zone weights of the screen column
  const yFar = (lx, z) => A.lerp(388 - 190 * Math.max(0, A.fbm(lx / 330, 31, 4) - 0.3), 720, A.smooth(z.r * 1.5));
  const yMid = (lx, z) => A.lerp(452 - 125 * (A.fbm(lx / 390, 21, 3) - 0.25) + z.t * 14, 730, A.smooth(z.r * 1.35));
  const yNear = (lx, z) => z.c * (512 - 74 * (A.fbm(lx / 430, 11, 2) - 0.3)) + z.t * 548 + z.r * (524 + Math.sin(lx / 170) * 3);
  const yIsle = lx => HORIZON + 2 - Math.max(0, A.fbm(lx / 250, 41, 3) - 0.47) * 230;

  const Wd = A.W = {
    camX: 0, t: 0, boil: 0, W: 1280, layers: null, sea: [], clouds: [],
    reset(x0) {
      this.camX = x0; this.sea = []; this.clouds = [];
      const mk = (key, par, lead) => ({ key, par, items: [], next: x0 * par - 200, lead });
      this.layers = { mid: mk('mid', 0.38, 200), near: mk('near', 0.66, 300), back: mk('back', 1, 320), front: mk('front', 1.32, 200) };
      this.seaNext = 0; this.cloudNext = -100; this.r = A.rng(12345);
      this.fill();
    },
    // screen x of a layer coordinate
    sx(lx, par) { return lx - this.camX * par; },
    fill() {
      const r = this.r, W = this.W;
      for (const L of Object.values(this.layers)) {
        while (L.next < this.camX * L.par + W + L.lead) {
          const xf = this.camX + (L.next - this.camX * L.par), z = A.zone(xf);
          const u = r(), zk = u < z.c ? 'c' : u < z.c + z.t ? 't' : 'r', tab = A.TABLES[L.key][zk];
          let tot = 0; for (const e of tab) tot += e[1];
          let pick = r() * tot, e = tab[0]; for (const q of tab) { pick -= q[1]; if (pick <= 0) { e = q; break; } }
          const d = A.SPR.defs[e[0]], gap = r.range(e[2], e[3]) * (L.key === 'back' ? BACK_SC : 1);
          let v = r.int(0, (d.v || 1) - 1);
          L.recent = L.recent || [];
          for (let tries = 0; tries < 8 && (d.v || 1) > 2; tries++) {
            if (e[0] === 'cafe') v = r.int(0, (d.v >> 1) - 1) * 2 + (zk === 'r' ? 1 : 0);
            if (!L.recent.includes(e[0] + v)) break;
            v = r.int(0, d.v - 1);
          }
          if (e[0] === 'cafe') v = (v & ~1) | (zk === 'r' ? 1 : 0);
          L.recent.push(e[0] + v); if (L.recent.length > 7) L.recent.shift();
          const it = { name: e[0], v, lx: L.next + gap * 0.5, flip: !d.noflip && !/house|cafe|sign|gelato|rowboat|skyline|church|kiosk/.test(e[0]) && r.chance(0.5), id: (r() * 1e6) | 0 };
          L.items.push(it);
          if (L.key === 'back') {
            if (/house|cafe/.test(e[0]) && r.chance(0.3)) L.items.push({ name: 'bunting', v: r.int(0, 2), lx: it.lx + gap * 0.5, flip: false, id: 1 });
            if (A.actors) A.actors.onScenery(it, zk, gap, r);
          }
          L.next += gap;
        }
        while (L.items.length && this.sx(L.items[0].lx, L.par) < -520) L.items.shift();
      }
      // boats out on the water
      while (this.seaNext < this.camX + W + 400) {
        if (A.zone(this.seaNext).r > 0.75) { const d = r(); this.sea.push({ name: r.chance(0.16) ? 'steamer' : 'sailboat', v: r.int(0, 3), d, par: 0.14 + d * 0.3, lx: 0, x0: this.seaNext, ph: r() * 9 }); const s = this.sea[this.sea.length - 1]; s.lx = this.camX * s.par + (this.t === 0 ? r() * W * 1.2 : W + 120 + r() * 200); }
        this.seaNext += r.range(260, 620);
      }
      while (this.sea.length && this.sea[0].lx - this.camX * this.sea[0].par < -300) this.sea.shift();
      // clouds drift on their own
      while (this.cloudNext < this.camX * 0.08 + W + 300) { this.clouds.push({ lx: this.cloudNext, y: r.range(70, 300), v: r.int(0, 4), sc: r.range(0.6, 1.25), par: 0.08, drift: r.range(4, 10) }); this.cloudNext += r.range(170, 420); }
      while (this.clouds.length && this.clouds[0].lx - this.camX * 0.08 < -400) this.clouds.shift();
    },
    update(dt) { this.t += dt; this.boil = Math.floor(this.t * 7.5); for (const c of this.clouds) c.lx -= c.drift * dt; this.fill(); },

    // sample a ridge across the screen at world-anchored positions
    ridge(par, step, fn) {
      const out = [], off = this.camX * par, W = this.W;
      for (let lx = Math.floor((off - 30) / step) * step; lx <= off + W + 30 + step; lx += step) { const sx = lx - off; out.push([sx, fn(lx, A.zone(this.camX + sx)), lx]); }
      return out;
    },
    zoneGrad(c, pal, a) {
      const g = c.createLinearGradient(0, 0, this.W, 0);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, mix3(pal, A.zone(this.camX + this.W * i / 8), a));
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
      const c = g.c, W = this.W, n = pts.length, bot = o.bottom ?? H + 10;
      c.globalAlpha = 1; c.beginPath(); c.moveTo(pts[0][0], bot); for (const p of pts) c.lineTo(p[0], p[1]); c.lineTo(pts[n - 1][0], bot); c.closePath();
      c.fillStyle = this.zoneGrad(c, pal, a); c.fill();
      if (g.mottle && o.mottle) { c.save(); c.clip(); c.translate(-((this.camX * (o.par || 1)) % 256), 0); c.globalAlpha = 0.35; c.fillStyle = g.mottle; c.fillRect(0, 0, W + 512, H); c.restore(); }
      // second, shorter wash hugging the ridge — the layered look of a real watercolor
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1] + 1.5);
      for (let i = n - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + band * (0.55 + 0.7 * A.hash(Math.round(pts[i][2]) + 9)));
      c.closePath(); c.fillStyle = this.zoneGrad(c, pal, 1 - (1 - a) * (1 - a * 0.75)); c.fill();
    },

    drawSky(g) {
      const c = g.c, W = this.W, p = ((this.camX + W * 0.3) % CYC) / CYC;
      const K = [[0, '#9cc9d2', '#f7e3bf'], [0.4, '#86bcd2', '#f5e8cc'], [0.66, '#93b9d2', '#f7dcae'], [0.86, '#e2a58e', '#f8c479'], [0.95, '#c59ab2', '#f6c98e'], [1, '#9cc9d2', '#f7e3bf']];
      let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
      const f = (p - K[i][0]) / (K[i + 1][0] - K[i][0]), top = A.mix(K[i][1], K[i + 1][1], f), low = A.mix(K[i][2], K[i + 1][2], f);
      // the wash changes slowly, so paint it small now and then and stretch it over the sky
      const SK = 4, sw = Math.ceil(W / SK), sh = 140;
      if (!this.skyCv || this.skyCv.width !== sw) { this.skyCv = document.createElement('canvas'); this.skyCv.width = sw; this.skyCv.height = sh; this.skyAge = 99; }
      if (++this.skyAge > 12) {
        this.skyAge = 0; const k2 = this.skyCv.getContext('2d'); k2.setTransform(1 / SK, 0, 0, 1 / SK, 0, 0);
        k2.fillStyle = '#fff'; k2.fillRect(0, 0, W + SK, 560);
        const gr = k2.createLinearGradient(0, 20, 0, 540);
        gr.addColorStop(0, A.rgba(top, 0.72)); gr.addColorStop(0.5, A.rgba(top, 0.34)); gr.addColorStop(0.75, A.rgba(low, 0.5)); gr.addColorStop(1, A.rgba(low, 0.1));
        k2.fillStyle = gr; k2.fillRect(0, 0, W + SK, 560);
        // unpainted, cloud-soft gaps in the wash
        for (let k = 0; k < 7; k++) {
          const x = ((A.hash(k * 7 + 3) * (W + 700) - this.camX * 0.03 - this.t * 3) % (W + 700) + (W + 700)) % (W + 700) - 350, y = 60 + A.hash(k * 7 + 4) * 300, rx = 180 + A.hash(k * 7 + 5) * 240;
          const rg = k2.createRadialGradient(x, y, 0, x, y, rx); rg.addColorStop(0, 'rgba(255,255,255,0.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          k2.save(); k2.translate(0, y); k2.scale(1, 0.45); k2.translate(0, -y); k2.fillStyle = rg; k2.fillRect(x - rx, y - rx, rx * 2, rx * 2); k2.restore();
        }
      }
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'; c.drawImage(this.skyCv, 0, 0, sw, sh, 0, 0, sw * SK, sh * SK);
      this.sun(g, p);
      for (const cl of this.clouds) A.drawSprite(c, 'cloud', cl.v, cl.lx - this.camX * cl.par, cl.y, this.boil + cl.v, cl.sc);
      this.skyP = p;
    },
    sun(g, p) {
      const c = g.c, W = this.W, x = W * (0.8 - 0.42 * p), y = 112 + 250 * p * p, R = 30 + 10 * p, t = this.t;
      const col = A.mix(C.ochre, C.red, A.smooth((p - 0.6) / 0.35));
      const halo = c.createRadialGradient(x, y, R * 0.6, x, y, R * 4.2); halo.addColorStop(0, A.rgba(col, 0.42)); halo.addColorStop(1, A.rgba(col, 0));
      c.fillStyle = halo; c.fillRect(x - R * 4.3, y - R * 4.3, R * 8.6, R * 8.6);
      g.seed(this.boil * 31 + 3, 77);
      g.paintEll(x, y, R, R, col, { a: 0.8 }); g.ell(x, y, R, R, { w: 1.6 });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU + t * 0.12, l = i % 2 ? 14 : 24, r0 = R + 7, wv = Math.sin(t * 2 + i) * 2;
        g.line([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a + 0.06) * (r0 + l * 0.5) + wv * Math.sin(a), y + Math.sin(a + 0.06) * (r0 + l * 0.5) - wv * Math.cos(a)], [x + Math.cos(a) * (r0 + l), y + Math.sin(a) * (r0 + l)]], { w: 1.2, c: i % 2 ? C.ink : C.brick, step: 99, a: 0.8 });
      }
      // a drowsy, kindly face
      const blink = (t % 5) > 4.8;
      for (const k of [-1, 1]) { if (blink) g.seg(x + k * 11 - 4, y - 5, x + k * 11 + 4, y - 5, { w: 1.2, over: 0 }); else g.arc(x + k * 11, y - 4, 4.5, 3.5, Math.PI, TAU, { w: 1.3 }); g.washEll(x + k * 15, y + 6, 5, 3.5, C.red, { a: 0.3, edge: false, mottle: false }); }
      g.arc(x, y + 5, 10, 7, 0.2, Math.PI - 0.2, { w: 1.4 }); g.line([[x - 1, y - 2], [x + 2.5, y + 3], [x - 1, y + 4]], { w: 1, dbl: false, wob: 0.4 });
    },

    drawSea(g) {
      const c = g.c, W = this.W, t = this.t;
      // islands on the horizon
      const isl = this.ridge(0.06, 16, yIsle);
      c.beginPath(); c.moveTo(isl[0][0], HORIZON + 4); for (const p of isl) c.lineTo(p[0], p[1]); c.lineTo(isl[isl.length - 1][0], HORIZON + 4); c.closePath();
      c.fillStyle = 'rgb(207,207,230)'; c.fill();
      this.inkRidge(g, isl.filter(p => p[1] < HORIZON + 1.5), 1, 0.45, 0.8, C.inkSoft);
      // water
      const y1 = 600; c.fillStyle = '#fff'; c.fillRect(0, HORIZON, W, y1 - HORIZON);
      const gr = c.createLinearGradient(0, HORIZON, 0, y1);
      gr.addColorStop(0, 'rgba(58,128,150,0.72)'); gr.addColorStop(0.3, 'rgba(84,160,166,0.62)'); gr.addColorStop(0.75, 'rgba(142,201,187,0.55)'); gr.addColorStop(1, 'rgba(190,225,205,0.45)');
      c.fillStyle = gr; c.fillRect(0, HORIZON, W, y1 - HORIZON);
      if (g.mottle) { c.save(); c.beginPath(); c.rect(0, HORIZON, W, y1 - HORIZON); c.clip(); c.translate(-((this.camX * 0.2) % 256), 0); c.scale(2.4, 0.7); c.globalAlpha = 0.5; c.fillStyle = g.mottle; c.fillRect(0, HORIZON / 0.7, W, 400); c.restore(); }
      const hz = []; for (let x = -20; x <= W + 20; x += 40) hz.push([x, HORIZON, Math.round(x + this.camX * 0.02)]);
      this.inkRidge(g, hz, 1.1, 0.6, 0.7, C.prussian);
      // little wave marks, denser and larger toward the shore
      g.seed(this.boil * 53 + 9, 3);
      for (let row = 0; row < 7; row++) {
        const d = (row + 0.5) / 7, y = HORIZON + 6 + d * d * 150, par = 0.1 + d * 0.5, gap = 70 + d * 90, off = this.camX * par + t * (6 + d * 16);
        for (let k = Math.floor(off / gap) - 1; k * gap < off + W + gap; k++) {
          const hsh = A.hash(k * 13 + row * 101); if (hsh < 0.35) continue;
          const x = k * gap - off + A.hash(k + row * 7) * gap * 0.7, s = 4 + d * 9, yy = y + Math.sin(t * 1.6 + k) * (1 + d * 2);
          g.line([[x - s * 2, yy], [x - s, yy - s * 0.45], [x, yy], [x + s, yy - s * 0.45], [x + s * 2, yy]], { w: 0.9 + d * 0.5, c: hsh > 0.8 ? '#ffffff' : C.prussian, a: hsh > 0.8 ? 0.9 : 0.5, dbl: false, step: 99, wob: 0.5 });
        }
      }
      for (const s of this.sea) {
        const x = s.lx - this.camX * s.par, y = HORIZON + 14 + s.d * 76 + Math.sin(t * 1.3 + s.ph) * 2, sc = 0.3 + s.d * 0.55;
        c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.1 + s.ph) * 0.04); A.drawSprite(c, s.name, s.v, 0, 0, this.boil, sc); c.restore();
        s.lx -= (s.name === 'steamer' ? 5 : 9) * (1 / 60);
      }
    },

    items(g, L, yOf, sc = 1, only) {
      const c = g.c, W = this.W;
      for (const it of L.items) {
        if (only && !only(it)) continue;
        const sx = it.lx - this.camX * L.par; if (sx < -340 || sx > W + 340) continue;
        const y = yOf(it, sx);
        A.drawSprite(c, it.name, it.v, sx, y, this.boil + it.id, sc, it.flip);
        const d = A.SPR.defs[it.name]; if (d.hub) A.drawSails(g, sx + (it.flip ? -1 : 1) * d.hub[0] * sc, y + d.hub[1] * sc, (d.hubR || 66) * sc, this.t * 0.9 + it.id, sc);
      }
    },

    // everything behind the road
    drawBack(g) {
      const c = g.c, W = this.W;
      this.drawSky(g);
      let anyR = 0; for (let i = 0; i <= 4; i++) anyR = Math.max(anyR, A.zone(this.camX + W * i / 4).r);
      if (anyR > 0.01) this.drawSea(g);
      // far mountains
      let pts = this.ridge(0.13, 14, yFar);
      this.hill(g, pts, PAL.far, 0.5, 26, { par: 0.13 }); this.inkRidge(g, pts, 1.1, 0.5, 1, C.inkSoft);
      // a few contour strokes down the flanks
      g.seed(this.boil * 7 + 1, 1);
      for (const p of pts) { if (A.hash(Math.round(p[2]) * 5) > 0.82 && p[1] < 400) g.line([[p[0], p[1] + 4], [p[0] - 9, p[1] + 26 + A.hash(p[2]) * 22]], { w: 0.7, a: 0.35, dbl: false, c: C.inkSoft }); }
      // mid hills with their patchwork of fields
      this.items(g, this.layers.mid, (it, sx) => yMid(it.lx, A.zone(this.camX + sx)) + 4, 0.8);
      pts = this.ridge(0.38, 14, yMid);
      this.hill(g, pts, PAL.mid, 0.6, 30, { par: 0.38 });
      this.fields(g, pts);
      this.inkRidge(g, pts, 1.3, 0.65, 1.2);
      // near backdrop: treelines, skyline, beach
      const onSand = it => /beachset|cabana|rowboat|strongman/.test(it.name);
      this.items(g, this.layers.near, (it, sx) => yNear(it.lx, A.zone(this.camX + sx)) + 5, 1, it => !onSand(it));
      pts = this.ridge(0.66, 13, yNear);
      this.hill(g, pts, PAL.near, 0.62, 22, { par: 0.66 });
      this.inkRidge(g, pts, 1.3, 0.7, 1.1);
      this.items(g, this.layers.near, (it, sx) => yNear(it.lx, A.zone(this.camX + sx)) + 14 + (it.id % 9), 1, onSand);
      // back props standing along the far side of the road
      this.items(g, this.layers.back, it => Math.max(A.ground(it.lx - 50), A.ground(it.lx + 50)) - 21, BACK_SC);
    },
    fields(g, pts) {
      const c = g.c, cell = 9, cols = ['rgba(219,163,60,0.3)', 'rgba(150,180,95,0.34)', 'rgba(232,201,121,0.36)', 'rgba(120,150,80,0.3)', 'rgba(201,116,74,0.16)'];
      for (let i = 0; i + cell < pts.length; i++) {
        const k = Math.round(pts[i][2] / 14); if (k % cell) continue;
        const z = A.zone(this.camX + pts[i][0]); if (z.r > 0.4) continue;
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
      const top = [], mid = [], low = [];
      for (let x = Math.floor((cam - 30) / 12) * 12; x <= cam + W + 42; x += 12) { const y = A.ground(x), sx = x - cam; top.push([sx, y - 21, x]); mid.push([sx, y, x]); low.push([sx, y + 13, x]); }
      this.hill(g, top, PAL.road, 0.6, 0);
      this.hill(g, low, PAL.verge, 0.62, 30);
      this.inkRidge(g, top, 1.1, 0.6, 0.9);
      this.inkRidge(g, low, 1.7, 0.85, 1.1);
      // surface marks: ruts and pebbles, cobbles, boardwalk planks
      g.seed(b * 17 + 5, 5);
      for (let x = Math.floor((cam - 40) / 26) * 26; x <= cam + W + 40; x += 26) {
        const z = A.zone(x), y = A.ground(x), sx = x - cam, h1 = A.hash(x), h2 = A.hash(x + 7);
        if (z.c > 0.5) {
          if (h1 > 0.4) g.line([[sx, y - 7 + h2 * 3], [sx + 18, A.ground(x + 18) - 7 + h2 * 3]], { w: 0.8, a: 0.35, dbl: false });
          if (h1 < 0.3) g.dot(sx + 8, y + 3 + h2 * 6, 1.2, { a: 0.5 });
          if (h2 > 0.35) { const tx = sx + h1 * 20, ty = A.ground(x + h1 * 20) + 15 + h2 * 4; for (let k = -1; k <= 1; k++) g.line([[tx + k * 2.5, ty], [tx + k * 6 + (h1 - 0.5) * 4, ty - 8 - h2 * 8]], { w: 1.1, c: C.olive, dbl: false, a: 0.85 }); }
          if (h1 > 0.88) { const fx = sx + 13, fy = A.ground(x + 13) + 24; g.seg(fx, fy + 10, fx + 1, fy, { w: 0.9, c: C.olive }); g.paintEll(fx + 1, fy - 2, 3.4, 3.2, h2 > 0.5 ? C.red : C.ochre, { a: 0.95, mottle: false }); }
        } else if (z.t > 0.5) {
          for (let k = 0; k < 2; k++) { const cx = sx + k * 13 + (h1 - 0.5) * 4, cy = y - 14 + k * 9 + h2 * 5; if (A.hash(x + k * 3) > 0.3) g.arc(cx, cy, 5.5, 2.6, Math.PI * 1.05, Math.PI * 1.95, { w: 0.8, a: 0.4, dbl: false }); }
          g.seg(sx, y + 44, sx + 26, A.ground(x + 26) + 44, { w: 0.8, a: 0.26, dbl: false, over: 0 });
          if ((x / 26) % 2 === 0) g.seg(sx + (h1 - 0.5) * 6, y + 15, sx - 9, y + 44, { w: 0.8, a: 0.26, dbl: false, over: 0 }); else g.seg(sx - 8, y + 44, sx - 22, y + 96, { w: 0.9, a: 0.24, dbl: false, over: 0 });
        } else {
          g.seg(sx, y - 20, sx - 2, y + 12, { w: 0.7, a: 0.3, dbl: false, over: 0 });
          if (h1 > 0.3) g.dot(sx + h2 * 20, y + 22 + h1 * 30, 0.9, { a: 0.4 });
          if (h1 > 0.6) g.dot(sx + h1 * 20, y + 18 + h2 * 50, 0.9, { a: 0.35 });
        }
      }
    },
    drawFront(g) {
      this.items(g, this.layers.front, () => H - A.FRAME.M + 4, 1.25);
    },
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

  // clouds live with the sky, so they are defined here
  A.SPR.defs.cloud = { name: 'cloud', w: 230, h: 90, b: 30, v: 5, far: true, draw(g, r) {
    const blobs = r.int(3, 5), pts = [];
    const top = [], bot = [];
    for (let i = 0; i < blobs; i++) { const cx = -80 + i * 160 / (blobs - 1), rr = r.range(24, 42) * (1 - Math.abs(i - (blobs - 1) / 2) / blobs * 0.8); top.push(...A.arcPts(cx, -28, rr, rr * r.range(0.8, 1.15), Math.PI * 1.05, Math.PI * 1.95, 6)); }
    for (let x = 100; x >= -100; x -= 28) bot.push([x, -20 + r.range(-3, 5)]);
    pts.push(...top, ...bot);
    g.wash(pts, '#ffffff', { a: 0.85, step: 99, under: true, mottle: false, edge: false });
    g.wash(bot.concat(top.filter((p, i) => i % 3 === 0).map(p => [p[0], p[1] * 0.25 - 16]).reverse()), C.lavender, { a: 0.28, step: 99, edge: false });
    g.line(top, { w: 1.2, step: 99, a: 0.7 }); g.line(bot.slice(1, -1), { w: 0.9, step: 99, a: 0.4, dbl: false });
    g.curl(top[top.length - 1][0] - 4, -24, 7, -1, { w: 1, a: 0.6, dbl: false, turns: 1 });
  } };
})();
