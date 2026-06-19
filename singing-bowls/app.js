"use strict";
/* Singing Bowls — live modal synthesis + canvas visuals. No libraries. */

/* ============================================================= *
 *  MATERIAL & SCALE DATA
 *  Partials are inharmonic (bell-like flexural modes). Each is
 *  {r: freq ratio to fundamental, g: relative gain, d: decay seconds}.
 *  Higher modes are quieter and decay faster. `beat` is the relative
 *  frequency split between each mode's two voices (the shimmer).
 * ============================================================= */
const MATERIALS = {
  metal: {
    label: "Himalayan metal",
    partials: [
      { r: 1.00, g: 1.00, d: 22 },
      { r: 2.71, g: 0.55, d: 13 },
      { r: 5.18, g: 0.30, d: 7.5 },
      { r: 8.69, g: 0.17, d: 4.5 },
      { r: 13.0, g: 0.09, d: 2.8 },
      { r: 18.2, g: 0.045, d: 1.8 },
    ],
    beat: 0.004,        // ~2 Hz shimmer on the fundamental
    noise: 0.16,        // stick-slip texture amount
    noiseLP: 2400,      // friction noise colour
    tilt: 7000,         // body low-pass
    rubAttack: 1.1,     // seconds to swell in fully
    body: {
      base: "#caa05a", deep: "#3a2a14", rim: "#ffe7a8",
      spec: "#fff6df", inner: "#241a0e", translucent: 0,
    },
  },
  crystal: {
    label: "Crystal / quartz",
    partials: [
      { r: 1.00, g: 1.00, d: 40 },
      { r: 2.76, g: 0.22, d: 16 },
      { r: 5.40, g: 0.07, d: 7 },
    ],
    beat: 0.0016,
    noise: 0.05,
    noiseLP: 3600,
    tilt: 9000,
    rubAttack: 1.7,
    body: {
      base: "#d7c6f2", deep: "#5a4a86", rim: "#ffffff",
      spec: "#ffffff", inner: "#b6a6e0", translucent: 0.55,
    },
  },
  glass: {
    label: "Glass",
    partials: [
      { r: 1.00, g: 1.00, d: 11 },
      { r: 2.71, g: 0.42, d: 6 },
      { r: 5.12, g: 0.18, d: 3 },
      { r: 8.40, g: 0.07, d: 1.6 },
    ],
    beat: 0.006,        // faster shimmer
    noise: 0.08,
    noiseLP: 4200,
    tilt: 11000,
    rubAttack: 0.8,
    body: {
      base: "#a7e4ef", deep: "#1d4a57", rim: "#ffffff",
      spec: "#ffffff", inner: "#7fc6d6", translucent: 0.62,
    },
  },
  ceramic: {
    label: "Ceramic",
    partials: [
      { r: 1.00, g: 1.00, d: 5.5 },
      { r: 2.42, g: 0.50, d: 3 },
      { r: 4.12, g: 0.28, d: 1.8 },
      { r: 6.55, g: 0.14, d: 1.0 },
      { r: 9.10, g: 0.06, d: 0.6 },
    ],
    beat: 0.003,
    noise: 0.20,
    noiseLP: 1800,
    tilt: 4200,
    rubAttack: 0.6,
    body: {
      base: "#dcae8a", deep: "#4a2f1e", rim: "#ffe9d4",
      spec: "#fff2e3", inner: "#7a513a", translucent: 0,
    },
  },
};

// Seven bowls, C major diatonic, C4..B4. Lowest = biggest = leftmost.
const SCALE = [
  { name: "C", freq: 261.63 },
  { name: "D", freq: 293.66 },
  { name: "E", freq: 329.63 },
  { name: "F", freq: 349.23 },
  { name: "G", freq: 392.00 },
  { name: "A", freq: 440.00 },
  { name: "B", freq: 493.88 },
];

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============================================================= *
 *  AUDIO ENGINE
 * ============================================================= */
let audio = null;

class AudioEngine {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    // master chain: [voices] -> dry + reverb -> compressor -> volume -> out
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 28;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;

    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.82;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.34;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(3.6, 2.6);

    this.dry.connect(this.comp);
    this.reverb.connect(this.wet);
    this.wet.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    // shared white-noise buffer for stick-slip friction
    this.noiseBuffer = this._makeNoise(2.0);
  }

  busConnect(node) {
    node.connect(this.dry);
    node.connect(this.reverb);
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // soft, smooth tail with a touch of early diffusion
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }
}

