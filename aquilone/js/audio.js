'use strict';
// Sound: five café tunes that cross-fade as the road passes from countryside to village, garden, sea and festa,
// matching ambience beds, one-shot effects, and a synthesized instrument for the kite that changes with the scene.
// Plain <audio> elements keep it working from file:// as well as from a server.
(() => {
  const A = window.A, BASE = 'assets/audio/';
  const ZK = ['campagna', 'paese', 'giardino', 'riviera', 'festa'];
  const SFX = ['bell', 'land', 'honk', 'crow', 'gull', 'thunder', 'flap', 'harp', 'meow', 'crash', 'bravo', 'fin', 'flourish', 'firework', 'baa', 'crate', 'sand', 'boing', 'crab'];
  // The tunes were composed in G major (countryside, garden, riviera) and its relative E minor (village, festa).
  // [voice, tonic in Hz, scale in semitones] for each tableau
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
  const VOICE = { c: ['musicbox', 783.99, MAJ], t: ['accordion', 329.63, MIN], j: ['calliope', 392, MAJ], r: ['mandolin', 392, MAJ], f: ['bells', 659.25, MIN] };

  const Au = A.audio = {
    started: false, muted: false, music: [], amb: [], pool: {}, ctx: null, master: 0, musicVol: 0.5, ambVol: 0.2,
    init() {
      const mk = (file, loop) => { const a = new Audio(BASE + file + '.mp3'); a.loop = loop; a.preload = 'auto'; a.volume = 0; return a; };
      this.music = ZK.map(k => mk('music_' + k, true)); this.amb = ZK.map(k => mk('amb_' + k, true));
      for (const s of SFX) this.pool[s] = { i: 0, els: [mk(s, false), mk(s, false), mk(s, false)] };
    },
    start() {
      if (this.started) return; this.started = true;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      for (const a of [...this.music, ...this.amb]) { a.volume = 0; a.play().catch(() => {}); }
    },
    // z = zone weights; called every frame
    mix(z, dt, duck = 1) {
      if (!this.started) return;
      this.master += ((this.muted ? 0 : 1) - this.master) * Math.min(1, dt * 3);
      const w = [z.c, z.t, z.j, z.r, z.f];
      for (let i = 0; i < w.length; i++) {
        // equal-power-ish crossfade
        this.set(this.music[i], Math.sqrt(w[i]) * this.musicVol * this.master * duck);
        this.set(this.amb[i], w[i] * this.ambVol * this.master);
      }
    },
    set(a, v) {
      v = Math.max(0, Math.min(1, v));
      if (v < 0.004) { if (!a.paused) a.pause(); a.volume = 0; return; }
      a.volume = v; if (a.paused) a.play().catch(() => {});
    },
    sfx(name, vol = 0.6, rate = 1) {
      if (!this.started || this.muted) return;
      const p = this.pool[name]; if (!p) return;
      const a = p.els[p.i = (p.i + 1) % p.els.length];
      try { a.currentTime = 0; a.volume = Math.min(1, vol); a.playbackRate = rate; a.play().catch(() => {}); } catch (e) { /* not loaded yet */ }
    },
    // ───── the kite's own instrument ─────
    // Each tableau gives the kite a different voice, in the key of that tableau's tune. Notes are asked
    // for by scale degree (0 = tonic, 7 = the octave), so phrases written once fit every key.
    note(zk, deg, vol = 1, delay = 0) {
      const ctx = this.ctx; if (!ctx || this.muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const [voice, root, sc] = VOICE[zk] || VOICE.c, o = Math.floor(deg / 7);
      const f = root * Math.pow(2, (sc[((deg % 7) + 7) % 7] + 12 * o) / 12), t = ctx.currentTime + 0.005 + delay;
      if (!this.out) this.bus(ctx);
      const g = ctx.createGain(); g.connect(this.out); g.connect(this.send);
      this[voice](ctx, f, t, vol, g);
    },
    // a rising arpeggio for a phrase gathered whole
    flourish(zk) { [0, 2, 4, 7, 9].forEach((d, i) => this.note(zk, d, 0.7, 0.09 + i * 0.075)); },
    // dry output plus a soft echo, so the notes sit in the air a moment
    bus(ctx) {
      this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(ctx.destination);
      this.send = ctx.createGain(); this.send.gain.value = 0.5;
      const dl = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
      dl.delayTime.value = 0.27; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 2400; wet.gain.value = 0.3;
      this.send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(ctx.destination);
      const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = n; this.plucks = new Map();
    },
    _osc(ctx, type, f, t, dur, dest, gain, cents = 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = cents; g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur); return o; },
    _noise(ctx, t, dur, dest, gain, type, freq) { const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = freq; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); n.connect(fl); fl.connect(g); g.connect(dest); n.start(t); n.stop(t + dur); },
    _decay(g, t, peak, attack, dur) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0006, t + dur); },
    // countryside: a music box
    musicbox(ctx, f, t, vol, g) {
      this._decay(g, t, 0.15 * vol, 0.004, 1.4);
      for (const [m, a] of [[1, 1], [2, 0.42], [3, 0.15], [4.2, 0.07]]) this._osc(ctx, 'sine', f * m, t, 1.45, g, a);
      this._noise(ctx, t, 0.02, g, 0.25, 'highpass', 5000);                       // the pluck of the comb
    },
    // village: a little musette accordion, two reeds a few cents apart
    accordion(ctx, f, t, vol, g) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.8; lp.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.085 * vol, t + 0.04); g.gain.setValueAtTime(0.085 * vol, t + 0.27); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.62);
      const os = [this._osc(ctx, 'sawtooth', f, t, 0.65, lp, 0.5, -8), this._osc(ctx, 'sawtooth', f, t, 0.65, lp, 0.5, 9), this._osc(ctx, 'square', f * 2, t, 0.65, lp, 0.13)];
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.25);
      lfo.connect(lg); for (const o of os) lg.connect(o.detune); lfo.start(t); lfo.stop(t + 0.65);
    },
    // garden: a fairground organ pipe, with a puff of air at the start
    calliope(ctx, f, t, vol, g) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 * vol, t + 0.03); g.gain.setValueAtTime(0.1 * vol, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.7);
      this._osc(ctx, 'triangle', f, t, 0.72, g, 1); this._osc(ctx, 'sine', f * 2, t, 0.72, g, 0.32); this._osc(ctx, 'sine', f * 3, t, 0.72, g, 0.1);
      this._noise(ctx, t, 0.045, g, 0.5, 'bandpass', f * 2);
    },
    // riviera: a mandolin, the note shivered three times
    mandolin(ctx, f, t, vol, g) {
      g.gain.value = 0.5 * vol;
      const buf = this.pluck(ctx, f);
      [[0, 1], [0.075, 0.55], [0.15, 0.8]].forEach(([dt, a]) => { const s = ctx.createBufferSource(), gg = ctx.createGain(); s.buffer = buf; gg.gain.value = a; s.connect(gg); gg.connect(g); s.start(t + dt); });
    },
    // festa: bright little bells and a shake of the tambourine
    bells(ctx, f, t, vol, g) {
      this._decay(g, t, 0.12 * vol, 0.003, 1.7);
      for (const [m, a] of [[1, 1], [2.76, 0.42], [5.4, 0.2], [8.93, 0.08]]) this._osc(ctx, 'sine', f * m, t, 1.75, g, a);
      this._noise(ctx, t, 0.11, g, 0.55, 'highpass', 6500);
    },
    // Karplus–Strong plucked string, rendered once per pitch and kept
    pluck(ctx, f) {
      const key = Math.round(f); let buf = this.plucks.get(key); if (buf) return buf;
      const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 0.9), ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      for (let i = 0; i < N; i++) ring[i] = (ring[i] + ring[(i + 1) % N]) * 0.5;
      buf = ctx.createBuffer(1, len, sr); const d = buf.getChannelData(0); let p = 0;
      for (let i = 0; i < len; i++) { const q = (p + 1) % N; d[i] = ring[p]; ring[p] = (ring[p] + ring[q]) * 0.5 * 0.9965; p = q; }
      for (let i = 0; i < 3000; i++) d[len - 1 - i] *= i / 3000;
      this.plucks.set(key, buf); return buf;
    },
    toggleMute() { this.muted = !this.muted; return this.muted; },
  };
})();
