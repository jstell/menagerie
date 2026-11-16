'use strict';
// Sound: five café tunes that cross-fade as the road passes from countryside to village, garden, sea and festa,
// matching ambience beds, one-shot effects, and a little synthesized music-box chime for notes.
// Plain <audio> elements keep it working from file:// as well as from a server.
(() => {
  const A = window.A, BASE = 'assets/audio/';
  const ZK = ['campagna', 'paese', 'giardino', 'riviera', 'festa'];
  const SFX = ['bell', 'land', 'honk', 'crow', 'gull', 'thunder', 'flap', 'harp', 'meow', 'crash', 'bravo', 'fin', 'flourish', 'firework'];
  // G major pentatonic — the tunes were composed in G major / E minor
  const SCALE = [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66, 1318.51];

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
    chime(step, vol = 0.11) {
      const ctx = this.ctx; if (!ctx || this.muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const f = SCALE[Math.min(step, SCALE.length - 1)], t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.008); out.gain.exponentialRampToValueAtTime(0.0008, t + 0.9); out.connect(ctx.destination);
      for (const [mult, g, type] of [[1, 1, 'sine'], [2, 0.35, 'sine'], [3.01, 0.12, 'triangle'], [5.4, 0.05, 'sine']]) {
        const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; o.frequency.value = f * mult; gg.gain.value = g;
        o.connect(gg); gg.connect(out); o.start(t); o.stop(t + 0.95);
      }
    },
    toggleMute() { this.muted = !this.muted; return this.muted; },
  };
})();
