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

    // ambience bed bypasses the compressor so bowl strikes never pump it
    this.amb = this.ctx.createGain();
    this.amb.gain.value = 1;
    this.amb.connect(this.master);

    // shared white-noise buffer for stick-slip friction
    this.noiseBuffer = this._makeNoise(2.0);
  }

  // swap the acoustic space (impulse + wet level) to match the scene
  setSpace(spec) {
    this.reverb.buffer = this._makeImpulse(spec.sec, spec.dec);
    this.wet.gain.setTargetAtTime(spec.wet, this.ctx.currentTime, 0.8);
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
 *  SCENE SOUNDSCAPES
 *  Each scene gets a synthesized ambient bed and its own acoustic
 *  space. Beds cross-fade on scene change; a topbar toggle mutes.
 * ============================================================= */
const SCENE_AUDIO = {
  dusk:   { verb: { sec: 3.2, dec: 2.6, wet: 0.30 } },  // intimate evening air
  aurora: { verb: { sec: 4.6, dec: 2.4, wet: 0.36 } },  // open sky
  ocean:  { verb: { sec: 5.5, dec: 2.2, wet: 0.40 } },  // deep water
  cosmos: { verb: { sec: 7.5, dec: 2.0, wet: 0.46 } },  // vast hall
};

const Ambience = {
  enabled: true,
  level: 0.5,          // bed gain inside the ambience bus
  current: null,       // {gain, nodes[], timers[]}

  setScene(key) {
    if (!audio) return;
    this._fadeOut(this.current);
    this.current = this._build(key);
  },

  toggle() {
    this.enabled = !this.enabled;
    document.getElementById("amb-btn")?.classList.toggle("off", !this.enabled);
    if (audio) {
      audio.amb.gain.setTargetAtTime(this.enabled ? 1 : 0, audio.ctx.currentTime, 0.6);
    }
  },

  _fadeOut(layer) {
    if (!layer) return;
    const t = audio.ctx.currentTime;
    layer.gain.gain.setTargetAtTime(0, t, 0.7);
    layer.timers.forEach(clearTimeout);
    setTimeout(() => {
      layer.nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch (e) {} });
      try { layer.gain.disconnect(); } catch (e) {}
    }, 2600);
  },

  _build(key) {
    const ctx = audio.ctx;
    const layer = { gain: ctx.createGain(), nodes: [], timers: [] };
    layer.gain.gain.value = 0;
    layer.gain.connect(audio.amb);
    layer.gain.gain.setTargetAtTime(this.level, ctx.currentTime, 1.4);

    const N = layer.nodes;
    const noiseSrc = () => {
      const n = ctx.createBufferSource();
      n.buffer = audio.noiseBuffer; n.loop = true; n.start();
      N.push(n);
      return n;
    };
    const lfo = (freq, depth, param) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g); g.connect(param); o.start();
      N.push(o, g);
    };

    if (key === "dusk") {
      // warm low wind, slowly breathing
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 240; lp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.14;
      noiseSrc().connect(lp); lp.connect(g); g.connect(layer.gain);
      lfo(0.06, 0.07, g.gain);
      lfo(0.045, 90, lp.frequency);
      N.push(lp, g);

      // two crickets with independent random chirp schedules
      for (let v = 0; v < 2; v++) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 4100 + Math.random() * 600;
        const trem = ctx.createOscillator();
        trem.frequency.value = 26 + Math.random() * 14;
        // tremolo must be its own multiplicative stage: summing it into the
        // envelope param leaves the voice sounding between chirps (a param's
        // inputs add to its scheduled value, so gain never reaches 0)
        const tremStage = ctx.createGain(); tremStage.gain.value = 0.5;
        const tremG = ctx.createGain(); tremG.gain.value = 0.5;
        trem.connect(tremG); tremG.connect(tremStage.gain); // 0..1 flutter
        const am = ctx.createGain(); am.gain.value = 0;      // chirp envelope
        const out = ctx.createGain(); out.gain.value = 0.016;
        osc.connect(am); am.connect(tremStage); tremStage.connect(out); out.connect(layer.gain);
        osc.start(); trem.start();
        N.push(osc, trem, tremG, tremStage, am, out);
        const chirp = () => {
          const t = ctx.currentTime, dur = 0.35 + Math.random() * 0.6;
          am.gain.cancelScheduledValues(t);
          am.gain.setValueAtTime(0, t);
          am.gain.linearRampToValueAtTime(1, t + 0.05);
          am.gain.setValueAtTime(1, t + dur - 0.08);
          am.gain.linearRampToValueAtTime(0, t + dur);
          layer.timers.push(setTimeout(chirp, 900 + Math.random() * 3200));
        };
        layer.timers.push(setTimeout(chirp, 400 + Math.random() * 2000));
      }
    }

    if (key === "aurora") {
      // airy high shimmer
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 5200;
      const hg = ctx.createGain(); hg.gain.value = 0.012;
      noiseSrc().connect(hp); hp.connect(hg); hg.connect(layer.gain);
      lfo(0.05, 0.007, hg.gain);
      N.push(hp, hg);

      // slow breathing pad on high fifths (C–G–D), each with its own cycle
      [1046.5, 1568, 2349.3].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
        const g = ctx.createGain(); g.gain.value = 0.008;
        o.connect(g); g.connect(layer.gain); o.start();
        lfo(0.05 + i * 0.023, 0.007, g.gain);
        N.push(o, g);
      });

      // occasional wind gusts
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 600; bp.Q.value = 0.5;
      const wg = ctx.createGain(); wg.gain.value = 0.02;
      noiseSrc().connect(bp); bp.connect(wg); wg.connect(layer.gain);
      lfo(0.03, 0.018, wg.gain);
      lfo(0.021, 260, bp.frequency);
      N.push(bp, wg);
    }

    if (key === "ocean") {
      // two overlapping wave layers: gain and cutoff ride slow LFOs
      [{ lf: 0.085, base: 420 }, { lf: 0.062, base: 300 }].forEach(({ lf, base }) => {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass"; lp.frequency.value = base; lp.Q.value = 0.6;
        const g = ctx.createGain(); g.gain.value = 0.10;
        noiseSrc().connect(lp); lp.connect(g); g.connect(layer.gain);
        lfo(lf, 0.09, g.gain);
        lfo(lf, base * 0.8, lp.frequency);
        N.push(lp, g);
      });
      // sub rumble
      const sub = ctx.createOscillator();
      sub.type = "sine"; sub.frequency.value = 48;
      const sg = ctx.createGain(); sg.gain.value = 0.03;
      sub.connect(sg); sg.connect(layer.gain); sub.start();
      lfo(0.07, 0.02, sg.gain);
      N.push(sub, sg);
    }

    if (key === "cosmos") {
      // deep detuned drone with a whisper of a fifth
      [[55, 0.045], [55.28, 0.045], [82.41, 0.015]].forEach(([f, amp]) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = amp;
        o.connect(g); g.connect(layer.gain); o.start();
        N.push(o, g);
      });
      // very slow spectral sweep across soft noise
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.014;
      noiseSrc().connect(bp); bp.connect(ng); ng.connect(layer.gain);
      lfo(0.013, 380, bp.frequency);
      lfo(0.019, 0.008, ng.gain);
      N.push(bp, ng);
    }

    return layer;
  },
};

