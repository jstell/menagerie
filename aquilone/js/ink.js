'use strict';
// Sketch: hand-drawn ink lines and watercolor washes on a 2D canvas.
// Lines wobble with a "jitter" generator that is reseeded a few times a second (line boil);
// washes use a separate, stable generator so the paint sits still while the ink breathes.
(() => {
  const A = window.A, C = A.C;

  function resample(pts, step, closed) {
    const out = [], n = pts.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1];
      const k = Math.max(1, Math.round(Math.hypot(dx, dy) / step));
      for (let s = 0; s < k; s++) out.push([a[0] + dx * s / k, a[1] + dy * s / k]);
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  A.resample = resample;

  class Sketch {
    constructor(ctx) {
      this.c = ctx; this.j = A.rng(1); this.wr = A.rng(2);
      this.k = 1;          // wobble multiplier (smaller for distant, delicate things)
      this.lw = 1;         // line weight multiplier
      this.inkCol = C.ink;
      this.al = 1;         // global opacity multiplier (for fading whole drawings)
      this.taper = true;   // pressure-sensitive pen strokes
      this.glaze = false;  // sprites: add a cool shadow glaze toward the lower right of every wash
      this.lights = null;  // sprites: collects [x, y, r] spots that glow at night
      this.mottle = null;  // optional CanvasPattern of pale blotches for pigment granulation
    }
    seed(jitter, wash) { this.j = A.rng(jitter); if (wash !== undefined) this.wr = A.rng(wash); return this; }

    _trace(P, closed) {
      const c = this.c, n = P.length;
      c.beginPath();
      if (n < 2) return;
      if (closed) {
        c.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
        for (let i = 0; i < n; i++) { const q = P[(i + 1) % n]; c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + q[0]) / 2, (P[i][1] + q[1]) / 2); }
        c.closePath();
      } else {
        c.moveTo(P[0][0], P[0][1]);
        for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
        c.lineTo(P[n - 1][0], P[n - 1][1]);
      }
    }

    // Organic line through points. o: w, c, a, wob, closed, dbl, step
    line(pts, o = {}) {
      if (pts.length < 2) return this;
      const c = this.c, j = this.j;
      const w = (o.w ?? 1.5) * this.lw, wob = (o.wob ?? 1) * this.k, al = (o.a ?? 0.9) * this.al;
      const R = resample(pts, o.step ?? 15, o.closed);
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = o.c || this.inkCol;
      const pass = (amp, lw, a) => {
        const P = R.map(p => [p[0] + (j() - 0.5) * 2 * amp, p[1] + (j() - 0.5) * 2 * amp]);
        this._trace(P, o.closed); c.lineWidth = lw; c.globalAlpha = a; c.stroke();
      };
      // A pen line is not a wire: it swells in the middle of the stroke and thins where the nib lands and
      // lifts. Open strokes of any weight are drawn as a filled ribbon with that profile.
      if ((o.taper ?? this.taper) && !o.closed && w >= 1.05 && R.length >= 3) {
        const P = R.map(p => [p[0] + (j() - 0.5) * 2 * wob, p[1] + (j() - 0.5) * 2 * wob]), n = P.length, Lf = [], Rt = [], hw = w * (0.5 + j() * 0.16), lean = 0.35 + j() * 0.3;
        for (let i = 0; i < n; i++) {
          const a0 = P[Math.max(0, i - 1)], b0 = P[Math.min(n - 1, i + 1)]; let dx = b0[0] - a0[0], dy = b0[1] - a0[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          const u = i / (n - 1), h = hw * (0.22 + 1.05 * Math.pow(Math.sin(Math.PI * Math.pow(u, lean * 2)), 0.6));
          Lf.push([P[i][0] - dy * h, P[i][1] + dx * h]); Rt.push([P[i][0] + dy * h, P[i][1] - dx * h]);
        }
        this._trace([...Lf, ...Rt.reverse()], true); c.fillStyle = o.c || this.inkCol; c.globalAlpha = al; c.fill();
      } else
      pass(wob, w * (0.85 + j() * 0.3), al);
      if (o.dbl !== false && w >= 1.1) pass(wob * 1.5, w * 0.5, al * 0.45);
      c.globalAlpha = 1;
      return this;
    }
    // Straight stroke the way a draughtsman rules it by hand: slight bow, ends overshooting.
    seg(x1, y1, x2, y2, o = {}) {
      const j = this.j, dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const ov = o.over ?? Math.min(3, d * 0.08), bow = (j() - 0.5) * d * 0.025;
      const a = [x1 - ux * ov * j(), y1 - uy * ov * j()], b = [x2 + ux * ov * j(), y2 + uy * ov * j()];
      const m = [(x1 + x2) / 2 - uy * bow, (y1 + y2) / 2 + ux * bow];
      return this.line([a, m, b], { step: Math.max(20, d / 2), ...o });
    }
    poly(pts, o = {}) {
      const n = pts.length, m = o.closed === false ? n - 1 : n;
      for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % n]; this.seg(a[0], a[1], b[0], b[1], o); }
      return this;
    }
    rect(x, y, w, h, o) { return this.poly(A.rectPts(x, y, w, h), o); }
    ell(cx, cy, rx, ry, o = {}) {
      const n = Math.max(8, Math.round((rx + ry) * 0.5)), a0 = this.j() * A.TAU;
      return this.line(A.arcPts(cx, cy, rx, ry, a0, a0 + A.TAU + 0.35, n), { step: 99, ...o });
    }
    arc(cx, cy, rx, ry, a0, a1, o = {}) {
      return this.line(A.arcPts(cx, cy, rx, ry, a0, a1, Math.max(5, Math.round((rx + ry) * Math.abs(a1 - a0) * 0.09))), { step: 99, ...o });
    }

    // Translucent watercolor wash, loosely registered against the line work.
    // o: a (strength), layers, spread, ox/oy (misregistration), under (opaque paper first), edge
    wash(pts, col, o = {}) {
      const c = this.c, r = this.wr, a = (o.a ?? 0.5) * this.al, layers = o.layers ?? 2, spread = o.spread ?? 2.2;
      const ox = o.ox ?? 1.2, oy = o.oy ?? 0.8;
      if (o.under) {
        c.globalAlpha = this.al; c.fillStyle = o.under === true ? '#fff' : o.under;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill();
      }
      const R = resample(pts, o.step ?? 24, true);
      c.fillStyle = col;
      for (let l = 0; l < layers; l++) {
        const P = R.map(p => [p[0] + ox + (r() - 0.5) * 2 * spread, p[1] + oy + (r() - 0.5) * 2 * spread]);
        this._trace(P, true); c.globalAlpha = Math.min(1, a / layers * 1.35); c.fill();
      }
      if (o.edge !== false) { c.globalAlpha = a * 0.3; c.strokeStyle = col; c.lineWidth = 1.3; c.stroke(); }
      if (this.mottle && o.mottle !== false) {
        c.save(); c.clip(); c.globalAlpha = (o.mot ?? 0.4) * this.al; c.fillStyle = this.mottle;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
        c.fillRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12);
        // light falls from the upper left: a violet glaze gathers toward the lower right of each shape
        if (this.glaze && o.glaze !== false && a >= 0.25 && x1 - x0 > 9 && y1 - y0 > 9) {
          const gr = c.createLinearGradient(x0, y0, x0 + (x1 - x0) * 0.8, y1); gr.addColorStop(0, 'rgba(255,244,214,0.10)'); gr.addColorStop(0.45, 'rgba(98,84,140,0)'); gr.addColorStop(1, 'rgba(98,84,140,0.24)');
          c.globalAlpha = this.al; c.fillStyle = gr; c.fillRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12);
        }
        c.restore();
      }
      c.globalAlpha = 1;
      return this;
    }
    // Opaque: blanks the paper underneath first so the shape hides what is behind it.
    paint(pts, col, o = {}) { return this.wash(pts, col, { under: true, ...o }); }
    washEll(cx, cy, rx, ry, col, o) { return this.wash(A.arcPts(cx, cy, rx, ry, 0, A.TAU * (1 - 1 / 16), 15), col, { step: 99, ...o }); }
    paintEll(cx, cy, rx, ry, col, o) { return this.washEll(cx, cy, rx, ry, col, { under: true, ...o }); }
    washRect(x, y, w, h, col, o) { return this.wash(A.rectPts(x, y, w, h), col, o); }
    paintRect(x, y, w, h, col, o) { return this.wash(A.rectPts(x, y, w, h), col, { under: true, ...o }); }

    lit(x, y, r = 12) { if (this.lights) this.lights.push([x, y, r]); return this; }
    // A filled, outlined limb or sleeve: a polyline of joints with a half-width at each.
    limb(pts, widths, col, o = {}) {
      const L = [], R = [], n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
        let dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        L.push([pts[i][0] - dy * widths[i], pts[i][1] + dx * widths[i]]); R.push([pts[i][0] + dy * widths[i], pts[i][1] - dx * widths[i]]);
      }
      const poly = [...L, ...R.reverse()];
      this.wash(poly, col, { under: true, a: o.a ?? 0.7, spread: 0.5, step: 99, mottle: false, ox: 0.4, oy: 0.3 });
      this.line(poly, { closed: true, w: o.w ?? 1.1, step: 99, wob: o.wob ?? 0.45, dbl: false });
      return this;
    }
    // Parallel shading strokes across a rectangle. o: ang, gap, w, a, clip (polygon)
    hatch(x, y, w, h, o = {}) {
      const c = this.c, j = this.j, ang = o.ang ?? -0.9, gap = o.gap ?? 5;
      const dx = Math.cos(ang), dy = Math.sin(ang), len = Math.hypot(w, h);
      c.save();
      c.beginPath();
      if (o.clip) { c.moveTo(o.clip[0][0], o.clip[0][1]); for (const p of o.clip) c.lineTo(p[0], p[1]); c.closePath(); } else c.rect(x, y, w, h);
      c.clip();
      const cx = x + w / 2, cy = y + h / 2, n = Math.ceil(len / gap);
      for (let i = -n / 2; i <= n / 2; i++) {
        const px = cx - dy * i * gap + (j() - 0.5) * gap * 0.5, py = cy + dx * i * gap + (j() - 0.5) * gap * 0.5;
        const l = len * (0.35 + j() * 0.2);
        this.line([[px - dx * l, py - dy * l], [px + dx * l, py + dy * l]], { w: o.w ?? 0.8, a: o.a ?? 0.5, dbl: false, step: 40, wob: 0.6, c: o.c });
      }
      c.restore();
      return this;
    }
    // Loose looping scribble inside an ellipse — foliage, wool, smoke.
    scribble(cx, cy, rx, ry, n, o = {}) {
      const j = this.j, pts = [];
      let a = j() * A.TAU;
      for (let i = 0; i < n; i++) { a += 1.6 + j() * 1.8; const r = 0.35 + j() * 0.65; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
      return this.line(pts, { w: 1, a: 0.6, dbl: false, step: 99, ...o });
    }
    // Scalloped cloud/foliage outline around an ellipse
    scallop(cx, cy, rx, ry, bumps, o = {}) {
      const pts = [], r = o.r ?? this.wr, depth = o.depth ?? 0.16;
      for (let i = 0; i < bumps; i++) {
        const a0 = i / bumps * A.TAU, a1 = (i + 1) / bumps * A.TAU, am = (a0 + a1) / 2, k = 1 + depth * (0.6 + r() * 0.8);
        pts.push([cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry], [cx + Math.cos(am) * rx * k, cy + Math.sin(am) * ry * k]);
      }
      return pts;
    }
    dot(x, y, r = 1.4, o = {}) {
      const c = this.c; c.globalAlpha = (o.a ?? 0.85) * this.al; c.fillStyle = o.c || this.inkCol;
      c.beginPath(); c.arc(x + (this.j() - 0.5) * this.k, y + (this.j() - 0.5) * this.k, r, 0, A.TAU); c.fill(); c.globalAlpha = 1;
      return this;
    }
    text(str, x, y, o = {}) {
      const c = this.c;
      c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot);
      c.font = `${o.style || ''} ${o.size || 16}px ${o.font || A.FONT.text}`; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'alphabetic';
      if (o.ls) c.letterSpacing = o.ls + 'px';
      c.fillStyle = o.c || this.inkCol; c.globalAlpha = (o.a ?? 0.9) * this.al;
      if (o.maxW) c.fillText(str, 0, 0, o.maxW); else c.fillText(str, 0, 0);
      c.restore();
      return this;
    }
    // Whiplash curl — the Art Nouveau flourish. Spiral ending at (x,y).
    curl(x, y, r, dir = 1, o = {}) {
      const pts = [], turns = o.turns ?? 1.4, a0 = o.a0 ?? 0;
      for (let i = 0; i <= 18; i++) { const t = i / 18, a = a0 + dir * t * turns * A.TAU, rr = r * (1 - t * 0.85); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
      return this.line(pts, { step: 99, w: 1.2, ...o });
    }
  }
  A.Sketch = Sketch;
  A.FONT = {
    title: '"Griffy", Georgia, serif', poster: '"Bigelow Rules", Georgia, serif', script: '"Parisienne", cursive',
    text: '"IM Fell DW Pica", Georgia, serif', sign: '"IM Fell DW Pica SC", Georgia, serif',
  };
})();
