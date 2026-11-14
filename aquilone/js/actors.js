'use strict';
// Everything that moves besides the rider: notes to gather, weather and birds to dodge,
// things on the road to hop, a balloon, the café band, strollers, and ink-and-paint particles.
(() => {
  const A = window.A, C = A.C, TAU = A.TAU;
  const NS = 1.25, OS = 1.2;   // people and road creatures are drawn larger than their base size
  const NOTE_COLS = [C.red, C.ochre, C.cerulean, C.leaf, C.lavender, C.rose, C.teal];

  const Ac = A.actors = {
    reset(x0, playing) {
      this.sky = []; this.road = []; this.npcs = []; this.parts = [];
      this.playing = playing; this.nextNote = x0 + 1500; this.nextHaz = x0 + 3200; this.nextOb = x0 + 2600; this.nextBalloon = x0 + 5200; this.nextFlock = x0 + 600;
      this.r = A.rng(Date.now() & 0xffff | 1); this.id = 0; this.flocks = [];
    },
    // scenery spawner hook: add living company near certain props
    onScenery(it, zk, gap, r) {
      if (!this.npcs) return;
      const x = it.lx + gap * 0.5 + 20, add = o => { this.npcs.push({ id: ++this.id, ph: r() * 9, x, ...o }); this.lastNpc = x + (o.wide || 0); };
      if (it.name === 'cafe' && r.chance(0.7)) { add({ k: 'band', x: x + 20 }); return; }
      if (x - (this.lastNpc ?? -1e9) < 170 || !r.chance(zk === 'c' ? 0.2 : 0.46)) return;
      // who might be out on the road in each tableau: [kind, weight]
      const tab = { c: [['haycart', 2.2], ['painter', 1.3], ['gent', 1.6], ['couple', 0.9], ['hoop', 0.7]],
        t: [['walker', 2.4], ['gent', 3], ['couple', 3], ['mime', 1], ['painter', 0.8], ['pram', 1.3], ['hoop', 1.1], ['balloons', 1], ['penny', 0.9], ['pigeons', 1.4], ['coupe', 1.5]],
        r: [['walker', 2.6], ['gent', 2.6], ['couple', 3], ['mime', 0.5], ['painter', 1.1], ['pram', 1.1], ['hoop', 1], ['balloons', 1.1], ['penny', 0.8], ['coupe', 1.2]] }[zk];
      let tot = 0; for (const e of tab) tot += e[1];
      let pick = r() * tot, k = tab[0][0]; for (const e of tab) { pick -= e[1]; if (pick <= 0) { k = e[0]; break; } }
      const dress = () => r.pick([C.rose, C.lavender, C.sage, C.ochre, C.sky, C.pink, C.teal, C.mauve]), suit = () => r.pick([C.prussian, C.umber, C.slate, C.pine, '#6e2f2a', C.inkSoft]);
      const dir = r.chance(0.42) ? 1 : -1, hatG = () => r.pick(['top', 'bowler', 'boater', 'boater', 'cap']);
      if (k === 'walker') add({ k, dir, v: dir * r.range(18, 30), col: dress(), par: r.pick([C.red, C.cream, C.cerulean, C.ochre]) });
      else if (k === 'gent') add({ k, dir, v: dir * r.range(24, 38), col: suit(), hat: hatG(), cane: r.chance(0.6), beard: r.chance(0.25) });
      else if (k === 'couple') add({ k, dir, v: dir * r.range(16, 24), col: dress(), col2: suit(), hat: hatG(), par: r.chance(0.6) ? r.pick([C.red, C.cream, C.cerulean, C.ochre]) : null });
      else if (k === 'pram') add({ k, dir, v: dir * r.range(16, 22), col: r.pick([C.slate, C.prussian, C.umber]) });
      else if (k === 'hoop') add({ k, dir: -1, v: -r.range(50, 75), col: r.pick([C.prussian, C.red, C.pine]) });
      else if (k === 'balloons') add({ k, dir, v: dir * r.range(8, 14), col: suit() });
      else if (k === 'coupe') { const d2 = r.chance(0.6) ? 1 : -1; add({ k, dir: d2, v: d2 * r.range(55, 80), wide: 230, col: r.pick(['#6e2f2a', C.prussian, C.pine, C.umber]), horse: r.pick([C.wood, C.umber, '#d8d2c6', '#8a8580']), lady: r.chance(0.5) }); }
      else if (k === 'haycart') add({ k, dir: 1, v: r.range(30, 45), wide: 200 });
      else if (k === 'penny') add({ k, v: -r.range(60, 90) });
      else if (k === 'pigeons') add({ k, n: r.int(3, 5), up: 0 });
      else add({ k, dir: r.sign(), col: suit() });      // mime, painter: they stay put
    },

    spawn(G) {
      const r = this.r, cam = A.W.camX, edge = cam + A.W.W + 140, diff = G.diff;
      // strings of notes that invite the kite to swoop
      while (this.nextNote < edge) {
        const x0 = this.nextNote, kind = r.pick(['arc', 'arc', 'wave', 'ramp', 'dip']), n = r.int(5, 8), yc = r.range(190, 360), amp = r.range(50, 120) * r.sign(), col = r.pick(NOTE_COLS);
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), x = x0 + i * 64;
          let y = kind === 'arc' ? yc - Math.sin(u * Math.PI) * amp : kind === 'wave' ? yc + Math.sin(u * TAU) * Math.abs(amp) * 0.7 : kind === 'ramp' ? yc + (u - 0.5) * amp * 1.6 : yc + Math.sin(u * Math.PI) * Math.abs(amp);
          y = A.clamp(y, 86, A.ground(x) - 120);
          this.sky.push({ k: 'note', x, y, col, v: (i + this.id) % 3, id: ++this.id, ph: i * 0.6 });
        }
        this.nextNote += n * 64 + r.range(260, 640) * (1.15 - diff * 0.35);
      }
      // weather and birds
      while (this.nextHaz < edge) {
        const x = this.nextHaz, z = A.zone(x);
        if (r.chance(0.5)) this.sky.push({ k: 'storm', x: x + 60, y: r.range(110, 330), id: ++this.id, vx: -r.range(10, 30), ph: r() * 9, r: 44 });
        else { const y = r.range(120, 380), gull = z.r > 0.5; this.sky.push({ k: 'bird', gull, x: x + 60, y, y0: y, id: ++this.id, vx: -r.range(110, 190) - diff * 60, ph: r() * 9, r: 20, cawed: false }); }
        this.nextHaz += r.range(760, 1450) * (1.2 - diff * 0.55);
      }
      // things in the road
      while (this.nextOb < edge) {
        const x = this.nextOb, z = A.zone(x), zk = z.c > 0.5 ? 'c' : z.t > 0.5 ? 't' : z.r > 0.5 ? 'r' : null;
        if (zk) {
          const k = r.pick({ c: ['geese', 'geese', 'sheep'], t: ['cat', 'crate', 'crate'], r: ['crab', 'castle', 'ball'] }[zk]);
          const o = { k, x: x + 80, id: ++this.id, ph: r() * 9, hit: false, n: k === 'geese' ? r.int(1, 3) : 1, vx: k === 'geese' ? -22 : k === 'ball' ? -70 : 0 };
          o.hw = { geese: 12 + o.n * 9, sheep: 26, cat: 20, crate: 22, crab: 18, castle: 24, ball: 15 }[k]; o.h = { geese: 34, sheep: 38, cat: 20, crate: 34, crab: 16, castle: 34, ball: 30 }[k];
          o.hw *= OS; o.h *= OS;
          this.road.push(o);
          // a reward floating over it for a well-timed hop
          for (let i = 0; i < 3; i++) this.sky.push({ k: 'note', x: o.x - 46 + i * 46, y: A.ground(o.x) - 116 - (i === 1 ? 30 : 0), low: true, col: C.ochre, v: i, id: ++this.id, ph: i });
        }
        this.nextOb += r.range(880, 1650) * (1.2 - diff * 0.5);
      }
      while (this.nextBalloon < edge) {
        this.sky.push({ k: 'balloon', x: this.nextBalloon + 120, y: r.range(150, 230), id: ++this.id, vx: 34, ph: r() * 9, taken: false, col: r.pick([C.red, C.cerulean, C.ochre, C.teal]) });
        this.nextBalloon += r.range(5200, 7600);
      }
    },

    update(dt, G) {
      const P = A.P, cam = A.W.camX, t = A.W.t, W = A.W.W;
      if (this.playing) this.spawn(G);
      // swallows crossing now and then (pure decoration)
      if (cam > this.nextFlock) { this.nextFlock = cam + this.r.range(1400, 3200); const y = this.r.range(90, 300), n = this.r.int(3, 7); for (let i = 0; i < n; i++) this.flocks.push({ x: cam + W + 60 + i * this.r.range(18, 40), y: y + this.r.range(-40, 40), v: -this.r.range(170, 240), ph: this.r() * 9 }); }
      // gusts of wind, drawn the way old illustrators drew them
      if (Math.random() < dt * 0.55) this.parts.push({ k: 'gust', x: cam + W + 80, y: 70 + Math.random() * 330, vx: -230 - Math.random() * 160, life: 0, max: 4, len: 50 + Math.random() * 90, seed: (Math.random() * 1e5) | 0, dir: Math.random() < 0.5 ? 1 : -1 });
      for (const f of this.flocks) { f.x += f.v * dt; f.y += Math.sin(t * 2 + f.ph) * 22 * dt; }
      this.flocks = this.flocks.filter(f => f.x > cam - 80);

      const kx = cam + P.kite.x, ky = P.kite.y, bx = P.x, by = P.y - 68, live = this.playing && !P.kite.gone;
      for (const o of this.sky) {
        if (o.vx) o.x += o.vx * dt;
        if (o.k === 'note') {
          if (o.got) continue;
          // gently drawn toward the kite when close
          const dk = Math.hypot(o.x - kx, o.y - ky), db = Math.hypot(o.x - bx, o.y - by);
          if (live && dk < 78) { o.x += (kx - o.x) * dt * 7; o.y += (ky - o.y) * dt * 7; }
          if (live && (dk < 34 || db < 50)) { o.got = true; G.onNote(o); }
        } else if (o.k === 'storm') {
          if (live && P.inv <= 0 && Math.abs(o.x - kx) < 62 && Math.abs(o.y + 4 - ky) < 44) G.onKiteHit('storm', o);
        } else if (o.k === 'bird') {
          o.y = o.y0 + Math.sin(t * 2.2 + o.ph) * 34;
          if (!o.cawed && o.x - cam < W + 20) { o.cawed = true; if (this.playing) G.sfx(o.gull ? 'gull' : 'crow', 0.4); }
          if (live && P.inv <= 0 && Math.hypot(o.x - kx, o.y - ky) < 40) G.onKiteHit('bird', o);
        } else if (o.k === 'balloon') {
          o.y += Math.sin(t * 0.7 + o.ph) * 5 * dt;
          if (live && !o.taken && Math.hypot(o.x - kx, o.y + 150 - ky) < 42) { o.taken = true; G.onRibbon(o); }
        }
      }
      this.sky = this.sky.filter(o => !o.got && o.x > cam - 260);
      for (const o of this.road) {
        if (o.vx && !o.hit) o.x += o.vx * dt;
        if (o.k === 'crab') o.x += Math.cos(t * 3 + o.ph) * 34 * dt;
        if (o.hit) { o.fly = (o.fly || 0) + dt; continue; }
        if (live && P.inv <= 0 && Math.abs(o.x - bx) < o.hw + 18 && A.ground(o.x) - P.y < o.h - 8) { o.hit = true; G.onBikeHit(o); }
        else if (live && !o.passed && o.x < bx - o.hw - 24) { o.passed = true; G.onCleared(o); }
      }
      this.road = this.road.filter(o => o.x > cam - 200 && !(o.fly > 2));
      for (const n of this.npcs) {
        if (n.v) n.x += n.v * dt;
        if (n.k === 'pigeons' && !n.up && n.x - bx < 150) n.up = 0.001;
        if (n.up) n.up += dt;
        if (n.k === 'band' && Math.random() < dt * 2.2 && n.x - cam < W + 50) this.parts.push({ k: 'mini', x: n.x + (Math.random() - 0.5) * 70, y: A.ground(n.x) - 114, vx: 8 + Math.random() * 14, vy: -28 - Math.random() * 20, life: 0, max: 2.6, col: NOTE_COLS[(Math.random() * 7) | 0], ph: Math.random() * 9 });
      }
      this.npcs = this.npcs.filter(n => n.x > cam - 420);
      for (const p of this.parts) { p.life += dt; p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; if (p.g) p.vy += p.g * dt; if (p.drag) { p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt); } }
      this.parts = this.parts.filter(p => p.life < p.max);
    },

    // ───── particles ─────
    bloom(x, y, col, big) {
      this.parts.push({ k: 'bloom', x, y, life: 0, max: big ? 1.6 : 1.1, col, r: big ? 60 : 34, seed: (Math.random() * 1e5) | 0 });
      const n = big ? 12 : 6; for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 140; this.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * s + 120, vy: Math.sin(a) * s, drag: 0.03, life: 0, max: 0.5 + Math.random() * 0.3, a }); }
    },
    puff(x, y, n = 3, col) { for (let i = 0; i < n; i++) this.parts.push({ k: 'dust', x: x + (Math.random() - 0.5) * 10, y, vx: -40 - Math.random() * 50, vy: -20 - Math.random() * 40, drag: 0.2, life: 0, max: 0.55 + Math.random() * 0.3, r: 4 + Math.random() * 5, dir: Math.random() < 0.5 ? 1 : -1, col }); },
    scatter(x, y, col, n = 8, k = 'blob') { for (let i = 0; i < n; i++) { const a = -Math.random() * Math.PI, s = 120 + Math.random() * 220; this.parts.push({ k, x, y, vx: Math.cos(a) * s + 160, vy: Math.sin(a) * s, g: 900, life: 0, max: 1.2, col, r: 3 + Math.random() * 3, rot: Math.random() * 6 }); } },
    say(x, y, text, o = {}) { this.parts.push({ k: 'text', x, y, vx: o.vx ?? 40, vy: -34, life: 0, max: o.max || 1.3, text, size: o.size || 22, col: o.col || C.ink, font: o.font }); },
    loseBow(x, y, col) { this.parts.push({ k: 'bow', x, y, vx: -60, vy: -40, g: 160, life: 0, max: 2.4, col, rot: 0 }); },

    drawParts(g) {
      const c = g.c, cam = A.W.camX, b = A.W.boil;
      for (const p of this.parts) {
        const u = p.life / p.max, x = p.x - cam, y = p.y;
        g.seed(b * 5 + (p.seed || 3), p.seed || 3);
        if (p.k === 'bloom') {
          // a wet drop of paint spreading into the paper, then drying to a ring
          const r = p.r * (0.35 + 0.65 * A.smooth(u * 2.2)), a = (1 - u) * 0.38;
          g.wash(g.scallop(x, y, r, r * 0.92, 9, { depth: 0.14 }), p.col, { a, step: 99, spread: 2, mottle: false, edge: false });
          c.globalAlpha = (1 - u) * 0.4; c.strokeStyle = p.col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r * 1.02, 0, TAU); c.stroke(); c.globalAlpha = 1;
        } else if (p.k === 'spark') {
          const l = 9 * (1 - u); g.seg(x, y, x + Math.cos(p.a) * l, y + Math.sin(p.a) * l, { w: 1.3, a: 1 - u, dbl: false, over: 0 });
        } else if (p.k === 'dust') {
          g.curl(x, y, p.r * (0.6 + u), p.dir, { w: 1, a: (1 - u) * 0.6, dbl: false, turns: 1.1, c: p.col });
        } else if (p.k === 'blob') {
          g.wash(A.arcPts(x, y, p.r, p.r, 0, TAU, 6), p.col, { a: 0.95 * (1 - u * u), spread: 0.4, mottle: false, step: 99 }); g.ell(x, y, p.r, p.r, { w: 0.8, a: 1 - u, dbl: false });
        } else if (p.k === 'feather') {
          const a = p.rot + p.life * 5; g.line([[x - Math.cos(a) * 7, y - Math.sin(a) * 7], [x + Math.cos(a) * 7, y + Math.sin(a) * 7]], { w: 2.2, c: p.col, a: 1 - u, dbl: false }); g.line([[x - Math.cos(a) * 7, y - Math.sin(a) * 7], [x + Math.cos(a) * 7, y + Math.sin(a) * 7]], { w: 0.7, a: 1 - u, dbl: false });
        } else if (p.k === 'bow') {
          A.P.bow(g, x + Math.sin(p.life * 5) * 16, y, p.life * 4, p.col, 1.1 - u * 0.3);
        } else if (p.k === 'mini') {
          c.globalAlpha = Math.min(1, u * 6) * (1 - u); A.drawNote(g, x + Math.sin(p.life * 3 + p.ph) * 6, y, 0.5, p.col, 0, false); c.globalAlpha = 1;
        } else if (p.k === 'gust') {
          const a = Math.min(1, u * 8, (1 - u) * 4) * 0.42, wv = Math.sin(p.life * 5 + p.seed) * 4;
          g.line(A.bezPts([x + p.len, y + wv], [x + p.len * 0.6, y - 7 - wv], [x + p.len * 0.3, y + 7], [x, y], 10), { w: 1.1, a, step: 99, dbl: false, c: C.inkSoft });
          g.curl(x + 1, y - p.dir * 7, 7, -p.dir, { w: 1.1, a, turns: 1.25, a0: p.dir * Math.PI / 2, dbl: false, c: C.inkSoft });
          if (p.len > 90) g.line([[x + p.len * 0.5, y + 12], [x + 16, y + 13 + wv * 0.5]], { w: 0.9, a: a * 0.8, dbl: false, c: C.inkSoft });
        } else if (p.k === 'drop') {
          g.seg(x, y, x - 2, y + 7, { w: 1.2, c: C.cerulean, a: 1 - u, dbl: false, over: 0 });
        } else if (p.k === 'text') {
          g.text(p.text, x, y, { size: p.size * (0.8 + 0.2 * A.smooth(u * 5)), font: p.font || A.FONT.script, a: Math.min(1, (1 - u) * 2.5), c: p.col });
        }
      }
    },

    drawSky(g) {
      const cam = A.W.camX, b = A.W.boil, t = A.W.t, W = A.W.W;
      g.seed(b * 3 + 8, 8);
      for (const f of this.flocks) { const x = f.x - cam, fl = Math.sin(t * 13 + f.ph) * 5; g.line([[x - 7, f.y - fl], [x - 2, f.y], [x + 1, f.y + 0.5], [x + 7, f.y - fl * 0.8 - 1]], { w: 1.3, step: 99, dbl: false, wob: 0.4 }); }
      for (const o of this.sky) {
        const x = o.x - cam; if (x < -200 || x > W + 220) continue;
        g.seed(b * 29 + o.id * 7, o.id);
        if (o.k === 'note') A.drawNote(g, x, o.y + Math.sin(t * 3 + o.ph) * 4, 1, o.col, o.v, true, Math.sin(t * 2 + o.ph) * 0.12);
        else if (o.k === 'storm') A.drawStorm(g, x, o.y, t + o.ph);
        else if (o.k === 'bird') A.drawBird(g, x, o.y, t * 1 + o.ph, o.gull);
        else if (o.k === 'balloon') A.drawBalloon(g, x, o.y, t + o.ph, o);
      }
    },
    drawRoad(g) {
      const cam = A.W.camX, b = A.W.boil, t = A.W.t, W = A.W.W;
      for (const n of this.npcs) {
        const x = n.x - cam; if (x < -380 || x > W + 380) continue;
        const y = A.ground(n.x) - 15, c = g.c; g.seed(b * 23 + n.id * 5, n.id);
        // figures are drawn facing right at the origin; those heading left are mirrored
        c.save(); c.translate(x, y); c.scale(NS * (n.dir < 0 ? -1 : 1), NS);
        (NPC[n.k] || NPC.walker)(g, n, t + n.ph, Math.abs(n.x - A.P.x) < 190);
        c.restore();
      }
      for (const o of this.road) {
        const x = o.x - cam; if (x < -140 || x > W + 140) continue;
        let y = A.ground(o.x); g.seed(b * 19 + o.id * 3, o.id);
        const c = g.c; c.save();
        if (o.hit) { c.translate(x + o.fly * 160, y - Math.sin(Math.min(1, o.fly * 1.2) * Math.PI) * 70); c.rotate(o.fly * 5); c.globalAlpha = Math.max(0, 1 - o.fly * 0.7); } else c.translate(x, y);
        c.scale(OS, OS); A.drawObstacle(g, o, t + o.ph);
        c.restore(); c.globalAlpha = 1;
      }
    },
  };

  // ───── drawings ─────
  A.drawNote = (g, x, y, s, col, v, halo, rot = 0) => {
    const c = g.c; c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    if (halo) g.wash(g.scallop(0, 0, 17, 16, 8, { depth: 0.16 }), col, { a: 0.55, step: 99, spread: 1.6, edge: true });
    const head = (hx, hy) => { c.save(); c.translate(hx, hy); c.rotate(-0.4); g.wash(A.arcPts(0, 0, 6.2, 4.4, 0, TAU, 8), C.ink, { a: 0.92, spread: 0.3, step: 99, mottle: false, ox: 0, oy: 0 }); c.restore(); };
    if (v === 1) { head(-7, 9); head(7, 6); g.seg(-1.6, 8, -1.6, -11, { w: 1.5, over: 0 }); g.seg(12.4, 5, 12.4, -14, { w: 1.5, over: 0 }); g.line([[-1.6, -11], [12.4, -14]], { w: 3.4, dbl: false, wob: 0.3 }); }
    else { head(-2, 9); g.seg(3.4, 8, 3.4, -13, { w: 1.5, over: 0 }); if (v === 0) g.line(A.quadPts([3.4, -13], [12, -9], [10, 0], 5), { w: 2, wob: 0.3 }); }
    c.restore();
  };
  A.drawStorm = (g, x, y, t) => {
    const c = g.c, bob = Math.sin(t * 1.4) * 3; c.save(); c.translate(x, y + bob);
    const flash = (t % 3.1) < 0.16;
    // rain
    for (let i = 0; i < 9; i++) { const rx = -44 + i * 11, f = ((t * 1.6 + i * 0.37) % 1), ry = 24 + f * 46; g.seg(rx - f * 8, ry, rx - f * 8 - 2.5, ry + 9, { w: 1.2, c: C.cerulean, a: (1 - f) * 0.9, dbl: false, over: 0 }); }
    if (flash || (t % 3.1) < 0.3) { const z = [[6, 22], [-4, 44], [5, 44], [-6, 70]]; g.line(z, { w: 3, c: C.ochre, step: 99, dbl: false, wob: 0.4 }); g.line(z, { w: 1, step: 99, wob: 0.4 }); }
    const pts = g.scallop(0, 0, 54, 26, 9, { depth: 0.3 });
    g.paint(pts, flash ? C.straw : '#7f7a9c', { a: 0.82, step: 99, spread: 2 });
    g.wash(A.arcPts(4, 9, 42, 14, 0, TAU, 10), C.prussian, { a: 0.3, step: 99, edge: false });
    g.line(pts, { closed: true, w: 1.9, step: 99, wob: 1.3 });
    // a thoroughly cross little face
    g.seg(-20, -9, -8, -4, { w: 2, over: 0 }); g.seg(20, -9, 8, -4, { w: 2, over: 0 });
    g.dot(-13, 1, 2.2); g.dot(13, 1, 2.2); g.arc(0, 15, 9, 6, Math.PI * 1.15, Math.PI * 1.85, { w: 1.7 });
    g.washEll(-22, 8, 5, 3, C.red, { a: 0.3, edge: false, mottle: false }); g.washEll(22, 8, 5, 3, C.red, { a: 0.3, edge: false, mottle: false });
    c.restore();
  };
  A.drawBird = (g, x, y, t, gull) => {
    const c = g.c, fl = Math.sin(t * 11), body = gull ? '#ffffff' : C.ink; c.save(); c.translate(x, y); c.rotate(Math.cos(t * 2.2) * 0.12);
    const wing = (k, a) => { const w = [[2, -2], [8, -4 - fl * 20 * k], [22, -2 - fl * 12 * k], [12, 2]]; g.paint(w, gull ? C.slate : C.ink, { a: a, step: 99, spread: 0.8 }); g.line(w, { closed: true, w: 1.2, step: 99, wob: 0.6 }); };
    wing(0.8, gull ? 0.5 : 0.6);
    const bd = [[-18, -2], [-10, -8], [8, -6], [26, 0], [10, 6], [-10, 6]];
    g.paint(bd, body, { a: gull ? 0.9 : 0.88, step: 99, mottle: !gull }); g.line(bd, { closed: true, w: 1.5, step: 99, wob: 0.7 });
    g.paintEll(-17, -4, 7, 6.5, body, { a: 0.9, mottle: false }); g.ell(-17, -4, 7, 6.5, { w: 1.3 });
    g.wash([[-23, -5], [-34, -1], [-23, 0]], C.ochre, { a: 0.95, mottle: false, spread: 0.4 }); g.line([[-23, -5], [-34, -1], [-23, 0]], { w: 1, step: 99 });
    g.paintEll(-19, -5.5, 2.4, 2.4, '#ffffff', { a: 1, mottle: false, edge: false }); g.dot(-19.4, -5.5, 1.1);
    if (!gull) { g.paint([[-21, -22], [-12, -20], [-13, -10], [-20, -11]], C.ink, { a: 0.9, mottle: false }); g.line([[-25, -11], [-9, -8]], { w: 2, dbl: false }); g.wash([[-20.5, -14], [-12.5, -12.5], [-12.8, -10], [-20, -11]], C.red, { a: 0.95, mottle: false, spread: 0.2, edge: false }); }
    wing(1, gull ? 0.6 : 0.9);
    c.restore();
  };
  A.drawBalloon = (g, x, y, t, o) => {
    const c = g.c; c.save(); c.translate(x, y); c.rotate(Math.sin(t * 0.8) * 0.03);
    const RX = 56, RY = 64, n = 7;
    const env = (u) => { const a = Math.PI * (0.5 + u), k = Math.sin(a) < 0 ? 1 : 1; return [Math.cos(a) * RX, Math.sin(a) * RY]; };
    const outline = []; for (let i = 0; i <= 28; i++) { const a = -Math.PI * 1.32 + i / 28 * Math.PI * 1.64; outline.push([Math.cos(a) * RX, Math.sin(a) * RY]); }
    outline.push([10, RY + 14], [-10, RY + 14]);
    g.paint(outline, C.cream, { a: 0.4, step: 99 });
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const u0 = -1 + i * 2 / n, u1 = -1 + (i + 1) * 2 / n, gore = [];
      for (let k = 0; k <= 10; k++) { const v = k / 10, yy = -RY + v * (RY * 2 + 10), w = Math.sqrt(Math.max(0, 1 - Math.pow((yy + 4) / (RY + 6), 2))) * RX * (yy > 20 ? 1 - (yy - 20) / 130 : 1); gore.push([u0 * w, yy]); }
      for (let k = 10; k >= 0; k--) { const v = k / 10, yy = -RY + v * (RY * 2 + 10), w = Math.sqrt(Math.max(0, 1 - Math.pow((yy + 4) / (RY + 6), 2))) * RX * (yy > 20 ? 1 - (yy - 20) / 130 : 1); gore.push([u1 * w, yy]); }
      g.wash(gore, o.col, { a: 0.85, step: 99, spread: 0.8, edge: false });
    }
    g.line(outline, { closed: true, w: 1.8, step: 99, wob: 1 });
    for (const k of [-0.5, 0, 0.5]) g.line(A.quadPts([0, -RY], [k * RX * 1.7, 0], [k * 16, RY + 14], 8), { w: 0.8, a: 0.55, dbl: false });
    g.line(A.arcPts(0, 14, RX * 0.93, 10, 0.05, Math.PI - 0.05, 10), { w: 1, a: 0.7, step: 99 });
    // ropes, basket and a waving aeronaut
    for (const k of [-1, 1]) g.seg(k * 10, RY + 14, k * 12, RY + 38, { w: 0.9, over: 0 });
    A.person(g, 2, RY + 62, { kind: 'gent', s: 0.42, col: C.prussian, hat: 'top', armA: 2.4 + Math.sin(t * 6) * 0.4, bendA: 0.3 });
    const bk = [[-14, RY + 38], [14, RY + 38], [11, RY + 56], [-11, RY + 56]]; g.paint(bk, C.wood, { a: 0.8 }); g.poly(bk, { w: 1.4 }); g.hatch(-12, RY + 40, 24, 16, { gap: 4, a: 0.5, ang: 0.8 });
    for (const k of [-1, 1]) { g.paintEll(k * 15, RY + 50, 3.5, 5, C.sand, { a: 0.9, mottle: false }); g.ell(k * 15, RY + 50, 3.5, 5, { w: 0.9 }); }
    // the prize: a ribbon bow dangling on a string
    if (!o.taken) {
      const sw = Math.sin(t * 2) * 8; g.line(A.quadPts([0, RY + 56], [sw * 0.5, RY + 100], [sw, RY + 140], 6), { w: 0.9, step: 99 });
      const pulse = 1 + Math.sin(t * 5) * 0.12; g.wash(g.scallop(sw, RY + 150, 24 * pulse, 22 * pulse, 9, { depth: 0.2 }), C.rose, { a: 0.5, step: 99, mottle: false });
      A.P.bow(g, sw, RY + 150, Math.sin(t * 2) * 0.3, C.red, 1.7);
      for (const k of [-1, 1]) g.line(A.quadPts([sw, RY + 152], [sw + k * 6, RY + 162], [sw + k * 9 + Math.sin(t * 6 + k) * 2, RY + 172], 4), { w: 2.2, c: C.red, dbl: false });
    }
    c.restore();
  };

  const goose = (g, x, y, t, s) => {
    const c = g.c; c.save(); c.translate(x, y); c.scale(s, s); c.rotate(Math.sin(t * 9) * 0.07);
    const st = Math.sin(t * 9);
    g.line([[-2 - st * 4, -9], [-3 - st * 6, 0], [-8 - st * 6, 0]], { w: 1.7, c: C.terracotta, step: 99 }); g.line([[4 + st * 4, -9], [4 + st * 6, 0], [-1 + st * 6, 0]], { w: 1.7, c: C.terracotta, step: 99 });
    const bd = [[-16, -20], [-6, -27], [10, -24], [20, -30], [16, -14], [4, -8], [-10, -9]];
    g.paint(bd, '#ffffff', { a: 0.9, step: 99, mottle: false, edge: false }); g.line(bd, { closed: true, w: 1.5, step: 99, wob: 0.8 });
    g.line([[2, -20], [12, -18], [8, -13]], { w: 0.9, a: 0.6, dbl: false });
    const nk = A.quadPts([-11, -20], [-22, -30], [-17, -44], 6); g.line(nk, { w: 6.5, c: '#ffffff', dbl: false, wob: 0.2, a: 1 }); g.line(nk.map(p => [p[0] - 3, p[1]]), { w: 1.2, step: 99 }); g.line(nk.map(p => [p[0] + 3.4, p[1] + 1]), { w: 1.2, step: 99 });
    g.paintEll(-18, -47, 5.5, 5, '#ffffff', { a: 1, mottle: false, edge: false }); g.ell(-18, -47, 5.5, 5, { w: 1.3 });
    g.wash([[-23, -49], [-33, -46], [-23, -44]], C.ochre, { a: 1, mottle: false, spread: 0.3 }); g.line([[-23, -49], [-33, -46], [-23, -44]], { w: 1, step: 99 }); g.dot(-20, -48.5, 1.1);
    c.restore();
  };
  A.drawObstacle = (g, o, t) => {
    const k = o.k;
    if (k === 'geese') { for (let i = o.n - 1; i >= 0; i--) goose(g, i * 24 - (o.n - 1) * 10, 0, t + i * 0.5, i === 0 ? 1 : 0.6); }
    else if (k === 'sheep') {
      for (const lx of [-13, -6, 8, 14]) g.seg(lx, -12, lx, 0, { w: 2, over: 0 });
      const w = g.scallop(0, -24, 24, 16, 11, { depth: 0.3 }); g.paint(w, C.cream, { a: 0.35, step: 99 }); g.line(w, { closed: true, w: 1.5, step: 99, wob: 1 });
      g.scribble(0, -24, 16, 10, 12, { a: 0.4 });
      const ch = Math.sin(t * 7) * 1; g.paintEll(-24, -28, 8, 9.5, C.ink, { a: 0.85 }); g.ell(-24, -28, 8, 9.5, { w: 1.2 });
      g.line([[-18, -33], [-11, -36]], { w: 2.6, dbl: false }); g.line([[-30, -33], [-36, -35]], { w: 2.6, dbl: false });
      g.paintEll(-26.5, -30, 1.7, 1.7, '#fff', { a: 1, mottle: false, edge: false }); g.paintEll(-21, -30, 1.7, 1.7, '#fff', { a: 1, mottle: false, edge: false });
      g.line([[-27, -22 + ch], [-24, -21 + ch], [-21, -22 + ch]], { w: 1, c: '#fff', dbl: false });
      const tf = g.scallop(-22, -38, 7, 5, 6, { depth: 0.3 }); g.paint(tf, C.cream, { a: 0.35, step: 99 }); g.line(tf, { closed: true, w: 1.1, step: 99 });
    } else if (k === 'cat') {
      const br = 1 + Math.sin(t * 2) * 0.04, bd = A.arcPts(0, 0, 20, 15 * br, Math.PI, TAU, 10);
      g.paint(bd, C.ochre, { a: 0.9, step: 99 }); g.line(bd, { w: 1.5, step: 99 }); g.seg(-21, 0, 21, 0, { w: 1.3 });
      for (let i = -2; i <= 2; i++) g.line([[i * 6, -14 + Math.abs(i) * 2], [i * 6 + 2, -7]], { w: 1.4, c: C.brick, dbl: false });
      g.paintEll(-15, -5, 8, 7, C.ochre, { a: 0.9 }); g.ell(-15, -5, 8, 7, { w: 1.3 });
      g.line([[-22, -9], [-21, -16], [-17, -11]], { w: 1.2, step: 99 }); g.line([[-13, -11], [-9, -16], [-8, -9]], { w: 1.2, step: 99 });
      g.arc(-18, -4, 2.2, 1.6, 0, Math.PI, { w: 1 }); g.arc(-12, -4, 2.2, 1.6, 0, Math.PI, { w: 1 });
      g.line(A.quadPts([19, -2], [30, -4], [26, -14], 5), { w: 2.6, c: C.ochre, dbl: false }); g.line(A.quadPts([19, -2], [30, -4], [26, -14], 5), { w: 1 });
      const zf = (t * 0.5) % 1; g.text('z', -6 + zf * 10, -22 - zf * 22, { size: 10 + zf * 8, font: A.FONT.text, style: 'italic', a: 1 - zf }); g.text('z', 2 + zf * 10, -34 - zf * 22, { size: 8 + zf * 6, font: A.FONT.text, style: 'italic', a: (1 - zf) * 0.7 });
    } else if (k === 'crate') {
      const bx = A.rectPts(-20, -24, 40, 24); g.paint(bx, C.wood, { a: 0.75 }); g.poly(bx, { w: 1.5 });
      g.seg(-20, -12, 20, -12, { w: 1 }); g.seg(-7, -24, -7, 0, { w: 0.8, over: 0 }); g.seg(7, -24, 7, 0, { w: 0.8, over: 0 });
      for (const [ox, oy] of [[-12, -29], [0, -30], [12, -29], [-6, -38], [6, -38]]) { g.paintEll(ox, oy, 6, 6, '#e88a2a', { a: 0.95, mottle: false }); g.ell(ox, oy, 6, 6, { w: 1 }); }
      g.line([[6, -43], [9, -47]], { w: 1.4, c: C.leaf, dbl: false });
    } else if (k === 'crab') {
      const cl = Math.abs(Math.sin(t * 6)) * 5;
      for (const d of [-1, 1]) { for (let i = 0; i < 3; i++) g.line([[d * (8 + i * 2), -6], [d * (17 + i * 2), -11 + i * 3], [d * (20 + i * 3), -1]], { w: 1.2, step: 99, dbl: false }); g.line([[d * 9, -11], [d * 16, -19], [d * 14, -24]], { w: 1.5, step: 99 }); const cw = [[d * 14, -24], [d * (8 - cl * 0.3), -31 - cl * 0.4], [d * 14, -27], [d * (20 + cl * 0.3), -32 - cl * 0.4]]; g.wash(cw, C.red, { a: 0.95, step: 99, mottle: false, spread: 0.4 }); g.line(cw, { closed: true, w: 1.1, step: 99 }); }
      const sh = A.arcPts(0, -6, 13, 9, 0, TAU, 10); g.paint(sh, C.red, { a: 0.92, step: 99 }); g.line(sh, { closed: true, w: 1.4, step: 99 });
      for (const d of [-1, 1]) { g.seg(d * 4, -13, d * 5, -19, { w: 1, over: 0 }); g.dot(d * 5, -20, 1.8); }
      g.arc(0, -4, 4, 2.5, 0.2, Math.PI - 0.2, { w: 1 });
    } else if (k === 'castle') {
      const b = [[-26, 0], [-20, -16], [-20, -26], [-15, -26], [-15, -22], [-10, -22], [-10, -34], [-6, -34], [-6, -30], [-2, -30], [-2, -34], [2, -34], [2, -30], [6, -30], [6, -34], [10, -34], [10, -22], [15, -22], [15, -26], [20, -26], [20, -16], [26, 0]];
      g.paint(b, C.sand, { a: 0.9, step: 99 }); g.line(b, { w: 1.4, step: 99, wob: 0.7 }); door(g, 0, 0, 8, 12);
      g.seg(0, -34, 0, -48, { w: 1 }); const fw = Math.sin(t * 8) * 2; g.wash([[0, -48], [11, -45 + fw], [0, -41]], C.red, { a: 0.95, mottle: false, spread: 0.3 }); g.line([[0, -48], [11, -45 + fw], [0, -41]], { w: 0.9, step: 99 });
      for (let i = 0; i < 5; i++) g.dot(-20 + i * 9, -8 + (i % 2) * 4, 0.9, { a: 0.5 });
    } else if (k === 'ball') {
      const c = g.c, by = -15 - Math.abs(Math.sin(t * 4)) * 10; c.save(); c.translate(0, by); c.rotate(-t * 4);
      g.paintEll(0, 0, 15, 15, C.cream, { a: 0.4, mottle: false });
      const cols = [C.red, C.cerulean, C.ochre]; for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; g.wash([[0, 0], ...A.arcPts(0, 0, 15, 15, a, a + TAU / 6, 4)], cols[i], { a: 0.9, step: 99, mottle: false, spread: 0.4, edge: false }); }
      g.ell(0, 0, 15, 15, { w: 1.5 }); g.ell(0, 0, 3, 3, { w: 0.9 }); c.restore();
      g.washEll(0, 1, 13 - by * -0.1, 2.5, C.umber, { a: 0.18, mottle: false, edge: false });
    }
  };
  function door(g, x, y, w, h) { const p = [[x - w / 2, y], [x - w / 2, y - h + w / 2], ...A.arcPts(x, y - h + w / 2, w / 2, w / 2, Math.PI, TAU, 5), [x + w / 2, y]]; g.wash(p, C.umber, { a: 0.6, step: 99, mottle: false }); g.line(p, { w: 1, step: 99 }); }

  // A horse (or a donkey) at the trot, facing right, feet at the origin.
  function horse(g, x, y, t, col, donkey) {
    const c = g.c, sc = donkey ? 1.05 : 1.35, ph = t * 8.5, bob = Math.sin(ph * 2) * 1.1, dark = A.mix(col, C.ink, 0.3);
    c.save(); c.translate(x, y); c.scale(sc, sc);
    const leg = (hx, off, far) => {
      const sw = Math.sin(ph + off), up = Math.max(0, Math.cos(ph + off)), a = sw * 0.5, kn = [hx + Math.sin(a) * 14, -27 + bob + Math.cos(a) * 13], a2 = a - up * 0.9 - 0.08;
      const ft = [kn[0] + Math.sin(a2) * 14, Math.min(-1.5, kn[1] + Math.cos(a2) * 13.5)];
      g.limb([[hx, -29 + bob], kn, ft], [4.4, 2.7, 2.1], far ? dark : col, { a: 0.8 });
      const hf = [[ft[0] - 2.6, ft[1] - 1.5], [ft[0] + 3, ft[1] - 1.5], [ft[0] + 3.4, ft[1] + 1.8], [ft[0] - 2.8, ft[1] + 1.8]]; g.wash(hf, C.ink, { a: 0.85, spread: 0.3, mottle: false }); g.line(hf, { closed: true, w: 0.8, step: 99, dbl: false });
    };
    leg(-18, 0.4 + Math.PI, true); leg(18, 0.4, true);
    // tail
    const tl = A.quadPts([-27, -42 + bob], [-42, -36 + Math.sin(ph) * 3], [-38 + Math.sin(ph) * 3, -14], 7);
    g.wash([...tl, ...tl.slice().reverse().map(p => [p[0] + 5, p[1] - 1])], donkey ? dark : C.ink, { a: 0.75, step: 99, mottle: false, spread: 0.6 }); g.line(tl, { w: 1.1, step: 99 });
    const body = [[-27, -44], [-12, -48], [12, -47], [25, -45], [30, -35], [24, -26], [2, -23], [-22, -26], [-30, -35]].map(p => [p[0], p[1] + bob]);
    g.paint(body, col, { a: 0.78, step: 99 }); g.line(body, { closed: true, w: 1.5, step: 99 });
    g.wash(A.arcPts(0, -27 + bob, 20, 5, 0, TAU, 8), dark, { a: 0.3, step: 99, edge: false, mottle: false });
    // neck and head, nodding
    const nod = Math.sin(ph * 2 + 1) * 1.5, hy = bob + nod;
    const neck = [[14, -47 + bob], [30, -38 + bob], [43, -60 + hy], [33, -70 + hy]]; g.paint(neck, col, { a: 0.78, step: 99 }); g.line([neck[1], neck[2]], { w: 1.4 }); g.line([neck[0], neck[3]], { w: 1.4 });
    const head = [[31, -72 + hy], [41, -77 + hy], [56, -62 + hy], [55, -55 + hy], [47, -55 + hy], [37, -61 + hy]]; g.paint(head, col, { a: 0.78, step: 99 }); g.line(head, { closed: true, w: 1.4, step: 99 });
    const el = donkey ? 15 : 8; for (const q of [0, 3.5]) { const ear = [[33 + q, -74 + hy], [32 + q - (donkey ? 3 : 0), -74 - el + hy], [37 + q, -76 + hy]]; g.paint(ear, col, { a: 0.8, mottle: false }); g.line(ear, { w: 1.1, step: 99 }); }
    g.dot(42, -69 + hy, 1.4); g.dot(53.6, -59 + hy, 1); g.washEll(51, -58 + hy, 5, 4, donkey ? '#ffffff' : dark, { a: 0.5, edge: false, mottle: false });
    // mane
    for (let i = 0; i < 6; i++) { const u = i / 5, mx = A.lerp(31, 15, u), my = A.lerp(-71 + hy, -48 + bob, u); g.line([[mx, my], [mx - 6 - Math.sin(ph + i) * 1.5, my + 5]], { w: 2, c: donkey ? dark : C.ink, dbl: false, wob: 0.4 }); }
    leg(-20, 0.4, false); leg(16, 0.4 + Math.PI, false);
    // harness: collar, girth, bridle
    g.line([[20, -47 + bob], [28, -36 + bob], [24, -30 + bob]], { w: 2.4, c: C.ochre, dbl: false }); g.line([[2, -47 + bob], [3, -23 + bob]], { w: 1.4, c: C.umber, dbl: false });
    g.line([[40, -75 + hy], [48, -57 + hy]], { w: 1, c: C.umber, dbl: false }); g.line([[36, -66 + hy], [52, -62 + hy]], { w: 1, c: C.umber, dbl: false });
    c.restore();
    return { mouth: [x + 52 * sc, y + (-60 + hy) * sc], collar: [x + 22 * sc, y + (-40 + bob) * sc] };
  }
  function cartWheel(g, x, y, r, a, n = 10) {
    g.washEll(x, y, r, r, '#ffffff', { a: 0.5, mottle: false, edge: false, spread: 0.4 }); g.ell(x, y, r, r, { w: 2 }); g.ell(x, y, r - 2.6, r - 2.6, { w: 0.6, a: 0.6, dbl: false });
    for (let i = 0; i < n; i++) { const q = a + i / n * TAU; g.seg(x, y, x + Math.cos(q) * (r - 2), y + Math.sin(q) * (r - 2), { w: 0.8, over: 0, dbl: false, a: 0.8 }); }
    g.paintEll(x, y, 3, 3, C.ochre, { a: 0.9, mottle: false }); g.ell(x, y, 3, 3, { w: 0.9, dbl: false });
  }

  // Everyone else on the road. Each is drawn facing right with feet at the origin.
  const NPC = {
    band(g, n, t) { A.drawBand(g, 0, -4, t); },
    penny(g, n, t) { A.drawPenny(g, 0, 6, t, n); },
    pigeons(g, n, t) { A.drawPigeons(g, 0, 8, t, n); },
    walker(g, n, t) {
      const c = g.c, bob = Math.abs(Math.sin(t * 4.2)) * 1.6; c.save(); c.translate(0, -bob); c.rotate(Math.sin(t * 4.2) * 0.02);
      A.person(g, 0, 0, { kind: 'lady', col: n.col, parasol: n.par, armA: 1.5, bendA: 1.1, trim: n.par }); c.restore();
    },
    gent(g, n, t, near) {
      const w = t * 5.6, bob = Math.abs(Math.sin(w)) * 1.2, hail = near && !n.cane;
      // a tip of the hat for a passing cyclist
      A.person(g, 0, -bob, { kind: 'gent', col: n.col, hat: n.hat, walk: w, beard: n.beard, cane: n.cane, vest: n.id % 2 ? C.straw : C.rose,
        armA: n.cane ? 0.5 : hail ? 2.5 + Math.sin(t * 9) * 0.25 : 0.2 + Math.sin(w) * 0.4, bendA: n.cane ? 0.5 : hail ? 0.5 : 0.4,
        armB: near && n.cane ? -2.6 + Math.sin(t * 9) * 0.2 : -0.1 - Math.sin(w) * 0.4, bendB: near && n.cane ? -0.5 : 0.3 });
    },
    couple(g, n, t) {
      const w = t * 4.4, bob = Math.abs(Math.sin(w)) * 1.2;
      A.person(g, -10, -bob, { kind: 'gent', col: n.col2, hat: n.hat, walk: w, cane: !n.par, armA: n.par ? 0.9 : 0.5, bendA: n.par ? 1.2 : 0.5, armB: -0.2, vest: C.straw, tails: true });
      A.person(g, 9, -Math.abs(Math.sin(w + 0.6)) * 1.2, { kind: 'lady', col: n.col, parasol: n.par, armA: n.par ? 1.5 : 0.4, bendA: n.par ? 1.1 : 0.9, armB: -0.9, bendB: -0.6, trim: n.par || C.red, hatCol: C.cream });
    },
    mime(g, n, t) {
      // pressing along an invisible wall, one palm after the other
      const s1 = Math.sin(t * 2.2), s2 = Math.sin(t * 2.2 + 1.9), c = g.c;
      c.save(); c.rotate(Math.sin(t * 1.1) * 0.03);
      const h = A.person(g, 0, 0, { kind: 'gent', col: '#ffffff', jersey: C.ink, legs: C.ink, hat: 'beret', hatCol: C.ink, mime: true, mustache: false, gloves: true, hair: C.ink,
        armA: 1.75 + s1 * 0.22, bendA: 0.15 - s1 * 0.2, armB: 1.5 + s2 * 0.25, bendB: 0.2 - s2 * 0.2 });
      c.restore();
      for (const hd of [h.ha, h.hb]) { g.line([[hd[0] + 5, hd[1] - 5], [hd[0] + 5, hd[1] + 5]], { w: 0.7, a: 0.35, dbl: false }); }
      // upturned hat for coins
      const ht = [[-30, 2], [-16, 2], [-18, -6], [-28, -6]]; g.paint(ht, C.ink, { a: 0.8 }); g.line(ht, { closed: true, w: 1, step: 99 }); g.ell(-23, -6, 7, 1.8, { w: 1 }); g.dot(-24, -6, 1.1, { c: C.ochre }); g.dot(-21, -6.4, 1.1, { c: C.ochre });
    },
    painter(g, n, t) {
      // easel and a canvas with the view on it (and a small kite in its sky)
      const ex = 30; g.seg(ex - 12, 2, ex - 2, -70, { w: 1.6 }); g.seg(ex + 12, 2, ex + 2, -70, { w: 1.6 }); g.seg(ex + 2, -40, ex + 22, 2, { w: 1.2 }); g.seg(ex - 12, -24, ex + 12, -24, { w: 1.6 });
      const cvs = A.rectPts(ex - 16, -64, 30, 39); g.paint(cvs, '#ffffff', { a: 0.05, mottle: false });
      g.wash(A.rectPts(ex - 15, -63, 28, 20), C.sky, { a: 0.75, spread: 0.6, edge: false }); g.wash([[ex - 15, -43], [ex - 4, -49], [ex + 6, -44], [ex + 13, -47], [ex + 13, -26], [ex - 15, -26]], C.sage, { a: 0.85, spread: 0.6, step: 99 });
      g.paintEll(ex + 6, -57, 2.4, 2.4, C.ochre, { a: 0.95, mottle: false }); g.wash([[ex - 8, -60], [ex - 5, -56], [ex - 8, -52], [ex - 11, -56]], C.red, { a: 0.95, spread: 0.2, mottle: false }); g.line([[ex - 8, -52], [ex - 6, -46]], { w: 0.5, dbl: false });
      g.poly(cvs, { w: 1.3 });
      const dab = Math.sin(t * 3) * 0.18, h = A.person(g, 0, 0, { kind: 'gent', col: C.sky, hat: 'beret', hatCol: n.col, beard: true, vest: C.cream, legs: C.umber, armA: 1.55 + dab, bendA: 0.25 - dab, armB: 0.9, bendB: 1.0 });
      g.seg(h.ha[0] + 2, h.ha[1] + 1, h.ha[0] + 13, h.ha[1] - 4, { w: 1.1 }); g.dot(h.ha[0] + 13.5, h.ha[1] - 4.2, 1.4, { c: C.red });
      const pl = A.arcPts(h.hb[0] + 3, h.hb[1] + 2, 7.5, 5, 0, TAU, 9); g.paint(pl, C.wood, { a: 0.85, step: 99 }); g.line(pl, { closed: true, w: 1, step: 99 });
      [[C.red, -3, 0], [C.cerulean, 1, -2], [C.ochre, 5, 0], [C.leaf, 1, 3]].forEach(([cc, dx, dy]) => g.paintEll(h.hb[0] + 3 + dx, h.hb[1] + 2 + dy, 1.5, 1.4, cc, { a: 0.95, mottle: false, edge: false }));
    },
    pram(g, n, t) {
      const bob = Math.abs(Math.sin(t * 4)) * 1.4;
      A.person(g, -16, -bob, { kind: 'lady', col: n.col, blouse: n.col, apron: true, hat: 'bonnet', armA: 1.25, bendA: 0.5, armB: 1.1, bendB: 0.5, trim: '#ffffff' });
      const px = 22, a = t * 3.2;
      g.line([[px - 24, -44], [px - 18, -40], [px - 13, -28]], { w: 1.4, step: 99 });                         // handle
      const bas = [[px - 15, -30], [px + 17, -30], [px + 14, -17], [px - 11, -17]]; g.paint(bas, C.cream, { a: 0.6, step: 99 }); g.line(bas, { closed: true, w: 1.4, step: 99 });
      const hood = [[px + 17, -30], ...A.arcPts(px + 3, -30, 14, 16, 0, -Math.PI * 0.62, 7), [px + 3, -30]]; g.paint(hood, C.prussian, { a: 0.75, step: 99 }); g.line(hood, { closed: true, w: 1.3, step: 99 });
      for (const q of [-0.3, -0.9, -1.5]) g.seg(px + 3, -30, px + 3 + Math.cos(q) * 14, -30 + Math.sin(q) * 16, { w: 0.6, over: 0, dbl: false, a: 0.6 });
      g.paintEll(px - 6, -32, 4, 3.6, C.skin, { a: 0.6, mottle: false }); g.ell(px - 6, -32, 4, 3.6, { w: 0.9, dbl: false }); g.dot(px - 5, -32.4, 0.7);
      g.line(A.quadPts([px - 9, -17], [px, -9], [px + 12, -17], 5), { w: 1 });
      cartWheel(g, px - 9, -8, 8, a, 8); cartWheel(g, px + 12, -8, 8, a + 0.4, 8);
    },
    hoop(g, n, t) {
      const c = g.c, w = t * 11, a = t * 6;
      g.ell(22, -15, 15, 15, { w: 2, c: C.wood }); g.ell(22, -15, 15, 15, { w: 0.8, dbl: false });
      c.save(); c.scale(0.64, 0.64); c.rotate(0.12);
      const h = A.person(g, 0, -Math.abs(Math.sin(w)) * 3, { kind: 'gent', col: '#ffffff', jersey: n.col, legs: n.col, hat: 'cap', hatCol: n.col, mustache: false, walk: w, armA: 1.2 + Math.sin(a) * 0.15, bendA: 0.3, armB: -0.7 - Math.sin(w) * 0.5, bendB: -0.8 });
      c.restore();
      g.seg(h.ha[0] * 0.64 + 1, h.ha[1] * 0.64, 20, -22, { w: 1.2 });
    },
    balloons(g, n, t) {
      const w = t * 2.4, h = A.person(g, 0, -Math.abs(Math.sin(w)) * 0.8, { kind: 'gent', col: n.col, hat: 'cap', hatCol: C.red, walk: w, armA: 2.3, bendA: 0.5, armB: -0.2, vest: C.ochre });
      const hx = h.ha[0], hy = h.ha[1] - 2, cols = [C.red, C.ochre, C.cerulean, C.leaf, C.rose, C.lavender, C.teal];
      for (let i = 0; i < 7; i++) {
        const bx = hx + (i - 3) * 9 + Math.sin(t * 1.3 + i * 1.7) * 3, by = hy - 62 - (i % 3) * 13 - Math.sin(t * 1.7 + i) * 2;
        g.line(A.quadPts([hx, hy], [(hx + bx) / 2 + 2, (hy + by) / 2 + 6], [bx, by + 10], 5), { w: 0.6, a: 0.7, dbl: false, step: 99 });
        const bl = A.arcPts(bx, by, 8, 10, 0, TAU, 9); g.paint(bl, cols[i], { a: 0.85, step: 99, mottle: false }); g.line(bl, { closed: true, w: 1, step: 99, dbl: false });
        g.line([[bx - 3.5, by - 5], [bx - 4.6, by - 1]], { w: 1.2, c: '#ffffff', a: 0.7, dbl: false }); g.line([[bx - 1.4, by + 10], [bx, by + 12.4], [bx + 1.4, by + 10]], { w: 0.8, dbl: false, step: 99 });
      }
    },
    coupe(g, n, t) {
      const a = t * 4.4, jog = Math.sin(t * 17) * 0.5, c = g.c;
      g.line([[30, -34], [150, -50]], { w: 1.8, c: C.umber });                                                   // shaft, behind the horse
      const hs = horse(g, 122, 2, t, n.horse, false);
      cartWheel(g, -52, -22, 23, a, 12);
      c.save(); c.translate(0, jog);
      // the closed cab on its springs
      for (const q of [-1, 1]) g.arc(-30 + q * 22, -31, 12, 5, 0.1, Math.PI - 0.1, { w: 1.4 });
      const cab = [[-70, -40], [-70, -84], [-63, -93], [-10, -93], [-3, -84], [-3, -54], [3, -40], [-12, -31], [-58, -31]];
      g.paint(cab, n.col, { a: 0.85, step: 99 }); g.line(cab, { closed: true, w: 1.6, step: 99, wob: 0.6 });
      g.line([[-70, -58], [-3, -58]], { w: 1.2, c: C.ochre, dbl: false }); g.line([[-36, -93], [-36, -32]], { w: 0.9, dbl: false, a: 0.7 }); g.dot(-32, -52, 1.4, { c: C.ochre });
      const win = A.rectPts(-64, -88, 24, 25); g.paint(win, C.sky, { a: 0.5 }); g.poly(win, { w: 1.1 });
      const win2 = A.rectPts(-31, -88, 22, 25); g.paint(win2, C.sky, { a: 0.5 }); g.poly(win2, { w: 1.1 });
      // a passenger glimpsed through the glass
      c.save(); c.beginPath(); c.rect(-31, -88, 22, 25); c.clip(); A.person(g, -22, -31, { kind: n.lady ? 'lady' : 'gent', sit: true, s: 0.78, col: n.lady ? C.rose : C.slate, hat: n.lady ? 'wide' : 'top', armA: 0.4 }); c.restore();
      g.line(A.quadPts([-64, -88], [-58, -80], [-63, -64], 4), { w: 1.6, c: C.red, dbl: false });                // curtain
      const lamp = [[-2, -74], [5, -74], [6, -64], [-1, -64]]; g.paint(lamp, C.straw, { a: 0.95, mottle: false }); g.line(lamp, { closed: true, w: 1, step: 99 }); g.seg(2, -74, 2, -78, { w: 1 });
      // box seat and coachman
      const box = [[-3, -66], [24, -66], [30, -50], [26, -40], [3, -40]]; g.paint(box, A.mix(n.col, C.ink, 0.3), { a: 0.85, step: 99 }); g.line(box, { closed: true, w: 1.4, step: 99 });
      g.line([[26, -40], [40, -34], [40, -30]], { w: 1.6, step: 99 });
      const h = A.person(g, 10, -48, { kind: 'gent', sit: true, col: C.umber, hat: 'top', trim: C.ochre, armA: 1.2 + Math.sin(t * 8.5) * 0.06, bendA: 0.5, armB: 1.0, bendB: 0.6, tails: true });
      c.restore();
      g.line([[10 + h.ha[0], -48 + h.ha[1] + jog], [70, -52], hs.mouth], { w: 0.7, step: 99, dbl: false, a: 0.8 });   // reins
      const wx = 10 + h.hb[0], wy = -48 + h.hb[1] + jog; g.line(A.quadPts([wx, wy], [wx + 20, wy - 40], [wx + 52, wy - 34 + Math.sin(t * 6) * 4], 7), { w: 0.9, step: 99 });   // whip
      cartWheel(g, 16, -16, 17, a * 1.35, 10);
    },
    haycart(g, n, t) {
      const a = t * 2.6, c = g.c, jog = Math.sin(t * 11) * 0.6;
      g.line([[26, -32], [126, -40]], { w: 1.8, c: C.umber });
      const hs = horse(g, 104, 2, t * 0.62, '#9a948c', true);
      c.save(); c.translate(0, jog);
      // a towering load of hay
      const hay = g.scallop(-26, -66, 48, 30, 11, { depth: 0.22 }); g.paint(hay, C.ochre, { a: 0.75, step: 99 }); g.line(hay, { closed: true, w: 1.4, step: 99, wob: 1.2 });
      for (let i = 0; i < 14; i++) { const hx = -66 + A.hash(i * 3 + n.id) * 80, hy = -88 + A.hash(i * 7 + n.id) * 40; g.line([[hx, hy], [hx + 5 - A.hash(i) * 10, hy + 10]], { w: 0.8, a: 0.55, dbl: false }); }
      g.seg(-30, -92, -18, -112, { w: 1.3 }); for (const q of [-3, 0, 3]) g.seg(-18 + q, -112, -17 + q * 1.4, -121, { w: 0.9, over: 0 });      // pitchfork
      const bed = [[-76, -52], [22, -52], [18, -32], [-72, -32]]; g.paint(bed, C.wood, { a: 0.8, step: 99 }); g.line(bed, { closed: true, w: 1.5, step: 99 });
      for (let x = -64; x < 18; x += 12) g.seg(x, -52, x + 1, -32, { w: 0.8, over: 0, dbl: false, a: 0.7 });
      g.line([[18, -40], [30, -36], [30, -30]], { w: 1.5, step: 99 });
      const h = A.person(g, 8, -50, { kind: 'gent', sit: true, col: C.sage, hat: 'boater', hatCol: C.straw, trim: C.umber, jersey: C.cream, legs: C.prussian, armA: 1.15, bendA: 0.5, armB: 0.9, bendB: 0.7, beard: true });
      c.restore();
      g.line([[8 + h.ha[0], -50 + h.ha[1] + jog], [60, -46], hs.mouth], { w: 0.7, step: 99, dbl: false, a: 0.8 });
      cartWheel(g, -50, -19, 20, a, 10); cartWheel(g, -2, -19, 20, a + 0.3, 10);
    },
  };

  // accordion, violin and double bass
  A.drawBand = (g, x, y, t) => {
    const c = g.c, beat = t * 5.2;
    // bassist
    const b3 = Math.sin(beat) * 1.5; c.save(); c.translate(x + 52, y + b3 * 0.3);
    A.person(g, -12, 0, { kind: 'gent', col: C.umber, hat: 'bowler', armA: 1.2 + Math.sin(beat * 2) * 0.25, bendA: 0.9, armB: 2.2, bendB: 0.7 });
    const body = [[2, 0], [-9, -8], [-11, -22], [-5, -32], [-8, -42], [-2, -52], [8, -52], [14, -42], [11, -32], [17, -22], [15, -8]];
    g.paint(body, C.wood, { a: 0.88, step: 99 }); g.line(body, { closed: true, w: 1.5, step: 99 });
    g.line([[3, -52], [3, -96]], { w: 3.2, c: C.umber, dbl: false }); g.curl(4, -99, 4, 1, { w: 1.3, turns: 1 }); for (const k of [-1.5, 1.5]) g.seg(3 + k, -94, 3 + k, -14, { w: 0.5, over: 0, dbl: false, a: 0.7 });
    g.line([[-3, -26], [-5, -20]], { w: 1.1, dbl: false }); g.line([[9, -26], [11, -20]], { w: 1.1, dbl: false });
    c.restore();
    // accordionist, seated, bellows breathing
    const sq = Math.sin(beat) * 5; c.save(); c.translate(x, y + Math.abs(Math.sin(beat)) * 1.2);
    g.seg(-8, 0, -7, -18, { w: 1.3 }); g.seg(8, 0, 7, -18, { w: 1.3 }); g.seg(-10, -18, 10, -18, { w: 1.6 });
    A.person(g, 0, 0, { kind: 'gent', sit: true, col: C.prussian, hat: 'beret', hatCol: C.red, armA: 1.1 + sq * 0.03, bendA: 1.1, armB: 0.6, bendB: 1.3 });
    const ax = 8, aw = 16 + sq, ay = -50;
    g.paintRect(ax - 4, ay, 7, 26, C.red, { a: 0.95, mottle: false }); g.rect(ax - 4, ay, 7, 26, { w: 1.2 });
    const zz = []; for (let i = 0; i <= 6; i++) zz.push([ax + 3 + aw * i / 6, ay + (i % 2 ? 2 : 0)]); const zz2 = zz.map(p => [p[0], p[1] + 24 - (p[1] - ay) * 2]);
    g.paint([...zz, ...zz2.slice().reverse()], C.cream, { a: 0.5, step: 99 }); g.line(zz, { w: 1, step: 99 }); g.line(zz2, { w: 1, step: 99 }); for (let i = 1; i < 6; i++) g.seg(zz[i][0], zz[i][1], zz2[i][0], zz2[i][1], { w: 0.7, over: 0, dbl: false });
    g.paintRect(ax + 3 + aw, ay, 7, 26, C.red, { a: 0.95, mottle: false }); g.rect(ax + 3 + aw, ay, 7, 26, { w: 1.2 }); for (let i = 0; i < 4; i++) g.dot(ax + 6.5 + aw, ay + 5 + i * 5.5, 0.9, { c: '#fff' });
    c.restore();
    // violinist swaying
    c.save(); c.translate(x - 50, y); c.rotate(Math.sin(beat * 0.5) * 0.05);
    A.person(g, 0, 0, { kind: 'lady', col: C.sage, hat: 'wide', hatCol: C.cream, trim: C.red, armA: 1.9, bendA: 0.9, armB: 1.5 + Math.sin(beat * 2) * 0.35, bendB: 1.2 });
    const vb = [[8, -62], [16, -66], [24, -62], [22, -56], [12, -54]]; g.paint(vb, C.brick, { a: 0.92, step: 99 }); g.line(vb, { closed: true, w: 1.2, step: 99 }); g.seg(22, -62, 36, -68, { w: 1.6 });
    const bw = Math.sin(beat * 2) * 8; g.seg(4 + bw, -50, 32 + bw, -74, { w: 0.9 });
    c.restore();
    // open case with a few coins
    const cs = [[-22, 8], [-2, 8], [0, 2], [-24, 2]]; g.paint(cs, C.umber, { a: 0.8 }); g.poly(cs, { w: 1.1 }); g.dot(-14, 5, 1.4, { c: C.ochre }); g.dot(-8, 4.5, 1.4, { c: C.ochre });
  };
  // a gentleman on a penny-farthing, coming the other way
  A.drawPenny = (g, x, y, t, n) => {
    const c = g.c; c.save(); c.translate(x, y); c.scale(-1, 1);
    const R = 30, a = t * 5;
    g.ell(0, -R, R, R, { w: 1.8 }); for (let i = 0; i < 10; i++) { const s = a + i / 10 * TAU; g.seg(0, -R, Math.cos(s) * (R - 1), -R + Math.sin(s) * (R - 1), { w: 0.6, over: 0, dbl: false, a: 0.7 }); }
    g.ell(-40, -9, 9, 9, { w: 1.5 }); g.line(A.quadPts([-40, -9], [-30, -50], [-2, -62], 6), { w: 2, c: C.prussian }); g.seg(0, -R, 0, -66, { w: 1.8 }); g.seg(-4, -68, 8, -70, { w: 1.6 });
    const p = [Math.cos(a) * 9, -R + Math.sin(a) * 9];
    g.limb([[-10, -86], [1, -66 + Math.sin(a) * 3], p], [4, 3.4, 2.7], C.umber, { a: 0.7 });
    const sh = [[p[0] - 3, p[1] + 3], [p[0] + 7, p[1] + 3], [p[0] + 7, p[1]], [p[0] - 3, p[1] - 1]]; g.wash(sh, C.ink, { a: 0.85, spread: 0.3, mottle: false }); g.line(sh, { closed: true, w: 0.9, step: 99, dbl: false });
    c.translate(-12, -62); A.person(g, 0, 0, { kind: 'gent', sit: true, noLegs: true, col: C.slate, hat: 'top', armA: 1.05, bendA: 0.5, tails: true });
    c.restore();
  };
  A.drawPigeons = (g, x, y, t, n) => {
    for (let i = 0; i < n.n; i++) {
      const px = x + (i - n.n / 2) * 16 + Math.sin(i * 7) * 5, up = n.up ? n.up + i * 0.06 : 0;
      const c = g.c; c.save(); c.translate(px + up * (140 + i * 30), y - up * up * 240 - up * 130); if (up > 1.6) { c.restore(); continue; }
      const peck = up ? 0 : Math.max(0, Math.sin(t * 6 + i * 2)) * 4, fl = up ? Math.sin(t * 30 + i) * 8 : 0;
      const bd = A.arcPts(0, -6, 8, 5.5, 0, TAU, 8); g.paint(bd, C.slate, { a: 0.85, step: 99 }); g.line(bd, { closed: true, w: 1.1, step: 99 });
      g.paintEll(-7, -11 + peck, 4, 4, C.slate, { a: 0.85, mottle: false }); g.ell(-7, -11 + peck, 4, 4, { w: 1 }); g.line([[-10, -11 + peck], [-14, -10 + peck * 1.4]], { w: 1.2, c: C.ochre, dbl: false }); g.dot(-8, -12 + peck, 0.8);
      if (up) g.line([[-2, -8], [4, -16 - fl], [12, -10 - fl * 0.5]], { w: 1.4, step: 99 }); else { g.seg(-1, -1, -2, 3, { w: 0.9, over: 0, c: C.terracotta }); g.seg(3, -1, 3, 3, { w: 0.9, over: 0, c: C.terracotta }); }
      g.line([[7, -6], [14, -4]], { w: 1.2, dbl: false });
      c.restore();
    }
  };
})();