/* ============================================================= *
 *  WOODEN COMPANIONS
 *  One woody-toned instrument per scene, drawn at the lower right.
 *  Wood = a few strongly-damped inharmonic partials + a knock of
 *  filtered noise; `soft` rounds the attack for mellow instruments.
 * ============================================================= */
const WOOD_SPECS = {
  mokugyo: { f: 384, drop: 0.05, amp: 1.7, parts: [
    { r: 1, g: 0.9, d: 0.20 }, { r: 1.83, g: 0.5, d: 0.11 }, { r: 2.66, g: 0.28, d: 0.07 }],
    nz: { f: 1250, q: 1.4, g: 0.5, d: 0.035 } },
  log: { f: 88, drop: 0.045, amp: 1.8, parts: [
    { r: 1, g: 1, d: 1.2 }, { r: 1.62, g: 0.4, d: 0.55 }, { r: 2.43, g: 0.2, d: 0.28 }],
    nz: { f: 320, q: 1, g: 0.5, d: 0.06 } },
};
const chimeSpec = (f) => ({ f, drop: 0.01, parts: [
  { r: 1, g: 0.7, d: 0.5 }, { r: 2.87, g: 0.22, d: 0.16 }],
  nz: { f: f * 2.2, q: 2, g: 0.22, d: 0.02 } });
const tongueSpec = (f) => ({ f, soft: true, drop: 0.015, amp: 1.6, parts: [
  { r: 1, g: 0.9, d: 1.0 }, { r: 2.92, g: 0.18, d: 0.3 }, { r: 4.3, g: 0.06, d: 0.14 }],
  nz: { f: 520, q: 1, g: 0.16, d: 0.045 } });

const CHIME_FREQS = [523.25, 587.33, 659.25, 783.99, 880];
const TONGUE_FREQS = [146.83, 196, 220];