/* One playable bowl: a bank of detuned oscillator pairs + friction noise. */
class BowlVoice {
  constructor(engine, materialKey, freq) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.freq = freq;
    this.level = 0;        // visual loudness estimate (0..1+)
    this._rubTarget = 0;   // current rub intensity
    this._lastNoise = 0;
    this.build(materialKey);
  }

  build(materialKey, freq) {
    if (freq) this.freq = freq;
    if (this.out) this.dispose();
    const ctx = this.ctx;
    const m = MATERIALS[materialKey];
    this.mat = m;

    this.out = ctx.createGain();
    this.out.gain.value = 0.85;

    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = m.tilt;
    this.tone.Q.value = 0.3;
    this.tone.connect(this.out);
    this.engine.busConnect(this.out);

    // modal partials, each split into two detuned voices for beating
    this.partials = m.partials.map((p, i) => {
      const env = ctx.createGain();
      env.gain.value = 0;
      env.connect(this.tone);

      const f = this.freq * p.r;
      const split = f * m.beat * (1 + i * 0.15); // higher modes beat a bit wider
      const oscs = [];
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f + (k === 0 ? -split / 2 : split / 2);
        o.connect(env);
        o.start();
        oscs.push(o);
      }
      return { env, oscs, def: p };
    });

    // stick-slip friction layer (only audible while rubbing)
    this.noise = ctx.createBufferSource();
    this.noise.buffer = this.engine.noiseBuffer;
    this.noise.loop = true;
    this.noiseFilt = ctx.createBiquadFilter();
    this.noiseFilt.type = "bandpass";
    this.noiseFilt.frequency.value = m.noiseLP;
    this.noiseFilt.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilt);
    this.noiseFilt.connect(this.noiseGain);
    this.noiseGain.connect(this.tone);
    this.noise.start();
  }

  dispose() {
    try {
      this.partials.forEach((p) => p.oscs.forEach((o) => { o.stop(); o.disconnect(); }));
      this.noise.stop(); this.noise.disconnect();
      this.noiseFilt.disconnect(); this.noiseGain.disconnect();
      this.tone.disconnect(); this.out.disconnect();
    } catch (e) { /* already gone */ }
  }

  // sustained rubbing — drive fundamental + low partials, swell with intensity
  rub(intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this._rubTarget = intensity;
    const m = this.mat;
    const atk = m.rubAttack;

    this.partials.forEach((p, i) => {
      // rubbing locks onto the lowest mode; upper modes barely sound
      const weight = i === 0 ? 1 : i === 1 ? 0.34 : i === 2 ? 0.10 : 0.03;
      const target = intensity * p.def.g * weight * 0.5;
      p.env.gain.setTargetAtTime(target, t, atk * 0.4);
    });

    const nz = intensity * m.noise * 0.5;
    this.noiseGain.gain.setTargetAtTime(nz, t, 0.08);
    // sweep the friction colour up a touch as you push harder
    this.noiseFilt.frequency.setTargetAtTime(m.noiseLP * (0.7 + intensity * 0.8), t, 0.1);
  }

  // released the rim — let it ring out naturally
  endRub() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this._rubTarget = 0;
    this.partials.forEach((p, i) => {
      const d = p.def.d;
      // sustained energy keeps ringing; release roughly on the modal decay
      p.env.gain.setTargetAtTime(0, t, Math.max(0.6, d * 0.22));
    });
    this.noiseGain.gain.setTargetAtTime(0, t, 0.18);
  }

  // a strike — excite every mode at once, sharp attack then modal decay
  strike(level, bright) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.partials.forEach((p, i) => {
      const def = p.def;
      // bright (flick) tilts energy toward upper partials and shortens decay
      const tilt = bright ? Math.pow(i + 1, 0.5) : 1;
      const peak = level * def.g * tilt * (bright ? 0.55 : 0.7);
      const dec = def.d * (bright ? 0.45 : 1);
      const g = p.env.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(peak, t + (bright ? 0.002 : 0.004));
      g.setTargetAtTime(0, t + 0.01, dec * 0.32);
    });

    // contact transient: a short filtered-noise tick
    const tick = ctx.createBufferSource();
    tick.buffer = this.engine.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = bright ? 5200 : 2600;
    bp.Q.value = 0.8;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    tick.connect(bp); bp.connect(tg); this.engine.busConnect(tg);
    const tl = level * (bright ? 0.18 : 0.12);
    tg.gain.setValueAtTime(tl, t);
    tg.gain.exponentialRampToValueAtTime(0.0006, t + (bright ? 0.06 : 0.11));
    tick.start(t);
    tick.stop(t + 0.2);
    tick.onended = () => { tick.disconnect(); bp.disconnect(); tg.disconnect(); };

    this.level = Math.min(1.4, this.level + level * (bright ? 0.8 : 1.0));
  }
}

