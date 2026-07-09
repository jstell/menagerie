// Schola Cantorum — Web Audio engine.
// One AudioContext; all voices route through a venue reverb whose impulse
// responses are synthesized on load (no IR files). Venue is a continuous
// morph between chapel / cathedral / basilica convolvers.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function noteToHz(noteIndex, octave) {
  const midi = 12 * (octave + 1) + noteIndex;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function centsBetween(fromHz, toHz) {
  return 1200 * Math.log2(toHz / fromHz);
}

// ---------------------------------------------------------------- reverb IRs

function synthIR(ctx, seconds, { damp = 4000, dampEnd = 800, fadeIn = 0.015 } = {}) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const t60 = seconds * 0.9;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      // one-pole lowpass whose cutoff falls as the tail decays (air + stone absorption)
      const cutoff = dampEnd + (damp - dampEnd) * Math.exp(-3 * t / seconds);
      const k = 1 - Math.exp(-2 * Math.PI * cutoff / rate);
      lp += k * ((Math.random() * 2 - 1) - lp);
      const env = Math.exp(-6.91 * t / t60) * Math.min(1, t / fadeIn);
      data[i] = lp * env;
    }
    // normalize per channel
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) for (let i = 0; i < len; i++) data[i] /= peak * 2.5;
  }
  return buf;
}

const VENUES = [
  { name: 'chapel', seconds: 1.8, damp: 5200, dampEnd: 1400, predelay: 0.012 },
  { name: 'cathedral', seconds: 4.5, damp: 4200, dampEnd: 900, predelay: 0.028 },
  { name: 'basilica', seconds: 9.0, damp: 3200, dampEnd: 550, predelay: 0.055 },
];

// ------------------------------------------------------- organum pitch shift
// Granular (dual-tap modulated delay) shifter: preserves duration, shifts pitch.

const SHIFTER_WORKLET = `
class Shifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1.5, minValue: 0.5, maxValue: 2.0 }];
  }
  constructor() {
    super();
    this.grain = 4096;
    this.size = 16384;
    this.ringL = new Float32Array(this.size);
    this.ringR = new Float32Array(this.size);
    this.w = 0;
    this.f = 0;
  }
  tap(ring, delay) {
    let pos = this.w - delay;
    while (pos < 0) pos += this.size;
    const i0 = Math.floor(pos) % this.size;
    const i1 = (i0 + 1) % this.size;
    const fr = pos - Math.floor(pos);
    return ring[i0] * (1 - fr) + ring[i1] * fr;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || out.length === 0) return true;
    const inL = inp && inp[0] ? inp[0] : null;
    const inR = inp && inp[1] ? inp[1] : inL;
    const n = out[0].length;
    const ratio = params.ratio.length > 1 ? params.ratio[0] : params.ratio[0];
    const step = (ratio - 1) / this.grain;
    for (let i = 0; i < n; i++) {
      this.ringL[this.w] = inL ? inL[i] : 0;
      this.ringR[this.w] = inR ? inR[i] : 0;
      this.f += step;
      this.f -= Math.floor(this.f);
      const f1 = this.f;
      const f2 = (this.f + 0.5) % 1;
      const d1 = 1 + this.grain * (1 - f1);
      const d2 = 1 + this.grain * (1 - f2);
      const g1 = Math.sin(Math.PI * f1);
      const g2 = Math.sin(Math.PI * f2);
      const l = g1 * this.tap(this.ringL, d1) + g2 * this.tap(this.ringL, d2);
      const r = g1 * this.tap(this.ringR, d1) + g2 * this.tap(this.ringR, d2);
      out[0][i] = l * 0.75;
      if (out[1]) out[1][i] = r * 0.75;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}
registerProcessor('schola-shifter', Shifter);
`;

// ------------------------------------------------------------------- engine

export class Engine {
  constructor() {
    this.ctx = null;
    this.bank = null;          // { phrases: Map, drones: Map, sfx: Map }
    this.placeholder = false;
    this.droneState = {
      on: false, note: 2, octave: 2, vowel: 'ah', voices: 3,
      fine: 0, swell: 3, level: 0.7, sources: [],
    };
    this.organum = { fifth: false, octaveUp: false };
    this.padTranspose = 0;     // semitones
    this.tuneChants = true;    // pull each phrase's cadence onto the ison's pitch class
    this.choir = 'monks';      // which voice bank sings: 'monks' | 'sisters'
    this.activePhrases = new Map();  // id -> { sources, stopFns }
    this.ambience = new Map();       // id -> { source, gain }
    this.onvoices = null;            // callback(count) for the scene
  }