const Wood = {
  key: "dusk",
  x: 0, y: 0, s: 80,     // anchor (center x, floor y) and scale
  anim: 0,               // hit flash 0..1
  tubes: Array.from({ length: 5 }, () => ({ swing: 0, vel: 0 })),
  flash: [0, 0, 0],      // per-tongue flash for the tongue drum

  setScene(key) { this.key = key; this.anim = 0; this.layout(); },

  layout() {
    this.s = Math.max(52, Math.min(Math.min(W, H) * 0.11, 96));
    this.x = W - Math.min(W * 0.06, 70) - this.s * 1.15;
    this.y = H - this.s * 0.55 - 16;
    this.topY = 64 + this.s * 0.2;   // chimes hang from the sky, clear of the bowls
  },

  hitTest(x, y) {
    const s = this.s;
    if (this.key === "aurora") {
      return Math.abs(x - this.x) < s * 0.95 && y > this.topY - s * 0.2 && y < this.topY + s * 2.2;
    }
    return Math.abs(x - this.x) < s * 1.15 && y > this.y - s * 1.4 && y < this.y + s * 0.55;
  },

  play(px, level = 0.9) {
    dismissHint();
    if (this.key === "dusk") {
      this._hit(WOOD_SPECS.mokugyo, level);
      this.anim = 1;
    } else if (this.key === "aurora") {
      this.strumAt(px, level);
    } else if (this.key === "ocean") {
      const i = this._tongueAt(px);
      this._hit(tongueSpec(TONGUE_FREQS[i]), level);
      this.flash[i] = 1;
    } else {
      this._hit(WOOD_SPECS.log, level);
      this.anim = 1;
    }
  },

  // chimes: strike the tube nearest px (used for taps and drag-strums)
  strumAt(px, level = 0.8) {
    const i = this._tubeAt(px);
    this._hit(chimeSpec(CHIME_FREQS[i]), level);
    this.tubes[i].vel += 0.045 + level * 0.03;
    this.anim = Math.max(this.anim, 0.7);
    return i;
  },

  _tubeAt(px) {
    const rel = (px - this.x) / (this.s * 0.32) + 2;
    return Math.max(0, Math.min(4, Math.round(rel)));
  },

  _tongueAt(px) {
    const rel = (px - this.x) / (this.s * 0.62) + 1;
    return Math.max(0, Math.min(2, Math.round(rel)));
  },

  // gentle scene-appropriate punctuation for auto-play
  autoHit() {
    if (!audio) return;
    const lvl = 0.35 + Math.random() * 0.3;
    if (this.key === "dusk") {
      this.play(this.x, lvl);
      if (Math.random() < 0.5) setTimeout(() => this.play(this.x, lvl * 0.8), 170);
    } else if (this.key === "aurora") {
      let n = 2 + Math.floor(Math.random() * 3), t = 0;
      for (let k = 0; k < n; k++) {
        t += 90 + Math.random() * 170;
        setTimeout(() => this.strumAt(this.x + (Math.random() - 0.5) * this.s * 1.6, lvl), t);
      }
    } else if (this.key === "ocean") {
      this.play(this.x + (Math.floor(Math.random() * 3) - 1) * this.s * 0.62, lvl);
    } else {
      this.play(this.x, lvl + 0.1);
    }
  },

  _hit(spec, level) {
    if (!audio) return;
    const ctx = audio.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = spec.amp || 1;
    audio.busConnect(out);
    let maxD = spec.nz.d;
    spec.parts.forEach((p) => {
      maxD = Math.max(maxD, p.d);
      const o = ctx.createOscillator();
      const f = spec.f * p.r;
      o.frequency.setValueAtTime(f * (1 + (spec.drop || 0)), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * p.g * 0.5, t + (spec.soft ? 0.012 : 0.003));
      g.gain.exponentialRampToValueAtTime(0.0004, t + Math.max(0.05, p.d));
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + p.d + 0.1);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    });
    const n = ctx.createBufferSource();
    n.buffer = audio.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = spec.nz.f; bp.Q.value = spec.nz.q;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * spec.nz.g, t);
    ng.gain.exponentialRampToValueAtTime(0.0004, t + spec.nz.d);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t); n.stop(t + spec.nz.d + 0.05);
    n.onended = () => { n.disconnect(); bp.disconnect(); ng.disconnect(); };
    setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (maxD + 0.4) * 1000);
  },

  draw(time) {
    this.anim *= 0.93;
    const { x, y, s } = this;
    ctx2d.save();
    if (this.key === "dusk") this._drawMokugyo(x, y, s);
    else if (this.key === "aurora") this._drawChimes(x, y, s, time);
    else if (this.key === "ocean") this._drawTongueDrum(x, y, s);
    else this._drawLogDrum(x, y, s);
    ctx2d.restore();
  },

  _glow(alpha) {
    if (alpha < 0.02) return;
    ctx2d.shadowColor = `rgba(255,215,150,${alpha})`;
    ctx2d.shadowBlur = 26 * alpha + 8;
  },

  _drawMokugyo(x, y, s) {
    const squash = 1 + this.anim * 0.05;
    // cushion
    let g = ctx2d.createRadialGradient(x, y, 2, x, y, s * 0.85);
    g.addColorStop(0, "#8a6a30"); g.addColorStop(1, "#4a3416");
    ctx2d.fillStyle = g;
    ctx2d.beginPath();
    ctx2d.ellipse(x, y + s * 0.06, s * 0.8, s * 0.24, 0, 0, Math.PI * 2);
    ctx2d.fill();
    // lacquered fish body
    const by = y - s * 0.42;
    this._glow(this.anim);
    g = ctx2d.createRadialGradient(x - s * 0.2, by - s * 0.25, 2, x, by, s * 0.75);
    g.addColorStop(0, "#d96a4a"); g.addColorStop(0.45, "#b03a28"); g.addColorStop(1, "#651c12");
    ctx2d.fillStyle = g;
    ctx2d.beginPath();
    ctx2d.ellipse(x, by, s * 0.62 / squash, s * 0.5 * squash, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    // mouth slit
    ctx2d.strokeStyle = "rgba(30,8,4,0.85)";
    ctx2d.lineWidth = Math.max(2, s * 0.05);
    ctx2d.lineCap = "round";
    ctx2d.beginPath();
    ctx2d.arc(x, by - s * 0.12, s * 0.48, Math.PI * 0.25, Math.PI * 0.75);
    ctx2d.stroke();
    // scale carving swirl
    ctx2d.strokeStyle = "rgba(255,200,170,0.22)";
    ctx2d.lineWidth = 1.4;
    ctx2d.beginPath();
    ctx2d.arc(x + s * 0.18, by - s * 0.1, s * 0.16, 0, Math.PI * 1.5);
    ctx2d.stroke();
    this._label(x, y + s * 0.42, "mokugyo");
  },

  _drawChimes(x, y, s, time) {
    const topY = this.topY;
    // hanging bar
    const bg = ctx2d.createLinearGradient(x - s, topY, x + s, topY);
    bg.addColorStop(0, "#6b4a2a"); bg.addColorStop(0.5, "#a97c48"); bg.addColorStop(1, "#5e4023");
    ctx2d.fillStyle = bg;
    ctx2d.beginPath();
    ctx2d.roundRect(x - s * 0.85, topY - s * 0.07, s * 1.7, s * 0.14, s * 0.07);
    ctx2d.fill();
    // tubes
    for (let i = 0; i < 5; i++) {
      const tu = this.tubes[i];
      // idle sway + hit swing, softly damped
      tu.vel += -tu.swing * 0.02 + Math.sin(time * 0.0006 + i * 1.7) * 0.00012;
      tu.swing += tu.vel;
      tu.vel *= 0.975;
      const px = x + (i - 2) * s * 0.32;
      const len = s * (1.75 - i * 0.16);
      ctx2d.save();
      ctx2d.translate(px, topY + s * 0.07);
      ctx2d.rotate(tu.swing);
      // string
      ctx2d.strokeStyle = "rgba(220,210,190,0.5)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath(); ctx2d.moveTo(0, 0); ctx2d.lineTo(0, s * 0.16); ctx2d.stroke();
      // bamboo tube
      this._glow(Math.min(0.8, Math.abs(tu.vel) * 22));
      const tg = ctx2d.createLinearGradient(-s * 0.07, 0, s * 0.07, 0);
      tg.addColorStop(0, "#8f7a40"); tg.addColorStop(0.4, "#cdb26a"); tg.addColorStop(1, "#7a6636");
      ctx2d.fillStyle = tg;
      ctx2d.beginPath();
      ctx2d.roundRect(-s * 0.065, s * 0.16, s * 0.13, len, s * 0.06);
      ctx2d.fill();
      ctx2d.shadowBlur = 0;
      // node ring
      ctx2d.strokeStyle = "rgba(70,55,20,0.5)";
      ctx2d.lineWidth = 1.2;
      ctx2d.beginPath();
      ctx2d.moveTo(-s * 0.065, s * 0.16 + len * 0.55);
      ctx2d.lineTo(s * 0.065, s * 0.16 + len * 0.55);
      ctx2d.stroke();
      ctx2d.restore();
    }
    this._label(x, topY + s * 2.35, "bamboo chimes");
  },

  _drawTongueDrum(x, y, s) {
    const topY = y - s * 0.62;
    this._glow(this.anim * 0.6);
    // side wall
    const wg = ctx2d.createLinearGradient(x, topY, x, y + s * 0.1);
    wg.addColorStop(0, "#7d6a54"); wg.addColorStop(1, "#453627");
    ctx2d.fillStyle = wg;
    ctx2d.beginPath();
    ctx2d.moveTo(x - s * 0.98, topY);
    ctx2d.lineTo(x - s * 0.98, y - s * 0.1);
    ctx2d.ellipse(x, y - s * 0.1, s * 0.98, s * 0.3, 0, Math.PI, 0, true);
    ctx2d.lineTo(x + s * 0.98, topY);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    // top face
    const tg = ctx2d.createRadialGradient(x - s * 0.3, topY - s * 0.12, 2, x, topY, s * 1.1);
    tg.addColorStop(0, "#a08a6c"); tg.addColorStop(1, "#6b5842");
    ctx2d.fillStyle = tg;
    ctx2d.beginPath();
    ctx2d.ellipse(x, topY, s * 0.98, s * 0.33, 0, 0, Math.PI * 2);
    ctx2d.fill();
    // wood grain
    ctx2d.strokeStyle = "rgba(60,45,30,0.25)";
    ctx2d.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      ctx2d.beginPath();
      ctx2d.ellipse(x, topY, s * (0.3 + k * 0.22), s * (0.1 + k * 0.075), 0, 0, Math.PI * 2);
      ctx2d.stroke();
    }
    // three tongue slots, flashing when struck
    for (let i = 0; i < 3; i++) {
      this.flash[i] *= 0.92;
      const tx = x + (i - 1) * s * 0.62;
      ctx2d.strokeStyle = `rgba(25,16,8,0.9)`;
      ctx2d.lineWidth = Math.max(2, s * 0.04);
      ctx2d.lineCap = "round";
      ctx2d.beginPath();
      ctx2d.moveTo(tx - s * 0.13, topY - s * 0.12);
      ctx2d.quadraticCurveTo(tx, topY + s * 0.16, tx + s * 0.13, topY - s * 0.12);
      ctx2d.stroke();
      if (this.flash[i] > 0.03) {
        ctx2d.strokeStyle = `rgba(255,220,170,${this.flash[i] * 0.8})`;
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();
      }
    }
    this._label(x, y + s * 0.42, "tongue drum");
  },

  _drawLogDrum(x, y, s) {
    const cy = y - s * 0.42;
    this._glow(this.anim);
    // log body
    const lg = ctx2d.createLinearGradient(x, cy - s * 0.3, x, cy + s * 0.3);
    lg.addColorStop(0, "#7a5a38"); lg.addColorStop(0.45, "#5c422a"); lg.addColorStop(1, "#2f2013");
    ctx2d.fillStyle = lg;
    ctx2d.beginPath();
    ctx2d.roundRect(x - s * 1.05, cy - s * 0.3, s * 2.1, s * 0.6, s * 0.3);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    // end grain rings
    const ex = x + s * 0.88;
    const eg = ctx2d.createRadialGradient(ex, cy, 1, ex, cy, s * 0.3);
    eg.addColorStop(0, "#c9a072"); eg.addColorStop(1, "#8a6640");
    ctx2d.fillStyle = eg;
    ctx2d.beginPath();
    ctx2d.ellipse(ex, cy, s * 0.17, s * 0.29, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = "rgba(90,60,30,0.6)";
    ctx2d.lineWidth = 1;
    for (let k = 1; k <= 2; k++) {
      ctx2d.beginPath();
      ctx2d.ellipse(ex, cy, s * 0.06 * k, s * 0.11 * k, 0, 0, Math.PI * 2);
      ctx2d.stroke();
    }
    // slit with end holes
    ctx2d.strokeStyle = "rgba(15,9,4,0.95)";
    ctx2d.lineWidth = Math.max(2.5, s * 0.05);
    ctx2d.lineCap = "round";
    ctx2d.beginPath();
    ctx2d.moveTo(x - s * 0.6, cy - s * 0.14);
    ctx2d.lineTo(x + s * 0.5, cy - s * 0.14);
    ctx2d.stroke();
    ctx2d.fillStyle = "rgba(15,9,4,0.95)";
    for (const hx of [x - s * 0.6, x + s * 0.5]) {
      ctx2d.beginPath();
      ctx2d.arc(hx, cy - s * 0.14, s * 0.055, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // feet
    ctx2d.fillStyle = "#241708";
    ctx2d.beginPath();
    ctx2d.ellipse(x - s * 0.6, y - s * 0.06, s * 0.16, s * 0.07, 0, 0, Math.PI * 2);
    ctx2d.ellipse(x + s * 0.6, y - s * 0.06, s * 0.16, s * 0.07, 0, 0, Math.PI * 2);
    ctx2d.fill();
    this._label(x, y + s * 0.42, "log drum");
  },

  _label(x, y, text) {
    ctx2d.globalAlpha = 0.32;
    ctx2d.fillStyle = "#e8ddc8";
    ctx2d.font = `500 ${Math.max(10, this.s * 0.14)}px -apple-system, system-ui, sans-serif`;
    ctx2d.textAlign = "center";
    ctx2d.fillText(text, x, y);
    ctx2d.globalAlpha = 1;
  },
};

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
const ripples = [];   // expanding "visible sound" rings on the floor

function exciteVisual(b, amt) {
  b.level = Math.min(1.3, b.level + amt);
}

function spawnRipple(b, strength = 1) {
  if (reduceMotion) return;
  const body = MATERIALS[currentMaterial].body;
  ripples.push({
    x: b.cx, y: b.cy,
    r: b.rx * 1.05, ratio: b.ry / b.rx,
    max: b.rx * (2.4 + strength * 1.4),
    speed: (0.9 + strength * 0.9) * (b.rx / 90),
    color: body.rim,
  });
  if (ripples.length > 48) ripples.shift();
}

function drawRipples() {
  if (!ripples.length) return;
  ctx2d.save();
  ctx2d.globalCompositeOperation = "lighter";
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += rp.speed;
    const life = 1 - (rp.r - rp.max * 0.38) / (rp.max * 0.62);
    if (rp.r >= rp.max) { ripples.splice(i, 1); continue; }
    const a = Math.max(0, Math.min(0.4, life * 0.4));
    ctx2d.beginPath();
    ctx2d.ellipse(rp.x, rp.y, rp.r, rp.r * rp.ratio, 0, 0, Math.PI * 2);
    ctx2d.strokeStyle = hexA(rp.color, a);
    ctx2d.lineWidth = 1.6;
    ctx2d.stroke();
  }
  ctx2d.restore();
}

/* ============================================================= *
 *  AUTO-PLAY — a generative performer for meditation mode
 * ============================================================= */
const AutoPlay = {
  on: false,
  nextT: 0,
  swells: [],   // active rub swells {bowl, t0, rise, hold, fall, peak}
  strokes: [],  // in-flight strike animations: mallet swings in, taps, withdraws
  // favor the C-pentatonic degrees (C D E G A); F and B stay rare
  weights: [1, 0.9, 0.9, 0.25, 1, 0.9, 0.18],
  lastIdx: -1,

  toggle() {
    this.on = !this.on;
    document.getElementById("auto-btn")?.classList.toggle("active", this.on);
    if (this.on) {
      dismissHint();
      this.firstEvent = true;   // open with a rub so the mode announces itself
      this.nextT = performance.now() + 500;
    } else {
      this.swells.forEach((s) => s.bowl.voice?.endRub());
      this.swells.length = 0;
      this.strokes.length = 0;
    }
  },

  tick(now) {
    if (this.on && audio && now >= this.nextT) {
      this._event(now);
      if (now >= this.nextT) this.nextT = now + 3500 + Math.random() * 5500;
    }
    this._runSwells(now);
    this._runStrokes(now);
  },

  _pick() {
    let idx = 0;
    for (let guard = 0; guard < 8; guard++) {
      idx = Math.min(bowls.length - 1,
        Math.floor(Math.pow(Math.random(), 1.35) * bowls.length)); // lean low/large
      if (idx !== this.lastIdx && Math.random() < this.weights[idx]) break;
    }
    this.lastIdx = idx;
    return bowls[idx];
  },

  _event(now) {
    const roll = this.firstEvent ? 0.3 : Math.random();
    this.firstEvent = false;
    if (roll < 0.12) { Wood.autoHit(); return; }
    const b = this._pick();
    if (!b || !b.voice) return;
    if (roll < 0.62) {
      // rub around the rim -- the traditional singing technique, and the
      // most common event; usually a faint tap "warms up" the bowl first,
      // but sometimes the rub just breathes in from silence
      if (Math.random() < 0.6) {
        b.voice.strike(0.08 + Math.random() * 0.14, false);
        exciteVisual(b, 0.15);
      }
      this.swells.push({
        bowl: b, t0: now,
        rise: 3200 + Math.random() * 1800,
        hold: 2000 + Math.random() * 2500,
        fall: 2600,
        peak: 0.5 + Math.random() * 0.35,
        ang: Math.random() * Math.PI * 2,
        lastT: now,
      });
      this.nextT = now + 6500 + Math.random() * 6000; // give the swell room to breathe
    } else {
      const side = Math.random() < 0.5 ? -1 : 1;
      const th = side > 0 ? 0.45 : Math.PI - 0.45; // contact point on the rim
      const tx = b.cx + Math.cos(th) * b.rx;
      const ty = b.cy + Math.sin(th) * b.ry;
      this.strokes.push({
        bowl: b, t0: now, dur: 950, hit: 0.42, fired: false,
        lvl: 0.35 + Math.random() * 0.35,
        bright: Math.random() < 0.1,
        tx, ty, sx: tx + side * 70, sy: ty - 90,
      });
    }
  },

  _runSwells(now) {
    for (let i = this.swells.length - 1; i >= 0; i--) {
      const s = this.swells[i];
      const t = now - s.t0;
      // only retire a swell once its whole envelope has played out --
      // checking inten <= 0 here killed newborn swells on their first frame
      if (t >= s.rise + s.hold + s.fall || !s.bowl.voice) {
        s.bowl.voice?.endRub();
        this.swells.splice(i, 1);
        continue;
      }
      let inten;
      if (t < s.rise) {
        const u = t / s.rise;
        inten = u * u * (3 - 2 * u);   // eased rise: barely-there at first
      } else if (t < s.rise + s.hold) inten = 1;
      else inten = 1 - (t - s.rise - s.hold) / s.fall;
      s.bowl.voice.rub(inten * s.peak * 0.9);
      if (Math.random() < 0.02 * inten) spawnRipple(s.bowl, inten * 0.7);

      // ghost mallet circles the rim, speeding up as the swell builds
      const dt = Math.min(50, now - s.lastT) / 1000;
      s.lastT = now;
      s.ang += (0.9 + inten * 2.6) * dt;
      const b = s.bowl;
      const x = b.cx + Math.cos(s.ang) * b.rx;
      const y = b.cy + Math.sin(s.ang) * b.ry;
      b.trail.push({ x, y, life: 1 });
      if (b.trail.length > 26) b.trail.shift();
      ctx2d.save();
      ctx2d.globalAlpha = 0.4 + 0.45 * inten;
      drawMallet(x, y, true);
      ctx2d.restore();
    }
  },

  _runStrokes(now) {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const k = this.strokes[i];
      const t = (now - k.t0) / k.dur;
      if (t >= 1 || !k.bowl.voice) { this.strokes.splice(i, 1); continue; }
      if (!k.fired && t >= k.hit) {
        k.fired = true;
        k.bowl.voice.strike(k.lvl, k.bright);
        exciteVisual(k.bowl, k.lvl * 0.8);
        spawnRipple(k.bowl, k.lvl);
      }
      let f, alpha;   // f: 0 at rest point, 1 at rim contact
      if (t < k.hit) {
        const u = t / k.hit;
        f = u * u * (3 - 2 * u);
        alpha = Math.min(1, (now - k.t0) / 160);   // fade in on approach
      } else {
        const u = (t - k.hit) / (1 - k.hit);
        f = 1 - u * u * (3 - 2 * u);
        alpha = 1 - Math.max(0, (u - 0.55) / 0.45); // fade out on retreat
      }
      ctx2d.save();
      ctx2d.globalAlpha = alpha * 0.9;
      drawMallet(k.sx + (k.tx - k.sx) * f, k.sy + (k.ty - k.sy) * f,
                 k.fired && t < k.hit + 0.12);
      ctx2d.restore();
    }
  },
};

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
  Wood.layout();
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
  const { cx, cy, depth } = b;
  const lvl = b.level;
  // elliptical vibration: rim breathes wider ⇄ flatter while ringing
  const vib = (lvl > 0.015 && !reduceMotion)
    ? 1 + Math.sin(time * 0.024 + b.phase * 7) * 0.007 * Math.min(1, lvl)
    : 1;
  const rx = b.rx * vib, ry = b.ry * (2 - vib);

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
  bodyGrad.addColorStop(0.3, body.base);
  bodyGrad.addColorStop(0.46, shade(body.base, 1.24));
  bodyGrad.addColorStop(0.58, body.base);
  bodyGrad.addColorStop(0.82, body.deep);
  bodyGrad.addColorStop(1, shade(body.deep, 0.65));
  ctx2d.fillStyle = bodyGrad;
  if (body.translucent) ctx2d.globalAlpha = 1 - body.translucent * 0.35;
  ctx2d.fill();

  // engraved bands ringing the body
  ctx2d.globalAlpha = body.translucent ? 0.2 : 0.35;
  for (const q of [0.3, 0.55]) {
    const w = rx * (1 - 0.5 * Math.pow(q, 2.2));
    ctx2d.beginPath();
    ctx2d.ellipse(cx, cy + depth * q, w, ry * 0.8, 0, Math.PI * 0.08, Math.PI * 0.92);
    ctx2d.strokeStyle = shade(body.deep, 0.55);
    ctx2d.lineWidth = 1.3;
    ctx2d.stroke();
    ctx2d.beginPath();
    ctx2d.ellipse(cx, cy + depth * q + 1.6, w, ry * 0.8, 0, Math.PI * 0.12, Math.PI * 0.88);
    ctx2d.strokeStyle = hexA(body.rim, 0.35);
    ctx2d.lineWidth = 0.8;
    ctx2d.stroke();
  }

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
    if (audio) audio.setSpace(SCENE_AUDIO[theme].verb);
    Ambience.setScene(theme);
    Wood.setScene(theme);
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
      this.shoot = null;
    }
    if (this.current === "aurora") {
      this.curtains = [];
      const hues = [150, 170, 195, 285];
      for (let i = 0; i < 4; i++) {
        this.curtains.push({
          hue: hues[i],
          ph: Math.random() * Math.PI * 2,
          sp: 0.5 + Math.random() * 0.7,
          amp: 0.04 + Math.random() * 0.04,
          base: 0.06 + i * 0.05,
        });
      }
      this.stars = [];
      for (let i = 0; i < (reduceMotion ? 30 : 60); i++) {
        this.stars.push({
          x: Math.random(), y: Math.random() * 0.5,
          r: Math.random() * 1.1 + 0.3,
          tw: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random(), hue: 200,
        });
      }
    }
    if (this.current === "dusk") {
      this.flies = [];
      const n = reduceMotion ? 0 : 14;
      for (let i = 0; i < n; i++) {
        this.flies.push({
          x: Math.random(), y: 0.45 + Math.random() * 0.45,
          ph: Math.random() * Math.PI * 2,
          sp: 0.4 + Math.random() * 0.8,
          r: 1.1 + Math.random() * 1.3,
        });
      }
    }
    if (this.current === "ocean") {
      this.bubbles = [];
      const n = reduceMotion ? 0 : 18;
      for (let i = 0; i < n; i++) {
        this.bubbles.push({
          x: Math.random(),
          ph: Math.random(),
          sp: 0.5 + Math.random() * 0.9,
          r: 1.5 + Math.random() * 3.5,
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
      default:       this._dusk(t); break;
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

  _stars(time) {
    for (const s of this.stars) {
      const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.001 * s.sp + s.tw));
      ctx2d.beginPath();
      ctx2d.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsla(${s.hue}, 60%, 88%, ${a})`;
      ctx2d.fill();
    }
  },

  _dusk(time) {
    this._radial([[0, "#191430"], [0.55, "#0d0a1c"], [1, "#06050d"]]);
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    // low drifting mist
    for (let i = 0; i < 3; i++) {
      const mx = ((i * 0.45 + time * 0.000008 * (i + 1)) % 1.4 - 0.2) * W;
      const my = H * (0.78 + i * 0.07);
      const g = ctx2d.createRadialGradient(mx, my, 4, mx, my, W * 0.35);
      g.addColorStop(0, "hsla(258, 35%, 62%, 0.045)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.ellipse(mx, my, W * 0.35, H * 0.09, 0, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // fireflies: wandering pulses of warm light
    for (const f of this.flies || []) {
      const fx = f.x * W + Math.sin(time * 0.0002 * f.sp + f.ph) * 46;
      const fy = f.y * H + Math.cos(time * 0.00013 * f.sp + f.ph * 1.3) * 30;
      const pulse = Math.max(0, Math.sin(time * 0.0016 * f.sp + f.ph));
      const a = 0.1 + Math.pow(pulse, 3) * 0.75;
      const g = ctx2d.createRadialGradient(fx, fy, 0, fx, fy, f.r * 6);
      g.addColorStop(0, `hsla(68, 95%, 70%, ${a})`);
      g.addColorStop(0.35, `hsla(68, 90%, 62%, ${a * 0.32})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(fx, fy, f.r * 6, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.restore();
  },

  _aurora(time) {
    this._radial([[0, "#0d1626"], [0.6, "#081019"], [1, "#04070e"]]);
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    this._stars(time);
    // layered waving curtains
    for (const c of this.curtains || []) {
      const t = time * 0.00005 * c.sp + c.ph;
      ctx2d.beginPath();
      const step = 18;
      const topAt = (x) =>
        H * (c.base
          + Math.sin(x * 0.0035 + t * 3) * c.amp
          + Math.sin(x * 0.0011 - t * 5) * c.amp * 1.6);
      ctx2d.moveTo(0, topAt(0));
      for (let x = step; x <= W + step; x += step) ctx2d.lineTo(x, topAt(x));
      const fall = H * 0.42;
      ctx2d.lineTo(W + step, topAt(W + step) + fall);
      for (let x = W; x >= -step; x -= step) ctx2d.lineTo(x, topAt(x) + fall);
      ctx2d.closePath();
      const g = ctx2d.createLinearGradient(0, H * c.base, 0, H * c.base + fall);
      g.addColorStop(0, `hsla(${c.hue}, 85%, 62%, 0.12)`);
      g.addColorStop(0.35, `hsla(${c.hue}, 80%, 55%, 0.05)`);
      g.addColorStop(1, `hsla(${c.hue}, 80%, 50%, 0)`);
      ctx2d.fillStyle = g;
      ctx2d.fill();
    }
    ctx2d.restore();
  },

  _ocean(time) {
    this._radial([[0, "#10405f"], [0.5, "#0a2438"], [1, "#04101d"]]);
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    // light shafts slanting down from the surface
    for (let i = 0; i < 3; i++) {
      const sx = W * (0.18 + i * 0.3) + Math.sin(time * 0.00006 + i * 2.1) * W * 0.04;
      const sway = 0.5 + 0.5 * Math.sin(time * 0.00009 + i * 1.4);
      const wTop = W * 0.05, tilt = W * 0.08, hh = H * 0.75;
      const g = ctx2d.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, `hsla(190, 65%, 72%, ${0.05 + sway * 0.04})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.moveTo(sx, 0);
      ctx2d.lineTo(sx + wTop, 0);
      ctx2d.lineTo(sx + tilt + wTop * 2.4, hh);
      ctx2d.lineTo(sx + tilt - wTop * 1.4, hh);
      ctx2d.closePath();
      ctx2d.fill();
    }
    // slow caustic light bands drifting through the deep
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
    // rising bubbles
    for (const b of this.bubbles || []) {
      const cyc = (time * 0.00003 * b.sp + b.ph) % 1.1;
      const by = H * (1.05 - cyc);
      const bx = b.x * W + Math.sin(time * 0.001 * b.sp + b.ph * 9) * 8;
      const a = Math.min(0.22, cyc * 0.5);
      ctx2d.beginPath();
      ctx2d.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx2d.strokeStyle = `hsla(190, 70%, 85%, ${a})`;
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
      ctx2d.beginPath();
      ctx2d.arc(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsla(190, 80%, 92%, ${a * 0.8})`;
      ctx2d.fill();
    }
    ctx2d.restore();
  },

  _cosmos(time) {
    this._radial([[0, "#100a22"], [0.5, "#080614"], [1, "#03030a"]]);
    ctx2d.save();
    ctx2d.globalCompositeOperation = "lighter";
    // twin nebulae
    const neb = ctx2d.createRadialGradient(W * 0.66, H * 0.3, 0, W * 0.66, H * 0.3, Math.max(W, H) * 0.5);
    neb.addColorStop(0, "hsla(275, 70%, 55%, 0.10)");
    neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = neb;
    ctx2d.fillRect(0, 0, W, H);
    const neb2 = ctx2d.createRadialGradient(W * 0.26, H * 0.62, 0, W * 0.26, H * 0.62, Math.max(W, H) * 0.4);
    neb2.addColorStop(0, "hsla(198, 65%, 50%, 0.06)");
    neb2.addColorStop(1, "rgba(0,0,0,0)");
    ctx2d.fillStyle = neb2;
    ctx2d.fillRect(0, 0, W, H);
    this._stars(time);
    // the occasional shooting star
    if (!reduceMotion) {
      if (!this.shoot && Math.random() < 0.0015) {
        this.shoot = {
          x: Math.random() * W * 0.7, y: Math.random() * H * 0.3,
          vx: 4 + Math.random() * 4, vy: 1.2 + Math.random() * 2, life: 1,
        };
      }
      const sh = this.shoot;
      if (sh) {
        sh.x += sh.vx; sh.y += sh.vy; sh.life -= 0.016;
        if (sh.life <= 0 || sh.x > W + 80) this.shoot = null;
        else {
          const tail = 16 * sh.life;
          const g = ctx2d.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * tail, sh.y - sh.vy * tail);
          g.addColorStop(0, `rgba(255,255,255,${0.85 * sh.life})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx2d.strokeStyle = g;
          ctx2d.lineWidth = 1.6;
          ctx2d.beginPath();
          ctx2d.moveTo(sh.x, sh.y);
          ctx2d.lineTo(sh.x - sh.vx * tail, sh.y - sh.vy * tail);
          ctx2d.stroke();
        }
      }
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
  drawRipples();

  // decay visual levels; rubbing keeps them up via pointer logic
  bowls.forEach((b) => {
    const v = b.voice;
    if (v) {
      const decayRate = v._rubTarget > 0.01 ? 0 : 0.045;
      if (v._rubTarget > 0.01) {
        b.level = lerp(b.level, Math.min(1.2, v._rubTarget * 1.1), 0.08);
        // a singing bowl sheds visible sound rings now and then
        if (Math.random() < 0.045 * v._rubTarget) spawnRipple(b, b.level);
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
  Wood.draw(time);

  AutoPlay.tick(time);
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
  if (Wood.hitTest(x, y)) {
    Wood.play(x);
    pointers.set(e.pointerId, {
      wood: true,
      lastTube: Wood.key === "aurora" ? Wood._tubeAt(x) : -1,
    });
    canvas.setPointerCapture?.(e.pointerId);
    return;
  }
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
  if (p.wood) {
    // dragging across the bamboo chimes strums tube by tube
    if (Wood.key === "aurora" && Wood.hitTest(e.clientX, e.clientY)) {
      const ti = Wood._tubeAt(e.clientX);
      if (ti !== p.lastTube) { Wood.strumAt(e.clientX, 0.6); p.lastTube = ti; }
    }
    return;
  }
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
  if (p.wood) return;
  const b = p.bowl;
  const dur = performance.now() - p.startT;

  if (p.hasRubbed) {
    b.voice.endRub();
  } else if (p.path < 12 && dur < 400) {
    // quick click -> strike
    b.voice.strike(0.9, false);
    exciteVisual(b, 0.75);
    spawnRipple(b, 0.9);
  } else if (p.path < 160 && dur < 260) {
    // fast swipe across the rim -> bright flick
    b.voice.strike(0.85, true);
    exciteVisual(b, 0.55);
    spawnRipple(b, 0.7);
  } else {
    // a slow drag that never built into a rub -> soft strike
    b.voice.strike(0.6, false);
    exciteVisual(b, 0.45);
    spawnRipple(b, 0.5);
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
canvas.addEventListener("pointerleave", (e) => cursors.delete(e.pointerId));

// losing focus can swallow pointerup/pointercancel, leaving orphaned mallets
// and stuck rubs -- sweep everything when the page goes to the background
function resetPointerState() {
  pointers.forEach((p) => {
    if (!p.wood && p.hasRubbed) p.bowl.voice.endRub();
  });
  pointers.clear();
  cursors.clear();
}
window.addEventListener("blur", resetPointerState);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetPointerState();
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

document.getElementById("auto-btn").addEventListener("click", () => AutoPlay.toggle());
document.getElementById("amb-btn").addEventListener("click", () => Ambience.toggle());

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
  audio.setSpace(SCENE_AUDIO[Scenes.current].verb);
  if (!Ambience.enabled) audio.amb.gain.value = 0;
  Ambience.setScene(Scenes.current);
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
