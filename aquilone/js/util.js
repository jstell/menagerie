'use strict';
// Shared namespace, math helpers, seeded randomness, palette.
window.A = {};
(() => {
  const A = window.A;
  A.TAU = Math.PI * 2;
  A.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  A.lerp = (a, b, t) => a + (b - a) * t;
  A.smooth = t => { t = A.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // mulberry32 with a few conveniences hung on the function
  A.rng = seed => {
    let s = (seed >>> 0) || 1;
    const f = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.chance = p => f() < p;
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  };

  A.hash = n => {
    n = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B);
    n ^= n >>> 13; n = Math.imul(n, 0xC2B2AE35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  A.noise1 = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return A.lerp(A.hash(i + seed * 7919), A.hash(i + 1 + seed * 7919), u);
  };
  A.fbm = (x, seed = 0, oct = 3) => {
    let v = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { v += A.noise1(x, seed + o * 13) * a; n += a; a *= 0.5; x *= 2.03; }
    return v / n;
  };

  // "#rrggbb" + alpha -> rgba()
  A.rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  A.mix = (h1, h2, t) => {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(A.lerp(a >> 16, b >> 16, t)), g = Math.round(A.lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(A.lerp(a & 255, b & 255, t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  };

  // Colored inks and watercolors of a 1900s sketchbook
  A.C = {
    ink: '#3a281b', inkSoft: '#6b5340', paper: '#ecdcb6',
    red: '#c9472e', rose: '#dc8f8a', pink: '#eab7a8', ochre: '#dba33c', straw: '#e8c979', cream: '#f4e6c3',
    sage: '#9cb06a', olive: '#6f8141', leaf: '#5e8a4e', pine: '#3f6b55', absinthe: '#b5c66d',
    sky: '#8fbcc9', cerulean: '#5f9fb8', teal: '#4d9a93', sea: '#6fb5b3', prussian: '#33536f',
    lavender: '#a99cc2', mauve: '#b78fa6', slate: '#7d8ea0', stone: '#cdbf9f', sand: '#e7cf94',
    terracotta: '#c8744a', brick: '#b3573c', wood: '#9a6a3f', umber: '#6a4a30', skin: '#f1c7a0', white: '#ffffff',
  };

  // point-list helpers (all return arrays of [x,y])
  A.arcPts = (cx, cy, rx, ry, a0, a1, n = 14) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  };
  A.quadPts = (p0, c, p1, n = 10) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); }
    return out;
  };
  A.bezPts = (p0, c1, c2, p1, n = 14) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]]);
    }
    return out;
  };
  A.rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
})();