  async init() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    // gentle glue so stacked voices + a 9s tail can't clip
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 18;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.4;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024;
    this.recDest = ctx.createMediaStreamDestination();
    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.limiter.connect(this.recDest);

    // dry + wet
    this.dry = ctx.createGain(); this.dry.gain.value = 0.6;
    this.dry.connect(this.master);

    this.predelay = ctx.createDelay(0.2);
    this.warmthFilter = ctx.createBiquadFilter();
    this.warmthFilter.type = 'lowpass'; this.warmthFilter.frequency.value = 5500;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.75;

    this.convolvers = VENUES.map((v) => {
      const conv = ctx.createConvolver();
      conv.buffer = synthIR(ctx, v.seconds, v);
      const g = ctx.createGain(); g.gain.value = 0;
      this.predelay.connect(conv); conv.connect(g); g.connect(this.warmthFilter);
      return { ...v, conv, gain: g };
    });
    this.warmthFilter.connect(this.wet);
    this.wet.connect(this.master);

    // voice bus (pads + drone) and ambience bus (smaller reverb send)
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.dry);
    this.voiceBus.connect(this.predelay);

    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.9;
    this.ambSend = ctx.createGain(); this.ambSend.gain.value = 0.25;
    this.ambBus.connect(this.dry);
    this.ambBus.connect(this.ambSend);
    this.ambSend.connect(this.predelay);

    // organum shifters for phrases (drone organum uses detuned copies instead)
    try {
      const url = URL.createObjectURL(new Blob([SHIFTER_WORKLET], { type: 'application/javascript' }));
      // addModule can hang forever when no audio device exists (headless);
      // give it 3s, then run without phrase organum rather than never loading
      await Promise.race([
        ctx.audioWorklet.addModule(url),
        new Promise((_, rej) => setTimeout(() => rej(new Error('worklet load timed out')), 3000)),
      ]);
      this.orgSend = ctx.createGain(); this.orgSend.gain.value = 1;
      this.shiftFifth = new AudioWorkletNode(ctx, 'schola-shifter', { outputChannelCount: [2] });
      this.shiftFifth.parameters.get('ratio').value = Math.pow(2, 7 / 12);
      this.shiftOct = new AudioWorkletNode(ctx, 'schola-shifter', { outputChannelCount: [2] });
      this.shiftOct.parameters.get('ratio').value = 2;
      this.orgFifthGain = ctx.createGain(); this.orgFifthGain.gain.value = 0;
      this.orgOctGain = ctx.createGain(); this.orgOctGain.gain.value = 0;
      this.orgSend.connect(this.shiftFifth); this.shiftFifth.connect(this.orgFifthGain);
      this.orgSend.connect(this.shiftOct); this.shiftOct.connect(this.orgOctGain);
      this.orgFifthGain.connect(this.voiceBus);
      this.orgOctGain.connect(this.voiceBus);
      this.workletOk = true;
    } catch (e) {
      console.warn('Organum worklet unavailable:', e);
      this.workletOk = false;
    }

    this.setVenue(0.45);
  }

  // ------------------------------------------------------------- bank loading

  async loadBank(makePlaceholders) {
    const bank = { phrases: new Map(), drones: new Map(), sfx: new Map(), manifest: null };
    let manifest = null;
    try {
      const res = await fetch('samples/manifest.json', { cache: 'no-store' });
      if (res.ok) manifest = await res.json();
    } catch (_) { /* fall through to placeholders */ }

    if (manifest) {
      bank.manifest = manifest;
      // decode on an OfflineAudioContext: it needs no audio device, so loading
      // can't stall when the main context's rendering thread isn't running yet
      const decoder = new OfflineAudioContext(2, 1, this.ctx.sampleRate);
      const load = async (entry, map, extra = {}) => {
        try {
          const res = await fetch('samples/' + entry.file);
          const arr = await res.arrayBuffer();
          const buf = await decoder.decodeAudioData(arr);
          map.set(entry.id, { ...entry, ...extra, buffer: buf });
        } catch (e) {
          console.warn('Failed to load', entry.file, e);
        }
      };
      await Promise.all([
        ...(manifest.phrases || []).map((p) => load(p, bank.phrases)),
        ...(manifest.drones || []).map((d) => load(d, bank.drones)),
        ...(manifest.sfx || []).map((s) => load(s, bank.sfx)),
      ]);
    }

    // Fill whatever the generated bank doesn't cover with synthesized stand-ins,
    // so the instrument always plays (and real SFX can coexist with placeholder voices).
    this.placeholder = bank.phrases.size === 0 || bank.drones.size === 0;
    if (this.placeholder || bank.sfx.size < 5) {
      const ph = await makePlaceholders(this.ctx);
      if (bank.phrases.size === 0) for (const p of ph.phrases) bank.phrases.set(p.id, p);
      if (bank.drones.size === 0) for (const d of ph.drones) bank.drones.set(d.id, d);
      for (const s of ph.sfx) if (!bank.sfx.has(s.id)) bank.sfx.set(s.id, s);
    }
    this.bank = bank;
    return bank;
  }

  // ------------------------------------------------------------------ helpers

  // Entries belonging to the active choir; falls back to everything so the
  // instrument still plays if one bank hasn't been generated yet.
  phrasesForChoir() {
    const mine = [...this.bank.phrases.values()].filter((p) => (p.choir || 'monks') === this.choir);
    return mine.length ? mine : [...this.bank.phrases.values()];
  }

  choirAvailable(choir) {
    return [...this.bank.phrases.values()].some((p) => (p.choir || 'monks') === choir);
  }

  setChoir(choir) {
    this.choir = choir;
    if (this.droneState.on) this.droneRebuild(); // swap to this choir's takes
  }

  stopAll() {
    for (const id of [...this.activePhrases.keys()]) this.stopPhrase(id);
    this.droneOff();
    for (const id of [...this.ambience.keys()]) this.setAmbience(id, 0);
  }

  _voiceCount() {
    let n = this.activePhrases.size;
    if (this.droneState.on) n += 1;
    return n;
  }
  _notifyVoices() { if (this.onvoices) this.onvoices(this._voiceCount(), this.droneState.on); }

  now() { return this.ctx.currentTime; }

  // -------------------------------------------------------------------- venue

  setVenue(v) { // 0..1
    this.venue = v;
    const pos = v * (VENUES.length - 1); // 0..2
    this.convolvers.forEach((c, i) => {
      const w = Math.max(0, 1 - Math.abs(pos - i));
      c.gain.gain.setTargetAtTime(w * w, this.now(), 0.15);
    });
    const pd = VENUES[0].predelay + (VENUES[2].predelay - VENUES[0].predelay) * v;
    this.predelay.delayTime.setTargetAtTime(pd, this.now(), 0.15);
    // bigger room: slightly more wet, slightly less dry
    this.dry.gain.setTargetAtTime(0.72 - 0.3 * v, this.now(), 0.15);
    this._applyWet();
  }

  setWet(v) { this.wetAmount = v; this._applyWet(); }
  _applyWet() {
    const base = this.wetAmount ?? 0.5;
    const scaled = 0.25 + base * 1.05 + (this.venue ?? 0.45) * 0.25;
    this.wet.gain.setTargetAtTime(scaled, this.now(), 0.15);
  }
  setWarmth(v) { // 0..1 → darker as it rises
    const hz = 8000 - v * 5800;
    this.warmthFilter.frequency.setTargetAtTime(Math.max(1200, hz), this.now(), 0.1);
  }

  // -------------------------------------------------------------------- drone

  // Render a loop-safe copy of a buffer: the approach to loopEnd is equal-power
  // crossfaded with the material leading into loopStart, so the wrap from end
  // to start is continuous instead of a hard cut. Cached on the entry.
  _seamlessBuffer(entry, aFrac, bFrac, fadeSec) {
    if (entry._loopBuf) return entry._loopBuf;
    const src = entry.buffer;
    const a = Math.floor(src.length * aFrac);
    const b = Math.floor(src.length * bFrac);
    const F = Math.max(1, Math.min(Math.floor(src.sampleRate * fadeSec), a, Math.floor((b - a) / 2)));
    const out = this.ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const s = src.getChannelData(ch);
      const d = out.getChannelData(ch);
      d.set(s);
      for (let i = 0; i < F; i++) {
        const t = i / F;
        const gOut = Math.cos(t * Math.PI / 2);
        const gIn = Math.sin(t * Math.PI / 2);
        d[b - F + i] = s[b - F + i] * gOut + s[a - F + i] * gIn;
      }
    }
    entry._loopBuf = out;
    entry._loopA = a / src.sampleRate;
    entry._loopB = b / src.sampleRate;
    return out;
  }

  _droneEntry() {
    const want = this.droneState.vowel;
    let pool = [...this.bank.drones.values()].filter((d) => (d.choir || 'monks') === this.choir);
    if (!pool.length) pool = [...this.bank.drones.values()];
    const cands = pool.filter((d) => d.vowel === want && d.base_pitch_hz);
    if (cands.length) {
      // steadiest take wins
      cands.sort((a, b) => (a.stability_cents ?? 999) - (b.stability_cents ?? 999));
      return cands[0];
    }
    const any = pool.filter((d) => d.vowel === want);
    if (any.length) return any[0];
    return pool[0];
  }

  _droneCents(entry) {
    const target = noteToHz(this.droneState.note, this.droneState.octave);
    const base = entry.base_pitch_hz || 110;
    let c = centsBetween(base, target) + this.droneState.fine;
    // a shift near or past an octave usually means the octave estimate is off —
    // fold back toward the sample's natural register (same pitch class)
    while (c > 950) c -= 1200;
    while (c < -950) c += 1200;
    return c;
  }

  // Cents applied to a phrase: optional auto-tune pulls the phrase's cadence
  // (its "final") onto the ison's pitch class — or the fifth above it, which
  // is the other consonant chant final over a drone — whichever needs the
  // smaller shift, so playback speed barely changes. Manual transpose adds on.
  phraseCents(entry) {
    let cents = this.padTranspose * 100;
    if (this.tuneChants) {
      const anchor = entry.end_pitch_hz || entry.base_pitch_hz;
      if (anchor) {
        const fold = (c) => {
          c = ((c % 1200) + 1200) % 1200;
          return c > 600 ? c - 1200 : c;
        };
        const toTonic = fold(centsBetween(anchor, noteToHz(this.droneState.note, 3)));
        const toFifth = fold(toTonic + 700);
        cents += Math.abs(toFifth) < Math.abs(toTonic) ? toFifth : toTonic;
      }
    }
    return cents;
  }

  retunePhrases() {
    for (const rec of this.activePhrases.values()) {
      rec.src.detune.setTargetAtTime(this.phraseCents(rec.entry), this.now(), 0.08);
    }
  }

  setTuneChants(on) {
    this.tuneChants = on;
    this.retunePhrases();
  }

  droneOn() {
    if (this.droneState.on) return;
    const st = this.droneState;
    const entry = this._droneEntry();
    if (!entry) return;
    st.on = true;
    st.entry = entry;
    st.master = this.ctx.createGain();
    st.master.gain.value = 0;
    st.master.connect(this.voiceBus);
    st.master.gain.setTargetAtTime(st.level, this.now(), Math.max(0.05, st.swell / 3));
    st.sources = [];
    this._buildDroneStacks();
    this._notifyVoices();
  }

  _buildDroneStacks() {
    const st = this.droneState;
    const entry = st.entry;
    const cents = this._droneCents(entry);
    const layers = [{ off: 0, gain: 1 }];
    if (this.organum.fifth) layers.push({ off: 700, gain: 0.6 });
    if (this.organum.octaveUp) layers.push({ off: 1200, gain: 0.45 });

    const buf = this._seamlessBuffer(entry, 0.2, 0.85, 1.5);
    for (const layer of layers) {
      for (let i = 0; i < st.voices; i++) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = entry._loopA;
        src.loopEnd = entry._loopB;
        const spread = st.voices > 1 ? (i / (st.voices - 1)) * 2 - 1 : 0;
        src.detune.value = cents + layer.off + spread * 7 + (Math.random() * 4 - 2);
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = spread * 0.55;
        const g = this.ctx.createGain();
        g.gain.value = (layer.gain / Math.sqrt(st.voices)) * 0.9;
        src.connect(pan); pan.connect(g); g.connect(st.master);
        // begin inside the loop region — never in the recording's raw onset
        const region = entry._loopB - entry._loopA;
        src.start(this.now(), entry._loopA + Math.random() * region * 0.9);
        st.sources.push({ src, layerOff: layer.off, spread });
      }
    }
  }

  _teardownDroneStacks() {
    const st = this.droneState;
    for (const { src } of st.sources) { try { src.stop(); } catch (_) {} }
    st.sources = [];
  }

  droneOff() {
    const st = this.droneState;
    if (!st.on) return;
    st.on = false;
    const rel = Math.max(0.05, st.swell / 3);
    st.master.gain.setTargetAtTime(0, this.now(), rel);
    const master = st.master, sources = st.sources;
    st.sources = [];
    setTimeout(() => {
      for (const { src } of sources) { try { src.stop(); } catch (_) {} }
      master.disconnect();
    }, st.swell * 1000 + 1500);
    this._notifyVoices();
  }

  // Live-retune without restarting: adjust detune on running sources.
  droneRetune() {
    const st = this.droneState;
    if (!st.on || !st.entry) return;
    const cents = this._droneCents(st.entry);
    for (const { src, layerOff, spread } of st.sources) {
      src.detune.setTargetAtTime(cents + layerOff + spread * 7, this.now(), 0.08);
    }
  }

  // Voice count / vowel / organum changes need a rebuild (crossfade via master swell).
  droneRebuild() {
    const st = this.droneState;
    if (!st.on) return;
    st.entry = this._droneEntry();
    this._teardownDroneStacks();
    this._buildDroneStacks();
  }

  setDroneLevel(v) {
    this.droneState.level = v;
    if (this.droneState.on) this.droneState.master.gain.setTargetAtTime(v, this.now(), 0.1);
  }

  // ------------------------------------------------------------------ phrases

  playPhrase(id, { loop = false, pan = 0 } = {}) {
    const entry = this.bank.phrases.get(id);
    if (!entry) return null;
    this.stopPhrase(id, true);

    const src = this.ctx.createBufferSource();
    src.buffer = entry.buffer;
    src.loop = loop;
    src.detune.value = this.phraseCents(entry);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.95, this.now(), 0.03);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(g);
    g.connect(panner);
    panner.connect(this.voiceBus);
    if (this.workletOk) panner.connect(this.orgSend);

    const rec = { src, gain: g, loop, entry };
    this.activePhrases.set(id, rec);
    src.onended = () => {
      if (this.activePhrases.get(id) === rec) {
        this.activePhrases.delete(id);
        this._notifyVoices();
        if (this.onphraseend) this.onphraseend(id);
      }
      g.disconnect();
      panner.disconnect();
    };
    src.start();
    this._notifyVoices();
    return entry;
  }

  stopPhrase(id, immediate = false) {
    const rec = this.activePhrases.get(id);
    if (!rec) return;
    this.activePhrases.delete(id);
    const fade = immediate ? 0.02 : 0.15;
    rec.gain.gain.setTargetAtTime(0, this.now(), fade);
    const src = rec.src;
    setTimeout(() => { try { src.stop(); } catch (_) {} }, fade * 6000);
    this._notifyVoices();
  }

  isPhrasePlaying(id) { return this.activePhrases.has(id); }

  setPadTranspose(semis) {
    this.padTranspose = semis;
    this.retunePhrases();
  }

  setOrganum(fifth, octaveUp) {
    this.organum.fifth = fifth;
    this.organum.octaveUp = octaveUp;
    if (this.workletOk) {
      this.orgFifthGain.gain.setTargetAtTime(fifth ? 0.5 : 0, this.now(), 0.2);
      this.orgOctGain.gain.setTargetAtTime(octaveUp ? 0.38 : 0, this.now(), 0.2);
    }
    if (this.droneState.on) this.droneRebuild();
  }

  // --------------------------------------------------------------- bell + amb

  bell() {
    const entry = this.bank.sfx.get('bell');
    if (!entry) return;
    const src = this.ctx.createBufferSource();
    src.buffer = entry.buffer;
    const g = this.ctx.createGain(); g.gain.value = 0.9;
    src.connect(g); g.connect(this.voiceBus);
    src.start();
  }

  static AMB_GAIN = { thunder: 1.9, wind: 1.2 }; // quieter sources get makeup gain

  setAmbience(id, level) { // level 0..1
    let a = this.ambience.get(id);
    if (level <= 0.001) {
      if (a) {
        a.gain.gain.setTargetAtTime(0, this.now(), 0.3);
        const src = a.source;
        setTimeout(() => { try { src.stop(); } catch (_) {} }, 2000);
        this.ambience.delete(id);
      }
      return;
    }
    if (!a) {
      const entry = this.bank.sfx.get(id);
      if (!entry) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this._seamlessBuffer(entry, 0.03, 0.97, 0.8);
      src.loop = true;
      src.loopStart = entry._loopA;
      src.loopEnd = entry._loopB;
      const g = this.ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(this.ambBus);
      src.start(this.now(), entry._loopA + Math.random() * (entry._loopB - entry._loopA) * 0.9);
      a = { source: src, gain: g };
      this.ambience.set(id, a);
    }
    a.gain.gain.setTargetAtTime(level * 0.8 * (Engine.AMB_GAIN[id] ?? 1), this.now(), 0.3);
  }

  // ----------------------------------------------------------------- recorder

  startRecording() {
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.recorder = new MediaRecorder(this.recDest.stream, { mimeType: mime, audioBitsPerSecond: 192000 });
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
  }

  stopRecording() {
    return new Promise((resolve) => {
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType }));
      this.recorder.stop();
    });
  }

  // -------------------------------------------------------------------- meter

  level() {
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
    return Math.sqrt(sum / buf.length);
  }
}
