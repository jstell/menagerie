'use strict';
// Scenery. Every prop is drawn procedurally into a few offscreen "boil" frames
// (same shapes, different line jitter) and blitted, so the ink wobbles while the paint stays put.
// Local coordinates: origin at the prop's foot, centre; x right, y down (so up is negative).
(() => {
  const A = window.A, C = A.C, TAU = A.TAU;
  const SPR = A.SPR = { scale: 1, cache: new Map(), defs: {}, PAD: 14 };
  const def = (name, d) => { d.name = name; SPR.defs[name] = d; };
  const nameHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) | 0; return h >>> 0; };

  A.sprite = (name, v = 0) => {
    const key = name + ':' + v;
    let s = SPR.cache.get(key);
    if (s) return s;
    const d = SPR.defs[name], S = SPR.scale, P = SPR.PAD, nf = d.frames || 3, nh = nameHash(name);
    const w = d.w + 2 * P, h = d.h + P + (d.b ?? 16), frames = [];
    for (let f = 0; f < nf; f++) {
      const cv = document.createElement('canvas'); cv.width = Math.ceil(w * S); cv.height = Math.ceil(h * S);
      const c = cv.getContext('2d'); c.scale(S, S); c.translate(d.w / 2 + P, d.h + P);
      const g = new A.Sketch(c); g.mottle = c.createPattern(A.mottleCv, 'repeat');
      if (d.far) { g.k = 0.6; g.lw = 0.75; g.inkCol = C.inkSoft; }
      g.seed(nh + f * 7717 + v * 13, nh + v * 101);
      d.draw(g, A.rng(nh + v * 977 + 5), v);
      frames.push(cv);
    }
    s = { frames, w, h, ox: d.w / 2 + P, oy: d.h + P, d };
    SPR.cache.set(key, s);
    return s;
  };
  A.drawSprite = (c, name, v, x, y, boil, sc = 1, flip = false) => {
    const s = A.sprite(name, v), f = s.frames[boil % s.frames.length];
    if (sc === 1 && !flip) { c.drawImage(f, x - s.ox, y - s.oy, s.w, s.h); return; }
    c.save(); c.translate(x, y); c.scale(flip ? -sc : sc, sc); c.drawImage(f, -s.ox, -s.oy, s.w, s.h); c.restore();
  };

  // ───────────────────────── people ─────────────────────────
  // o: kind lady|gent|waiter|bather, col, hat, flip, s, sit, armA/armB (radians from straight down, + = forward),
  //    parasol, cane, mustache, tray
  function person(g, x, y, o = {}) {
    const c = g.c, kind = o.kind || 'lady', col = o.col || C.rose, s = o.s || 1, sit = !!o.sit;
    c.save(); c.translate(x, y); c.scale((o.flip ? -1 : 1) * s, s);
    const dy = sit ? 18 : 0, shY = -61 + dy, hdY = -74 + dy, wY = sit ? -29 : -45;
    const trim = o.trim || C.red, dark = A.mix(col, C.ink, 0.4), lady = kind === 'lady', bather = kind === 'bather';
    const sleeve = lady ? (o.blouse || C.cream) : kind === 'waiter' ? '#ffffff' : col, hair = o.hair || C.umber;
    const hat = o.hat || (lady ? 'wide' : kind === 'waiter' ? 'none' : 'boater'), hc = o.hatCol || C.straw;
    const hand = (hx, hy) => { g.paintEll(hx, hy, 2.5, 2.7, lady || o.gloves ? '#ffffff' : C.skin, { a: lady || o.gloves ? 0.12 : 0.6, mottle: false }); g.ell(hx, hy, 2.5, 2.7, { w: 0.9, dbl: false }); };
    const arm = (sx, ang, bend) => {
      const s0 = [sx, shY + 3], el = [s0[0] + Math.sin(ang) * 12, s0[1] + Math.cos(ang) * 12], a2 = ang + bend;
      const hn = [el[0] + Math.sin(a2) * 11, el[1] + Math.cos(a2) * 11], hp = [hn[0] + Math.sin(a2) * 2.4, hn[1] + Math.cos(a2) * 2.4];
      if (bather) g.limb([s0, el, hn], [3.1, 2.6, 2.1], C.skin, { a: 0.6 });
      else if (lady) {
        // leg-of-mutton sleeve: a great puff at the shoulder, tight below the elbow
        g.limb([el, hn], [2.5, 2], sleeve, { a: 0.45 });
        g.limb([s0, [(s0[0] + el[0]) / 2, (s0[1] + el[1]) / 2], el], [4.6, 6, 2.7], sleeve, { a: 0.5 });
        g.line([[s0[0] - 1, s0[1] + 2], [(s0[0] + el[0]) / 2 - 1, (s0[1] + el[1]) / 2 + 1]], { w: 0.6, a: 0.45, dbl: false });
      } else {
        g.limb([s0, el, hn], [4.3, 3.6, 3], sleeve, { a: kind === 'waiter' ? 0.1 : 0.68 });
        const nx = Math.cos(a2) * 3, ny = -Math.sin(a2) * 3;     // white cuff
        g.line([[hn[0] - nx, hn[1] - ny], [hn[0] + nx, hn[1] + ny]], { w: 2.2, c: '#ffffff', dbl: false, wob: 0.2, a: 1 }); g.line([[hn[0] - nx, hn[1] - ny], [hn[0] + nx, hn[1] + ny]], { w: 0.7, dbl: false, wob: 0.2 });
      }
      hand(hp[0], hp[1]);
      return hn;
    };
    const shoe = (fx, fy) => { const sh = [[fx - 3.5, fy], [fx + 7, fy], [fx + 7.6, fy - 2], [fx + 2, fy - 4.2], [fx - 3.5, fy - 3.6]]; g.wash(sh, C.ink, { a: 0.85, spread: 0.3, mottle: false, step: 99 }); g.line(sh, { closed: true, w: 0.9, step: 99, dbl: false }); };

    const hb = arm(-5, o.armB ?? -0.25, o.bendB ?? 0.3);    // far arm goes behind the body

    if (lady) {
      const sk = sit
        ? [[-7, -29], [5, -31], [16, -29], [21, -22], [22, -4], [23, 0], [4, 0], [3, -14], [-8, -15]]
        : [[-6, wY], [5.5, wY], [9, -36], [13, -18], [17, -3], [18, 0], [-17, 0], [-16, -8], [-13, -26], [-9, -40]];
      g.paint(sk, col, { a: 0.66, step: 99 });
      // darker flounce along the hem, soft folds falling from the waist
      if (sit) g.wash([[21.5, -9], [23, 0], [4, 0], [3.4, -8]], dark, { a: 0.4, step: 99, mottle: false, edge: false });
      else g.wash([[16, -7], [18, 0], [-17, 0], [-16, -7], [0, -8.5]], dark, { a: 0.4, step: 99, mottle: false, edge: false });
      g.line(sk, { closed: true, w: 1.3, step: 99 });
      if (sit) { g.line(A.quadPts([4, -28], [15, -24], [18, -4], 5), { w: 0.7, a: 0.45, dbl: false }); g.line([[3.5, -8], [22, -9]], { w: 0.7, a: 0.5, dbl: false }); }
      else {
        for (const [x0, x1] of [[-3, -10], [1, 1.5], [4, 11]]) g.line(A.quadPts([x0, wY + 5], [(x0 + x1) / 2 + 1.5, -26], [x1, -9], 5), { w: 0.7, a: 0.42, dbl: false });
        const hem = []; for (let i = 0; i <= 8; i++) hem.push([-16 + i * 4, -7.5 - (i % 2) * 1.6 - Math.sin(i / 8 * Math.PI) * 1.2]); g.line(hem, { w: 0.8, a: 0.6, dbl: false, step: 99 });
        const toe = [[11, 0], [19.5, 0], [20.5, -2], [14, -3.6]]; g.wash(toe, C.ink, { a: 0.85, spread: 0.3, mottle: false }); g.line(toe, { closed: true, w: 0.8, step: 99, dbl: false });
      }
      const bd = [[-6, wY], [5.5, wY], [8.6, wY - 9], [8, shY + 1], [3.5, shY - 3], [-4.5, shY - 3], [-8, shY + 2], [-7.4, wY - 8]];
      g.paint(bd, o.blouse || C.cream, { a: 0.5, step: 99 }); g.line(bd, { closed: true, w: 1.2, step: 99 });
      g.wash([[-6.4, wY - 3.4], [6, wY - 3.4], [6, wY + 1], [-6.4, wY + 1]], trim, { a: 0.85, spread: 0.3, mottle: false, edge: false });       // sash
      g.scribble(4.6, shY + 7, 2.6, 4.5, 6, { w: 0.6, a: 0.55 });                                                                              // lace jabot
      if (o.apron && !sit) {
        const ap = [[-2, wY], [6, wY], [12.5, -18], [14.5, -7], [2, -7], [-0.5, -22]], bib = [[0, wY - 12], [7.4, wY - 12], [6.4, wY], [-0.6, wY]];
        g.paint(ap, '#ffffff', { a: 0.08, step: 99, mottle: false }); g.line(ap, { closed: true, w: 1, step: 99 }); g.paint(bib, '#ffffff', { a: 0.08, mottle: false }); g.line(bib, { closed: true, w: 0.9, step: 99, dbl: false });
        g.line([[2, -9.5], [14, -9.5]], { w: 0.6, a: 0.5, dbl: false });
      }
    } else if (bather) {
      for (const lx of [-3.6, 3.2]) { g.limb([[lx, -24], [lx - 0.4, -12], [lx, -1.5]], [3.4, 2.9, 2.2], C.skin, { a: 0.55 }); const ft = [[lx - 2, 0], [lx + 6, 0], [lx + 5.5, -2.2], [lx - 2, -2.6]]; g.wash(ft, C.skin, { a: 0.6, spread: 0.3, mottle: false }); g.line(ft, { closed: true, w: 0.8, step: 99, dbl: false }); }
      const suit = [[-8, shY + 1], [-4, shY - 2], [0, shY + 1.5], [4, shY - 2], [8, shY + 1], [9, -40], [8, -21], [1, -21], [0, -27], [-1, -21], [-8, -21], [-9, -40]];
      g.paint(suit, C.cream, { a: 0.3, step: 99 });
      for (let yy = shY + 4; yy < -23; yy += 7) g.wash([[-8.5, yy], [8.5, yy], [8.5, yy + 3.5], [-8.5, yy + 3.5]], col, { a: 0.78, spread: 0.6, ox: 0, oy: 0, edge: false, mottle: false });
      g.line(suit, { closed: true, w: 1.2, step: 99 });
    } else {
      const lc = o.legs || C.umber;
      if (sit && o.noLegs) { /* legs drawn by the caller */ } else if (sit) {
        g.limb([[-4, -26.5], [5, -27], [13.5, -26.5]], [4.3, 3.9, 3.5], lc, { a: 0.65 }); g.limb([[13, -27], [13.4, -14], [13.6, -2.5]], [3.5, 3, 2.7], lc, { a: 0.65 }); shoe(13, 0);
      } else {
        // o.walk is a stride phase: the legs scissor from the hip and the trailing foot lifts
        (o.noLegs ? [] : [-3.6, 3.2]).forEach((lx, i) => {
          if (o.walk === undefined) { g.limb([[lx, -37], [lx - 0.3, -19], [lx + 0.2, -2.5]], [3.7, 3.2, 2.8], lc, { a: 0.65 }); g.line([[lx + 1, -33], [lx + 0.8, -6]], { w: 0.5, a: 0.4, dbl: false }); shoe(lx - 0.5, 0); return; }
          const ph = o.walk + i * Math.PI, a = Math.sin(ph) * 0.44, lift = Math.max(0, Math.cos(ph)) * 3, fx = lx + Math.sin(a) * 35, fy = -37 + Math.cos(a) * 34.5 - lift;
          g.limb([[lx, -37], [(lx + fx) / 2 + 1.6 + lift * 0.5, (-37 + fy) / 2], [fx, fy]], [3.7, 3.2, 2.8], i ? lc : A.mix(lc, C.ink, 0.2), { a: 0.65 }); shoe(fx - 0.5, fy + 2.5);
        });
      }
      const jb = sit ? -30 : -33;
      const coat = [[-8.5, shY + 1], [-4, shY - 3], [4, shY - 3], [8, shY + 1], [8.8, -46], [7.6, jb], [2, jb + 1.5], [-9, jb + (o.tails ? 9 : 2)], [-9.6, -46]];
      g.paint(coat, col, { a: 0.68, step: 99 });
      if (kind === 'waiter') {
        g.wash([[-1, shY - 2], [6, shY - 2], [7.5, -44], [0, -44]], '#ffffff', { a: 0.9, spread: 0.3, mottle: false, edge: false });         // shirt front
        const ap = [[-7.5, -42], [7.5, -42], [8.5, -9], [-8.5, -9]]; g.paint(ap, '#ffffff', { a: 0.1, mottle: false }); g.line(ap, { closed: true, w: 1 });
        g.line([[0, -40], [0.6, -11]], { w: 0.6, a: 0.4, dbl: false }); g.line([[-7, -38], [7, -38]], { w: 0.7, a: 0.5, dbl: false });
      } else if (o.jersey) {
        for (let yy = shY + 3; yy < jb - 2; yy += 6) g.wash([[-8.6, yy], [8.6, yy], [8.6, yy + 3], [-8.6, yy + 3]], o.jersey, { a: 0.85, spread: 0.5, ox: 0, oy: 0, edge: false, mottle: false });
        g.line([[-3.5, shY - 2], [-4.5, jb + 1]], { w: 1.5, dbl: false }); g.line([[4, shY - 2], [5, jb + 1]], { w: 1.5, dbl: false });      // braces
      } else {
        g.wash([[0.5, shY - 2], [6.5, shY - 1], [7.4, jb + 2], [3, jb + 3]], o.vest || C.straw, { a: 0.85, spread: 0.3, mottle: false, edge: false });   // waistcoat
        g.line([[0.8, shY - 3], [2.6, -50], [7, -47]], { w: 0.9, dbl: false });                                                                         // lapel
        g.dot(5.2, -44, 0.8); g.dot(5.4, -39.5, 0.8);
        if (!sit) g.arc(4.6, -42, 2.8, 2.4, 0.2, Math.PI - 0.2, { w: 0.8, c: C.ochre, dbl: false });                                                  // watch chain
      }
      g.line(coat, { closed: true, w: 1.3, step: 99 });
      if (!o.jersey) {
      const col2 = [[-0.5, shY - 3.5], [4.6, shY - 3.5], [3, shY + 1.2]]; g.wash(col2, '#ffffff', { a: 1, spread: 0.2, mottle: false, edge: false, under: true }); g.line(col2, { closed: true, w: 0.7, step: 99, dbl: false });
      g.wash([[1.4, shY - 1.6], [5, shY - 2.4], [5, shY + 1], [1.6, shY + 0.4]], kind === 'waiter' ? C.ink : trim, { a: 0.9, spread: 0.2, mottle: false, edge: false });       // bow tie
      }
    }

    // neck, head, face
    g.limb([[1, shY - 2], [1.6, hdY + 5]], [2.5, 2.5], C.skin, { a: 0.55, w: 0.8 });
    if (lady) { g.paintRect(-1.4, shY - 6.5, 5.4, 4.2, '#ffffff', { a: 0.1, mottle: false }); g.rect(-1.4, shY - 6.5, 5.4, 4.2, { w: 0.8, dbl: false }); g.dot(3.4, shY - 2.6, 1, { c: trim }); }
    g.paintEll(0.5, hdY, 6.6, 7.6, o.mime ? '#ffffff' : C.skin, { a: o.mime ? 0.06 : 0.58 }); g.ell(0.5, hdY, 6.6, 7.6, { w: 1.2 });
    if (o.mime) { g.seg(3.5, hdY - 4.4, 3.5, hdY + 1.8, { w: 0.9, over: 0, dbl: false }); g.paintEll(2.2, hdY + 3.2, 1.9, 1.9, C.red, { a: 0.9, mottle: false }); }
    g.arc(-2.6, hdY + 0.6, 1.5, 2.2, 1.3, 4.9, { w: 0.8, dbl: false });                                         // ear
    g.dot(3.5, hdY - 1.2, 0.95); g.line([[1.8, hdY - 3.9], [5.4, hdY - 4.3]], { w: 0.85, dbl: false, wob: 0.3 });  // eye and brow
    g.line([[6.8, hdY - 1], [8.8, hdY + 1.7], [6.7, hdY + 2.3]], { w: 0.95, dbl: false, wob: 0.3 });             // nose
    if (!o.mime) g.wash(A.arcPts(2.4, hdY + 3, 2.4, 1.7, 0, TAU, 6), C.rose, { a: 0.38, spread: 0.5, edge: false, mottle: false });
    const stache = o.mustache ?? (!lady && !bather);
    if (stache) { g.line([[2, hdY + 4.3], [5, hdY + 3.5], [8.6, hdY + 4.7], [10.4, hdY + 3]], { w: 1.8, dbl: false, wob: 0.3, step: 99 }); g.line([[4.6, hdY + 3.6], [2.4, hdY + 5.6]], { w: 1.3, dbl: false, wob: 0.3 }); }
    else { g.wash(A.arcPts(5.2, hdY + 4.6, 1.6, 1, 0, TAU, 5), C.red, { a: 0.75, spread: 0.2, edge: false, mottle: false }); g.line([[3.8, hdY + 4.5], [6.6, hdY + 4.3]], { w: 0.6, dbl: false, wob: 0.2 }); }
    if (o.beard) { const bd = [[-1, hdY + 5], [7, hdY + 5.5], [5, hdY + 12], [1, hdY + 10]]; g.wash(bd, hair, { a: 0.8, spread: 0.4, mottle: false }); g.line(bd, { w: 0.8, step: 99, dbl: false }); }
    if (lady) {
      // Gibson-girl pompadour and bun
      const hp = [[-6.6, hdY + 3], [-8.4, hdY - 3], [-6, hdY - 9], [0, hdY - 10.6], [5, hdY - 8.4], [6.2, hdY - 5], [1.4, hdY - 6], [-2, hdY - 3], [-3.2, hdY + 3]];
      g.paintEll(-7.6, hdY - 7.5, 4.2, 3.8, hair, { a: 0.8, mottle: false }); g.ell(-7.6, hdY - 7.5, 4.2, 3.8, { w: 0.9, dbl: false });
      g.wash(hp, hair, { a: 0.82, spread: 0.4, step: 99, mottle: false }); g.line(hp, { closed: true, w: 1, step: 99, dbl: false });
      g.line([[-5, hdY - 6], [1, hdY - 8.6]], { w: 0.5, a: 0.5, dbl: false, c: '#ffffff' });
    } else {
      const hp = [[-6.4, hdY + 2.4], [-7, hdY - 4], [-3, hdY - 8], [2.4, hdY - 7.6], [-1, hdY - 4.4], [-2.6, hdY + 2.6]];
      g.wash(hp, hair, { a: 0.8, spread: 0.4, step: 99, mottle: false }); g.line(hp, { closed: true, w: 0.9, step: 99, dbl: false });
    }
    // hats
    if (hat === 'wide') {
      g.paintEll(0.5, hdY - 9, 17.5, 4.8, hc, { a: 0.65 }); g.ell(0.5, hdY - 9, 17.5, 4.8, { w: 1.2 });
      const cr = A.arcPts(-0.5, hdY - 10, 7.8, 7.4, Math.PI, TAU, 8); g.paint(cr, hc, { a: 0.65 }); g.line(cr, { w: 1.2, step: 99 });
      g.wash([[-8.3, hdY - 12.6], [7.3, hdY - 12.6], [7.3, hdY - 10], [-8.3, hdY - 10]], trim, { a: 0.85, spread: 0.3, mottle: false, edge: false });
      const plume = A.quadPts([-6, hdY - 13], [-17, hdY - 30], [-26, hdY - 13], 8);
      g.wash([...plume, ...plume.slice().reverse().map(p => [p[0] + 2.5, p[1] + 5])], trim, { a: 0.6, step: 99, spread: 0.8, mottle: false }); g.line(plume, { w: 1, step: 99 });
      for (let i = 2; i < 8; i++) g.line([plume[i], [plume[i][0] + 2, plume[i][1] + 5.5]], { w: 0.5, a: 0.6, dbl: false });
      g.scribble(4, hdY - 14, 5, 3, 6, { c: C.leaf, a: 0.85, w: 1.1 });
      for (const [fx, fy, fc] of [[2, hdY - 15, C.rose], [6, hdY - 14, '#ffffff'], [4.4, hdY - 17, C.ochre]]) { g.paintEll(fx, fy, 2.2, 2.1, fc, { a: 0.95, mottle: false }); g.ell(fx, fy, 2.2, 2.1, { w: 0.6, dbl: false }); }
    } else if (hat === 'boater') {
      g.paintRect(-6.4, hdY - 14.5, 13.4, 6.4, hc, { a: 0.7 }); g.rect(-6.4, hdY - 14.5, 13.4, 6.4, { w: 1.1 });
      g.washRect(-6.4, hdY - 11.4, 13.4, 2.8, trim, { a: 0.88, spread: 0.3, edge: false, mottle: false });
      g.paintEll(0.5, hdY - 8, 12.5, 1.9, hc, { a: 0.7, mottle: false }); g.ell(0.5, hdY - 8, 12.5, 1.9, { w: 1.1 });
    } else if (hat === 'top') {
      const th = [[-6, hdY - 8], [-6.6, hdY - 23], [7.4, hdY - 23], [6.6, hdY - 8]]; g.paint(th, C.ink, { a: 0.8 }); g.line(th, { closed: true, w: 1.1, step: 99 });
      g.washRect(-6, hdY - 11.6, 12.6, 2.6, trim, { a: 0.8, spread: 0.3, edge: false, mottle: false }); g.line([[-3.6, hdY - 21], [-3.2, hdY - 13]], { w: 0.7, c: '#ffffff', a: 0.5, dbl: false });
      g.paintEll(0.5, hdY - 7.6, 10.6, 1.8, C.ink, { a: 0.8, mottle: false }); g.ell(0.5, hdY - 7.6, 10.6, 1.8, { w: 1 });
    } else if (hat === 'bowler') {
      const bw = A.arcPts(0.5, hdY - 7.5, 7.6, 8.6, Math.PI, TAU, 8); g.paint(bw, C.umber, { a: 0.8 }); g.line(bw, { w: 1.1, step: 99 });
      g.washRect(-7, hdY - 10, 15, 2.2, C.ink, { a: 0.6, spread: 0.3, edge: false, mottle: false });
      g.paintEll(0.5, hdY - 7.2, 11, 1.8, C.umber, { a: 0.8, mottle: false }); g.ell(0.5, hdY - 7.2, 11, 1.8, { w: 1 });
    } else if (hat === 'beret') {
      g.paintEll(-1.5, hdY - 8.4, 9.6, 4.2, o.hatCol || C.prussian, { a: 0.8 }); g.ell(-1.5, hdY - 8.4, 9.6, 4.2, { w: 1.1 }); g.seg(-1.5, hdY - 12.4, -0.6, hdY - 14.6, { w: 1 });
    } else if (hat === 'bonnet') {
      const bn = A.arcPts(-1.5, hdY - 5.5, 8.4, 7, Math.PI * 0.95, Math.PI * 2.02, 9); g.paint(bn, '#ffffff', { a: 0.08, mottle: false }); g.line(bn, { w: 1.1, step: 99 });
      const fr = []; for (let i = 0; i < 5; i++) fr.push(...A.arcPts(-8 + i * 3.6, hdY - 5.6, 1.8, 1.6, Math.PI, 0, 3)); g.line(fr, { w: 0.8, step: 99, dbl: false });
      for (const q of [0, 1]) g.line(A.quadPts([-8, hdY - 3], [-13, hdY + 2 + q * 3], [-11 - q * 2, hdY + 9], 4), { w: 1.4, c: '#ffffff', dbl: false });
    } else if (hat === 'cap') {
      const cp = A.arcPts(0, hdY - 5.6, 7.2, 6.2, Math.PI, TAU, 8); g.paint(cp, o.hatCol || C.red, { a: 0.75 }); g.line(cp, { w: 1.1, step: 99 });
      g.line([[6, hdY - 6], [11.5, hdY - 4.6]], { w: 2, dbl: false }); g.dot(0, hdY - 12, 1);
    }

    const ha = arm(5, o.armA ?? 0.35, o.bendA ?? 0.5);       // near arm in front
    if (kind === 'waiter' && !o.tray) { const tw = [[hb[0] - 3, hb[1] - 1], [hb[0] + 3, hb[1] - 1], [hb[0] + 3.5, hb[1] + 11], [hb[0] - 3, hb[1] + 10]]; g.paint(tw, '#ffffff', { a: 0.1, mottle: false }); g.line(tw, { closed: true, w: 0.8, step: 99, dbl: false }); }
    if (o.parasol) {
      const [px, py] = ha, tx = px + 6, ty = py - 50;
      g.seg(px, py + 5, tx, ty, { w: 1.2 }); g.curl(px - 2, py + 7, 2.4, 1, { w: 1, turns: 0.7, dbl: false });
      const dome = A.arcPts(tx, ty + 6, 27, 16, Math.PI, TAU, 10), n = 6;
      for (let i = 0; i < n; i++) { const a0 = Math.PI + i / n * Math.PI, a1 = Math.PI + (i + 1) / n * Math.PI; g.paint([[tx, ty - 10], ...A.arcPts(tx, ty + 6, 27, 16, a0, a1, 3)], i % 2 ? '#ffffff' : o.parasol, { a: i % 2 ? 0.2 : 0.7, spread: 0.6, edge: false, step: 99, mottle: false }); }
      g.line(dome, { w: 1.2, step: 99 });
      const sc = []; for (let i = 0; i < n; i++) sc.push(...A.arcPts(tx - 27 + (i + 0.5) * 9, ty + 6, 4.5, 3.6, Math.PI, 0, 4)); g.line(sc, { w: 1, step: 99 });
      for (let i = 1; i < n; i++) { const a = Math.PI + i / n * Math.PI; g.line(A.quadPts([tx, ty - 10], [tx + Math.cos(a) * 18, ty - 6], [tx + Math.cos(a) * 27, ty + 6 + Math.sin(a) * 16], 4), { w: 0.6, a: 0.6, dbl: false }); }
      g.seg(tx, ty - 10, tx, ty - 15, { w: 1 });
    }
    if (o.cane) { g.seg(ha[0] + 2, ha[1], ha[0] + 6, 0, { w: 1.5 }); g.dot(ha[0] + 2, ha[1] - 1, 1.6, { c: C.ochre }); }
    if (o.tray) {
      g.paintEll(ha[0], ha[1] - 3, 10, 2, '#ffffff', { a: 0.15, mottle: false }); g.ell(ha[0], ha[1] - 3, 10, 2, { w: 1.1 });
      g.rect(ha[0] - 6, ha[1] - 10, 4.5, 6, { w: 0.9 }); g.line(A.quadPts([ha[0] - 4, ha[1] - 12], [ha[0] - 1, ha[1] - 17], [ha[0] - 5, ha[1] - 22], 5), { w: 0.6, a: 0.5, dbl: false });
      const bt = [[ha[0] + 2, ha[1] - 4], [ha[0] + 2, ha[1] - 12], [ha[0] + 3.4, ha[1] - 14], [ha[0] + 3.4, ha[1] - 18], [ha[0] + 5, ha[1] - 18], [ha[0] + 5, ha[1] - 14], [ha[0] + 6.4, ha[1] - 12], [ha[0] + 6.4, ha[1] - 4]]; g.wash(bt, C.pine, { a: 0.85, spread: 0.3, mottle: false, step: 99 }); g.line(bt, { w: 0.8, step: 99, dbl: false });
    }
    c.restore();
    return { ha, hb };
  }
  A.person = person;

  // ───────────────────────── trees ─────────────────────────
  function trunk(g, r, h, w, lean = 0) {
    const pts = [[-w, 4], [-w * 0.5 + lean * 0.5, -h * 0.5], [-w * 0.35 + lean, -h], [w * 0.35 + lean, -h], [w * 0.5 + lean * 0.5, -h * 0.5], [w, 4]];
    g.paint(pts, C.wood, { a: 0.55 });
    g.line(pts.slice(0, 3), { w: 1.4 }); g.line(pts.slice(3), { w: 1.4 });
    for (let i = 0; i < 3; i++) { const t = r.range(0.2, 0.9); g.line([[lean * t - w * 0.2, -h * t], [lean * t + w * 0.15, -h * t - 6]], { w: 0.7, a: 0.5, dbl: false }); }
  }
  function crown(g, r, cx, cy, rx, ry, col, o = {}) {
    const pts = g.scallop(cx, cy, rx, ry, o.bumps || Math.round((rx + ry) / 7), { depth: o.depth ?? 0.2 });
    g.paint(pts, col, { a: o.a ?? 0.55, step: 99, spread: 2.5 });
    g.wash(A.arcPts(cx + rx * 0.25, cy + ry * 0.3, rx * 0.7, ry * 0.6, 0, TAU, 10), o.shade || C.pine, { a: 0.22, step: 99, spread: 4, edge: false });
    g.line(pts, { closed: true, w: 1.4, wob: 1.4, step: 99 });
    for (let i = 0; i < (o.scr ?? 3); i++) g.scribble(cx + r.range(-0.5, 0.5) * rx, cy + r.range(-0.4, 0.5) * ry, rx * 0.3, ry * 0.3, 6, { a: 0.45 });
  }
  def('poplar', { w: 70, h: 250, v: 3, draw(g, r) {
    const h = r.range(190, 235); trunk(g, r, 40, 5);
    const pts = []; for (let i = 0; i <= 26; i++) { const t = i / 26, a = t * TAU - Math.PI / 2, tp = Math.sin(a) < 0 ? 0.75 : 1; pts.push([Math.cos(a) * 22 * tp * (0.85 + r() * 0.3), -h * 0.56 + Math.sin(a) * h * 0.44]); }
    g.paint(pts, C.leaf, { a: 0.55, step: 99 }); g.wash(pts.slice(2, 12), C.pine, { a: 0.25, step: 99, edge: false });
    g.line(pts, { closed: true, w: 1.4, wob: 1.6, step: 99 });
    for (let i = 0; i < 7; i++) { const y = -h * r.range(0.2, 0.9); g.line(A.quadPts([r.range(-8, 8), y], [r.range(-6, 6), y - 12], [r.range(-8, 8), y - 26], 4), { w: 0.8, a: 0.5, dbl: false }); }
  } });
  def('oak', { w: 180, h: 190, v: 3, draw(g, r) {
    const h = r.range(60, 80); trunk(g, r, h, 9, r.range(-6, 6));
    g.line([[0, -h + 6], [-22, -h - 22]], { w: 1.3 }); g.line([[2, -h + 6], [24, -h - 26]], { w: 1.3 });
    const col = r.pick([C.sage, C.leaf, C.absinthe]);
    crown(g, r, -34, -h - 28, 40, 30, col); crown(g, r, 36, -h - 34, 42, 32, col); crown(g, r, 0, -h - 62, 50, 36, col, { scr: 5 });
  } });
  def('pine', { w: 200, h: 230, v: 3, draw(g, r) {
    const h = r.range(150, 180), lean = r.range(-14, 14); trunk(g, r, h, 6, lean);
    g.line([[lean * 0.8, -h * 0.85], [lean - 34, -h - 6]], { w: 1.3 }); g.line([[lean * 0.8, -h * 0.82], [lean + 38, -h - 8]], { w: 1.3 });
    crown(g, r, lean - 30, -h - 14, 48, 17, C.pine, { depth: 0.25, a: 0.6, scr: 2 }); crown(g, r, lean + 36, -h - 18, 46, 16, C.pine, { depth: 0.25, a: 0.6, scr: 2 });
    crown(g, r, lean, -h - 30, 62, 20, C.leaf, { depth: 0.25, a: 0.6, shade: C.prussian });
  } });
  def('cypress', { w: 44, h: 200, v: 2, draw(g, r) {
    const h = r.range(150, 185); g.seg(0, 4, 0, -14, { w: 2 });
    const pts = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU - Math.PI / 2; pts.push([Math.cos(a) * 12 * (0.85 + r() * 0.3) * (Math.sin(a) < 0 ? 0.6 : 1), -h * 0.54 + Math.sin(a) * h * 0.46]); }
    g.paint(pts, C.pine, { a: 0.72, step: 99 }); g.line(pts, { closed: true, w: 1.3, wob: 1.3, step: 99 });
    for (let i = 0; i < 6; i++) { const y = -h * r.range(0.15, 0.85); g.line([[r.range(-5, 5), y], [r.range(-4, 4), y - 22]], { w: 0.8, a: 0.55, dbl: false }); }
  } });
  def('palm', { w: 150, h: 220, v: 2, draw(g, r) {
    const h = r.range(150, 180), lean = r.range(-26, 26);
    const side = k => A.quadPts([k * 6, 4], [k * 4 + lean * 0.2, -h * 0.5], [lean + k * 3.5, -h], 8);
    g.paint([...side(-1), ...side(1).reverse()], C.wood, { a: 0.5 }); g.line(side(-1), { w: 1.4 }); g.line(side(1), { w: 1.4 });
    for (let t = 0.1; t < 1; t += 0.09) { const p = A.quadPts([0, 4], [lean * 0.2, -h * 0.5], [lean, -h], 10)[Math.round(t * 10)]; g.line([[p[0] - 5, p[1]], [p[0] + 5, p[1] - 2]], { w: 0.8, a: 0.55, dbl: false }); }
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + i / 7 * Math.PI + r.range(-0.15, 0.15), L = r.range(52, 68), ex = lean + Math.cos(a) * L, ey = -h + Math.sin(a) * L * 0.5 + 24;
      const sp = A.quadPts([lean, -h], [lean + Math.cos(a) * L * 0.6, -h + Math.sin(a) * L * 0.9 - 14], [ex, ey], 9);
      const leaf = [...sp, ...sp.slice().reverse().map((p, k) => [p[0], p[1] + Math.sin(k / 9 * Math.PI) * 13])];
      g.wash(leaf, i % 2 ? C.leaf : C.pine, { a: 0.55, step: 99, spread: 1.5 }); g.line(sp, { w: 1.3 });
      for (let k = 2; k < 9; k++) g.seg(sp[k][0], sp[k][1], sp[k][0] - 2 * Math.cos(a), sp[k][1] + 10, { w: 0.7, a: 0.6, dbl: false, over: 0 });
    }
    for (let i = 0; i < 3; i++) { g.paintEll(lean - 5 + i * 5, -h + 5, 3.4, 3.4, C.umber, { a: 0.8 }); }
  } });
  def('plane', { w: 110, h: 170, v: 2, draw(g, r) {
    trunk(g, r, 82, 6); crown(g, r, 0, -112, 40, 36, r.pick([C.sage, C.absinthe]), { scr: 4 });
    g.rect(-16, -2, 32, 5, { w: 1 }); for (let x = -12; x <= 12; x += 6) g.seg(x, -2, x, 3, { w: 0.7, over: 0 });
  } });
  def('olive', { w: 130, h: 110, v: 2, draw(g, r) {
    trunk(g, r, 40, 8, r.range(-10, 10)); crown(g, r, -18, -62, 34, 20, '#a9b79a', { shade: C.slate }); crown(g, r, 22, -66, 36, 22, '#a9b79a', { shade: C.slate });
  } });

  // ───────────────────────── countryside ─────────────────────────
  def('haystack', { w: 100, h: 80, v: 2, draw(g, r) {
    const d = A.arcPts(0, 2, 40, 62, Math.PI, TAU, 14);
    g.paint(d, C.ochre, { a: 0.55 }); g.line(d, { w: 1.5, wob: 1.4 });
    for (let i = 0; i < 16; i++) { const x = r.range(-32, 32), y = r.range(-48, -4) * (1 - Math.abs(x) / 44); g.line([[x, y], [x + r.range(-4, 4), y + r.range(8, 16)]], { w: 0.8, a: 0.55, dbl: false }); }
    g.seg(0, -58, 2, -74, { w: 1.4 });
  } });
  def('farm', { w: 210, h: 170, v: 3, draw(g, r) {
    const w = r.range(110, 140), h = 62, x0 = -w / 2 - 14;
    const wall = A.rectPts(x0, -h, w, h + 12); g.paint(wall, r.pick([C.cream, C.stone, C.pink]), { a: 0.5 });
    g.poly([[x0, 8], [x0, -h], [x0 + w, -h], [x0 + w, 8]], { closed: false, w: 1.5 });
    const roof = [[x0 - 8, -h], [x0 + w + 8, -h], [x0 + w - 8, -h - 40], [x0 + 14, -h - 40]];
    g.paint(roof, C.terracotta, { a: 0.65 }); g.poly(roof, { w: 1.5 });
    for (let y = -h - 32; y < -h; y += 8) g.line([[x0 - 4, y + 4], [x0 + w + 4, y + 4]], { w: 0.8, a: 0.5, dbl: false, wob: 1.6 });
    g.paintRect(x0 + w * 0.7, -h - 62, 12, 26, C.brick, { a: 0.6 }); g.rect(x0 + w * 0.7, -h - 62, 12, 26, { w: 1.2 });
    smoke(g, x0 + w * 0.7 + 6, -h - 64, r);
    door(g, x0 + w * 0.5, 0, 20, 38, C.leaf, true);
    for (const fx of [0.2, 0.82]) windowAt(g, r, x0 + w * fx, -h + 14, 18, 24, { shut: C.teal });
    // lean-to shed and climbing vine
    const sx = x0 + w, shed = [[sx, 8], [sx, -44], [sx + 44, -32], [sx + 44, 8]];
    g.paint(shed, C.wood, { a: 0.45 }); g.poly(shed, { w: 1.3 }); for (let x = sx + 8; x < sx + 44; x += 8) g.seg(x, -40 + (x - sx) * 0.27, x, 6, { w: 0.7, a: 0.5, dbl: false });
    for (let i = 0; i < 5; i++) g.scribble(x0 + 8 + r.range(-6, 6), -8 - i * 11, 9, 7, 6, { c: C.leaf, a: 0.8, w: 1.2 });
  } });
  def('windmill', { w: 130, h: 200, v: 1, hub: [0, -152], draw(g, r) {
    const b = [[-30, 6], [30, 6], [18, -140], [-18, -140]];
    g.paint(b, C.cream, { a: 0.5 }); g.poly(b, { w: 1.5 }); g.hatch(4, -140, 28, 146, { clip: b, gap: 6, a: 0.28 });
    const cap = A.arcPts(0, -140, 22, 28, Math.PI, TAU, 10); g.paint(cap, C.brick, { a: 0.7 }); g.line(cap, { w: 1.5 }); g.seg(-24, -140, 24, -140, { w: 1.5 });
    door(g, 0, 4, 16, 30, C.wood, true); windowAt(g, r, 0, -84, 10, 14, {}); windowAt(g, r, 0, -122, 8, 10, {});
    for (let i = 0; i < 6; i++) g.line([[r.range(-22, 10), r.range(-120, -10)], [r.range(-8, 20), r.range(-120, -10)]].sort((a, b2) => a[0] - b2[0]).map((p, k, arr) => [p[0], arr[0][1]]), { w: 0.7, a: 0.4, dbl: false });
  } });
  def('fence', { w: 190, h: 46, v: 2, draw(g, r) {
    for (let x = -80; x <= 80; x += 32) { g.paintRect(x - 3, -34, 6, 38, C.wood, { a: 0.5 }); g.rect(x - 3, -34, 6, 38, { w: 1.1 }); }
    g.line([[-88, -26], [88, -24 + r.range(-3, 3)]], { w: 1.4 }); g.line([[-88, -12], [88, -13 + r.range(-3, 3)]], { w: 1.4 });
    for (let i = 0; i < 4; i++) tuft(g, r.range(-80, 80), 2, r);
  } });
  def('vines', { w: 240, h: 64, v: 2, draw(g, r) {
    for (let x = -105; x <= 105; x += 30) {
      g.seg(x, 2, x, -44, { w: 1.3 });
      g.scribble(x, -36, 13, 12, 9, { c: C.leaf, a: 0.85, w: 1.3 }); g.washEll(x, -34, 14, 13, C.sage, { a: 0.45 });
      for (let i = 0; i < 3; i++) g.paintEll(x + r.range(-7, 7), -22 + r.range(-3, 5), 2.6, 3, C.mauve, { a: 0.9, mottle: false });
    }
    g.line([[-112, -42], [112, -42]], { w: 0.9, a: 0.7 });
  } });
  def('sunflowers', { w: 130, h: 96, v: 2, draw(g, r) {
    for (let i = 0; i < 6; i++) {
      const x = -52 + i * 21 + r.range(-4, 4), h = r.range(52, 80), lean = r.range(-5, 5);
      g.line(A.quadPts([x, 2], [x + lean, -h * 0.5], [x + lean * 1.5, -h], 5), { w: 1.4, c: C.leaf });
      g.line([[x + lean * 0.5, -h * 0.4], [x + 10, -h * 0.5]], { w: 1.2, c: C.leaf }); g.line([[x + lean * 0.5, -h * 0.6], [x - 9, -h * 0.68]], { w: 1.2, c: C.leaf });
      const cx = x + lean * 1.5, cy = -h;
      const pet = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; pet.push([cx + Math.cos(a) * 5, cy + Math.sin(a) * 5], [cx + Math.cos(a + 0.26) * 11, cy + Math.sin(a + 0.26) * 11]); }
      g.paint(pet, C.ochre, { a: 0.9, step: 99, spread: 0.8 }); g.line(pet, { closed: true, w: 0.9, step: 99, wob: 0.5 });
      g.paintEll(cx, cy, 4.2, 4.2, C.umber, { a: 0.85, mottle: false });
    }
  } });
  def('cow', { w: 110, h: 80, v: 2, draw(g, r) {
    const body = [[-36, -50], [22, -52], [30, -44], [30, -24], [-34, -22], [-40, -34]];
    for (const lx of [-30, -20, 16, 25]) { g.paint([[lx - 3, -26], [lx + 3, -26], [lx + 2, 0], [lx - 2, 0]], C.cream, { a: 0.3 }); g.line([[lx - 3, -26], [lx - 2, 0], [lx + 3, 0], [lx + 3, -26]], { w: 1.2 }); }
    g.paint(body, C.cream, { a: 0.3 }); g.line(body, { closed: true, w: 1.5 });
    for (let i = 0; i < 3; i++) g.washEll(r.range(-26, 16), r.range(-44, -30), r.range(6, 11), r.range(5, 8), r.pick([C.umber, C.brick]), { a: 0.75 });
    // head lowered to the grass
    const hd = [[24, -48], [40, -36], [46, -18], [38, -14], [30, -26], [26, -36]];
    g.paint(hd, C.cream, { a: 0.3 }); g.line(hd, { closed: true, w: 1.4 }); g.dot(38, -30, 1.1);
    g.line([[28, -48], [24, -57]], { w: 1.2 }); g.line([[32, -46], [36, -55]], { w: 1.2 }); g.washEll(42, -17, 4, 3, C.pink, { a: 0.7 });
    g.line(A.quadPts([-38, -44], [-50, -36], [-46, -16], 5), { w: 1.2 }); g.scribble(-46, -13, 3, 4, 5, { a: 0.8 });
    g.washEll(-4, -22, 7, 4, C.pink, { a: 0.6 }); g.paintEll(27, -30, 3, 3.5, C.ochre, { a: 0.9 });
  } });
  def('scarecrow', { w: 90, h: 112, v: 1, draw(g, r) {
    g.seg(0, 4, 0, -84, { w: 1.8 }); g.seg(-34, -66, 34, -70, { w: 1.6 });
    const coat = [[-12, -70], [12, -72], [16, -30], [8, -34], [0, -26], [-8, -34], [-15, -28]];
    g.paint(coat, C.prussian, { a: 0.55 }); g.line(coat, { closed: true, w: 1.3 });
    g.paintEll(0, -84, 8, 9, C.straw, { a: 0.7 }); g.ell(0, -84, 8, 9, { w: 1.2 }); g.dot(-3, -85, 1); g.dot(3, -85, 1); g.line([[-3, -80], [0, -79], [3, -81]], { w: 0.9, dbl: false });
    const hat = [[-13, -91], [13, -93], [6, -95], [3, -108], [-5, -107], [-7, -94]]; g.paint(hat, C.umber, { a: 0.7 }); g.line(hat, { closed: true, w: 1.2 });
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) g.seg(k * 32, -68, k * (38 + i * 2), -62 + i * 5 - 6, { w: 0.9, c: C.ochre });
    tuft(g, -6, 2, r); tuft(g, 8, 2, r);
  } });
  def('signpost', { w: 110, h: 100, v: 3, draw(g, r, v) {
    g.paintRect(-3, -86, 6, 90, C.wood, { a: 0.55 }); g.rect(-3, -86, 6, 90, { w: 1.2 });
    const txt = [['au Village', 'la Mer'], ['Riviera', 'la Gare'], ['le Café', 'Paris']][v % 3];
    const board = (y, s, t) => { const b = [[-2 * s, y], [40 * s, y], [50 * s, y + 8], [40 * s, y + 16], [-2 * s, y + 16]]; g.paint(b, C.cream, { a: 0.5 }); g.poly(b, { w: 1.2 }); g.text(t, 21 * s, y + 12.5, { size: 12, font: A.FONT.text, style: 'italic' }); };
    board(-80, 1, txt[0]); board(-58, -1, txt[1]); tuft(g, -8, 2, r); tuft(g, 9, 2, r);
  } });
  def('well', { w: 84, h: 92, v: 1, draw(g, r) {
    const b = A.rectPts(-24, -28, 48, 32); g.paint(b, C.stone, { a: 0.6 }); g.poly(b, { w: 1.4 });
    for (let i = 0; i < 9; i++) { const x = r.range(-20, 12), y = r.range(-24, -2); g.line([[x, y], [x + 9, y], [x + 9, y + 5]], { w: 0.7, a: 0.5, dbl: false }); }
    g.seg(-20, -28, -20, -70, { w: 1.5 }); g.seg(20, -28, 20, -70, { w: 1.5 });
    const rf = [[-30, -68], [30, -68], [0, -88]]; g.paint(rf, C.terracotta, { a: 0.65 }); g.poly(rf, { w: 1.3 });
    g.seg(-20, -58, 20, -58, { w: 1.2 }); g.seg(0, -58, 0, -40, { w: 0.9 }); g.rect(-5, -40, 10, 9, { w: 1 });
  } });

  // ───────────────────────── architecture bits ─────────────────────────
  function smoke(g, x, y, r) {
    let px = x, py = y; const pts = [[px, py]];
    for (let i = 0; i < 7; i++) { px += r.range(2, 9) * (i % 2 ? 1 : -0.4); py -= r.range(6, 10); pts.push([px, py]); }
    g.line(pts, { w: 1, a: 0.5, dbl: false, wob: 1.6 }); g.curl(px + 5, py - 2, 5, 1, { a: 0.5, w: 0.9, dbl: false });
  }
  function tuft(g, x, y, r) { for (let i = -1; i <= 1; i++) g.line([[x + i * 2, y], [x + i * 5 + r.range(-2, 2), y - r.range(7, 13)]], { w: 1, c: C.olive, dbl: false }); }
  function door(g, x, y, w, h, col, arch) {
    const pts = arch ? [[x - w / 2, y], [x - w / 2, y - h + w / 2], ...A.arcPts(x, y - h + w / 2, w / 2, w / 2, Math.PI, TAU, 6), [x + w / 2, y]] : A.rectPts(x - w / 2, y - h, w, h);
    g.paint(pts, col, { a: 0.72 }); g.line(pts, { w: 1.3, step: 99 }); g.seg(x, y - 2, x, y - h + 3, { w: 0.8, a: 0.6, dbl: false }); g.dot(x + 3, y - h * 0.45, 1.1);
  }
  function windowAt(g, r, x, y, w, h, o = {}) {   // x centre, y top
    const x0 = x - w / 2;
    g.paintRect(x0, y, w, h, o.glass || C.prussian, { a: o.lit ? 0.2 : 0.42, spread: 1 });
    g.rect(x0, y, w, h, { w: 1.2 }); g.seg(x, y, x, y + h, { w: 0.8, over: 0 }); g.seg(x0, y + h * 0.42, x0 + w, y + h * 0.42, { w: 0.8, over: 0 });
    if (o.arch) { const a = A.arcPts(x, y, w / 2, w * 0.42, Math.PI, TAU, 6); g.paint(a, o.glass || C.prussian, { a: 0.4 }); g.line(a, { w: 1.1, step: 99 }); }
    if (o.shut) for (const k of [-1, 1]) {
      const sx = k < 0 ? x0 - w * 0.48 - 1 : x0 + w + 1, sw = w * 0.48;
      g.paintRect(sx, y, sw, h, o.shut, { a: 0.7, spread: 1 }); g.rect(sx, y, sw, h, { w: 1 });
      for (let yy = y + 4; yy < y + h - 1; yy += 4.5) g.seg(sx + 1.5, yy, sx + sw - 1.5, yy, { w: 0.6, a: 0.55, dbl: false, over: 0 });
    }
    g.seg(x0 - 3, y + h + 1, x0 + w + 3, y + h + 1, { w: 1.6 });
    if (o.curtain) g.line(A.quadPts([x0 + 1, y + 1], [x0 + w * 0.5, y + h * 0.3], [x0 + 2, y + h - 1], 5), { w: 0.8, a: 0.7, dbl: false });
    if (o.box) { g.scribble(x, y + h - 3, w * 0.62, 5, 12, { c: C.leaf, a: 0.9, w: 1.3 }); for (let i = 0; i < 5; i++) g.paintEll(x + r.range(-w * 0.55, w * 0.55), y + h - 5 + r.range(-3, 3), 2.2, 2.2, o.box, { a: 0.95, mottle: false }); }
    if (o.balcony) {
      const bw = w + 22, bx = x - bw / 2, by = y + h + 2;
      g.seg(bx, by, bx + bw, by, { w: 1.7 }); g.seg(bx, by - 15, bx + bw, by - 15, { w: 1.2 });
      for (let xx = bx + 3; xx < bx + bw; xx += 5) g.seg(xx, by - 15, xx, by, { w: 0.7, over: 0, dbl: false });
      for (const k of [-1, 1]) g.curl(x + k * bw * 0.52, by + 5, 4, k, { w: 0.9, a: 0.8, turns: 1, dbl: false });
    }
  }
  function awning(g, x, y, w, col, o = {}) {       // x centre, y top edge
    const d = o.d ?? 22, flare = 8, n = Math.max(4, Math.round(w / 14));
    for (let i = 0; i < n; i++) {
      const a0 = i / n, a1 = (i + 1) / n;
      const q = [[x - w / 2 + w * a0, y], [x - w / 2 + w * a1, y], [x - w / 2 - flare + (w + 2 * flare) * a1, y + d], [x - w / 2 - flare + (w + 2 * flare) * a0, y + d]];
      g.paint(q, i % 2 ? C.cream : col, { a: i % 2 ? 0.35 : 0.8, spread: 0.7, edge: false, ox: 0.5, oy: 0.4 });
    }
    g.poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2 + flare, y + d], [x - w / 2 - flare, y + d]], { w: 1.4 });
    const sc = []; for (let i = 0; i < n; i++) sc.push(...A.arcPts(x - w / 2 - flare + (w + 2 * flare) * (i + 0.5) / n, y + d, (w + 2 * flare) / n / 2, 5, Math.PI, 0, 4));
    g.line(sc, { w: 1.1, step: 99 });
  }
  function signBand(g, x, y, w, h, text, col, o = {}) {  // x centre, y top
    g.paintRect(x - w / 2, y, w, h, col, { a: 0.88, spread: 1, mot: 0.2 }); g.rect(x - w / 2, y, w, h, { w: 1.3 });
    g.text(text, x, y + h * 0.76, { size: o.size || h * 0.82, font: o.font || A.FONT.sign, c: o.tc || '#fff4d6', a: 0.95, maxW: w - 10, ls: o.ls ?? 1 });
  }
  function chimneys(g, r, x0, x1, y) {
    const n = r.int(1, 2);
    for (let i = 0; i < n; i++) {
      const x = A.lerp(x0 + 14, x1 - 26, r()), h = r.range(16, 26);
      g.paintRect(x, y - h, 14, h, C.brick, { a: 0.6 }); g.rect(x, y - h, 14, h, { w: 1.2 });
      for (let k = 0; k < 2; k++) { g.paintRect(x + 1.5 + k * 6, y - h - 7, 4.5, 7, C.terracotta, { a: 0.8 }); g.rect(x + 1.5 + k * 6, y - h - 7, 4.5, 7, { w: 0.9 }); }
      if (r.chance(0.5)) smoke(g, x + 6, y - h - 9, r);
    }
  }
  function roofCat(g, x, y) {
    const b = [[x - 9, y], [x - 8, y - 9], [x - 2, y - 12], [x + 5, y - 9], [x + 7, y]];
    g.paint(b, C.ink, { a: 0.8 }); g.line([[x + 3, y - 10], [x + 4, y - 17], [x + 6, y - 13], [x + 9, y - 17], [x + 10, y - 9]], { w: 1.1 }); g.paintEll(x + 6.5, y - 9.5, 4.5, 4, C.ink, { a: 0.8 });
    g.line(A.quadPts([x - 9, y - 2], [x - 18, y - 4], [x - 16, y - 14], 5), { w: 1.4 });
  }

  // one name per sprite variant, so a street never shows the same shop twice in a row
  const SHOPS_FR = ['BOULANGERIE', 'FLEURISTE', 'LIBRAIRIE', 'CHAPELIER', 'TABAC', 'PÂTISSERIE', 'FROMAGERIE', 'HÔTEL', 'ÉPICERIE', 'MODES', 'CHOCOLATIER', 'HORLOGER', 'PARFUMERIE', 'CRÉMERIE', 'BOUQUINISTE', 'CORDONNIER'];
  const SHOPS_IT = ['GELATERIA', 'TRATTORIA', 'PENSIONE', 'ALBERGO', 'PESCHERIA', 'TABACCHI', 'PANIFICIO', 'OSTERIA', 'FARMACIA', 'LIBRERIA', 'SARTORIA', 'DROGHERIA'];
  const CAFES = [['CAFÉ DU CERF-VOLANT', 'CAFFÈ AQUILONE'], ['CAFÉ DE LA GARE', 'CAFFÈ DEL MARE'], ['AU CHAT RÊVEUR', 'BAR CENTRALE'], ['CAFÉ DES ARTISTES', 'CAFFÈ BELLAVISTA']];
  const WALLS_FR = ['#e9d6b0', '#e3c8a8', '#d9cfc0', '#e6d3c4', '#d7d9c4', '#ead9a6'];
  const WALLS_IT = ['#f0c36e', '#ee9f86', '#f3b58f', '#e8d08a', '#e98f7b', '#f1d7a8', '#a9d0c2'];
  const SHUT_FR = [C.slate, C.pine, C.prussian, C.brick, '#8a9a7a'];
  const SHUT_IT = [C.teal, C.pine, C.cerulean, C.leaf, C.brick];

  function house(g, r, style, v = 0) {
    const it = style === 'it';
    const w = r.range(118, 176), floors = r.int(2, 3), fh = it ? 54 : 58, H = floors * fh, x0 = -w / 2, x1 = w / 2;
    const wallCol = r.pick(it ? WALLS_IT : WALLS_FR), shut = r.pick(it ? SHUT_IT : SHUT_FR), trim = r.pick([C.red, C.rose, C.ochre, C.white]);
    g.paint(A.rectPts(x0, -H, w, H + 18), wallCol, { a: it ? 0.7 : 0.6, spread: 3 });
    g.hatch(x1 - 16, -H, 16, H + 10, { gap: 5, a: 0.25 });
    // roof
    if (!it) {
      const rf = [[x0 - 5, -H], [x1 + 5, -H], [x1 - 9, -H - 36], [x0 + 9, -H - 36]];
      g.paint(rf, C.slate, { a: 0.65 }); g.poly(rf, { w: 1.5 });
      for (let y = -H - 28; y < -H; y += 7) g.line([[x0 + 4, y], [x1 - 4, y]], { w: 0.7, a: 0.45, dbl: false, wob: 1.2 });
      const nd = Math.max(2, Math.round(w / 56));
      for (let i = 0; i < nd; i++) { const dx = x0 + w * (i + 0.5) / nd; g.paintRect(dx - 9, -H - 30, 18, 24, wallCol, { a: 0.5 }); windowAt(g, r, dx, -H - 26, 11, 16, { arch: true }); g.poly([[dx - 11, -H - 28], [dx, -H - 38], [dx + 11, -H - 28]], { closed: false, w: 1.2 }); }
      chimneys(g, r, x0, x1, -H - 36);
      if (r.chance(0.3)) roofCat(g, r.range(x0 + 30, x1 - 30), -H - 37);
    } else if (r.chance(0.55)) {
      const rf = [[x0 - 9, -H], [x1 + 9, -H], [x1 - 14, -H - 26], [x0 + 14, -H - 26]];
      g.paint(rf, C.terracotta, { a: 0.72 }); g.poly(rf, { w: 1.5 });
      for (let y = -H - 20; y < -H; y += 6.5) { const pts = []; for (let x = x0; x <= x1; x += 7) pts.push([x, y + ((x / 7) & 1 ? 1.6 : -1.6)]); g.line(pts, { w: 0.7, a: 0.5, dbl: false, step: 99 }); }
      chimneys(g, r, x0, x1, -H - 26);
    } else {
      // roof terrace with pergola and washing
      g.seg(x0 - 4, -H, x1 + 4, -H, { w: 1.8 });
      for (let x = x0 + 8; x < x1; x += 22) g.seg(x, -H, x, -H - 26, { w: 1.1 });
      g.seg(x0 + 4, -H - 26, x1 - 4, -H - 27, { w: 1.3 });
      for (let i = 0; i < 6; i++) g.scribble(r.range(x0 + 10, x1 - 10), -H - 27, 12, 6, 7, { c: C.leaf, a: 0.85, w: 1.2 });
      for (let i = 0; i < 3; i++) { const x = r.range(x0 + 14, x1 - 24); g.paintRect(x, -H - 22, 10, 14, r.pick([C.white, C.rose, C.sky]), { a: 0.5 }); g.rect(x, -H - 22, 10, 14, { w: 0.9 }); }
    }
    g.poly([[x0, 12], [x0, -H], [x1, -H], [x1, 12]], { closed: false, w: 1.6 });
    // floors
    const cols = Math.max(2, Math.round(w / 52)), shop = v % 5 !== 4;
    for (let f = 0; f < floors; f++) {
      const yb = -f * fh, yt = yb - fh;
      if (f > 0) g.seg(x0 - 2, yb, x1 + 2, yb, { w: 1.1 });
      if (f === 0 && shop) {
        const names = it ? SHOPS_IT : SHOPS_FR, name = names[v % names.length], sc = r.pick([C.pine, C.prussian, C.brick, C.umber, '#7a3b3b']);
        signBand(g, 0, yt + 5, w - 16, 14, name, sc, { size: 12.5, ls: 2 });
        const dx = x0 + (r.chance(0.5) ? 24 : w - 24), wx = dx < 0 ? 16 : -16;
        door(g, dx, 8, 20, 36, sc, it);
        const ww = w - 66, wr = A.rectPts(wx - ww / 2, yb - 33, ww, 30);
        g.paint(wr, C.sky, { a: 0.4 }); g.poly(wr, { w: 1.3 });
        for (let i = 0; i < 5; i++) { const gx = wx - ww / 2 + 8 + i * (ww - 16) / 4; g.paintEll(gx, yb - 9 - (i % 2) * 5, 4.5, 4, r.pick([C.ochre, C.red, C.rose, C.cream, C.leaf]), { a: 0.9, mottle: false }); g.ell(gx, yb - 9 - (i % 2) * 5, 4.5, 4, { w: 0.8 }); }
        if (r.chance(0.7)) awning(g, wx, yb - 37, ww + 8, r.pick([C.red, C.pine, C.ochre, C.prussian, C.teal]), { d: 16 });
      } else if (f === 0) {
        door(g, 0, 8, 22, 40, shut, true);
        for (const k of [-1, 1]) windowAt(g, r, k * w * 0.3, yt + 16, 18, 26, { shut, box: trim });
      } else {
        const balc = !it && f === 1 && r.chance(0.6);
        for (let i = 0; i < cols; i++) {
          const wx = x0 + w * (i + 0.5) / cols;
          windowAt(g, r, wx, yt + 13, 17, fh - 28, { shut: r.chance(0.85) ? shut : null, box: r.chance(0.35) ? trim : null, balcony: balc || r.chance(0.12), curtain: r.chance(0.5), arch: it && f === floors - 1 && r.chance(0.3) });
        }
        if (it && r.chance(0.35)) {   // washing line slung between windows
          const y = yt + fh - 10, xa = x0 + w * 0.5 / cols, xb = x0 + w * (cols - 0.5) / cols;
          g.line(A.quadPts([xa, y], [(xa + xb) / 2, y + 8], [xb, y], 6), { w: 0.8 });
          for (let x = xa + 8; x < xb - 10; x += 13) { const yy = y + 5 - Math.abs((x - (xa + xb) / 2) / (xb - xa)) * 8; g.paintRect(x, yy, 9, 12, r.pick([C.white, C.rose, C.sky, C.cream, C.red]), { a: 0.6, spread: 0.8 }); g.rect(x, yy, 9, 12, { w: 0.8 }); }
        }
      }
    }
    if (r.chance(0.35)) { g.scribble(x0 + 5, -H * 0.4, 9, H * 0.36, 26, { c: C.leaf, a: 0.75, w: 1.2 }); }
  }
  def('houseFr', { w: 200, h: 300, b: 22, v: 16, frames: 2, draw(g, r, v) { house(g, r, 'fr', v); } });
  def('houseIt', { w: 200, h: 290, b: 22, v: 12, frames: 2, draw(g, r, v) { house(g, r, 'it', v); } });

  // The café: striped awning, gilt sign, terrace tables and their regulars.
  function cafeTable(g, x, y) {
    g.seg(x, y, x, y - 22, { w: 1.3 }); g.line([[x - 7, y], [x, y - 4], [x + 7, y]], { w: 1.1 });
    g.paintEll(x, y - 23, 12, 3, C.cream, { a: 0.4 }); g.ell(x, y - 23, 12, 3, { w: 1.2 });
    g.rect(x - 6, y - 30, 4, 5, { w: 0.9 }); g.line(A.quadPts([x - 4, y - 32], [x - 1, y - 37], [x - 5, y - 42], 4), { w: 0.6, a: 0.5, dbl: false });
    g.seg(x + 4, y - 25, x + 4, y - 34, { w: 0.9 }); g.paintEll(x + 4, y - 35, 2, 3, C.pine, { a: 0.8 });
  }
  function chair(g, x, y, dir) {
    g.seg(x - 6 * dir, y, x - 6 * dir, y - 38, { w: 1.1 }); g.seg(x + 6 * dir, y, x + 6 * dir, y - 18, { w: 1.1 }); g.seg(x - 7 * dir, y - 18, x + 7 * dir, y - 18, { w: 1.4 });
    g.arc(x - 6 * dir, y - 30, 5, 8, -Math.PI / 2, Math.PI / 2, { w: 0.9 });
  }
  function cafe(g, r, v) {
    const it = v % 2 === 1, w = 236, H = 150, x0 = -w / 2, x1 = w / 2, col = it ? C.pine : C.red;
    g.paint(A.rectPts(x0, -H, w, H + 18), it ? '#f2c98a' : '#ead7b4', { a: 0.6, spread: 3 });
    g.hatch(x1 - 16, -H, 16, H + 10, { gap: 5, a: 0.25 });
    if (it) { const rf = [[x0 - 9, -H], [x1 + 9, -H], [x1 - 14, -H - 26], [x0 + 14, -H - 26]]; g.paint(rf, C.terracotta, { a: 0.72 }); g.poly(rf, { w: 1.5 }); for (let y = -H - 20; y < -H; y += 6.5) g.line([[x0, y], [x1, y]], { w: 0.7, a: 0.45, dbl: false, wob: 1.5 }); }
    else { const rf = [[x0 - 5, -H], [x1 + 5, -H], [x1 - 9, -H - 34], [x0 + 9, -H - 34]]; g.paint(rf, C.slate, { a: 0.65 }); g.poly(rf, { w: 1.5 }); for (let i = 0; i < 3; i++) { const dx = x0 + w * (i + 0.5) / 3; g.paintRect(dx - 9, -H - 28, 18, 22, '#ead7b4', { a: 0.5 }); windowAt(g, r, dx, -H - 25, 11, 15, { arch: true }); } chimneys(g, r, x0, x1, -H - 34); }
    g.poly([[x0, 12], [x0, -H], [x1, -H], [x1, 12]], { closed: false, w: 1.6 });
    for (let i = 0; i < 4; i++) windowAt(g, r, x0 + w * (i + 0.5) / 4, -H + 12, 18, 34, { shut: it ? C.teal : C.slate, box: i % 2 ? C.red : null, balcony: i % 2 === 0, curtain: true });
    g.seg(x0 - 2, -86, x1 + 2, -86, { w: 1.1 });
    signBand(g, 0, -84, w - 18, 20, CAFES[(v >> 1) % CAFES.length][it ? 1 : 0], it ? C.pine : '#6e2f2a', { size: 17, ls: 2.5, tc: '#ffe9a8' });
    // glazed front and door behind the terrace
    const fr = A.rectPts(x0 + 12, -58, w - 24, 58); g.paint(fr, C.prussian, { a: 0.32 }); g.poly(fr, { w: 1.2 });
    for (let x = x0 + 12 + (w - 24) / 5; x < x1 - 14; x += (w - 24) / 5) g.seg(x, -58, x, 0, { w: 0.9, over: 0 });
    g.text(it ? 'Gelati · Vini' : 'Vins · Liqueurs', 0, -40, { size: 11, font: A.FONT.script, c: '#fff4d6', a: 0.9 });
    awning(g, 0, -64, w - 8, col, { d: 26 });
    // potted bays
    for (const k of [-1, 1]) { const px = k * (w / 2 + 2); g.paint([[px - 8, 12], [px + 8, 12], [px + 6, -2], [px - 6, -2]], C.terracotta, { a: 0.8 }); g.poly([[px - 8, 12], [px + 8, 12], [px + 6, -2], [px - 6, -2]], { w: 1.1 }); g.seg(px, -2, px, -20, { w: 1.2 }); crown(g, r, px, -30, 12, 12, C.leaf, { scr: 1, bumps: 9 }); }
    // terrace
    const y = 14;
    chair(g, -92, y, 1); person(g, -92, y, { kind: 'gent', sit: true, col: C.prussian, hat: 'top', armA: 0.9, bendA: 1.2 });
    cafeTable(g, -66, y);
    chair(g, -38, y, -1); person(g, -38, y, { kind: 'lady', sit: true, flip: true, col: r.pick([C.rose, C.lavender, C.ochre]), armA: 1.0, bendA: 1.3, trim: C.red });
    cafeTable(g, 18, y); chair(g, 46, y, -1);
    person(g, 46, y, { kind: 'gent', sit: true, flip: true, col: C.umber, hat: 'bowler', armA: 1.0, bendA: 1.2 });
    // newspaper
    g.paint([[30, y - 52], [42, y - 56], [42, y - 38], [30, y - 34]], C.white, { a: 0.1 }); g.poly([[30, y - 52], [42, y - 56], [42, y - 38], [30, y - 34]], { w: 1 });
    for (let i = 0; i < 4; i++) g.seg(32, y - 50 + i * 4, 40, y - 53 + i * 4, { w: 0.5, a: 0.6, dbl: false, over: 0 });
    person(g, 84, y, { kind: 'waiter', col: C.ink, armA: 1.9, bendA: 0.9, tray: true, flip: true });
    // chalkboard
    const cb = [[-122, y], [-116, y - 30], [-102, y - 30], [-98, y]]; g.paint(cb, C.ink, { a: 0.7 }); g.poly(cb, { w: 1.1 });
    g.text('Menu', -110, y - 19, { size: 8, font: A.FONT.script, c: '#fff', a: 0.9 }); for (let i = 0; i < 3; i++) g.seg(-116, y - 14 + i * 4, -104, y - 14 + i * 4, { w: 0.5, c: '#fff', a: 0.7, dbl: false, over: 0 });
  }
  def('cafe', { w: 270, h: 200, b: 26, v: 8, frames: 2, draw(g, r, v) { cafe(g, r, v); } });

  // ───────────────────────── street furniture ─────────────────────────
  def('lamp', { w: 60, h: 180, v: 2, draw(g, r, v) {
    g.paint([[-5, 4], [5, 4], [3, -12], [-3, -12]], C.pine, { a: 0.75 }); g.line([[-5, 4], [-3, -12], [-1.6, -128]], { w: 1.2 }); g.line([[5, 4], [3, -12], [1.6, -128]], { w: 1.2 });
    g.wash([[-1.6, -12], [1.6, -12], [1.6, -128], [-1.6, -128]], C.pine, { a: 0.7, spread: 0.3 });
    for (const y of [-30, -110]) g.seg(-4, y, 4, y, { w: 1.4 });
    const lan = [[-7, -130], [7, -130], [10, -152], [-10, -152]]; g.paint(lan, C.straw, { a: 0.75 }); g.poly(lan, { w: 1.2 });
    g.poly([[-12, -152], [12, -152], [0, -164]], { w: 1.2 }); g.wash([[-12, -152], [12, -152], [0, -164]], C.pine, { a: 0.7 }); g.seg(0, -164, 0, -170, { w: 1.2 });
    if (v) { g.line(A.quadPts([2, -112], [22, -120], [22, -100], 6), { w: 1.1 }); g.curl(22, -104, 4, 1, { w: 0.9, dbl: false }); g.scribble(22, -92, 9, 7, 12, { c: C.leaf, a: 0.9, w: 1.3 }); for (let i = 0; i < 5; i++) g.paintEll(22 + r.range(-8, 8), -92 + r.range(-5, 5), 2.2, 2.2, r.pick([C.red, C.rose, C.ochre]), { a: 0.95, mottle: false }); }
  } });
  def('kiosk', { w: 76, h: 160, v: 2, draw(g, r) {
    const b = A.rectPts(-20, -108, 40, 114); g.paint(b, C.pine, { a: 0.6 }); g.poly([[-20, 6], [-20, -108], [20, -108], [20, 6]], { closed: false, w: 1.4 });
    const pc = [C.red, C.ochre, C.cream, C.cerulean, C.rose];
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { const x = -17 + k * 18, y = -98 + i * 46; g.paintRect(x, y, 16, 38, r.pick(pc), { a: 0.75, spread: 0.8 }); g.rect(x, y, 16, 38, { w: 0.9 }); g.scribble(x + 8, y + 12, 5, 7, 5, { w: 1.2, a: 0.8 }); for (let l = 0; l < 3; l++) g.seg(x + 3, y + 26 + l * 4, x + 13, y + 26 + l * 4, { w: 0.5, dbl: false, over: 0, a: 0.6 }); }
    const cap = [[-26, -108], [26, -108], [22, -116], [-22, -116]]; g.paint(cap, C.pine, { a: 0.8 }); g.poly(cap, { w: 1.2 });
    const dome = A.arcPts(0, -116, 20, 24, Math.PI, TAU, 10); g.paint(dome, C.pine, { a: 0.75 }); g.line(dome, { w: 1.3 }); g.seg(0, -140, 0, -150, { w: 1.3 }); g.dot(0, -151, 2);
  } });
  def('fountain', { w: 170, h: 124, v: 1, draw(g, r) {
    const basin = [[-70, 6], [70, 6], [62, -18], [-62, -18]]; g.paint(basin, C.stone, { a: 0.6 }); g.poly(basin, { w: 1.5 });
    g.washRect(-58, -22, 116, 6, C.sky, { a: 0.6 });
    g.paint([[-7, -18], [7, -18], [5, -62], [-5, -62]], C.stone, { a: 0.6 }); g.poly([[-7, -18], [-5, -62], [5, -62], [7, -18]], { closed: false, w: 1.3 });
    const bowl = [[-30, -68], [30, -68], [18, -60], [-18, -60]]; g.paint(bowl, C.stone, { a: 0.6 }); g.poly(bowl, { w: 1.3 });
    g.paint([[-4, -68], [4, -68], [3, -92], [-3, -92]], C.stone, { a: 0.6 }); g.line([[-4, -68], [-3, -92], [3, -92], [4, -68]], { w: 1.2 }); g.ell(0, -97, 5, 5, { w: 1.2 });
    for (const k of [-1, 1]) for (const [dx, top, y1] of [[24, -112, -68], [50, -80, -20]]) g.line(A.quadPts([k * 2, top + 14], [k * dx * 0.55, top], [k * dx, y1], 7), { w: 1, c: C.cerulean, a: 0.8 });
    for (let i = 0; i < 8; i++) g.dot(r.range(-50, 50), r.range(-30, -22), 1, { c: C.cerulean, a: 0.7 });
  } });
  function wheel(g, x, y, rad, n = 8) { g.ell(x, y, rad, rad, { w: 1.5 }); g.ell(x, y, 2.5, 2.5, { w: 1 }); for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.2; g.seg(x, y, x + Math.cos(a) * rad, y + Math.sin(a) * rad, { w: 0.8, over: 0, dbl: false }); } }
  def('flowercart', { w: 150, h: 124, v: 2, draw(g, r) {
    const box = [[-44, -30], [44, -30], [38, -8], [-38, -8]]; g.paint(box, C.wood, { a: 0.6 }); g.poly(box, { w: 1.4 });
    g.line([[44, -28], [66, -40]], { w: 1.4 }); g.seg(-30, -8, -34, 4, { w: 1.3 });
    const fc = [C.red, C.rose, C.ochre, C.lavender, C.white, C.pink];
    for (let i = 0; i < 9; i++) { const x = -38 + i * 9.5, col = r.pick(fc); g.scribble(x, -38 - (i % 3) * 5, 8, 8, 8, { c: C.leaf, a: 0.8, w: 1.2 }); for (let k = 0; k < 4; k++) { g.paintEll(x + r.range(-6, 6), -42 - (i % 3) * 5 + r.range(-6, 5), 3, 3, col, { a: 0.95, mottle: false }); } }
    for (const k of [-1, 1]) g.seg(k * 42, -30, k * 44, -88, { w: 1.2 });
    awning(g, 0, -100, 92, r.pick([C.ochre, C.teal, C.red]), { d: 14 });
    wheel(g, 14, -14, 18, 10);
    person(g, -62, 4, { kind: 'lady', col: r.pick([C.teal, C.lavender, C.sage]), hat: 'wide', hatCol: C.cream, armA: 1.1, bendA: 0.4, blouse: C.white });
  } });
  def('gelato', { w: 140, h: 140, v: 2, draw(g, r, v) {
    const box = A.rectPts(-34, -44, 68, 34); g.paint(box, v ? C.sea : C.pink, { a: 0.6 }); g.poly(box, { w: 1.4 });
    g.text(v ? 'GELATI' : 'GLACES', 0, -22, { size: 15, font: A.FONT.poster, ls: 2 });
    for (const k of [-1, 1]) g.seg(k * 30, -44, k * 32, -100, { w: 1.2 });
    awning(g, 0, -112, 76, v ? C.red : C.teal, { d: 15 });
    wheel(g, -14, -12, 14, 8); wheel(g, 22, -8, 9, 6); g.line([[34, -40], [54, -50], [58, -46]], { w: 1.4 });
    for (let i = 0; i < 3; i++) { const x = -18 + i * 16; g.poly([[x - 4, -52], [x + 4, -52], [x, -44]], { w: 0.9 }); g.paintEll(x, -56, 4.5, 4.5, [C.rose, C.cream, C.absinthe][i], { a: 0.95, mottle: false }); g.ell(x, -56, 4.5, 4.5, { w: 0.9 }); }
    person(g, 54, 4, { kind: 'gent', col: C.white, hat: 'cap', hatCol: C.white, flip: true, armA: 1.3, bendA: 0.5, legs: C.slate });
  } });
  def('bench', { w: 110, h: 96, v: 2, draw(g, r, v) {
    g.seg(-40, -20, 40, -20, { w: 1.8 }); g.seg(-40, -40, 40, -40, { w: 1.4 }); g.seg(-40, -32, 40, -32, { w: 1.1 });
    for (const k of [-1, 1]) { g.line([[k * 36, 2], [k * 36, -20], [k * 40, -44]], { w: 1.4 }); g.curl(k * 36, 0, 4, k, { w: 0.9, dbl: false, turns: 0.8 }); }
    if (v) { person(g, -8, 2, { kind: 'lady', sit: true, col: C.lavender, armA: 0.9, bendA: 1.1, trim: C.ochre }); }
    else {
      person(g, -6, 2, { kind: 'gent', sit: true, col: C.slate, hat: 'bowler', armA: 1.0, bendA: 1.2 });
      const np = [[4, -56], [22, -62], [24, -38], [6, -32]]; g.paint(np, C.white, { a: 0.1 }); g.poly(np, { w: 1 }); for (let i = 0; i < 5; i++) g.seg(7, -52 + i * 4, 21, -57 + i * 4, { w: 0.5, a: 0.6, dbl: false, over: 0 });
    }
  } });
  def('bunting', { w: 300, h: 250, b: 0, v: 3, draw(g, r) {
    const y0 = -r.range(190, 225), sag = 34, pts = A.quadPts([-146, y0], [0, y0 + sag * 2], [146, y0 - 8], 22);
    g.line(pts, { w: 0.9, step: 99 });
    const cols = [C.red, C.ochre, C.cerulean, C.cream, C.leaf, C.rose];
    for (let i = 1; i < 22; i++) { const [x, y] = pts[i], tri = [[x - 5.5, y + 1], [x + 5.5, y + 1], [x + r.range(-1.5, 1.5), y + 15]]; g.wash(tri, cols[i % cols.length], { a: 0.85, spread: 0.7, mottle: false }); g.poly(tri, { w: 0.8, dbl: false }); }
  } });
  def('balustrade', { w: 220, h: 58, v: 1, draw(g, r) {
    g.paintRect(-104, -34, 208, 7, C.stone, { a: 0.6 }); g.rect(-104, -34, 208, 7, { w: 1.3 }); g.seg(-104, 0, 104, 0, { w: 1.4 });
    for (let x = -94; x <= 94; x += 13) { const b = [[x - 2, -27], [x + 2, -27], [x + 4, -14], [x + 2, 0], [x - 2, 0], [x - 4, -14]]; g.paint(b, C.stone, { a: 0.55, spread: 0.8 }); g.line(b, { closed: true, w: 0.9, dbl: false, step: 99 }); }
    for (const k of [-1, 1]) { const px = k * 104; g.paintRect(px - 6, -40, 12, 44, C.stone, { a: 0.6 }); g.rect(px - 6, -40, 12, 44, { w: 1.3 }); g.paint(A.arcPts(px, -40, 8, 8, 0, Math.PI, 6), C.terracotta, { a: 0.8 }); g.scribble(px, -52, 9, 8, 10, { c: C.leaf, a: 0.9, w: 1.3 }); for (let i = 0; i < 4; i++) g.paintEll(px + r.range(-7, 7), -54 + r.range(-5, 5), 2.2, 2.2, C.red, { a: 0.95, mottle: false }); }
  } });

  // ───────────────────────── riviera ─────────────────────────
  function beachUmbrella(g, x, y, col, lean = 0) {
    g.seg(x, y, x + lean, y - 70, { w: 1.4 });
    const cx = x + lean, cy = y - 62, n = 6;
    for (let i = 0; i < n; i++) { const a0 = Math.PI + i / n * Math.PI, a1 = Math.PI + (i + 1) / n * Math.PI; g.paint([[cx, cy - 26], ...A.arcPts(cx, cy, 44, 24, a0, a1, 3)], i % 2 ? C.cream : col, { a: i % 2 ? 0.35 : 0.85, spread: 0.8, edge: false, step: 99 }); }
    g.line(A.arcPts(cx, cy, 44, 24, Math.PI, TAU, 12), { w: 1.4, step: 99 });
    const sc = []; for (let i = 0; i < n; i++) sc.push(...A.arcPts(cx - 44 + (i + 0.5) * 88 / n, cy, 44 / n, 5, Math.PI, 0, 4)); g.line(sc, { w: 1.1, step: 99 });
    for (let i = 1; i < n; i++) { const a = Math.PI + i / n * Math.PI; g.line(A.quadPts([cx, cy - 26], [cx + Math.cos(a) * 30, cy - 20], [cx + Math.cos(a) * 44, cy + Math.sin(a) * 24], 4), { w: 0.7, a: 0.6, dbl: false }); }
  }
  def('beachset', { w: 190, h: 124, v: 4, draw(g, r, v) {
    const col = [C.red, C.cerulean, C.ochre, C.teal][v % 4];
    beachUmbrella(g, -20, 2, col, r.range(-8, 8));
    // deck chair with a sunbather stretched out, reading or dozing
    const dc = [[-4, 0], [34, -30], [38, -28], [4, 2]]; g.paint(dc, C.cream, { a: 0.4 });
    for (let i = 0; i < 5; i += 2) g.wash([[-4 + i * 7.6, -i * 6], [-4 + (i + 1) * 7.6, -(i + 1) * 6], [(i + 1) * 7.6, 2 - (i + 1) * 6], [i * 7.6, 2 - i * 6]], col, { a: 0.8, spread: 0.5, edge: false, mottle: false });
    g.poly(dc, { w: 1.2 }); g.seg(14, -12, 26, 2, { w: 1.2 }); g.seg(-6, 2, 38, 2, { w: 1.1 });
    const c = g.c; c.save(); c.translate(-2, -7); c.rotate(0.92);
    person(g, 0, 0, { kind: 'bather', col: r.pick([C.prussian, C.red, C.pine]), hat: v % 2 ? 'boater' : 'none', armA: -1.9, bendA: -1.0, armB: -0.4, bendB: -0.6, flip: false, mustache: v % 2 === 1 });
    c.restore();
    // bucket, ball or a second bather
    if (v % 2) { const b = [[56, 2], [70, 2], [72, -12], [54, -12]]; g.paint(b, C.red, { a: 0.8 }); g.poly(b, { w: 1.1 }); g.arc(63, -12, 9, 8, Math.PI, TAU, { w: 0.9 }); const sc = [[-78, 2], [-70, -12], [-66, -6], [-60, -16], [-54, -6], [-50, -11], [-44, 2]]; g.paint(sc, C.sand, { a: 0.8 }); g.line(sc, { w: 1.2, step: 99 }); g.seg(-60, -16, -60, -26, { w: 0.9 }); g.wash([[-60, -26], [-52, -23], [-60, -20]], C.red, { a: 0.9, mottle: false }); }
    else { person(g, 64, 2, { kind: 'bather', col: r.pick([C.red, C.prussian]), hat: 'cap', armA: -2.6, bendA: -0.4, armB: 2.7, bendB: 0.4, mustache: false }); g.paintEll(64, -96, 10, 10, C.cream, { a: 0.4 }); g.wash(A.arcPts(64, -96, 10, 10, -1, 1, 5).concat([[64, -96]]), C.red, { a: 0.85, step: 99, mottle: false }); g.wash(A.arcPts(64, -96, 10, 10, 2.1, 4.1, 5).concat([[64, -96]]), C.cerulean, { a: 0.85, step: 99, mottle: false }); g.ell(64, -96, 10, 10, { w: 1.1 }); }
  } });
  def('cabana', { w: 84, h: 126, v: 3, draw(g, r, v) {
    const col = [C.cerulean, C.red, C.teal][v % 3], x0 = -26, w = 52, H = 76;
    g.paintRect(x0, -H - 8, w, H, C.cream, { a: 0.35 });
    for (let i = 0; i < 6; i += 2) g.wash(A.rectPts(x0 + i * w / 6, -H - 8, w / 6, H), col, { a: 0.8, spread: 0.6, edge: false, mottle: false });
    g.rect(x0, -H - 8, w, H, { w: 1.4 });
    const rf = [[x0 - 6, -H - 8], [x0 + w + 6, -H - 8], [0, -H - 36]]; g.paint(rf, col, { a: 0.85 }); g.poly(rf, { w: 1.4 }); g.seg(0, -H - 36, 0, -H - 46, { w: 1 }); g.wash([[0, -H - 46], [10, -H - 43], [0, -H - 40]], C.red, { a: 0.9, mottle: false });
    door(g, 0, -8, 20, 44, C.cream, false); g.line([[-8, -8], [-12, 2]], { w: 1.2 }); g.line([[8, -8], [12, 2]], { w: 1.2 }); g.seg(-12, -2, 12, -2, { w: 1 });
    wheel(g, -18, -6, 9, 6); wheel(g, 18, -6, 9, 6);
  } });
  def('rowboat', { w: 170, h: 96, v: 2, draw(g, r, v) {
    const hull = [[-66, -22], [70, -24], [54, -2], [-48, 0]]; g.paint(hull, v ? C.cerulean : C.red, { a: 0.75 }); g.poly(hull, { w: 1.5 });
    g.wash([[-66, -22], [70, -24], [66, -17], [-62, -15]], C.cream, { a: 0.8, mottle: false }); g.seg(-62, -15, 66, -17, { w: 0.9 });
    g.text(v ? 'Stella' : 'Mimì', 10, -5, { size: 10, font: A.FONT.script, c: '#fff', a: 0.9 });
    g.seg(-70, -30, 50, -36, { w: 1.3 }); // oar
    // drying nets on poles
    g.seg(-74, 2, -74, -70, { w: 1.2 }); g.seg(-40, 2, -40, -64, { w: 1.2 });
    const net = A.quadPts([-74, -66], [-57, -40], [-40, -60], 8); g.line(net, { w: 0.9 });
    for (let i = 1; i < 8; i++) g.seg(net[i][0], net[i][1], net[i][0] + 2, net[i][1] + 18 - Math.abs(i - 4) * 2, { w: 0.5, a: 0.6, dbl: false, over: 0 });
    for (let i = 0; i < 4; i++) g.line(net.map(p => [p[0], p[1] + 4 + i * 4]), { w: 0.4, a: 0.5, dbl: false, step: 99 });
  } });
  def('strongman', { w: 110, h: 112, v: 1, draw(g, r) {
    person(g, 0, 2, { kind: 'bather', col: C.red, hat: 'none', armA: 2.75, bendA: 0.25, armB: -2.75, bendB: -0.25, mustache: true });
    g.seg(-34, -86, 34, -86, { w: 2 });
    for (const k of [-1, 1]) { g.paintEll(k * 38, -86, 9, 9, C.ink, { a: 0.8 }); g.ell(k * 38, -86, 9, 9, { w: 1.2 }); }
    g.line([[-12, -100], [-8, -104]], { w: 0.8, dbl: false }); g.line([[12, -100], [16, -104]], { w: 0.8, dbl: false });
  } });

  // ───────────────────────── distance: the "near" backdrop layer ─────────────────────────
  def('skyline', { w: 440, h: 200, b: 30, v: 4, far: true, frames: 2, draw(g, r) {
    let x = -214;
    while (x < 200) {
      const w = r.range(44, 78), h = r.range(70, 140), col = r.pick(['#e3d3bd', '#dccbc0', '#d5d3c6', '#e5cfb4']);
      g.paintRect(x, -h, w, h + 28, col, { a: 0.5 });
      const rf = [[x - 2, -h], [x + w + 2, -h], [x + w - 6, -h - 20], [x + 6, -h - 20]]; g.paint(rf, C.slate, { a: 0.5 }); g.poly(rf, { w: 1.1 });
      g.line([[x, 20], [x, -h]], { w: 1.1 }); g.line([[x + w, -h], [x + w, 20]], { w: 1.1 });
      for (let yy = -h + 10; yy < -8; yy += 22) for (let xx = x + 9; xx < x + w - 8; xx += 15) { g.washRect(xx, yy, 6, 11, C.prussian, { a: 0.4, spread: 0.5, mottle: false }); g.rect(xx, yy, 6, 11, { w: 0.6, dbl: false }); }
      if (r.chance(0.5)) { g.rect(x + w * 0.5, -h - 32, 7, 13, { w: 0.9 }); }
      x += w + r.range(-2, 6);
    }
  } });
  def('church', { w: 150, h: 370, b: 30, v: 2, far: true, frames: 2, draw(g, r, v) {
    const tw = 44, H = r.range(230, 270);
    g.paintRect(-tw / 2, -H, tw, H + 28, '#e6d6ba', { a: 0.55 }); g.poly([[-tw / 2, 24], [-tw / 2, -H], [tw / 2, -H], [tw / 2, 24]], { closed: false, w: 1.3 });
    g.hatch(tw / 2 - 10, -H, 10, H, { gap: 5, a: 0.25 });
    const sp = v ? [[-tw / 2 - 3, -H], [tw / 2 + 3, -H], [0, -H - 86]] : [[-tw / 2 - 3, -H], [tw / 2 + 3, -H], [tw / 2 - 4, -H - 26], [0, -H - 44], [-tw / 2 + 4, -H - 26]];
    g.paint(sp, v ? C.slate : C.terracotta, { a: 0.65 }); g.poly(sp, { w: 1.3 }); const top = v ? -H - 86 : -H - 44; g.seg(0, top, 0, top - 16, { w: 1.1 }); g.seg(-5, top - 10, 5, top - 10, { w: 1.1 });
    g.paintEll(0, -H + 34, 12, 12, C.cream, { a: 0.6 }); g.ell(0, -H + 34, 12, 12, { w: 1.2 }); g.seg(0, -H + 34, 0, -H + 26, { w: 1, over: 0 }); g.seg(0, -H + 34, 6, -H + 37, { w: 1, over: 0 });
    for (const y of [-H + 62, -H + 108]) windowAt(g, r, 0, y, 12, 24, { arch: true });
    // nave
    const nv = [[tw / 2, 24], [tw / 2, -70], [tw / 2 + 62, -70], [tw / 2 + 62, 24]]; g.paint(nv, '#e6d6ba', { a: 0.55 }); g.poly(nv.slice(1), { closed: false, w: 1.2 });
    const nr = [[tw / 2, -70], [tw / 2 + 66, -70], [tw / 2 + 56, -100], [tw / 2, -100]]; g.paint(nr, v ? C.slate : C.terracotta, { a: 0.6 }); g.poly(nr, { w: 1.2 });
    for (let i = 0; i < 2; i++) windowAt(g, r, tw / 2 + 18 + i * 26, -54, 10, 26, { arch: true });
  } });
  def('treeline', { w: 380, h: 110, b: 30, v: 3, far: true, draw(g, r) {
    let x = -170;
    while (x < 170) { const rx = r.range(22, 40), ry = r.range(18, 34), h = r.range(18, 34); g.seg(x, 20, x, -h, { w: 1.2 }); crown(g, r, x, -h - ry * 0.7, rx, ry, r.pick([C.sage, C.leaf, C.absinthe]), { scr: 1, a: 0.5 }); x += rx * r.range(0.9, 1.7); }
  } });
  def('farAway', { w: 240, h: 120, b: 30, v: 3, far: true, draw(g, r) {
    const w = 70, x0 = -60; g.paintRect(x0, -40, w, 64, C.cream, { a: 0.45 }); g.poly([[x0, 20], [x0, -40], [x0 + w, -40], [x0 + w, 20]], { closed: false, w: 1.1 });
    const rf = [[x0 - 5, -40], [x0 + w + 5, -40], [x0 + w - 8, -64], [x0 + 8, -64]]; g.paint(rf, C.terracotta, { a: 0.6 }); g.poly(rf, { w: 1.1 });
    for (const fx of [0.25, 0.7]) { g.washRect(x0 + w * fx, -30, 8, 12, C.prussian, { a: 0.4, mottle: false }); g.rect(x0 + w * fx, -30, 8, 12, { w: 0.7, dbl: false }); }
    for (const tx of [40, 62, 86]) { const h = r.range(60, 100); const pts = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU - Math.PI / 2; pts.push([tx + Math.cos(a) * 8, -h * 0.5 + Math.sin(a) * h * 0.5]); } g.paint(pts, C.pine, { a: 0.6, step: 99 }); g.line(pts, { closed: true, w: 1, step: 99 }); }
  } });
  def('lighthouse', { w: 130, h: 290, b: 30, v: 1, far: true, frames: 2, draw(g, r) {
    // rocky foot
    const rock = [[-60, 24], [-44, -14], [-18, -26], [14, -22], [40, -8], [60, 24]]; g.paint(rock, C.stone, { a: 0.6 }); g.line(rock, { w: 1.3, step: 99 }); g.hatch(-10, -26, 60, 44, { clip: rock, gap: 6, a: 0.3 });
    const H = 210, t = [[-17, -20], [17, -20], [11, -H], [-11, -H]]; g.paint(t, C.cream, { a: 0.3 });
    for (let i = 0; i < 5; i += 2) { const y0 = -20 - i * (H - 20) / 5, y1 = -20 - (i + 1) * (H - 20) / 5, k0 = 17 - 6 * i / 5, k1 = 17 - 6 * (i + 1) / 5; g.wash([[-k0, y0], [k0, y0], [k1, y1], [-k1, y1]], C.red, { a: 0.75, spread: 0.8, edge: false }); }
    g.poly(t, { w: 1.3 }); g.seg(-16, -H, 16, -H, { w: 1.5 });
    const lan = A.rectPts(-8, -H - 22, 16, 22); g.paint(lan, C.straw, { a: 0.8 }); g.poly(lan, { w: 1.1 }); g.seg(0, -H - 22, 0, -H, { w: 0.7, over: 0 });
    const cap = A.arcPts(0, -H - 22, 11, 12, Math.PI, TAU, 8); g.paint(cap, C.prussian, { a: 0.75 }); g.line(cap, { w: 1.2 }); g.seg(0, -H - 34, 0, -H - 42, { w: 1 });
    door(g, 0, -20, 10, 20, C.prussian, true); windowAt(g, r, 0, -120, 7, 11, {});
  } });
  def('hillVillage', { w: 260, h: 150, b: 30, v: 3, far: true, frames: 2, draw(g, r) {
    // pastel houses climbing a slope
    for (let i = 0; i < 9; i++) {
      const x = -104 + i * 24 + r.range(-6, 6), base = -Math.sin((i + 0.5) / 9 * Math.PI) * 46, w = r.range(26, 36), h = r.range(34, 58);
      g.paintRect(x, base - h, w, h + 54, r.pick(WALLS_IT), { a: 0.7 }); g.poly([[x, base + 6], [x, base - h], [x + w, base - h], [x + w, base + 6]], { closed: false, w: 1 });
      const rf = [[x - 3, base - h], [x + w + 3, base - h], [x + w / 2, base - h - 12]]; g.paint(rf, C.terracotta, { a: 0.7 }); g.poly(rf, { w: 1 });
      for (let yy = base - h + 8; yy < base - 6; yy += 15) for (let xx = x + 6; xx < x + w - 6; xx += 12) { g.washRect(xx, yy, 5, 8, C.pine, { a: 0.65, spread: 0.4, mottle: false }); }
    }
    for (let i = 0; i < 5; i++) g.scribble(r.range(-110, 110), r.range(-6, 14), 16, 8, 8, { c: C.leaf, a: 0.7, w: 1.2 });
  } });

  // ───────────────────────── far distance: minis for hilltops and the sea ─────────────────────────
  def('miniTown', { w: 170, h: 90, b: 20, v: 3, far: true, draw(g, r) {
    for (let i = 0; i < 7; i++) { const x = -70 + i * 20 + r.range(-4, 4), w = r.range(16, 24), h = r.range(14, 30); g.paintRect(x, -h, w, h + 16, r.pick(['#ead9b8', '#e7c9a8', '#eed6a0']), { a: 0.55 }); g.rect(x, -h, w, h + 10, { w: 0.8, dbl: false }); const rf = [[x - 2, -h], [x + w + 2, -h], [x + w / 2, -h - 8]]; g.paint(rf, C.terracotta, { a: 0.6 }); g.line(rf, { closed: true, w: 0.8, dbl: false, step: 99 }); }
    g.paintRect(-6, -62, 12, 66, '#ead9b8', { a: 0.55 }); g.rect(-6, -62, 12, 62, { w: 0.9, dbl: false }); const sp = [[-7, -62], [7, -62], [0, -80]]; g.paint(sp, C.terracotta, { a: 0.6 }); g.line(sp, { closed: true, w: 0.9, dbl: false, step: 99 });
    for (const x of [-84, 78]) { const pts = A.arcPts(x, -18, 5, 20, 0, TAU, 8); g.paint(pts, C.pine, { a: 0.6, step: 99 }); g.line(pts, { closed: true, w: 0.8, dbl: false, step: 99 }); }
  } });
  def('miniCypress', { w: 130, h: 66, b: 16, v: 3, far: true, draw(g, r) {
    for (let i = 0; i < r.int(3, 6); i++) { const x = -52 + i * 20 + r.range(-5, 5), h = r.range(26, 48), pts = A.arcPts(x, -h * 0.5, 4.5, h * 0.5, 0, TAU, 8); g.paint(pts, C.pine, { a: 0.6, step: 99 }); g.line(pts, { closed: true, w: 0.8, dbl: false, step: 99 }); }
  } });
  def('miniTrees', { w: 150, h: 60, b: 16, v: 3, far: true, draw(g, r) {
    for (let i = 0; i < r.int(3, 5); i++) { const x = -56 + i * 26 + r.range(-6, 6), rr = r.range(10, 17); g.seg(x, 6, x, -10, { w: 0.9 }); crown(g, r, x, -12 - rr * 0.6, rr, rr * 0.8, r.pick([C.sage, C.leaf]), { scr: 0, a: 0.5, bumps: 8 }); }
  } });
  def('miniMill', { w: 60, h: 80, b: 16, v: 1, far: true, hub: [0, -50], hubR: 22, draw(g, r) {
    const b = [[-9, 6], [9, 6], [6, -46], [-6, -46]]; g.paint(b, C.cream, { a: 0.5 }); g.poly(b, { w: 0.9 }); const cap = A.arcPts(0, -46, 7, 9, Math.PI, TAU, 6); g.paint(cap, C.brick, { a: 0.7 }); g.line(cap, { w: 0.9, step: 99 });
  } });
  def('sailboat', { w: 100, h: 110, b: 14, v: 4, far: true, draw(g, r, v) {
    const hull = [[-32, -10], [34, -12], [24, 2], [-24, 2]]; g.paint(hull, [C.red, C.prussian, C.umber, C.teal][v % 4], { a: 0.75 }); g.poly(hull, { w: 1.2 });
    g.seg(0, -10, 0, -96, { w: 1.2 });
    const s1 = [[3, -92], [3, -16], [40, -18]], s2 = [[-3, -84], [-3, -16], [-30, -17]];
    g.paint(s1, v % 2 ? C.ochre : C.cream, { a: v % 2 ? 0.75 : 0.35 }); g.line(s1, { closed: true, w: 1.1, step: 99 }); g.paint(s2, C.cream, { a: 0.35 }); g.line(s2, { closed: true, w: 1.1, step: 99 });
    g.wash([[0, -96], [12, -93], [0, -89]], C.red, { a: 0.9, mottle: false });
  } });
  def('steamer', { w: 210, h: 100, b: 14, v: 1, far: true, draw(g, r) {
    const hull = [[-92, -18], [96, -22], [78, 2], [-80, 2]]; g.paint(hull, C.ink, { a: 0.7 }); g.poly(hull, { w: 1.3 }); g.wash([[-90, -18], [94, -22], [92, -16], [-88, -12]], C.red, { a: 0.8, mottle: false });
    const cab = A.rectPts(-50, -36, 96, 17); g.paint(cab, C.cream, { a: 0.4 }); g.poly(cab, { w: 1.1 }); for (let x = -42; x < 42; x += 12) g.ell(x, -27, 2.5, 2.5, { w: 0.8, dbl: false });
    for (const x of [-18, 14]) { const f = [[x - 7, -36], [x + 7, -36], [x + 6, -66], [x - 6, -66]]; g.paint(f, C.ochre, { a: 0.8 }); g.poly(f, { w: 1.1 }); g.wash([[x - 6, -66], [x + 6, -66], [x + 6, -58], [x - 6, -58]], C.ink, { a: 0.8, mottle: false }); for (let i = 0; i < 3; i++) g.scribble(x - 12 - i * 16, -76 - i * 5, 9 + i * 3, 6 + i * 2, 7, { a: 0.4 }); }
    g.seg(70, -22, 70, -62, { w: 1 }); g.seg(-76, -18, -76, -56, { w: 1 }); g.line([[-76, -56], [-18, -66], [14, -66], [70, -62]], { w: 0.6, a: 0.6, dbl: false });
  } });

  // ───────────────────────── foreground accents ─────────────────────────
  def('fgGrass', { w: 150, h: 70, b: 10, v: 3, draw(g, r) {
    g.inkCol = C.umber;
    for (let i = 0; i < 26; i++) { const x = r.range(-64, 64), h = r.range(20, 58) * (1 - Math.abs(x) / 90), lean = r.range(-14, 14); g.line(A.quadPts([x, 6], [x + lean * 0.3, -h * 0.6], [x + lean, -h], 4), { w: r.range(1.2, 2.2), c: r.pick([C.olive, C.leaf, C.pine]), dbl: false }); }
    for (let i = 0; i < 4; i++) { const x = r.range(-50, 50), y = r.range(-52, -30); g.seg(x, 4, x, y, { w: 1, c: C.olive }); g.paintEll(x, y, 5, 4.5, C.red, { a: 0.95, mottle: false }); g.ell(x, y, 5, 4.5, { w: 0.9 }); g.dot(x, y, 1.2); }
  } });
  def('fgDaisies', { w: 130, h: 64, b: 10, v: 2, draw(g, r) {
    for (let i = 0; i < 14; i++) { const x = r.range(-54, 54), h = r.range(14, 36); g.line([[x, 6], [x + r.range(-5, 5), -h]], { w: 1.4, c: C.olive, dbl: false }); }
    for (let i = 0; i < 7; i++) { const x = r.range(-50, 50), y = r.range(-46, -22); g.seg(x, 4, x, y, { w: 1, c: C.olive }); const pet = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; pet.push([x + Math.cos(a) * 2, y + Math.sin(a) * 2], [x + Math.cos(a + 0.4) * 7, y + Math.sin(a + 0.4) * 7]); } g.paint(pet, C.white, { a: 0.1, step: 99 }); g.line(pet, { closed: true, w: 0.9, step: 99, dbl: false }); g.paintEll(x, y, 2.2, 2.2, C.ochre, { a: 0.95, mottle: false }); }
  } });
  def('fgPost', { w: 50, h: 96, b: 10, v: 2, draw(g, r, v) {
    if (v) { g.paintRect(-5, -70, 10, 78, C.wood, { a: 0.65 }); g.rect(-5, -70, 10, 78, { w: 1.6 }); g.line([[-2, -60], [-1, -8]], { w: 0.8, a: 0.5, dbl: false }); g.paintEll(0, -78, 9, 7, C.ink, { a: 0.8 }); g.line([[7, -80], [14, -78], [8, -76]], { w: 1.2, c: C.ochre }); g.line([[-8, -76], [-16, -70]], { w: 1.4 }); }
    else { const b = [[-7, 6], [7, 6], [6, -34], [-6, -34]]; g.paint(b, C.pine, { a: 0.8 }); g.poly(b, { w: 1.6 }); g.paintEll(0, -39, 7, 6, C.pine, { a: 0.8 }); g.ell(0, -39, 7, 6, { w: 1.5 }); g.seg(-7, -24, 7, -24, { w: 1.2 }); }
  } });
  def('fgPlanter', { w: 110, h: 80, b: 10, v: 2, draw(g, r) {
    const b = [[-36, 6], [36, 6], [42, -22], [-42, -22]]; g.paint(b, C.terracotta, { a: 0.8 }); g.poly(b, { w: 1.6 }); g.seg(-40, -14, 40, -14, { w: 1 });
    for (let i = 0; i < 8; i++) g.scribble(r.range(-34, 34), -32 + r.range(-6, 4), 12, 10, 8, { c: r.pick([C.leaf, C.pine]), a: 0.9, w: 1.5 });
    for (let i = 0; i < 12; i++) g.paintEll(r.range(-38, 38), r.range(-50, -26), 3.6, 3.6, r.pick([C.red, C.rose, C.white, C.ochre]), { a: 0.95, mottle: false });
  } });
  def('fgLamp', { w: 70, h: 360, b: 10, v: 1, draw(g, r) {
    const base = [[-9, 6], [9, 6], [6, -30], [-6, -30]]; g.paint(base, C.pine, { a: 0.85 }); g.poly(base, { w: 1.7 });
    g.wash([[-3, -30], [3, -30], [2.2, -292], [-2.2, -292]], C.pine, { a: 0.85, spread: 0.4 }); g.line([[-3, -30], [-2.2, -292]], { w: 1.4 }); g.line([[3, -30], [2.2, -292]], { w: 1.4 });
    for (const y of [-44, -200, -286]) g.seg(-6, y, 6, y, { w: 1.6 });
    for (const k of [-1, 1]) { g.line(A.quadPts([0, -262], [k * 24, -276], [k * 22, -250], 6), { w: 1.3 }); g.curl(k * 22, -254, 5, k, { w: 1, dbl: false }); }
    const lan = [[-10, -294], [10, -294], [14, -326], [-14, -326]]; g.paint(lan, C.straw, { a: 0.85 }); g.poly(lan, { w: 1.5 }); g.seg(0, -294, 0, -326, { w: 0.8, over: 0 });
    const cap = [[-17, -326], [17, -326], [0, -344]]; g.paint(cap, C.pine, { a: 0.85 }); g.poly(cap, { w: 1.5 }); g.seg(0, -344, 0, -352, { w: 1.4 });
  } });
  def('fgBeach', { w: 150, h: 70, b: 10, v: 3, draw(g, r, v) {
    for (let i = 0; i < 16; i++) { const x = r.range(-60, 20), h = r.range(18, 52), lean = r.range(4, 22); g.line(A.quadPts([x, 6], [x + lean * 0.2, -h * 0.6], [x + lean, -h], 4), { w: r.range(1.1, 1.8), c: r.pick(['#b9b072', C.olive, C.sage]), dbl: false }); }
    if (v === 0) { const st = []; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - Math.PI / 2, rr = k % 2 ? 6 : 15; st.push([44 + Math.cos(a) * rr, -8 + Math.sin(a) * rr * 0.7]); } g.paint(st, C.terracotta, { a: 0.85, step: 99 }); g.line(st, { closed: true, w: 1.3, step: 99 }); }
    else if (v === 1) { const sh = A.arcPts(42, 0, 15, 14, Math.PI, TAU, 8); g.paint(sh, C.pink, { a: 0.8 }); g.line(sh, { w: 1.3, step: 99 }); for (let k = 1; k < 6; k++) g.seg(42, 0, 42 + Math.cos(Math.PI + k / 6 * Math.PI) * 14, Math.sin(Math.PI + k / 6 * Math.PI) * 13, { w: 0.8, over: 0, dbl: false }); g.seg(26, 0, 58, 0, { w: 1.3 }); }
  } });

  // ───────────────────────── choosing what stands where ─────────────────────────
  // Weighted tables per zone and layer. [name, weight, gapAfter (min,max)]
  A.TABLES = {
    back: {
      c: [['oak', 5, 150, 330], ['poplar', 6, 80, 240], ['pine', 3, 160, 300], ['cypress', 3, 60, 160], ['haystack', 4, 120, 260], ['farm', 2.2, 260, 420], ['windmill', 1.1, 260, 420], ['fence', 3, 190, 280], ['vines', 3, 235, 300], ['sunflowers', 3, 140, 240], ['cow', 2.4, 150, 300], ['scarecrow', 1, 160, 300], ['signpost', 1, 160, 300], ['well', 0.8, 160, 300], ['olive', 2, 140, 260]],
      t: [['houseFr', 11, 150, 196], ['cafe', 3.2, 262, 290], ['lamp', 2.2, 70, 110], ['kiosk', 1.4, 90, 130], ['fountain', 0.9, 190, 240], ['flowercart', 1.5, 160, 200], ['gelato', 1.1, 150, 190], ['bench', 1.5, 120, 160], ['plane', 2.6, 100, 150]],
      r: [['houseIt', 6, 150, 200], ['cafe', 1.6, 262, 300], ['palm', 5, 110, 240], ['pine', 2, 180, 300], ['balustrade', 4, 218, 222], ['gelato', 1.4, 150, 220], ['lamp', 1.2, 90, 160], ['bench', 1, 130, 200], ['olive', 1, 140, 220]],
    },
    near: {
      c: [['treeline', 5, 300, 620], ['farAway', 2.5, 300, 700]],
      t: [['skyline', 7, 380, 440], ['church', 1.6, 200, 360]],
      r: [['beachset', 6, 170, 320], ['cabana', 3.5, 90, 200], ['rowboat', 2, 190, 320], ['strongman', 0.8, 120, 240], ['hillVillage', 1.3, 300, 520], ['lighthouse', 0.5, 300, 600]],
    },
    mid: {
      c: [['miniTown', 2, 260, 620], ['miniCypress', 4, 160, 460], ['miniTrees', 5, 160, 420], ['miniMill', 1.2, 200, 460]],
      t: [['miniTown', 4, 240, 520], ['miniTrees', 4, 180, 420], ['miniCypress', 2, 180, 420]],
      r: [['miniCypress', 1, 400, 800]],
    },
    front: {
      c: [['fgGrass', 6, 260, 760], ['fgDaisies', 4, 260, 760], ['fgPost', 1.2, 400, 900]],
      t: [['fgPlanter', 3, 520, 1200], ['fgPost', 2, 420, 900], ['fgLamp', 1.6, 700, 1500]],
      r: [['fgBeach', 6, 300, 800], ['fgPlanter', 1, 500, 900]],
    },
  };
})();
