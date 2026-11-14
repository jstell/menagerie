'use strict';
// The scroll itself: sepia paper texture, pigment-granulation pattern, and the frame
// (deckled edges, rolled ends, desk underneath) that sits over the painting.
(() => {
  const A = window.A;

  // Paper texture, tileable horizontally so the scroll can unroll forever.
  A.makePaper = (W, H, S) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), r = A.rng(1900);
    c.fillStyle = '#f3e5c3'; c.fillRect(0, 0, W, H);
    const wrap = (x, rad, fn) => { fn(x); if (x - rad < 0) fn(x + W); if (x + rad > W) fn(x - W); };
    // broad tonal blotches: tea stains and sun-bleached patches
    for (let i = 0; i < 80; i++) {
      const x = r() * W, y = r() * H, rad = r.range(70, 340) * S, dark = r.chance(0.55), al = r.range(0.03, 0.085);
      wrap(x, rad, xx => {
        const g = c.createRadialGradient(xx, y, 0, xx, y, rad);
        g.addColorStop(0, dark ? `rgba(128,88,40,${al})` : `rgba(255,248,226,${al * 1.6})`);
        g.addColorStop(1, dark ? 'rgba(128,88,40,0)' : 'rgba(255,248,226,0)');
        c.fillStyle = g; c.fillRect(xx - rad, y - rad, rad * 2, rad * 2);
      });
    }
    // foxing
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = r.range(2, 11) * S, al = r.range(0.06, 0.16);
      wrap(x, rad, xx => {
        const g = c.createRadialGradient(xx, y, 0, xx, y, rad);
        g.addColorStop(0, `rgba(120,72,30,${al})`); g.addColorStop(1, 'rgba(120,72,30,0)');
        c.fillStyle = g; c.fillRect(xx - rad, y - rad, rad * 2, rad * 2);
      });
    }
    // laid-paper chain lines
    const gap = W / Math.round(W / (34 * S));
    for (let x = 0; x < W; x += gap) { c.fillStyle = 'rgba(110,80,40,0.035)'; c.fillRect(x, 0, Math.max(1, S * 0.8), H); }
    for (let y = 0; y < H; y += 3.2 * S) { c.fillStyle = 'rgba(110,80,40,0.018)'; c.fillRect(0, y, W, Math.max(1, S * 0.6)); }
    // fibres
    c.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * W, y = r() * H, a = r() * A.TAU, l = r.range(4, 20) * S, bend = r.range(-0.6, 0.6);
      c.strokeStyle = r.chance(0.6) ? `rgba(96,66,34,${r.range(0.04, 0.13)})` : `rgba(255,250,235,${r.range(0.08, 0.2)})`;
      c.lineWidth = r.range(0.4, 0.9) * S;
      wrap(x, l, xx => {
        c.beginPath(); c.moveTo(xx, y);
        c.quadraticCurveTo(xx + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, xx + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      });
    }
    // fine grain
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 13; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9; }
    c.putImageData(img, 0, 0);
    return cv;
  };

  // Pale blotches used inside washes so pigment looks unevenly settled.
  A.makeMottle = () => {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d'), r = A.rng(77);
    for (let i = 0; i < 90; i++) {
      const x = r() * N, y = r() * N, rad = r.range(6, 46), al = r.range(0.1, 0.55);
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        if (x + ox + rad < 0 || x + ox - rad > N || y + oy + rad < 0 || y + oy - rad > N) continue;
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    return cv;
  };

  A.FRAME = { M: 24, RW: 40 }; // logical margins: desk strip top/bottom, roll width left/right

  // The torn top and bottom edges of the sheet, with the desk showing beyond them. They belong to the
  // paper, so they are built as strips that tile at the paper's own width and travel with it.
  A.makeEdges = (Wt, S) => {
    const M = A.FRAME.M * S, h = Math.round(M + 24 * S);
    const raw = (x, k) => (A.fbm(x / (9 * S), k, 3) - 0.5) * 7 * S + (A.fbm(x / (70 * S), k + 5, 2) - 0.5) * 6 * S;
    // cross-fade the noise with itself one tile back so the edge joins up seamlessly
    const edge = (x, k) => { const u = ((x % Wt) + Wt) % Wt, t = u / Wt; return raw(u, k) * (1 - t) + raw(u - Wt, k) * t; };
    const strip = top => {
      const cv = document.createElement('canvas'); cv.width = Wt; cv.height = h;
      const c = cv.getContext('2d'), pad = 60 * S;
      c.beginPath();
      if (top) { c.moveTo(-pad, -20); c.lineTo(Wt + pad, -20); for (let x = Wt + pad; x >= -pad; x -= 3 * S) c.lineTo(x, M + edge(x, 1)); }
      else { c.moveTo(-pad, h + 20); c.lineTo(Wt + pad, h + 20); for (let x = Wt + pad; x >= -pad; x -= 3 * S) c.lineTo(x, h - M + edge(x, 9)); }
      c.closePath();
      const g = c.createLinearGradient(0, top ? 0 : h - M * 1.4, 0, top ? M * 1.4 : h);
      g.addColorStop(0, top ? '#1d130c' : '#22160e'); g.addColorStop(1, top ? '#2a1b11' : '#0f0906');
      c.shadowColor = 'rgba(40,20,5,0.5)'; c.shadowBlur = 8 * S; c.fillStyle = g; c.fill();
      return cv;
    };
    return { top: strip(true), bot: strip(false), h };
  };

  // Static overlay in device pixels. W,H device size; S device px per logical unit.
  A.makeFrame = (W, H, S) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), r = A.rng(31), M = A.FRAME.M * S, RW = A.FRAME.RW * S;

    // aged darkening just inside the paper edges
    for (const top of [true, false]) {
      const g = c.createLinearGradient(0, top ? M : H - M, 0, top ? M + 70 * S : H - M - 70 * S);
      g.addColorStop(0, 'rgba(120,78,34,0.28)'); g.addColorStop(0.35, 'rgba(120,78,34,0.07)'); g.addColorStop(1, 'rgba(120,78,34,0)');
      c.fillStyle = g; c.fillRect(0, top ? M - 8 * S : H - M - 70 * S, W, 78 * S);
    }
    // wood grain on the desk strips
    c.lineWidth = Math.max(1, S * 0.7);
    for (let i = 0; i < 70; i++) {
      const top = i % 2 === 0, y = (top ? r.range(1, M * 0.6) : H - r.range(1, M * 0.6)), x = r() * W, l = r.range(60, 400) * S;
      c.strokeStyle = `rgba(${r.chance(0.5) ? '90,58,34' : '12,7,4'},${r.range(0.15, 0.4)})`;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y + r.range(-3, 3) * S, x + l, y); c.stroke();
    }

    // the two rolls
    for (const left of [true, false]) {
      const x0 = left ? 0 : W - RW;
      // shadow of the roll across the flat paper
      const sx = left ? RW : W - RW, sg = c.createLinearGradient(sx, 0, sx + (left ? 1 : -1) * 46 * S, 0);
      sg.addColorStop(0, 'rgba(70,40,14,0.5)'); sg.addColorStop(0.3, 'rgba(90,56,22,0.2)'); sg.addColorStop(1, 'rgba(90,56,22,0)');
      c.fillStyle = sg; c.fillRect(Math.min(sx, sx + (left ? 1 : -1) * 46 * S), M * 0.4, 46 * S, H - M * 0.8);
      // rolled paper cylinder
      const g = c.createLinearGradient(x0, 0, x0 + RW, 0);
      const stops = [[0, '#6f5433'], [0.12, '#b39a6c'], [0.38, '#f3e6c6'], [0.55, '#eedfb9'], [0.82, '#b9a070'], [1, '#6a4f30']];
      for (const [t, col] of stops) g.addColorStop(left ? t : 1 - t, col);
      c.fillStyle = g; c.fillRect(x0, M * 0.45, RW, H - M * 0.9);
      // paper layers visible at the roll ends
      for (const y of [M * 0.45, H - M * 0.45]) {
        c.fillStyle = 'rgba(80,52,24,0.5)'; c.fillRect(x0, y - 1.5 * S, RW, 3 * S);
        c.fillStyle = 'rgba(250,240,214,0.5)'; c.fillRect(x0 + RW * 0.15, y - 0.5 * S, RW * 0.7, 1 * S);
      }
      // turned wooden handles with a brass collar
      const hw = RW * 0.42, hx = x0 + RW / 2 - hw / 2;
      for (const top of [true, false]) {
        const y = top ? 0 : H - M * 0.45, h = M * 0.45;
        const wg = c.createLinearGradient(hx, 0, hx + hw, 0);
        wg.addColorStop(0, '#2a160b'); wg.addColorStop(0.4, '#8a5a30'); wg.addColorStop(0.6, '#6f4424'); wg.addColorStop(1, '#22110a');
        c.fillStyle = wg; c.fillRect(hx, y, hw, h);
        const bg = c.createLinearGradient(hx - 2 * S, 0, hx + hw + 2 * S, 0);
        bg.addColorStop(0, '#5a4012'); bg.addColorStop(0.4, '#e6c66a'); bg.addColorStop(0.65, '#b08a2e'); bg.addColorStop(1, '#4a330c');
        c.fillStyle = bg; c.fillRect(hx - 2 * S, top ? h - 4 * S : y, hw + 4 * S, 4 * S);
      }
      // crisp edge where the roll meets the sheet
      c.fillStyle = 'rgba(60,36,14,0.55)'; c.fillRect(left ? RW - S : W - RW, M * 0.45, S, H - M * 0.9);
    }

    // vignette
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    v.addColorStop(0, 'rgba(60,34,10,0)'); v.addColorStop(1, 'rgba(60,34,10,0.2)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
    return cv;
  };
})();