/* ============================================================= *
 *  VISUAL MODEL
 * ============================================================= */
const canvas = document.getElementById("stage");
const ctx2d = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;

let currentMaterial = "metal";
let octave = 0;       // semitone-octave offset applied to the whole set
const OCT_MIN = -3, OCT_MAX = 1;
const bowls = [];     // {note, baseFreq, freq, voice, cx, cy, rx, ry, depth, level, phase, particles[], trail[]}

function layout() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
  positionBowls();
}

function positionBowls() {
  if (!bowls.length) return;
  const n = bowls.length;
  const margin = Math.min(W * 0.06, 70);
  const usable = W - margin * 2;
  const slot = usable / n;

  // radius scales inversely with pitch (bigger bowl = lower note)
  const baseR = Math.min(slot * 0.46, H * 0.13, 130);

  const cy = H * 0.56;
  const arc = Math.min(H * 0.05, 46); // gentle downward arc toward the ends

  bowls.forEach((b, i) => {
    const t = i / (n - 1);
    const sizeScale = 0.62 + 0.38 * (1 - i / (n - 1)); // 1.0 lowest (left) -> 0.62 highest
    b.rx = baseR * sizeScale;
    b.ry = b.rx * 0.34;          // perspective flatten
    b.depth = b.rx * 1.15;
    b.cx = margin + slot * (i + 0.5);
    const a = (t - 0.5) * 2;     // -1..1
    b.cy = cy - b.depth * 0.5 + a * a * arc;
  });
}

function buildBowls() {
  bowls.length = 0;
  const mult = Math.pow(2, octave);
  SCALE.forEach((s) => {
    const freq = s.freq * mult;
    const voice = audio ? new BowlVoice(audio, currentMaterial, freq) : null;
    bowls.push({
      note: s.name, baseFreq: s.freq, freq, voice,
      cx: 0, cy: 0, rx: 0, ry: 0, depth: 0,
      level: 0, phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      particles: [], trail: [],
    });
  });
  positionBowls();
}

function setMaterial(key) {
  currentMaterial = key;
  document.querySelectorAll(".swatch").forEach((s) =>
    s.classList.toggle("active", s.dataset.material === key));
  if (audio) bowls.forEach((b) => b.voice.build(key));
}

function setOctave(delta) {
  const next = Math.max(OCT_MIN, Math.min(OCT_MAX, octave + delta));
  if (next === octave) return;
  octave = next;
  const mult = Math.pow(2, octave);
  bowls.forEach((b) => {
    b.freq = b.baseFreq * mult;
    if (audio) b.voice.build(currentMaterial, b.freq);
  });
  updateOctaveUI();
}

function updateOctaveUI() {
  document.getElementById("oct-readout").textContent = "C" + (4 + octave);
  document.getElementById("oct-down").disabled = octave <= OCT_MIN;
  document.getElementById("oct-up").disabled = octave >= OCT_MAX;
}

/* ---------- drawing ---------- */
function lerp(a, b, t) { return a + (b - a) * t; }

