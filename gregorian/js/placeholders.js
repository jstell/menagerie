// Synthesized stand-in voices, used only until the ElevenLabs bank has been
// generated (run `uv run generate/generate.py`). Everything here is rendered
// offline at load so the instrument is playable immediately.

export const PHRASE_SPEC = [
  { id: 'kyrie', label: 'Kyrie', latin: 'Kyrie eleison' },
  { id: 'gloria', label: 'Gloria', latin: 'Gloria in excelsis Deo' },
  { id: 'sanctus', label: 'Sanctus', latin: 'Sanctus Dominus Deus Sabaoth' },
  { id: 'agnus_dei', label: 'Agnus Dei', latin: 'Agnus Dei, qui tollis peccata mundi' },
  { id: 'pie_jesu', label: 'Pie Jesu', latin: 'Pie Jesu Domine, dona eis requiem' },
  { id: 'dies_irae', label: 'Dies irae', latin: 'Dies irae, dies illa' },
  { id: 'alleluia', label: 'Alleluia', latin: 'Alleluia, alleluia' },
  { id: 'credo', label: 'Credo', latin: 'Credo in unum Deum' },
  { id: 'salve_regina', label: 'Salve Regina', latin: 'Salve Regina, mater misericordiae' },
  { id: 'lux_aeterna', label: 'Lux aeterna', latin: 'Lux aeterna luceat eis' },
  { id: 'in_paradisum', label: 'In paradisum', latin: 'In paradisum deducant te angeli' },
  { id: 'amen', label: 'Amen', latin: 'Amen, amen' },
];

const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12]; // D dorian degrees in semitones

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function renderOffline(seconds, build) {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  build(ctx);
  return ctx.startRendering();
}

const FORMANTS = {
  ah: [[730, 1], [1090, 0.5], [2440, 0.12]],
  oo: [[300, 1], [870, 0.35], [2240, 0.05]],
  mm: [[250, 1], [500, 0.15], [1200, 0.02]],
};

function voiceChain(ctx, dest, vowel, gainVal) {
  const sum = ctx.createGain(); sum.gain.value = gainVal;
  for (const [freq, amt] of FORMANTS[vowel]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = amt;
    sum.connect(bp); bp.connect(g); g.connect(dest);
  }
  const body = ctx.createBiquadFilter();
  body.type = 'lowpass'; body.frequency.value = 900;
  const bg = ctx.createGain(); bg.gain.value = 0.5;
  sum.connect(body); body.connect(bg); bg.connect(dest);
  return sum;
}

async function makeDrone(vowel) {
  const baseHz = 110; // A2
  const buffer = await renderOffline(6, (ctx) => {
    const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
    for (const det of [-6, 0, 5]) {
      const chain = voiceChain(ctx, out, vowel, 0.33);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = baseHz;
      osc.detune.value = det;
      const vib = ctx.createOscillator(); vib.frequency.value = 0.15 + Math.random() * 0.1;
      const vibG = ctx.createGain(); vibG.gain.value = 3;
      vib.connect(vibG); vibG.connect(osc.detune);
      osc.connect(chain);
      osc.start(); vib.start();
    }
  });
  return { id: `drone_${vowel}_ph`, vowel, base_pitch_hz: baseHz, buffer };
}

async function makePhrase(spec) {
  const baseHz = 146.83; // D3
  const syllables = Math.max(4, spec.latin.split(/[\s-]+/).length + 2);
  const h = hashStr(spec.latin);
  const noteDur = 0.55;
  const total = syllables * noteDur + 3;
  const buffer = await renderOffline(total, (ctx) => {
    const out = ctx.createGain(); out.gain.value = 0.6; out.connect(ctx.destination);
    const chain = voiceChain(ctx, out, 'ah', 1);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const env = ctx.createGain(); env.gain.value = 0;
    osc.connect(env); env.connect(chain);
    let deg = 0;
    for (let i = 0; i < syllables; i++) {
      const t = 0.1 + i * noteDur;
      const roll = (h >> ((i * 3) % 27)) & 7;
      deg = Math.max(0, Math.min(DORIAN.length - 1, deg + [-2, -1, -1, 0, 1, 1, 2, 1][roll]));
      const hz = baseHz * Math.pow(2, DORIAN[deg] / 12);
      osc.frequency.setTargetAtTime(hz, t, 0.04);
      env.gain.setTargetAtTime(0.9, t, 0.06);
    }
    const end = 0.1 + syllables * noteDur;
    osc.frequency.setTargetAtTime(baseHz, end - noteDur, 0.08); // cadence home
    env.gain.setTargetAtTime(0, end, 0.4);
    osc.start();
  });
  return { ...spec, base_pitch_hz: baseHz, buffer };
}

async function makeBell() {
  const f0 = 98;
  const partials = [[0.5, 1, 9], [1, 0.7, 6], [1.19, 0.5, 5], [1.56, 0.35, 4], [2.0, 0.3, 3], [2.51, 0.15, 2.2], [3.01, 0.1, 1.6]];
  const buffer = await renderOffline(7, (ctx) => {
    const out = ctx.createGain(); out.gain.value = 0.5; out.connect(ctx.destination);
    for (const [ratio, amp, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f0 * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, 0);
      g.gain.setTargetAtTime(0, 0.02, decay / 4);
      osc.connect(g); g.connect(out); osc.start();
    }
  });
  return { id: 'bell', kind: 'oneshot', label: 'Bell', buffer };
}

function noiseSource(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  return src;
}

async function makeAmb(id, label, build) {
  const buffer = await renderOffline(12, build);
  return { id, kind: 'loop', label, buffer };
}

export async function makePlaceholders() {
  const phrases = await Promise.all(PHRASE_SPEC.map(makePhrase));
  const drones = await Promise.all(['ah', 'oo', 'mm'].map(makeDrone));
  const sfx = [];
  sfx.push(await makeBell());
  sfx.push(await makeAmb('candles', 'Candles', (ctx) => {
    const src = noiseSource(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(g); g.connect(ctx.destination);
    for (let t = 0; t < 12; t += 0.05 + Math.random() * 0.3) {
      g.gain.setValueAtTime(Math.random() * 0.25, t);
      g.gain.setTargetAtTime(0, t + 0.005, 0.012);
    }
    src.start();
  }));
  sfx.push(await makeAmb('wind', 'Wind', (ctx) => {
    const src = noiseSource(ctx);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2;
    const mod = ctx.createOscillator(); mod.frequency.value = 0.11;
    const mg = ctx.createGain(); mg.gain.value = 220;
    mod.connect(mg); mg.connect(lp.frequency);
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(); mod.start();
  }));
  sfx.push(await makeAmb('rain', 'Rain', (ctx) => {
    const src = noiseSource(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4500; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start();
  }));
  sfx.push(await makeAmb('thunder', 'Thunder', (ctx) => {
    const src = noiseSource(ctx);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90; lp.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.value = 0;
    for (const t of [1.5, 7.5]) {
      g.gain.setTargetAtTime(0.9, t, 0.4);
      g.gain.setTargetAtTime(0, t + 1.2, 0.9);
    }
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start();
  }));
  return { phrases, drones, sfx };
}
