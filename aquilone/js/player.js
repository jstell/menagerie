'use strict';
// The cyclist, her bicycle (with a small dog in the basket), her scarf, and the kite on its string.
(() => {
  const A = window.A, C = A.C, TAU = A.TAU;
  const GRAV = 1200, HOP = 540, STRING = 430;
  const RS = 1.3;   // the heroine is drawn larger than life so her details read

  // two-bone IK: joint position for bones a,b from p to q, bending toward `dir` (+1/-1)
  const ik = (p, q, a, b, dir) => {
    let dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1e-3;
    const dd = Math.min(d, a + b - 0.01), k = (a * a - b * b + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, a * a - k * k));
    dx /= d; dy /= d;
    return [p[0] + dx * k - dy * h * dir, p[1] + dy * k + dx * h * dir];
  };

  // convex hull (monotone chain), used to wrap the skirt around the moving legs
  const hull = pts => {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };

  const P = A.P = {
    reset(x) {
      this.x = x; this.y = A.ground(x); this.vy = 0; this.on = true; this.tilt = 0; this.speed = 300; this.crank = 0; this.wheel = 0;
      this.wob = 0; this.squash = 0; this.inv = 0; this.sx = 0;
      this.kite = { x: 520, y: 260, vx: 0, vy: 0, ang: 0, gone: false };
      this.tail = []; for (let i = 0; i < 10; i++) this.tail.push({ x: 520 - i * 12, y: 300, px: 520 - i * 12, py: 300 });
      this.scarf = []; for (let i = 0; i < 6; i++) this.scarf.push({ x: 300 - i * 8, y: 480, px: 300 - i * 8, py: 480 });
      this.hand = [330, 470]; this.dust = 0; this.ear = 0;
    },
    hop() {
      if (!this.on) return false;
      this.on = false; this.vy = Math.min(this.vy, 0) - HOP; this.squash = 0.16; return true;
    },
    update(dt, target, baseSpeed, G) {
      const W = A.W.W;
      this.sx = Math.round(W * 0.27);
      // ride: a little faster downhill, slower up
      const sl = A.slope(this.x), want = baseSpeed * (1 + A.clamp(sl, -0.5, 0.5) * 0.55) * (this.wob > 0 ? 0.7 : 1);
      this.speed += (want - this.speed) * Math.min(1, dt * 2.2);
      const dx = this.speed * dt; this.x += dx;
      const gy = A.ground(this.x);
      if (this.on) {
        const vyGround = sl * this.speed;
        // the road can fall away faster than gravity pulls: leave the crest
        if (this.vy < vyGround - 260 * dt * 8) { this.on = false; } else { this.y = gy; this.vy = vyGround; }
      }
      if (!this.on) {
        this.vy += GRAV * dt; this.y += this.vy * dt;
        if (this.y >= gy) { this.y = gy; this.on = true; this.squash = -0.14; if (this.vy > 300) G.onLand(this.vy); this.vy = sl * this.speed; }
      }
      const wantTilt = this.on ? Math.atan(sl) : A.clamp(this.vy / 1400, -0.35, 0.4);
      this.tilt += (wantTilt - this.tilt) * Math.min(1, dt * (this.on ? 12 : 5));
      this.crank += dx / (34 * RS); this.wheel += dx / (23 * RS);
      this.squash *= Math.pow(0.002, dt); this.wob = Math.max(0, this.wob - dt); this.inv = Math.max(0, this.inv - dt);
      this.ear += dt * (6 + this.speed / 60);

      // kite: a damped spring chasing the pointer, on a string of limited length
      const k = this.kite, t = A.W.t, hx = this.hand[0], hy = this.hand[1];
      if (!k.gone) {
        let tx = target.x + Math.sin(t * 1.7) * 9, ty = target.y + Math.sin(t * 2.3 + 1) * 7;
        const ceil = A.FRAME.M + 38, floor = A.ground(A.W.camX + tx) - 62;
        ty = A.clamp(ty, ceil, floor); tx = A.clamp(tx, hx - 150, W - A.FRAME.RW - 30);
        let ddx = tx - hx, ddy = ty - hy; const d = Math.hypot(ddx, ddy);
        if (d > STRING) { tx = hx + ddx / d * STRING; ty = hy + ddy / d * STRING; }
        k.vx += ((tx - k.x) * 46 - k.vx * 9.5) * dt; k.vy += ((ty - k.y) * 46 - k.vy * 9.5) * dt;
      } else { k.vx += (90 - k.vx) * dt; k.vy += (-210 - k.vy) * dt * 1.5; }
      k.x += k.vx * dt; k.y += k.vy * dt;
      const wantAng = (k.gone ? Math.sin(t * 5) * 0.6 : A.clamp((k.x - hx) / STRING, -1, 1) * 0.5 + k.vx * 0.0011 + Math.sin(t * 3.1) * 0.05);
      k.ang += (wantAng - k.ang) * Math.min(1, dt * 8);
      // tail and scarf: verlet ribbons in the apparent wind
      const tipX = k.x - Math.sin(k.ang) * 36, tipY = k.y + Math.cos(k.ang) * 36;
      this.ribbon(this.tail, tipX, tipY, 12.5, dt, -150 - this.speed * 0.5, 260, t, 60);
    },
    ribbon(nodes, ax, ay, seg, dt, wind, grav, t, flut) {
      nodes[0].x = ax; nodes[0].y = ay;
      const dt2 = Math.min(dt, 1 / 30) ** 2;
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i], vx = (n.x - n.px) * 0.94, vy = (n.y - n.py) * 0.94;
        n.px = n.x; n.py = n.y;
        n.x += vx + (wind + Math.sin(t * 9 + i * 1.3) * flut) * dt2; n.y += vy + (grav + Math.cos(t * 11 + i * 1.7) * flut * 2.2) * dt2;
      }
      for (let it = 0; it < 4; it++) for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1], b = nodes[i]; let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1e-3, f = (d - seg) / d;
        if (i === 1) { b.x -= dx * f; b.y -= dy * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; b.x -= dx * f * 0.5; b.y -= dy * f * 0.5; }
      }
    },
    // local (bike) -> screen
    toScreen(lx, ly) { const c = Math.cos(this.tilt), s = Math.sin(this.tilt); lx *= RS; ly *= RS; return [this.sx + lx * c - ly * s, this.y + lx * s + ly * c]; },

    draw(g, G) {
      const c = g.c, b = A.W.boil, t = A.W.t;
      if (this.inv > 0 && Math.floor(t * 14) % 2 === 0 && !this.kite.gone) c.globalAlpha = 0.45;
      const wobA = this.wob > 0 ? Math.sin(this.wob * 26) * 0.12 * this.wob : 0;
      c.save(); c.translate(this.sx, this.y); c.rotate(this.tilt + wobA); c.scale(RS * (1 - this.squash * 0.5), RS * (1 + this.squash));
      g.seed(b * 61 + 11, 11);
      const R = [-33, -23], F = [35, -23], BB = [-3, -22], S = [-15, -58], HT = [25, -64], GR = [17, -77], WR = 23;
      const th = this.crank, ped = a => [BB[0] + Math.cos(a) * 10, BB[1] + Math.sin(a) * 10];
      const hip = [-14, -66], sh = [3, -100], hd = [9, -113];
      const leg = (a, far) => {
        const p = ped(a), kn = ik(hip, p, 25, 26, -1);
        // stockinged calf with jaunty stripes
        const an = [p[0] + 0.5, p[1] - 5], dxl = an[0] - kn[0], dyl = an[1] - kn[1], dl = Math.hypot(dxl, dyl) || 1, nx = -dyl / dl, ny = dxl / dl;
        g.limb([kn, [(kn[0] + an[0]) / 2 + nx * 1.4, (kn[1] + an[1]) / 2 + ny * 1.4], an], [3.5, 3.5, 2.3], far ? '#d9c9a8' : '#ffffff', { a: far ? 0.9 : 0.15 });
        for (let i = 1; i <= 3; i++) { const u = i / 4.2, sx = A.lerp(kn[0], an[0], u) + nx * 0.8, sy = A.lerp(kn[1], an[1], u) + ny * 0.8, hw = 3 - u; g.line([[sx - nx * hw, sy - ny * hw], [sx + nx * hw, sy + ny * hw]], { w: 1.7, c: C.red, dbl: false, wob: 0.2, a: far ? 0.45 : 0.9 }); }
        // buttoned boot and pedal
        const boot = [[p[0] - 4, p[1] - 6], [p[0] + 2.5, p[1] - 6], [p[0] + 9, p[1] - 0.5], [p[0] + 8.5, p[1] + 2], [p[0] - 4, p[1] + 2]];
        g.wash(boot, C.umber, { a: far ? 0.6 : 0.9, spread: 0.5, mottle: false }); g.line(boot, { closed: true, w: 1, step: 99, dbl: false });
        g.seg(p[0] - 5, p[1] + 3, p[0] + 7, p[1] + 3, { w: 1.6, over: 0 });
        return [kn, an];
      };
      // far-side leg, then machine, then near leg
      const [knF, anF] = leg(th + Math.PI, true);
      // wheels
      for (const hub of [R, F]) {
        g.washEll(hub[0], hub[1], WR, WR, '#fff', { a: 0.55, mottle: false, edge: false, spread: 0.5 });
        g.ell(hub[0], hub[1], WR, WR, { w: 2 }); g.ell(hub[0], hub[1], WR - 3, WR - 3, { w: 0.6, a: 0.5, dbl: false });
        for (let i = 0; i < 7; i++) { const a = this.wheel + i / 7 * TAU; g.seg(hub[0], hub[1], hub[0] + Math.cos(a) * (WR - 2), hub[1] + Math.sin(a) * (WR - 2), { w: 0.6, over: 0, dbl: false, a: 0.7 }); }
        g.dot(hub[0], hub[1], 2);
        g.arc(hub[0], hub[1], WR + 3.5, WR + 3.5, hub === R ? Math.PI * 1.02 : Math.PI * 1.25, hub === R ? Math.PI * 1.75 : Math.PI * 1.95, { w: 1.7, c: C.red });
      }
      // frame in vermilion ink
      const fr = { w: 2.3, c: C.red, wob: 0.6 };
      g.line([BB, S], fr); g.line([S, HT], fr); g.line([BB, [26, -55]], fr); g.line([BB, R], fr); g.line([S, R], fr);
      g.line([[26, -55], HT, [25, -72], GR], { w: 2, wob: 0.5 }); g.line(A.quadPts([26, -57], [34, -44], F, 5), { w: 2, c: C.red, wob: 0.5 });
      g.line([[-22, -62], [-9, -63], [-7, -60]], { w: 3.4, c: C.umber, dbl: false, wob: 0.4 });      // saddle
      g.ell(BB[0], BB[1], 6, 6, { w: 1.3 }); g.line([[BB[0] - 5, BB[1] - 4], [R[0], R[1] - 3]], { w: 0.7, a: 0.7, dbl: false }); g.line([[BB[0] - 5, BB[1] + 5], [R[0], R[1] + 3]], { w: 0.7, a: 0.7, dbl: false });
      g.seg(...ped(th), ...ped(th + Math.PI), { w: 1.6, over: 0 });
      // wicker basket with baguette, flowers and Filou the dog
      const bk = [[30, -84], [54, -84], [51, -64], [33, -64]];
      g.seg(26, -70, 33, -72, { w: 1.2 });
      const earF = Math.sin(this.ear) * 0.5 + (this.on ? 0 : -0.7), dh = [45, -93 + Math.sin(this.ear * 0.5) * 0.8];
      g.line([[36, -80], [28, -112]], { w: 5, c: C.ochre, dbl: false, wob: 0.3, a: 0.9 }); g.line([[33.5, -80], [25.5, -112], [30, -113], [38.5, -80]], { w: 1, step: 99 });
      for (let i = 0; i < 3; i++) g.line([[31 - i * 2.2, -90 - i * 7], [34.5 - i * 2.2, -93 - i * 7]], { w: 0.8, dbl: false });
      g.paintEll(dh[0], dh[1], 7, 6.4, C.white, { a: 0.2, mottle: false }); g.ell(dh[0], dh[1], 7, 6.4, { w: 1.2 });
      g.wash([[dh[0] - 6, dh[1] - 3], [dh[0] - 13 - earF * 4, dh[1] - 6 + earF * 9], [dh[0] - 7, dh[1] + 3]], C.wood, { a: 0.9, spread: 0.5, mottle: false }); g.line([[dh[0] - 5, dh[1] - 4], [dh[0] - 13 - earF * 4, dh[1] - 6 + earF * 9], [dh[0] - 6, dh[1] + 3]], { w: 1, step: 99 });
      g.washEll(dh[0] + 2, dh[1] - 2, 3.2, 3, C.wood, { a: 0.8, mottle: false });
      g.dot(dh[0] + 2.4, dh[1] - 1.6, 1); g.paintEll(dh[0] + 8.5, dh[1] + 1.4, 3.6, 2.8, C.white, { a: 0.2, mottle: false }); g.ell(dh[0] + 8.5, dh[1] + 1.4, 3.6, 2.8, { w: 1 }); g.dot(dh[0] + 11.6, dh[1] + 0.4, 1.3);
      g.wash([[dh[0] + 6, dh[1] + 4], [dh[0] + 9, dh[1] + 4], [dh[0] + 8, dh[1] + 9 + Math.sin(this.ear * 2)]], C.rose, { a: 0.95, spread: 0.3, mottle: false });
      g.paint(bk, C.straw, { a: 0.8 }); g.poly(bk, { w: 1.3 });
      for (let i = 1; i < 4; i++) g.seg(31 + i * 0.6, -84 + i * 5, 53 - i * 0.6, -84 + i * 5, { w: 0.6, a: 0.6, dbl: false, over: 0 });
      for (let i = 1; i < 5; i++) g.seg(30 + i * 4.8, -84, 32 + i * 4.2, -64, { w: 0.6, a: 0.6, dbl: false, over: 0 });
      // near leg
      const [knN, anN] = leg(th, false);
      // Skirt: the convex outline around waist, saddle, both knees and both upper calves. Because it is
      // built from the legs themselves it always encloses them, so the calves emerge from under the hem
      // wherever the pedals are.
      const mid = (a, b2, u) => [A.lerp(a[0], b2[0], u), A.lerp(a[1], b2[1], u)], cN = mid(knN, anN, 0.36), cF = mid(knF, anF, 0.36);
      const sk = hull([[-21, -73], [-8, -77], [-26, -54], [knN[0] + 6, knN[1] - 5], [knF[0] + 6, knF[1] - 5], [knN[0] + 7, knN[1] + 3], [knF[0] + 7, knF[1] + 3],
        [cN[0] + 6, cN[1] + 3], [cN[0] - 5, cN[1] + 4], [cF[0] + 6, cF[1] + 3], [cF[0] - 5, cF[1] + 4]]);
      g.wash(sk, C.red, { under: true, a: 0.85, spread: 1, step: 99, mottle: false }); g.line(sk, { closed: true, w: 1.4, step: 99, wob: 0.6 });
      // folds running from the waist over each knee to the hem
      g.line([[-10, -72], [knN[0] - 1, knN[1] + 2], [cN[0], cN[1] + 1]], { w: 0.8, a: 0.5, dbl: false });
      g.line([[-15, -70], [knF[0] - 4, knF[1] + 3], [cF[0] - 2, cF[1] + 1]], { w: 0.7, a: 0.38, dbl: false });
      g.line([[-19, -68], [-22, -56]], { w: 0.7, a: 0.4, dbl: false });
      // blouse
      const bl = [[-20, -72], [-8, -77], [9, -98], [0, -106], [-11, -99]];
      g.paint(bl, C.cream, { a: 0.5, step: 99 }); g.line(bl, { closed: true, w: 1.4, step: 99, wob: 0.7 });
      g.washRect(-19, -78, 12, 5, C.prussian, { a: 0.85, spread: 0.4, mottle: false });       // sash
      for (let i = 0; i < 3; i++) g.dot(-3 + i * 3.6, -82 - i * 5.2, 0.85);                    // buttons
      g.scribble(5, -95, 2.6, 3.6, 6, { w: 0.6, a: 0.55 });                                    // lace at the throat
      g.line([[-14, -76], [-8, -90], [-9, -98]], { w: 0.6, a: 0.4, dbl: false });
      // kite arm raised toward the kite, near arm on the bar
      const k = this.kite, kl = [(k.x - this.sx) / RS, (k.y - this.y) / RS], kd = Math.hypot(kl[0] - sh[0], kl[1] - sh[1]) || 1;
      const hand = [sh[0] + (kl[0] - sh[0]) / kd * 24 - 4, sh[1] + (kl[1] - sh[1]) / kd * 24];
      const arm = (to, dir) => {
        const el = ik(sh, to, 14, 14, dir), fx = to[0] - el[0], fy = to[1] - el[1], fd = Math.hypot(fx, fy) || 1, cx = to[0] - fx / fd * 3, cy = to[1] - fy / fd * 3;
        g.limb([sh, el, [cx, cy]], [5, 3.3, 2.2], C.cream, { a: 0.5 });
        g.line([[cx + fy / fd * 2.6, cy - fx / fd * 2.6], [cx - fy / fd * 2.6, cy + fx / fd * 2.6]], { w: 1.8, c: C.prussian, dbl: false, wob: 0.2 });      // cuff
        g.paintEll(to[0], to[1], 2.7, 2.7, C.skin, { a: 0.8, mottle: false }); g.ell(to[0], to[1], 2.7, 2.7, { w: 0.9, dbl: false });
      };
      arm(hand, 1);
      this.hand = this.toScreen(hand[0], hand[1]);
      arm(GR, -1);
      g.paintEll(sh[0] - 1, sh[1] + 3, 6.5, 7, C.cream, { a: 0.5 }); g.ell(sh[0] - 1, sh[1] + 3, 6.5, 7, { w: 1.2 });
      // head, hair, boater
      g.line([[3, -103], [6, -106]], { w: 3.4, c: C.skin, dbl: false });
      g.paintEll(hd[0] - 6, hd[1] + 1, 7, 7.5, C.brick, { a: 0.85 }); g.ell(hd[0] - 6, hd[1] + 1, 7, 7.5, { w: 1.1 });
      g.paintEll(hd[0], hd[1], 8, 8.6, C.skin, { a: 0.6 }); g.ell(hd[0], hd[1], 8, 8.6, { w: 1.3 });
      g.wash(A.arcPts(hd[0] - 1, hd[1] - 3, 8.4, 7, Math.PI * 0.95, Math.PI * 1.9, 7), C.brick, { a: 0.85, spread: 0.5, step: 99, mottle: false });
      // face: a bright eye that blinks, brow, nose, smile, rosy cheek
      const ex = hd[0] + 3.6, ey = hd[1] - 1.2;
      if ((t % 4.3) > 4.15) g.line([[ex - 2, ey], [ex + 2, ey + 0.3]], { w: 1.1, dbl: false, wob: 0.2 });
      else {
        g.paintEll(ex, ey, 2.1, 2.5, '#ffffff', { a: 1, mottle: false, edge: false, spread: 0.2 }); g.ell(ex, ey, 2.1, 2.5, { w: 0.8, dbl: false, wob: 0.25 }); g.dot(ex + 0.7, ey + 0.2, 1.25);
        g.line([[ex - 1.6, ey - 2.4], [ex + 1.2, ey - 3], [ex + 3, ey - 2.2]], { w: 0.8, dbl: false, wob: 0.2 });
      }
      g.line([[ex - 2.4, ey - 4.8], [ex + 2.6, ey - 5.6]], { w: 1, dbl: false, wob: 0.3, c: C.brick });
      g.line([[hd[0] + 7.6, hd[1] - 0.4], [hd[0] + 10, hd[1] + 2.2], [hd[0] + 7.6, hd[1] + 3]], { w: 1, dbl: false, wob: 0.3 });
      g.arc(hd[0] + 4.6, hd[1] + 3.4, 3.2, 2.6, 0.15, 2.5, { w: 1.1 }); g.wash(A.arcPts(hd[0] + 5, hd[1] + 4.7, 1.8, 1.1, 0, TAU, 5), C.red, { a: 0.7, spread: 0.2, edge: false, mottle: false });
      g.washEll(hd[0] + 1.6, hd[1] + 2.6, 2.8, 2, C.red, { a: 0.4, edge: false, mottle: false, spread: 0.4 });
      g.arc(hd[0] - 3.4, hd[1] + 0.6, 1.6, 2.4, 1.3, 4.9, { w: 0.8, dbl: false });
      const hb = [[hd[0] - 9, hd[1] - 15], [hd[0] + 6, hd[1] - 17], [hd[0] + 7, hd[1] - 10], [hd[0] - 8, hd[1] - 8]];
      g.paint(hb, C.straw, { a: 0.85 }); g.poly(hb, { w: 1.2 });
      g.wash([[hd[0] - 8.5, hd[1] - 11.5], [hd[0] + 6.8, hd[1] - 13.5], [hd[0] + 7, hd[1] - 10], [hd[0] - 8, hd[1] - 8]], C.prussian, { a: 0.9, spread: 0.3, mottle: false });
      g.line([[hd[0] - 15, hd[1] - 6.5], [hd[0] + 14, hd[1] - 10.5]], { w: 2.4, wob: 0.4 });
      for (const q of [0, 1]) g.line(A.quadPts([hd[0] - 8, hd[1] - 10], [hd[0] - 17, hd[1] - 9 + q * 4 + Math.sin(t * 9 + q) * 2], [hd[0] - 25, hd[1] - 5 + q * 5 + Math.sin(t * 11 + q * 2) * 3], 5), { w: 2, c: C.prussian, dbl: false, wob: 0.3 });   // hat ribbons
      c.restore();
      // scarf: anchored at the neck, streaming behind
      const nk = this.toScreen(1, -103);
      this.ribbon(this.scarf, nk[0], nk[1], 11.5, 1 / 60, -360 - this.speed, 120, t, 90);
      const sp = this.scarf.map(n => [n.x, n.y]);
      const band = [...sp.map((p, i) => [p[0], p[1] - 4.2 + i * 0.4]), ...sp.slice().reverse().map((p, i) => [p[0], p[1] + 4.2 - (5 - i) * 0.4])];
      g.wash(band, C.ochre, { a: 0.9, spread: 0.6, step: 99, mottle: false }); g.line(band, { closed: true, w: 1, step: 99, wob: 0.5, dbl: false });
      for (let i = 1; i < 5; i += 2) g.wash([[sp[i][0], sp[i][1] - 3.8], [sp[i + 1][0], sp[i + 1][1] - 3.8], [sp[i + 1][0], sp[i + 1][1] + 3.8], [sp[i][0], sp[i][1] + 3.8]], C.red, { a: 0.85, spread: 0.3, step: 99, mottle: false, edge: false });
      c.globalAlpha = 1;
    },

    drawKite(g, G) {
      const c = g.c, b = A.W.boil, k = this.kite, t = A.W.t;
      g.seed(b * 67 + 21, 21);
      // string with a little slack
      if (!k.gone) {
        const hx = this.hand[0], hy = this.hand[1], d = Math.hypot(k.x - hx, k.y - hy), sag = Math.max(8, (STRING - d) * 0.22);
        g.line(A.quadPts([hx, hy], [(hx + k.x) / 2 - 10, (hy + k.y) / 2 + sag], [k.x, k.y + 4], 14), { w: 0.9, a: 0.75, wob: 0.5, step: 99, dbl: false });
      }
      // tail with its bows — one bow per life
      const tp = this.tail.map(n => [n.x, n.y]);
      g.line(tp, { w: 1.1, step: 99, wob: 0.5 });
      const bc = [C.red, C.cerulean, C.ochre, C.leaf];
      for (let i = 0; i < 4; i++) {
        if (i >= G.bows) continue;
        const n = tp[2 + i * 2], m = tp[3 + i * 2], a = Math.atan2(m[1] - n[1], m[0] - n[0]) + Math.PI / 2;
        this.bow(g, n[0], n[1], a, bc[i], 1);
      }
      c.save(); c.translate(k.x, k.y); c.rotate(k.ang);
      if (this.inv > 0 && Math.floor(t * 14) % 2 === 0 && !k.gone) c.globalAlpha = 0.5;
      const flex = Math.sin(t * 7) * 1.2, T = [0, -36], Rr = [23 + flex, -8], Bt = [0, 36], L = [-23 - flex, -8], M = [0, -8];
      g.paint([T, Rr, M], C.ochre, { a: 0.9, spread: 0.8 }); g.paint([T, M, L], C.red, { a: 0.9, spread: 0.8 });
      g.paint([M, Rr, Bt], C.cerulean, { a: 0.85, spread: 0.8 }); g.paint([L, M, Bt], C.cream, { a: 0.6, spread: 0.8 });
      g.poly([T, Rr, Bt, L], { w: 1.7 }); g.seg(T[0], T[1], Bt[0], Bt[1], { w: 1.1 }); g.seg(L[0], L[1], Rr[0], Rr[1], { w: 1.1 });
      // a small sun stencilled on the kite
      g.ell(0, -8, 5, 5, { w: 1 }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.seg(Math.cos(a) * 7, -8 + Math.sin(a) * 7, Math.cos(a) * 10, -8 + Math.sin(a) * 10, { w: 0.8, over: 0, dbl: false }); }
      c.restore(); c.globalAlpha = 1;
    },
    bow(g, x, y, a, col, s) {
      const ca = Math.cos(a), sa = Math.sin(a), q = (lx, ly) => [x + (lx * ca - ly * sa) * s, y + (lx * sa + ly * ca) * s];
      for (const d of [-1, 1]) { const tri = [q(0, 0), q(d * 10, -6), q(d * 10, 6)]; g.wash(tri, col, { a: 0.95, spread: 0.5, mottle: false, step: 99 }); g.line(tri, { closed: true, w: 1, step: 99, dbl: false, wob: 0.5 }); }
      g.dot(x, y, 1.8 * s);
    },
  };
})();