function drawBowl(b, time) {
  const mat = MATERIALS[currentMaterial];
  const body = mat.body;
  const { cx, cy, rx, ry, depth } = b;
  const lvl = b.level;

  // ---- contact shadow ----
  ctx2d.save();
  ctx2d.globalAlpha = 0.5;
  const sh = ctx2d.createRadialGradient(cx, cy + depth + ry * 0.6, 1, cx, cy + depth + ry * 0.6, rx * 1.3);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx2d.fillStyle = sh;
  ctx2d.beginPath();
  ctx2d.ellipse(cx, cy + depth + ry * 0.55, rx * 1.25, ry * 0.85, 0, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();

  // ---- bowl body (a rounded vessel below the rim) ----
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.moveTo(cx - rx, cy);
  // outer walls curving to a rounded base
  ctx2d.bezierCurveTo(cx - rx, cy + depth * 0.7, cx - rx * 0.55, cy + depth, cx, cy + depth);
  ctx2d.bezierCurveTo(cx + rx * 0.55, cy + depth, cx + rx, cy + depth * 0.7, cx + rx, cy);
  // front rim curve back to start
  ctx2d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, true);
  ctx2d.closePath();

  const bodyGrad = ctx2d.createLinearGradient(cx - rx, cy, cx + rx, cy + depth);
  bodyGrad.addColorStop(0, shade(body.deep, 0.7));
  bodyGrad.addColorStop(0.32, body.base);
  bodyGrad.addColorStop(0.55, shade(body.base, 1.12));
  bodyGrad.addColorStop(0.8, body.deep);
  bodyGrad.addColorStop(1, shade(body.deep, 0.7));
  ctx2d.fillStyle = bodyGrad;
  if (body.translucent) ctx2d.globalAlpha = 1 - body.translucent * 0.35;
  ctx2d.fill();

  // vertical sheen band
  ctx2d.globalAlpha = (body.translucent ? 0.5 : 0.32);
  const sheen = ctx2d.createLinearGradient(cx - rx, 0, cx + rx, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0.0)");
  sheen.addColorStop(0.5, hexA(body.spec, 0.5));
  sheen.addColorStop(0.58, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx2d.fillStyle = sheen;
  ctx2d.fill();
  ctx2d.restore();

  // ---- inner opening (top ellipse) ----
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const inner = ctx2d.createRadialGradient(cx, cy - ry * 0.2, ry * 0.1, cx, cy, rx);
  inner.addColorStop(0, shade(body.inner, 1.25));
  inner.addColorStop(0.7, body.inner);
  inner.addColorStop(1, shade(body.inner, 0.6));
  ctx2d.fillStyle = inner;
  ctx2d.fill();

  // ---- standing-wave ripples inside (audio reactive) ----
  ctx2d.clip();
  if (lvl > 0.002) {
    b.rot += 0.004 + lvl * 0.02;
    const rings = 5;
    const beatPhase = time * 0.0016 * (1 + mat.beat * 60);
    for (let i = rings; i >= 1; i--) {
      const baseScale = i / rings;
      const wob = Math.sin(beatPhase + i * 0.9) * 0.06 * lvl;
      const a2 = 2 + Math.floor(lvl * 2);          // nodal-diameter mode shape
      const grow = (Math.sin(time * 0.002 + i) * 0.5 + 0.5) * 0.04 * lvl;
      ctx2d.beginPath();
      for (let s = 0; s <= 40; s++) {
        const ang = (s / 40) * Math.PI * 2;
        const modeR = 1 + Math.cos(a2 * (ang + b.rot)) * (0.05 + wob);
        const er = (baseScale + grow) * modeR;
        const px = cx + Math.cos(ang) * rx * er;
        const py = cy + Math.sin(ang) * ry * er;
        if (s === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
      }
      ctx2d.closePath();
      const alpha = Math.min(0.5, lvl * 0.6) * (1 - baseScale * 0.5);
      ctx2d.strokeStyle = hexA(body.rim, alpha);
      ctx2d.lineWidth = 1.1;
      ctx2d.stroke();
    }
    // bright pool reflection at center
    const glow = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, rx * 0.7);
    glow.addColorStop(0, hexA(body.spec, Math.min(0.4, lvl * 0.5)));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx2d.fillStyle = glow;
    ctx2d.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  }
  ctx2d.restore();

  // ---- rim (glows with level) ----
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx2d.lineWidth = Math.max(1.5, rx * 0.025);
  ctx2d.strokeStyle = hexA(body.rim, 0.85);
  ctx2d.shadowColor = hexA(body.rim, 0.9);
  ctx2d.shadowBlur = 6 + lvl * 40;
  ctx2d.stroke();
  // crisp inner edge
  ctx2d.shadowBlur = 0;
  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = hexA(body.spec, 0.5 + lvl * 0.4);
  ctx2d.stroke();
  ctx2d.restore();

  // ---- specular highlight on the front body ----
  ctx2d.save();
  ctx2d.globalAlpha = 0.5;
  ctx2d.beginPath();
  ctx2d.ellipse(cx - rx * 0.42, cy + depth * 0.34, rx * 0.16, depth * 0.3, -0.35, 0, Math.PI * 2);
  const hl = ctx2d.createRadialGradient(cx - rx * 0.42, cy + depth * 0.3, 0, cx - rx * 0.42, cy + depth * 0.34, rx * 0.3);
  hl.addColorStop(0, hexA(body.spec, 0.5));
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx2d.fillStyle = hl;
  ctx2d.fill();
  ctx2d.restore();

  // ---- note label ----
  ctx2d.save();
  ctx2d.globalAlpha = 0.35 + lvl * 0.5;
  ctx2d.fillStyle = hexA(body.rim, 0.9);
  ctx2d.font = `600 ${Math.max(11, rx * 0.2)}px -apple-system, system-ui, sans-serif`;
  ctx2d.textAlign = "center";
  ctx2d.fillText(b.note, cx, cy + depth + ry * 1.6);
  ctx2d.restore();

  drawParticles(b, body);
  drawTrail(b, body);
}

function drawParticles(b, body) {
  const mat = MATERIALS[currentMaterial];
  // spawn while singing
  if (b.level > 0.12 && !reduceMotion && Math.random() < b.level * 0.6) {
    const ang = Math.random() * Math.PI * 2;
    b.particles.push({
      x: b.cx + Math.cos(ang) * b.rx * 0.9,
      y: b.cy + Math.sin(ang) * b.ry * 0.9,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.4 - Math.random() * 0.9 - b.level,
      life: 1, r: 1 + Math.random() * 2,
    });
  }
  for (let i = b.particles.length - 1; i >= 0; i--) {
    const p = b.particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.004; p.life -= 0.012;
    if (p.life <= 0) { b.particles.splice(i, 1); continue; }
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx2d.fillStyle = hexA(body.spec, p.life * 0.6);
    ctx2d.shadowColor = hexA(body.rim, p.life * 0.8);
    ctx2d.shadowBlur = 8;
    ctx2d.fill();
  }
  ctx2d.shadowBlur = 0;
}

function drawTrail(b, body) {
  if (!b.trail.length) return;
  for (let i = b.trail.length - 1; i >= 0; i--) {
    const t = b.trail[i];
    t.life -= 0.04;
    if (t.life <= 0) { b.trail.splice(i, 1); continue; }
  }
  ctx2d.save();
  for (let i = 1; i < b.trail.length; i++) {
    const a = b.trail[i - 1], c = b.trail[i];
    ctx2d.beginPath();
    ctx2d.moveTo(a.x, a.y);
    ctx2d.lineTo(c.x, c.y);
    ctx2d.strokeStyle = hexA(body.spec, c.life * 0.5);
    ctx2d.lineWidth = 2.5 * c.life;
    ctx2d.lineCap = "round";
    ctx2d.shadowColor = hexA(body.rim, c.life);
    ctx2d.shadowBlur = 10;
    ctx2d.stroke();
  }
  ctx2d.restore();
  ctx2d.shadowBlur = 0;
}

/* ---------- colour helpers ---------- */
function parseHex(h) {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex, f) {
  const [r, g, b] = parseHex(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function hexA(hex, a) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- background scenes ---------- */
const Scenes = {
  current: "dusk",
  grad: null,
  stars: [],
  blobs: [],

  set(theme) {
    this.current = theme;
    this.grad = null;
    document.querySelectorAll(".scene").forEach((s) =>
      s.classList.toggle("active", s.dataset.scene === theme));
    this.build();
  },

  build() {
    this.grad = null;
    if (this.current === "cosmos") {
      this.stars = [];
      const n = reduceMotion ? 90 : 170;
      for (let i = 0; i < n; i++) {
        this.stars.push({
          x: Math.random(), y: Math.random() * 0.92,
          r: Math.random() * 1.5 + 0.3,
          tw: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random() * 1.1,
          hue: Math.random() < 0.3 ? 220 : 280,
        });
      }
    }
    if (this.current === "aurora") {
      this.blobs = [];
      const hues = [150, 175, 200, 280, 310];
      for (let i = 0; i < 5; i++) {
        this.blobs.push({
          x: (i + 0.5) / 5, hue: hues[i],
          ph: Math.random() * Math.PI * 2,
          w: 0.16 + Math.random() * 0.14,
          sp: 0.6 + Math.random() * 0.8,
        });
      }
    }
  },

  render(time) {
    const t = reduceMotion ? 0 : time;
    switch (this.current) {
      case "aurora": this._aurora(t); break;
      case "ocean":  this._ocean(t); break;
      case "cosmos": this._cosmos(t); break;
      default:       this._dusk(); break;
    }
  },

  _radial(stops) {
    if (!this.grad) {
      this.grad = ctx2d.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
      stops.forEach(([o, c]) => this.grad.addColorStop(o, c));
    }
    ctx2d.fillStyle = this.grad;
    ctx2d.fillRect(0, 0, W, H);
  },

  _dusk() {
    this._radial([[0, "#191430"], [0.55, "#0d0a1c"], [1, "#06050d"]]);
  },

  _aurora(time) {
    this._radial([[0, "#0d1626"], [0.6, "#081019"], [1, "#04070e"]]);
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    for (const b of this.blobs) {
      const x = (b.x + Math.sin(time * 0.00004 * b.sp + b.ph) * 0.08) * W;
      const sway = Math.sin(time * 0.00006 + b.ph) * 0.5 + 0.5;
      const top = H * (0.05 + sway * 0.12);
      const g = ctx2d.createLinearGradient(0, top, 0, H * 0.78);
      g.addColorStop(0, `hsla(${b.hue}, 80%, 60%, 0)`);
      g.addColorStop(0.4, `hsla(${b.hue}, 85%, 58%, 0.10)`);
      g.addColorStop(1, `hsla(${b.hue}, 80%, 55%, 0)`);
      ctx2d.fillStyle = g;
      const w = b.w * W;
      ctx2d.beginPath();
      ctx2d.ellipse(x, H * 0.42, w * 0.5, H * 0.5, 0, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.restore();
  },

  _ocean(time) {
    this._radial([[0, "#10405f"], [0.5, "#0a2438"], [1, "#04101d"]]);
    // slow caustic light bands drifting through the deep
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const y = H * (0.2 + i * 0.2);
      const phase = time * 0.00012 * (1 + i * 0.2) + i;
      ctx2d.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const yy = y + Math.sin(x * 0.006 + phase) * 26 + Math.sin(x * 0.013 + phase * 1.7) * 12;
        if (x === 0) ctx2d.moveTo(x, yy); else ctx2d.lineTo(x, yy);
      }
      ctx2d.strokeStyle = `hsla(190, 70%, 70%, ${0.05 - i * 0.008})`;
      ctx2d.lineWidth = 22;
      ctx2d.stroke();
    }
    ctx2d.restore();
  },

  _cosmos(time) {
    this._radial([[0, "#100a22"], [0.5, "#080614"], [1, "#03030a"]]);
    // faint nebula
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    const neb = ctx2d.createRadialGradient(W * 0.66, H * 0.3, 0, W * 0.66, H * 0.3, Math.max(W, H) * 0.5);
    neb.addColorStop(0, "hsla(275, 70%, 55%, 0.10)");
    neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = neb;
    ctx2d.fillRect(0, 0, W, H);
    // stars
    for (const s of this.stars) {
      const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.001 * s.sp + s.tw));
      ctx2d.beginPath();
      ctx2d.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsla(${s.hue}, 60%, 88%, ${a})`;
      ctx2d.fill();
    }
    ctx2d.restore();
  },
};

function paintBackground(time) {
  Scenes.render(time);

  // faint drifting aura that brightens with total playing activity
  let total = 0;
  bowls.forEach((b) => (total += b.level));
  if (total > 0.05) {
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    const aura = ctx2d.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.5);
    const mat = MATERIALS[currentMaterial];
    aura.addColorStop(0, hexA(mat.body.rim, Math.min(0.08, total * 0.02)));
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = aura;
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.restore();
  }
}

/* ============================================================= *
 *  RENDER LOOP
 * ============================================================= */
function frame(time) {
  paintBackground(time);

  // decay visual levels; rubbing keeps them up via pointer logic
  bowls.forEach((b) => {
    const v = b.voice;
    if (v) {
      const decayRate = v._rubTarget > 0.01 ? 0 : 0.045;
      if (v._rubTarget > 0.01) {
        b.level = lerp(b.level, Math.min(1.2, v._rubTarget * 1.1), 0.08);
      } else {
        b.level *= (1 - decayRate);
        v.level = b.level;
      }
    } else {
      b.level *= 0.95;
    }
    if (b.level < 0.0005) b.level = 0;
  });

  // draw back-to-front isn't needed (single row); draw left to right
  bowls.forEach((b) => drawBowl(b, time));

  updatePointers(time);

  // mallet follows every cursor / active touch point
  cursors.forEach((c) => {
    if (c.x != null) drawMallet(c.x, c.y, !!c.down);
  });

  requestAnimationFrame(frame);
}

/* ============================================================= *
 *  INTERACTION
 * ============================================================= */
const pointers = new Map();
const cursors = new Map();   // pointerId -> {x,y,down,type}: where to draw a mallet
const RUB_MIN = 2.2;     // rad/s before it starts singing
const RUB_MAX = 13;      // rad/s for full intensity

function bowlAt(x, y) {
  let best = null, bestD = Infinity;
  for (const b of bowls) {
    // generous hit region: the opening ellipse + the body below
    const dx = (x - b.cx) / (b.rx * 1.15);
    const dyTop = (y - b.cy) / (b.ry * 1.4);
    const inOpening = dx * dx + dyTop * dyTop <= 1;
    const inBody = x > b.cx - b.rx * 1.1 && x < b.cx + b.rx * 1.1 &&
                   y > b.cy - b.ry && y < b.cy + b.depth + b.ry;
    if (inOpening || inBody) {
      const d = Math.hypot(x - b.cx, y - b.cy);
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  return best;
}

function onDown(e) {
  if (!audio) return;
  const x = e.clientX, y = e.clientY;
  const b = bowlAt(x, y);
  if (!b) return;
  dismissHint();
  pointers.set(e.pointerId, {
    bowl: b, startX: x, startY: y, startT: performance.now(),
    lastAngle: Math.atan2(y - b.cy, x - b.cx),
    lastX: x, lastY: y, lastMoveT: performance.now(),
    speed: 0, path: 0, hasRubbed: false,
  });
  canvas.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const x = e.clientX, y = e.clientY;
  const now = performance.now();
  const b = p.bowl;

  const dist = Math.hypot(x - p.lastX, y - p.lastY);
  p.path += dist;

  const ang = Math.atan2(y - b.cy, x - b.cx);
  let dA = ang - p.lastAngle;
  while (dA > Math.PI) dA -= Math.PI * 2;
  while (dA < -Math.PI) dA += Math.PI * 2;
  const dt = Math.max(8, now - p.lastMoveT) / 1000;
  const angSpeed = Math.abs(dA) / dt;       // rad/s
  p.speed = lerp(p.speed, angSpeed, 0.35);

  p.lastAngle = ang; p.lastX = x; p.lastY = y; p.lastMoveT = now;

  // engage singing once you're genuinely circling (not a quick flick)
  if (!p.hasRubbed && now - p.startT > 140 && p.speed > RUB_MIN) p.hasRubbed = true;

  if (p.hasRubbed) {
    const inten = Math.max(0, Math.min(1, (p.speed - RUB_MIN) / (RUB_MAX - RUB_MIN)));
    b.voice.rub(0.25 + inten * 0.75);
    // mallet trail along the rim
    b.trail.push({ x, y, life: 1 });
    if (b.trail.length > 26) b.trail.shift();
  }
}

function updatePointers(time) {
  const now = performance.now();
  pointers.forEach((p) => {
    if (p.hasRubbed && now - p.lastMoveT > 90) {
      // finger still down but not circling -> friction fades
      p.speed *= 0.9;
      const inten = Math.max(0, Math.min(1, (p.speed - RUB_MIN) / (RUB_MAX - RUB_MIN)));
      p.bowl.voice.rub(inten * 0.75);
    }
  });
}

// a wooden mallet/striker: leather-wrapped head at (x,y), handle up to the right
function drawMallet(x, y, pressed) {
  const body = MATERIALS[currentMaterial].body;
  const headR = pressed ? 11.5 : 10.5;
  const ang = -0.62;                       // handle direction (up-right)
  const len = 56;
  const hx = x + Math.cos(ang) * len;
  const hy = y + Math.sin(ang) * len;

  ctx2d.save();

  // soft drop shadow for the whole striker
  ctx2d.save();
  ctx2d.shadowColor = "rgba(0,0,0,0.45)";
  ctx2d.shadowBlur = 9;
  ctx2d.shadowOffsetY = 4;

  // handle (tapered wooden dowel)
  const hg = ctx2d.createLinearGradient(x, y, hx, hy);
  hg.addColorStop(0, "#6b4a2a");
  hg.addColorStop(0.5, "#b08350");
  hg.addColorStop(1, "#8a6238");
  ctx2d.strokeStyle = hg;
  ctx2d.lineCap = "round";
  ctx2d.lineWidth = 6;
  ctx2d.beginPath();
  ctx2d.moveTo(x, y);
  ctx2d.lineTo(hx, hy);
  ctx2d.stroke();
  // thin wooden highlight
  ctx2d.shadowBlur = 0; ctx2d.shadowOffsetY = 0;
  ctx2d.strokeStyle = "rgba(255,230,190,0.35)";
  ctx2d.lineWidth = 1.4;
  ctx2d.beginPath();
  ctx2d.moveTo(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6);
  ctx2d.lineTo(hx, hy);
  ctx2d.stroke();
  ctx2d.restore();

  // pressed contact glow, tinted to the bowl's material
  if (pressed) {
    ctx2d.beginPath();
    ctx2d.arc(x, y, headR + 6, 0, Math.PI * 2);
    ctx2d.strokeStyle = hexA(body.rim, 0.55);
    ctx2d.lineWidth = 2;
    ctx2d.shadowColor = hexA(body.rim, 0.9);
    ctx2d.shadowBlur = 16;
    ctx2d.stroke();
    ctx2d.shadowBlur = 0;
  }

  // leather-wrapped head
  const g = ctx2d.createRadialGradient(x - headR * 0.35, y - headR * 0.4, 1, x, y, headR);
  g.addColorStop(0, "#f3e6c8");
  g.addColorStop(0.5, "#cda46e");
  g.addColorStop(1, "#5f4226");
  ctx2d.fillStyle = g;
  ctx2d.beginPath();
  ctx2d.arc(x, y, headR, 0, Math.PI * 2);
  ctx2d.fill();
  // rim shade on the head
  ctx2d.strokeStyle = "rgba(50,32,16,0.5)";
  ctx2d.lineWidth = 1;
  ctx2d.stroke();

  ctx2d.restore();
}

function onUp(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  const b = p.bowl;
  const dur = performance.now() - p.startT;

  if (p.hasRubbed) {
    b.voice.endRub();
  } else if (p.path < 12 && dur < 400) {
    // quick click -> strike
    b.voice.strike(0.9, false);
  } else if (p.path < 160 && dur < 260) {
    // fast swipe across the rim -> bright flick
    b.voice.strike(0.85, true);
  } else {
    // a slow drag that never built into a rub -> soft strike
    b.voice.strike(0.6, false);
  }
}

canvas.addEventListener("pointerdown", onDown);
canvas.addEventListener("pointermove", onMove);
canvas.addEventListener("pointerup", onUp);
canvas.addEventListener("pointercancel", onUp);

// track every pointer (even hovering, no button) so the mallet follows it
function setCursor(e, down) {
  let c = cursors.get(e.pointerId);
  if (!c) { c = { type: e.pointerType }; cursors.set(e.pointerId, c); }
  c.x = e.clientX; c.y = e.clientY; c.type = e.pointerType;
  if (down !== undefined) c.down = down;
}
canvas.addEventListener("pointermove", (e) => setCursor(e));
canvas.addEventListener("pointerdown", (e) => setCursor(e, true));
canvas.addEventListener("pointerup", (e) => {
  const c = cursors.get(e.pointerId);
  if (!c) return;
  c.down = false;
  if (e.pointerType !== "mouse") cursors.delete(e.pointerId); // touch lifts away
});
canvas.addEventListener("pointercancel", (e) => cursors.delete(e.pointerId));
canvas.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse") cursors.delete(e.pointerId);
});

/* ============================================================= *
 *  UI WIRING + BOOT
 * ============================================================= */
function dismissHint() {
  const h = document.getElementById("hint");
  if (h) h.classList.add("gone");
}

document.getElementById("materials").addEventListener("click", (e) => {
  const btn = e.target.closest(".swatch");
  if (btn) setMaterial(btn.dataset.material);
});

document.getElementById("volume").addEventListener("input", (e) => {
  if (audio) audio.master.gain.value = parseFloat(e.target.value);
});

document.getElementById("oct-down").addEventListener("click", () => setOctave(-1));
document.getElementById("oct-up").addEventListener("click", () => setOctave(1));

document.getElementById("scenes").addEventListener("click", (e) => {
  const btn = e.target.closest(".scene");
  if (btn) Scenes.set(btn.dataset.scene);
});

const helpPanel = document.getElementById("help");
document.getElementById("help-btn").addEventListener("click", () => helpPanel.hidden = false);
document.getElementById("help-close").addEventListener("click", () => helpPanel.hidden = true);
helpPanel.addEventListener("click", (e) => { if (e.target === helpPanel) helpPanel.hidden = true; });

window.addEventListener("resize", () => { Scenes.grad = null; layout(); });

// start audio on first gesture (autoplay policy)
const startOverlay = document.getElementById("tap-to-start");
function start() {
  if (audio) return;
  audio = new AudioEngine();
  if (audio.ctx.state === "suspended") audio.ctx.resume();
  audio.master.gain.value = parseFloat(document.getElementById("volume").value);
  bowls.forEach((b) => { b.voice = new BowlVoice(audio, currentMaterial, b.freq); });
  startOverlay.classList.add("gone");
  setTimeout(() => startOverlay.remove(), 800);
}
startOverlay.addEventListener("pointerdown", start);
startOverlay.addEventListener("click", start);

// boot
setMaterial("metal");
Scenes.set("dusk");
updateOctaveUI();
buildBowls();
layout();
requestAnimationFrame(frame);
