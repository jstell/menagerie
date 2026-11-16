'use strict';
// Main loop, input, game rules, HUD and the title / fin cards.
(() => {
  const A = window.A, C = A.C, TAU = A.TAU, H = 720, START_X = 1500, PX_PER_KM = 7000;
  const cv = document.getElementById('scroll'), ctx = cv.getContext('2d');
  const g = new A.Sketch(ctx);
  const Q = new URLSearchParams(location.search);
  let S = 1, offY = 0, paper = null, paperPat = null, frame = null, edges = null, last = 0, shake = 0, quality = 1, slowAcc = 0, slowN = 0;

  const G = A.G = {
    state: 'title', phr: { id: -1, got: 0 }, notes: 0, dist: 0, bows: 4, time: 0, diff: 0, chain: 0, lastNote: -9, best: 0, bestKm: 0, card: null, overT: 0, paused: false, zi: 0, stT: 0,
    sfx(n, v, r) { A.audio.sfx(n, v, r); },
    onNote(o) {
      this.notes++;
      // every note sounds its own pitch, so a string gathered in order plays its little tune
      A.audio.note(o.zk || 'c', o.deg || 0, o.low ? 1.15 : 1); A.actors.bloom(o.x, o.y, o.col, false);
      if (o.pid === undefined) return;
      if (this.phr.id !== o.pid) this.phr = { id: o.pid, got: 0 };
      // the whole phrase, not one note missed: a flourish and a bonus
      if (++this.phr.got === o.pn) { this.notes += 3; A.audio.flourish(o.zk); A.actors.bloom(o.x, o.y, o.col, true); A.actors.say(o.x, o.y - 34, ['Bravo !', 'Bellissimo !', 'Quelle mélodie !', 'Encore !'][o.pid % 4], { size: 30, col: C.red }); }
    },
    lose(x, y) {
      this.bows--; A.P.inv = 2; shake = 0.35;
      A.actors.loseBow(x, y, [C.red, C.cerulean, C.ochre, C.leaf][Math.max(0, this.bows)]);
      if (this.bows <= 0) this.gameOver();
    },
    onKiteHit(kind, o) {
      const P = A.P, x = A.W.camX + P.kite.x, y = P.kite.y;
      if (kind === 'storm') { this.sfx('thunder', 0.7); for (let i = 0; i < 12; i++) A.actors.parts.push({ k: 'drop', x: x + (Math.random() - 0.5) * 60, y: y - 20, vx: 100, vy: 120 + Math.random() * 160, life: 0, max: 0.7 }); A.actors.say(x, y - 44, 'Plouf !', { size: 28, col: C.prussian }); }
      else { this.sfx('flap', 0.7); o.vx *= 1.8; A.actors.scatter(x, y, o.gull ? C.slate : C.ink, 7, 'feather'); A.actors.say(x, y - 44, o.gull ? 'Ahi !' : 'Croa !', { size: 28 }); }
      P.kite.vy += 260; P.kite.vx -= 200;
      this.lose(x, y);
    },
    onBikeHit(o) {
      const P = A.P, y = A.ground(o.x) - 20;
      P.wob = 1; P.vy = -260; P.on = false;
      const k = o.k;
      if (k === 'geese') { this.sfx('honk', 0.7); A.actors.scatter(o.x, y, '#bbbbbb', 8, 'feather'); A.actors.say(o.x, y - 60, 'Coin coin !', { size: 28 }); }
      else if (k === 'cat') { this.sfx('meow', 0.7); A.actors.say(o.x, y - 50, 'Miaou !', { size: 28 }); }
      else if (k === 'crate') { this.sfx('crate', 0.75); A.actors.scatter(o.x, y, '#e88a2a', 9); A.actors.say(o.x, y - 60, 'Oh là là !', { size: 28 }); }
      else if (k === 'castle') { this.sfx('sand', 0.8); A.actors.scatter(o.x, y, C.sand, 12); A.actors.say(o.x, y - 60, 'Mamma mia !', { size: 28 }); }
      else if (k === 'sheep') { this.sfx('baa', 0.75); A.actors.scatter(o.x, y, C.cream, 8); A.actors.say(o.x, y - 60, 'Bêêê !', { size: 28 }); }
      else { this.sfx(k === 'crab' ? 'crab' : k === 'ball' ? 'boing' : 'crash', 0.75); A.actors.say(o.x, y - 50, k === 'crab' ? 'Aïe !' : k === 'ball' ? 'Boing !' : 'Oups !', { size: 28 }); }
      this.lose(A.W.camX + A.P.kite.x, A.P.kite.y);
    },
    onCleared(o) { if (A.P.y < A.ground(A.P.x) - 6 || !A.P.on) A.actors.say(o.x, A.ground(o.x) - 110, A.rng(o.id)() < 0.5 ? 'Hop là !' : 'Et voilà !', { size: 22, vx: -10 }); },
    onRibbon(o) {
      this.sfx('harp', 0.6); A.actors.bloom(o.x, o.y + 150, C.rose, true);
      if (this.bows < 4) { this.bows++; A.actors.say(o.x, o.y + 110, 'Un ruban !', { size: 32, col: C.red }); } else { this.notes += 10; A.actors.say(o.x, o.y + 110, '+10', { size: 34, col: C.red, font: A.FONT.title }); }
    },
    onLand(vy) { this.sfx('land', Math.min(0.5, vy / 1600)); A.actors.puff(A.P.x - 30, A.P.y - 2, 4); },
    start() {
      A.audio.start(); this.sfx('flourish', 0.5);
      this.state = 'play'; this.notes = 0; this.dist = 0; this.bows = 4; this.time = 0; this.chain = 0; this.lastNote = -9; this.stT = 0;
      const P = A.P; if (P.kite.gone) { P.kite.gone = false; P.kite.x = P.hand[0] + 20; P.kite.y = P.hand[1] - 30; P.kite.vx = P.kite.vy = 0; for (const n of P.tail) { n.x = n.px = P.kite.x; n.y = n.py = P.kite.y + 30; } }
      P.inv = 1.5;
      A.actors.sky = []; A.actors.road = []; A.actors.playing = true;
      A.actors.nextNote = P.x + 1000; A.actors.nextHaz = P.x + 2700; A.actors.nextOb = P.x + 2200; A.actors.nextBalloon = P.x + 5000;
      this.zi = A.zoneIndex(P.x); this.card = { idx: this.zi, t: 0 };
      cv.style.cursor = 'none';
    },
    gameOver() {
      this.state = 'over'; this.overT = 0; A.P.kite.gone = true; A.actors.playing = false; this.sfx('fin', 0.7);
      if (this.notes > this.best) { this.best = this.notes; this.newBest = true; try { localStorage.setItem('aquilone.best', String(this.best)); } catch (e) { /* private mode */ } } else this.newBest = false;
      cv.style.cursor = 'default';
    },
  };
  try { G.best = parseInt(localStorage.getItem('aquilone.best') || '0', 10) || 0; } catch (e) { G.best = 0; }
  try { A.P.who = Q.get('rider') || localStorage.getItem('aquilone.rider') || 'f'; } catch (e) { A.P.who = 'f'; }
  const swapRider = () => { A.P.who = A.P.who === 'm' ? 'f' : 'm'; try { localStorage.setItem('aquilone.rider', A.P.who); } catch (e) { /* private mode */ } };
  const RIDER_Y = 410;   // where the rider chooser sits on the title card

  // ───── input ─────
  const In = { x: 600, y: 260, keys: {}, viaKeys: false, moved: false };
  const toLogical = (cx, cy) => { const r = cv.getBoundingClientRect(), k = cv.width / r.width; return [(cx - r.left) * k / S, ((cy - r.top) * k - offY) / S]; };
  const act = () => {
    if (G.paused) { G.paused = false; return; }
    if (G.state === 'title') { if (Math.abs(In.y - RIDER_Y + 6) < 17 && Math.abs(In.x - (A.W.W / 2 + 56)) < 210 && In.moved) { swapRider(); return; } G.start(); }
    else if (G.state === 'play') { if (A.P.hop()) { G.sfx('bell', 0.3, 0.95 + Math.random() * 0.1); A.actors.puff(A.P.x - 20, A.P.y - 2, 3); } }
    else if (G.state === 'over' && G.overT > 1.3) G.start();
  };
  cv.addEventListener('mousemove', e => { [In.x, In.y] = toLogical(e.clientX, e.clientY); In.viaKeys = false; In.moved = true; });
  cv.addEventListener('mousedown', e => { e.preventDefault(); [In.x, In.y] = toLogical(e.clientX, e.clientY); act(); });
  let touchId = null, touchT = 0;
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touchId === null && G.state === 'play') { touchId = t.identifier; touchT = performance.now(); const p = toLogical(t.clientX, t.clientY); In.x = p[0] + 40; In.y = p[1] - 90; In.viaKeys = false; }
      else { if (G.state === 'title') { [In.x, In.y] = toLogical(t.clientX, t.clientY); In.moved = true; } act(); }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touchId) { const p = toLogical(t.clientX, t.clientY); In.x = p[0] + 40; In.y = p[1] - 90; } }, { passive: false });
  const touchEnd = e => { for (const t of e.changedTouches) if (t.identifier === touchId) { touchId = null; if (performance.now() - touchT < 170) act(); } };
  cv.addEventListener('touchend', touchEnd); cv.addEventListener('touchcancel', touchEnd);
  addEventListener('keydown', e => {
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    In.keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); act(); }
    else if (e.code === 'KeyM') A.audio.toggleMute();
    else if (G.state === 'title' && /^Arrow(Left|Right)$|^KeyR$/.test(e.code)) { swapRider(); e.preventDefault(); }
    else if (e.code === 'KeyP' && G.state === 'play') G.paused = !G.paused;
    else if (/^Arrow|Key[WASD]$/.test(e.code)) { if (!In.viaKeys) { In.viaKeys = true; In.x = A.P.kite.x; In.y = A.P.kite.y; } e.preventDefault(); }
  });
  addEventListener('keyup', e => { In.keys[e.code] = false; });
  addEventListener('blur', () => { In.keys = {}; if (G.state === 'play') G.paused = true; });

  // ───── sizing ─────
  function resize() {
    // render at device resolution, capped, and scaled down further if the machine struggles (see tick)
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 1440 / innerHeight) * quality, cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
    cv.width = cw; cv.height = ch;
    S = Math.min(ch / H, cw / 960); offY = Math.round((ch - H * S) / 2);
    A.W.W = cw / S;
    const sprS = Math.min(2.5, Math.max(1, S * 1.25));
    if (A.SPR.scale !== sprS) { A.SPR.scale = sprS; A.SPR.cache.clear(); }
    paper = A.makePaper(Math.round(1500 * S / 64) * 64, Math.round(H * S), S); paperPat = ctx.createPattern(paper, 'repeat');
    edges = A.makeEdges(paper.width, S);
    frame = A.makeFrame(cw, Math.round(H * S), S);
    g.mottle = ctx.createPattern(A.mottleCv, 'repeat');
  }
  let rzT = 0; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(resize, 120); });

  // ───── update ─────
  function update(dt) {
    const P = A.P, W = A.W;
    let base, target;
    if (G.state === 'play') {
      G.time += dt; G.stT += dt; G.diff = A.smooth(G.time / 260);
      base = 225 + 115 * G.diff;     // a leisurely ride that picks up gently
      if (In.viaKeys) {
        const k = In.keys, v = 520 * dt;
        if (k.ArrowLeft || k.KeyA) In.x -= v; if (k.ArrowRight || k.KeyD) In.x += v; if (k.ArrowUp || k.KeyW) In.y -= v; if (k.ArrowDown || k.KeyS) In.y += v;
        In.x = A.clamp(In.x, P.sx - 100, W.W - 80); In.y = A.clamp(In.y, 60, 520);
      }
      target = AUTO ? autopilot() : { x: In.x, y: In.y };
      G.dist += P.speed * dt;
    } else {
      base = G.state === 'title' ? 150 : 120;
      target = G.state === 'title' ? { x: P.sx - 46 + Math.sin(W.t * 0.6) * 40, y: 150 + Math.sin(W.t * 0.95) * 44 } : { x: P.sx + 260 + Math.sin(W.t * 0.6) * 110, y: 250 + Math.sin(W.t * 0.95) * 90 };
      if (G.state === 'over') G.overT += dt;
    }
    P.update(dt, target, base, G);
    W.camX = P.x - P.sx; W.camSpeed = P.speed; W.update(dt);
    A.actors.update(dt, G);
    if (P.on && Math.random() < dt * (2 + P.speed / 90)) A.actors.puff(P.x - 40, P.y - 1, 1);
    // a new tableau: announce it
    const zi = A.zoneIndex(P.x);
    if (zi !== G.zi) { G.zi = zi; if (G.state === 'play') { G.card = { idx: zi, t: 0 }; G.sfx('bravo', 0.28); } }
    if (G.card) { G.card.t += dt; if (G.card.t > 4.4) G.card = null; }
    shake = Math.max(0, shake - dt);
    A.audio.mix(A.zone(P.x), dt, G.state === 'over' ? 0.5 : G.state === 'title' ? 0.75 : 1);
  }
  // debug autopilot for unattended runs: chase the nearest note ahead, hop over things
  function autopilot() {
    const P = A.P, cam = A.W.camX; let best = null;
    for (const o of A.actors.sky) if (o.k === 'note' && !o.low && o.x - cam > P.kite.x - 20 && (!best || o.x < best.x)) best = o;
    for (const o of A.actors.road) if (!o.hit && o.x - P.x > 0 && o.x - P.x < 110 + P.speed * 0.12) P.hop();
    return best ? { x: Math.max(P.sx + 120, Math.min(best.x - cam, P.sx + 380)), y: best.y } : { x: P.sx + 260, y: 260 + Math.sin(A.W.t) * 60 };
  }
  const AUTO = Q.has('auto');
  const GRAIN_SPEED = 0.6, ROLL_SPEED = 0.3;   // fractions of the road's scrolling speed

  // ───── drawing ─────
  function flourish(x, y, dir, len, al = 1) {
    const a = g.al; g.al = a * al;
    g.line(A.bezPts([x, y], [x + dir * len * 0.3, y - 16], [x + dir * len * 0.7, y + 16], [x + dir * len, y - 2], 16), { w: 1.4, step: 99 });
    g.curl(x + dir * len - dir * 2, y - 11, 9, dir, { w: 1.3, turns: 1.2, a0: Math.PI / 2 });
    g.curl(x + dir * len * 0.45, y + 9, 6, -dir, { w: 1.1, turns: 1.1, a0: -Math.PI / 2 });
    g.dot(x + dir * 4, y, 2.2); g.al = a;
  }
  function blot(x, y, rx, ry, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    const rg = ctx.createRadialGradient(0, 0, rx * 0.25, 0, 0, rx); rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(0.7, `rgba(255,255,255,${a * 0.75})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
  }
  function drawHUD() {
    const W = A.W.W, x0 = A.FRAME.RW + 34, y0 = A.FRAME.M + 46, b = A.W.boil;
    g.seed(b * 41 + 4, 4);
    if (G.state !== 'title') {
      A.drawNote(g, x0, y0 - 6, 1.25, C.red, 0, true, -0.1);
      const hud = (A.W.nf || 0) > 0.45 ? '#fff0cc' : C.ink;
      g.text(String(G.notes), x0 + 28, y0 + 9, { size: 42, font: A.FONT.title, align: 'left', c: hud });
      g.text((G.dist / PX_PER_KM).toFixed(1).replace('.', ',') + ' km', x0 - 12, y0 + 38, { size: 18, font: A.FONT.text, style: 'italic', align: 'left', a: 0.75, c: hud });
      const cols = [C.red, C.cerulean, C.ochre, C.leaf];
      for (let i = 0; i < 4; i++) {
        const bx = W - A.FRAME.RW - 46 - i * 36, by = y0 - 8;
        if (i < G.bows) A.P.bow(g, bx, by + Math.sin(A.W.t * 3 + i) * 1.5, Math.sin(A.W.t * 2 + i) * 0.12, cols[i], 1.5);
        else { g.ell(bx, by, 3, 3, { w: 1, a: 0.35, dbl: false }); for (const d of [-1, 1]) g.line([[bx, by], [bx + d * 14, by - 8], [bx + d * 14, by + 8], [bx, by]], { w: 0.9, a: 0.28, dbl: false, step: 99 }); }
      }
    }
    if (G.card && G.state === 'play') {
      const t = G.card.t, a = A.smooth(t / 0.6) * (1 - A.smooth((t - 3.3) / 1.1)), nm = A.ZONE_NAMES[G.card.idx], cx = W / 2 + 60, cy = 150 - (1 - A.smooth(t / 0.8)) * 14;
      blot(cx, cy - 16, 300, 96, 0.6 * a);
      g.al = a;
      g.text('— ' + nm[0] + ' —', cx, cy - 52, { size: 22, font: A.FONT.sign, ls: 4, a: 0.8 });
      g.text(nm[1], cx + 2.5, cy + 2.5, { size: 64, font: A.FONT.title, c: C.red, a: 0.5 }); g.text(nm[1], cx, cy, { size: 64, font: A.FONT.title });
      flourish(cx - 150, cy - 14, -1, 80); flourish(cx + 150, cy - 14, 1, 80);
      g.al = 1;
    }
    if (G.paused && !Q.has('cast')) { blot(W / 2, 330, 260, 90, 0.8); g.text('Pause', W / 2, 340, { size: 72, font: A.FONT.title }); g.text('click or press P to ride on', W / 2, 376, { size: 19, font: A.FONT.text, style: 'italic', a: 0.8 }); }
    if (G.state === 'play' && !In.viaKeys && !AUTO && G.stT < 9) {
      const a = (1 - A.smooth((G.stT - 6) / 3)) * 0.55; g.al = a; g.seed(b * 3 + 1, 1);
      g.ell(In.x, In.y, 9, 9, { w: 1, dbl: false }); g.dot(In.x, In.y, 1.4); g.al = 1;
    }
  }
  function drawTitle() {
    const W = A.W.W, cx = W / 2 + 56, t = A.W.t, b = A.W.boil;
    g.seed(b * 43 + 6, 6);
    blot(cx, 300, 510, 280, 0.92);
    g.text('une promenade à bicyclette, vers 1900', cx, 124, { size: 30, font: A.FONT.script, a: 0.85 });
    g.text('L’Aquilone', cx + 5, 241, { size: 138, font: A.FONT.title, c: C.red, a: 0.55 });
    g.text('L’Aquilone', cx, 236, { size: 138, font: A.FONT.title });
    flourish(cx - 136, 293, -1, 180); flourish(cx + 136, 293, 1, 180);
    g.text('— le cerf-volant —', cx, 299, { size: 20, font: A.FONT.sign, ls: 5, a: 0.8 });
    g.text('Move the mouse to fly the kite  ·  click or press Space to hop', cx, 350, { size: 22, font: A.FONT.text, style: 'italic' });
    g.text('Gather the music, mind the weather, and keep the bows on your tail.', cx, 379, { size: 19, font: A.FONT.text, style: 'italic', a: 0.75 });
    // choose your rider: click a name, or press the left / right arrow
    const man = A.P.who === 'm';
    g.text('Mademoiselle', cx - 24, RIDER_Y, { size: 27, font: A.FONT.script, align: 'right', c: man ? C.ink : C.red, a: man ? 0.5 : 1 });
    g.text('Monsieur', cx + 24, RIDER_Y, { size: 27, font: A.FONT.script, align: 'left', c: man ? C.red : C.ink, a: man ? 1 : 0.5 });
    g.text('ou', cx, RIDER_Y - 1, { size: 16, font: A.FONT.text, style: 'italic', a: 0.6 });
    const ux = man ? cx + 24 : cx - 24 - 150, uw = man ? 104 : 150; g.line(A.quadPts([ux, RIDER_Y + 9], [ux + uw / 2, RIDER_Y + 13], [ux + uw, RIDER_Y + 8], 6), { w: 1.6, c: C.red, step: 99 });
    const p = 0.6 + Math.sin(t * 3.2) * 0.4;
    g.text('~  click to set off  ~', cx, 458, { size: 34, font: A.FONT.title, c: C.red, a: 0.45 + p * 0.5 });
    g.text((G.best ? 'record : ' + G.best + ' notes   ·   ' : '') + 'M  music   ·   P  pause   ·   ← →  choose rider   ·   arrow keys also steer the kite', cx, 492, { size: 15, font: A.FONT.text, style: 'italic', a: 0.6 });
  }
  function drawOver() {
    const W = A.W.W, cx = W / 2 + 20, b = A.W.boil, a = A.smooth(G.overT / 0.9);
    g.seed(b * 47 + 7, 7); blot(cx, 290, 440, 215, 0.9 * a); g.al = a;
    g.text('Fin', cx + 5, 285, { size: 170, font: A.FONT.title, c: C.red, a: 0.55 }); g.text('Fin', cx, 280, { size: 170, font: A.FONT.title });
    flourish(cx - 110, 250, -1, 150); flourish(cx + 110, 250, 1, 150);
    g.text('le cerf-volant s’est envolé…', cx, 150, { size: 30, font: A.FONT.script, a: 0.85 });
    g.text(G.notes + ' notes  ·  ' + (G.dist / PX_PER_KM).toFixed(1).replace('.', ',') + ' km', cx, 346, { size: 36, font: A.FONT.title });
    g.text(G.newBest ? 'Nouveau record !' : 'record : ' + G.best + ' notes', cx, 380, { size: 21, font: A.FONT.text, style: 'italic', c: G.newBest ? C.red : C.ink, a: 0.85 });
    if (G.overT > 1.3) g.text('~  click to ride again  ~', cx, 432, { size: 32, font: A.FONT.title, c: C.red, a: 0.5 + Math.sin(A.W.t * 3.2) * 0.4 });
    g.al = 1;
  }

  function render() {
    const W = A.W.W, c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (offY > 0) { c.fillStyle = '#150d08'; c.fillRect(0, 0, cv.width, cv.height); }
    c.setTransform(S, 0, 0, S, 0, offY);
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    if (shake > 0) c.translate((Math.random() - 0.5) * shake * 22, (Math.random() - 0.5) * shake * 22);
    A.W.drawBack(g);
    A.W.drawGround(g);
    A.actors.drawRoad(g);
    A.P.draw(g, G);
    A.W.drawFront(g);
    // night falls as a glaze over the finished painting; then everything that shines is put back on top
    A.W.drawNight(g); A.W.drawLights(g);
    if (G.state === 'title') drawTitle();
    A.actors.drawSky(g);
    A.P.drawKite(g, G);
    A.actors.drawParts(g);
    c.restore();
    c.setTransform(S, 0, 0, S, 0, offY);
    drawHUD();
    if (G.state === 'over') drawOver();
    // lay the whole painting onto the paper
    // the paper travels with the road: the whole sheet is being wound from one roll to the other
    // The torn edges keep pace with the road; the grain drifts a little slower so it doesn't distract.
    const off = Math.round((A.W.camX * S) % paper.width), gOff = Math.round((A.W.camX * GRAIN_SPEED * S) % paper.width);
    c.setTransform(1, 0, 0, 1, -gOff, offY); c.globalCompositeOperation = 'multiply'; c.fillStyle = paperPat; c.fillRect(gOff, 0, cv.width, Math.round(H * S));
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over';
    for (let x = -off; x < cv.width; x += paper.width) { c.drawImage(edges.top, x, offY); c.drawImage(edges.bot, x, offY + Math.round(H * S) - edges.h); }
    c.drawImage(frame, 0, offY);
    // the rolls turn as the scroll is wound along
    const RW = A.FRAME.RW * S, M = A.FRAME.M * S;
    // Both rolls sit on top of the sheet, which runs leftward beneath them: the right one pays it out from
    // underneath and the left one takes it up from underneath, so the visible top of each roll moves to the
    // right, against the paper. They turn slower than the paper truly would, which reads calmer.
    for (const x0 of [0, cv.width - RW]) for (let i = 0; i < 6; i++) {
      const ph = A.W.camX * ROLL_SPEED / (A.FRAME.RW / 2) + i * Math.PI / 3, cs = Math.cos(ph); if (cs <= 0.05) continue;
      c.fillStyle = `rgba(90,60,26,${0.16 * cs})`; c.fillRect(x0 + RW / 2 + Math.sin(ph) * RW * 0.48, M * 0.45 + offY, Math.max(1, S * 1.2), H * S - M * 0.9);
    }
  }

  function tick(now) {
    const raw = (now - last) / 1000 || 0.016, dt = Math.min(0.034, raw); last = now;
    // if frames keep running long, trade resolution for smoothness
    if (raw < 0.25) { slowAcc += raw; if (++slowN >= 120) { if (slowAcc / slowN > 0.027 && quality > 0.5 && !Q.has('hq')) { quality *= 0.8; resize(); } slowAcc = slowN = 0; } }
    if (!G.paused) update(dt);
    render();
    requestAnimationFrame(tick);
  }

  async function boot() {
    try { await Promise.all(['138px "Griffy"', '20px "Bigelow Rules"', '30px "Parisienne"', '20px "IM Fell DW Pica"', 'italic 20px "IM Fell DW Pica"', '20px "IM Fell DW Pica SC"'].map(f => document.fonts.load(f))); } catch (e) { /* fall back to system serif */ }
    A.mottleCv = A.makeMottle(); A.glowCv = A.makeGlow();
    A.audio.init(); if (Q.has('mute')) A.audio.muted = true;
    resize();
    // ?zone=c|t|j|r|f starts in that tableau; ?x=N nudges further along
    const x0 = (Q.has('zone') ? A.zoneStart(Q.get('zone')) + 2600 : START_X) + (parseFloat(Q.get('x')) || 0);
    A.P.reset(x0); A.P.sx = Math.round(A.W.W * 0.27);
    A.actors.reset(x0, false); A.W.reset(x0 - A.P.sx);
    if (AUTO) { G.start(); A.P.inv = 0; if (Q.has('god')) G.lose = () => { A.P.inv = 2; }; }
    // debug aids: ?selftest draws every prop once, ?warp=N fast-forwards N seconds, ?over shows the end card, ?bench times rendering
    if (Q.has('selftest')) { let bad = 0, n = 0; for (const [name, d] of Object.entries(A.SPR.defs)) for (let v = 0; v < (d.v || 1); v++) { n++; try { A.sprite(name, v); } catch (e) { bad++; console.log('SPRITE FAIL ' + name + ' ' + v + ' ' + e.message); } } console.log('selftest sprites=' + n + ' bad=' + bad); }
    const warp = parseFloat(Q.get('warp')) || 0; for (let i = 0; i < warp * 60; i++) update(1 / 60);
    if (warp) console.log('warp ' + JSON.stringify({ state: G.state, notes: G.notes, bows: G.bows, km: +(G.dist / PX_PER_KM).toFixed(2), t: +G.time.toFixed(1), sprites: A.SPR.cache.size }));
    // ?cast=gent,couple,... lines the named characters up ahead of the rider and freezes the scene
    if (Q.has('cast')) {
      const ks = Q.get('cast').split(','), sp = 880 / ks.length;
      ks.forEach((k, i) => A.actors.npcs.push({ id: 900 + i, ph: i * 1.3, k, x: x0 + 170 + i * sp + (/coupe|haycart/.test(k) ? 60 : 0), dir: Q.has('left') ? -1 : 1, n: 4, up: 0, lady: i % 2 === 0, cane: i % 2 === 0, beard: i % 2 === 1,
        col: /walker|couple/.test(k) ? C.rose : /coupe/.test(k) ? '#6e2f2a' : C.prussian, col2: C.umber, hat: ['top', 'bowler', 'boater'][i % 3], par: C.cream, horse: [C.wood, '#d8d2c6'][i % 2] }));
      for (let i = 0; i < 20; i++) update(1 / 60); G.paused = true;
    }
    if (Q.has('over')) { G.gameOver(); for (let i = 0; i < 150; i++) update(1 / 60); }
    if (Q.has('bench')) {
      render(); const N = 40, tm = (label, fn) => { const t0 = performance.now(); for (let i = 0; i < N; i++) fn(); ctx.getImageData(0, 0, 1, 1); return label + '=' + ((performance.now() - t0) / N).toFixed(1); };
      ctx.setTransform(S, 0, 0, S, 0, offY);
      const out = [tm('update', () => update(1 / 60)), tm('sky', () => A.W.drawSky(g)), tm('back', () => A.W.drawBack(g)), tm('ground', () => A.W.drawGround(g)), tm('road', () => A.actors.drawRoad(g)), tm('rider', () => A.P.draw(g, G)), tm('front', () => A.W.drawFront(g)), tm('skyActors', () => A.actors.drawSky(g)), tm('kite', () => A.P.drawKite(g, G)), tm('parts', () => A.actors.drawParts(g)), tm('hud', () => drawHUD()), tm('full', () => render())];
      console.log('bench S=' + S.toFixed(2) + ' ' + out.join(' '));
    }
    document.getElementById('loading').remove();
    requestAnimationFrame(t => { last = t; tick(t); });
  }
  boot();
})();
// (debug) ?synthtest plays each kite voice once and reports whether the audio graph built without error
if (new URLSearchParams(location.search).has('synthtest')) setTimeout(() => { try { window.A.audio.start(); for (const z of ['c', 't', 'j', 'r', 'f']) { for (const d of [-7, 0, 4, 9]) window.A.audio.note(z, d, 1); window.A.audio.flourish(z); } console.log('synthtest ok ctx=' + window.A.audio.ctx.state + ' plucks=' + window.A.audio.plucks.size); } catch (e) { console.log('synthtest FAIL ' + e.message); } }, 600);
