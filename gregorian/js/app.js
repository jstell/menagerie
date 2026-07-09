// Schola Cantorum — UI wiring, vespers scheduler, recorder.

import { Engine, NOTE_NAMES } from './audio.js?v=61ad28b';
import { Scene, hourFromClock } from './scene.js?v=61ad28b';
import { makePlaceholders, PHRASE_SPEC } from './placeholders.js?v=61ad28b';

console.log('[schola] build v6');

const $ = (sel) => document.querySelector(sel);
const engine = new Engine();
let scene = null;
let padLoop = new Set();   // pad ids in latch/loop mode
let vespers = null;        // scheduler state
let clockTimer = null;
let recording = false;

const PAD_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'];

// ------------------------------------------------------------------- helpers

function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------------------------------------------------------------- pads

function buildPads() {
  const holder = $('#pads');
  holder.innerHTML = '';
  const entries = engine.phrasesForChoir();
  // keep the canonical order when ids match the spec (sisters ids end in _s)
  const specIdx = (id) => PHRASE_SPEC.findIndex((s) => s.id === id.replace(/_s$/, ''));
  entries.sort((a, b) => {
    const ia = specIdx(a.id);
    const ib = specIdx(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  entries.forEach((p, i) => {
    const pad = document.createElement('button');
    pad.className = 'pad';
    pad.dataset.id = p.id;
    const initial = (p.label || p.id)[0].toUpperCase();
    const rest = (p.label || p.id).slice(1);
    pad.innerHTML = `
      <span class="dropcap">${initial}</span><span class="pad-label">${rest}</span>
      <span class="pad-latin">${p.latin || ''}</span>
      <span class="pad-key">${PAD_KEYS[i] ?? ''}</span>
      <span class="pad-loop" title="Sing without ceasing">⟳</span>`;
    pad.addEventListener('click', (e) => {
      if (e.target.classList.contains('pad-loop')) {
        togglePadLoop(p.id, pad);
      } else {
        togglePhrase(p.id);
      }
    });
    holder.appendChild(pad);
  });

  $('#bank-note').textContent = engine.placeholder
    ? 'Stand-in voices — run `uv run generate/generate.py` to give the schola real ones.'
    : '';
}

function padEl(id) { return document.querySelector(`.pad[data-id="${id}"]`); }

// --------------------------------------------------- antiphonal call/answer
let antiphonal = false;
const chains = new Map(); // baseId -> { remaining } answers still owed
const baseId = (id) => id.replace(/_s$/, '');
const counterpartId = (id) => (id.endsWith('_s') ? id.slice(0, -2) : id + '_s');
const panFor = (id) => (antiphonal ? (id.endsWith('_s') ? 0.4 : -0.4) : 0);
const sideFor = (id) => (antiphonal ? (id.endsWith('_s') ? 1 : -1) : 0);
const padForBase = (base) =>
  document.querySelector(`.pad[data-id="${base}"]`) || document.querySelector(`.pad[data-id="${base}_s"]`);

function togglePhrase(id) {
  if (engine.isPhrasePlaying(id)) {
    engine.stopPhrase(id);
    stopVerba(id);
    chains.delete(baseId(id));
    padEl(id)?.classList.remove('singing');
  } else {
    // in antiphonal mode a latched pad ping-pongs between choirs instead of looping
    const loop = padLoop.has(id) && !antiphonal;
    const entry = engine.playPhrase(id, { loop, pan: panFor(id) });
    if (entry) startVerba(id, entry);
    padEl(id)?.classList.add('singing');
    if (antiphonal && engine.bank.phrases.has(counterpartId(id))) {
      chains.set(baseId(id), { remaining: padLoop.has(id) ? Infinity : 1 });
    }
  }
}

function answerPhrase(endedId) {
  const base = baseId(endedId);
  const c = chains.get(base);
  if (!c || c.remaining <= 0) { chains.delete(base); return; }
  const next = counterpartId(endedId);
  if (!engine.bank.phrases.has(next)) { chains.delete(base); return; }
  c.remaining--;
  setTimeout(() => { // a breath between call and answer
    if (!antiphonal || engine.isPhrasePlaying(next)) return;
    const entry = engine.playPhrase(next, { pan: panFor(next) });
    if (!entry) return;
    startVerba(next, entry);
    // the visible pad glows red when its own choir sings, gold when the far choir answers
    const pad = padForBase(base);
    if (pad) pad.classList.add(pad.dataset.id === next ? 'singing' : 'answering');
  }, 700 + Math.random() * 600);
}

// --- spectral words, synced to each phrase's (tuning-adjusted) duration ---
const verba = new Map(); // id -> { handle, interval }

function startVerba(id, entry) {
  stopVerba(id);
  const rate = Math.pow(2, engine.phraseCents(entry) / 1200);
  const dur = entry.buffer.duration / rate;
  const rec = { handle: scene.singWords(entry.latin, dur, sideFor(id)) };
  if (padLoop.has(id) && !antiphonal) {
    rec.interval = setInterval(() => {
      if (engine.isPhrasePlaying(id)) rec.handle = scene.singWords(entry.latin, dur, sideFor(id));
    }, dur * 1000);
  }
  verba.set(id, rec);
}

function stopVerba(id) {
  const rec = verba.get(id);
  if (!rec) return;
  scene.cancelWords(rec.handle);
  clearInterval(rec.interval);
  verba.delete(id);
}

function togglePadLoop(id, pad) {
  if (padLoop.has(id)) {
    padLoop.delete(id);
    pad.classList.remove('latched');
    // if currently looping, let it finish this pass
    const rec = engine.activePhrases.get(id);
    if (rec) rec.src.loop = false;
    const c = chains.get(baseId(id));
    if (c) c.remaining = 0; // let the current exchange finish, then rest
  } else {
    padLoop.add(id);
    pad.classList.add('latched');
    const rec = engine.activePhrases.get(id);
    if (rec && !antiphonal) rec.src.loop = true;
    // latching mid-antiphony makes the exchange perpetual
    if (antiphonal && (engine.isPhrasePlaying(id) || engine.isPhrasePlaying(counterpartId(id)))) {
      chains.set(baseId(id), { remaining: Infinity });
    }
  }
}

engine.onphraseend = (id) => {
  padEl(id)?.classList.remove('singing');
  padForBase(baseId(id))?.classList.remove('answering');
  stopVerba(id);
  if (antiphonal) answerPhrase(id);
};

function buildAntiphonal() {
  $('#antiphonal').addEventListener('click', () => {
    if (!antiphonal && !(engine.choirAvailable('monks') && engine.choirAvailable('sisters'))) {
      toast('Antiphony needs both choirs — generate the other bank first.');
      return;
    }
    antiphonal = !antiphonal;
    $('#antiphonal').classList.toggle('active', antiphonal);
    if (!antiphonal) {
      chains.clear();
      document.querySelectorAll('.pad.answering').forEach((p) => p.classList.remove('answering'));
    }
    toast(antiphonal
      ? 'Antiphony — the far choir will answer each phrase.'
      : 'The choirs sing apart once more.');
  });
}

// ------------------------------------------------------------------ silence

function silence(quiet = false) {
  stopVespers();
  chains.clear();
  for (const id of [...verba.keys()]) stopVerba(id);
  engine.stopAll();
  document.querySelectorAll('.pad.singing, .pad.answering').forEach((p) => p.classList.remove('singing', 'answering'));
  const btn = $('#drone-toggle');
  btn.textContent = 'Begin the drone';
  btn.classList.remove('active');
  document.querySelectorAll('#ambience input').forEach((i) => { i.value = 0; });
  if (!quiet) toast('Silentium.');
}

// -------------------------------------------------------------------- choir

function buildChoir() {
  document.querySelectorAll('[data-choir-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choir = btn.dataset.choirBtn;
      if (choir === engine.choir) return;
      if (!engine.choirAvailable(choir) && choir !== 'monks') {
        toast('The sisters have not been given voices yet — run the generator.');
        return;
      }
      document.querySelectorAll('[data-choir-btn]').forEach((b) => b.classList.toggle('active', b === btn));
      // let sounding phrases fade out; their pads are about to be replaced
      chains.clear();
      for (const id of [...engine.activePhrases.keys()]) { engine.stopPhrase(id); stopVerba(id); }
      engine.setChoir(choir);
      buildPads();
      toast(choir === 'sisters' ? 'The sisters and children take the choir.' : 'The brothers take the choir.');
    });
  });
}

// --------------------------------------------------------------------- drone

function buildDroneControls() {
  const sel = $('#drone-note');
  NOTE_NAMES.forEach((n, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = n;
    if (i === 2) opt.selected = true; // D — the dorian home
    sel.appendChild(opt);
  });

  $('#drone-toggle').addEventListener('click', toggleDrone);
  sel.addEventListener('change', () => {
    engine.droneState.note = +sel.value;
    engine.droneRetune();
    engine.retunePhrases(); // the chants follow the ison
  });
  $('#drone-octave').addEventListener('change', (e) => { engine.droneState.octave = +e.target.value; engine.droneRetune(); });

  $('#drone-vowel').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-vowel]');
    if (!btn) return;
    document.querySelectorAll('#drone-vowel button').forEach((b) => b.classList.toggle('active', b === btn));
    engine.droneState.vowel = btn.dataset.vowel;
    engine.droneRebuild();
  });

  bindSlider('#drone-voices', '#out-voices', (v) => {
    engine.droneState.voices = v;
    engine.droneRebuild();
    return v;
  });
  bindSlider('#drone-fine', '#out-fine', (v) => {
    engine.droneState.fine = v;
    engine.droneRetune();
    return `${v > 0 ? '+' : ''}${v}¢`;
  });
  bindSlider('#drone-swell', '#out-swell', (v) => {
    engine.droneState.swell = v;
    return v.toFixed(1) + 's';
  });
  bindSlider('#drone-level', '#out-dlevel', (v) => {
    engine.setDroneLevel(v / 100);
    return v;
  });

  $('#org-5').addEventListener('click', () => toggleOrganum('fifth', '#org-5'));
  $('#org-8').addEventListener('click', () => toggleOrganum('octaveUp', '#org-8'));

  $('#tune-chants').addEventListener('click', () => {
    const on = !engine.tuneChants;
    engine.setTuneChants(on);
    $('#tune-chants').classList.toggle('active', on);
  });

  bindSlider('#pad-transpose', '#out-transpose', (v) => {
    engine.setPadTranspose(v);
    return `${v > 0 ? '+' : ''}${v} st`;
  });
}

function toggleDrone() {
  const btn = $('#drone-toggle');
  if (engine.droneState.on) {
    engine.droneOff();
    btn.textContent = 'Begin the drone';
    btn.classList.remove('active');
  } else {
    engine.droneOn();
    btn.textContent = 'Release the drone';
    btn.classList.add('active');
  }
}

function toggleOrganum(which, selector) {
  engine.organum[which] = !engine.organum[which];
  $(selector).classList.toggle('active', engine.organum[which]);
  engine.setOrganum(engine.organum.fifth, engine.organum.octaveUp);
}

function bindSlider(inputSel, outSel, apply) {
  const input = $(inputSel), out = $(outSel);
  const run = () => { out.textContent = apply(+input.value); };
  input.addEventListener('input', run);
  run();
}

// ------------------------------------------------------------------- console

function buildConsole() {
  const venue = $('#venue');
  const applyVenue = () => {
    const v = +venue.value / 100;
    engine.setVenue(v);
    scene.setVenue(v);
  };
  venue.addEventListener('input', applyVenue);

  bindSlider('#wet', '#out-wet', (v) => { engine.setWet(v / 100); return v; });
  bindSlider('#warmth', '#out-warmth', (v) => { engine.setWarmth(v / 100); return v; });
  applyVenue();

  // ambience mixer from whatever loops the bank offers
  const holder = $('#ambience');
  holder.innerHTML = '';
  for (const s of engine.bank.sfx.values()) {
    if (s.kind !== 'loop') continue;
    const row = document.createElement('div');
    row.className = 'mini-slider amb';
    row.innerHTML = `<label>${s.label || s.id}</label><input type="range" min="0" max="100" value="0" aria-label="${s.label || s.id} level">`;
    row.querySelector('input').addEventListener('input', (e) => engine.setAmbience(s.id, +e.target.value / 100));
    holder.appendChild(row);
  }

  $('#bell').addEventListener('click', () => engine.bell());
}

// --------------------------------------------------------------------- hours

function buildHours() {
  document.querySelectorAll('[data-hour-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-hour-btn]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const h = btn.dataset.hourBtn;
      clearInterval(clockTimer);
      if (h === 'auto') {
        const apply = () => scene.setHour(hourFromClock());
        apply();
        clockTimer = setInterval(apply, 60000);
      } else {
        scene.setHour(h);
      }
    });
  });
}

// ------------------------------------------------------------------ recorder

function buildRecorder() {
  const btn = $('#record');
  btn.addEventListener('click', async () => {
    if (!recording) {
      engine.startRecording();
      recording = true;
      btn.classList.add('recording');
      btn.textContent = '■ Stop';
      toast('Recording — the room is listening.');
    } else {
      const blob = await engine.stopRecording();
      recording = false;
      btn.classList.remove('recording');
      btn.textContent = '● Record';
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = URL.createObjectURL(blob);
      a.download = `schola-${stamp}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast('Saved the performance.');
    }
  });
}

// -------------------------------------------------------- vespers (self-sing)

function startVespers() {
  vespers = { timers: [] };
  $('#vespers-mode').classList.add('active');
  toast('The schola sings by itself. Touch anything to take back the choir.');

  if (!engine.droneState.on) toggleDrone();

  const later = (fn, ms) => { const t = setTimeout(fn, ms); vespers.timers.push(t); };

  const singNext = () => {
    if (!vespers) return;
    const ids = engine.phrasesForChoir().map((p) => p.id).filter((id) => !engine.isPhrasePlaying(id));
    if (ids.length) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      // occasionally let a phrase carry organum
      if (Math.random() < 0.25 && !engine.organum.fifth) {
        toggleOrganum('fifth', '#org-5');
        later(() => { if (vespers && engine.organum.fifth) toggleOrganum('fifth', '#org-5'); }, 20000);
      }
      togglePhrase(id);
    }
    later(singNext, 6000 + Math.random() * 9000);
  };
  later(singNext, 2500);

  const toll = () => {
    if (!vespers) return;
    engine.bell();
    later(toll, 120000 + Math.random() * 90000);
  };
  later(toll, 30000 + Math.random() * 60000);
}

function stopVespers() {
  if (!vespers) return;
  vespers.timers.forEach(clearTimeout);
  vespers = null;
  $('#vespers-mode').classList.remove('active');
}

function buildVespers() {
  $('#vespers-mode').addEventListener('click', () => (vespers ? stopVespers() : startVespers()));
  // any manual pad/drone interaction pauses the rite
  $('#pads').addEventListener('pointerdown', stopVespers, true);
  $('#drone-rail').addEventListener('pointerdown', (e) => {
    if (e.target.id !== 'vespers-mode') stopVespers();
  }, true);
}

// ------------------------------------------------------------------ keyboard

function buildKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(input|select|textarea)$/i.test(document.activeElement?.tagName || '')) return;
    const k = e.key.toLowerCase();
    const padIdx = PAD_KEYS.indexOf(k);
    if (padIdx >= 0) {
      const pad = document.querySelectorAll('#pads .pad')[padIdx];
      if (pad) { stopVespers(); togglePhrase(pad.dataset.id); }
      e.preventDefault();
    } else if (k === ' ') {
      stopVespers();
      toggleDrone();
      e.preventDefault();
    } else if (k === 'b') {
      engine.bell();
    } else if (k === 'a') {
      $('#antiphonal').click();
    } else if (k === 'escape') {
      silence();
    }
  });
}

// ---------------------------------------------------------------------- boot

async function enter() {
  const btn = $('#enter');
  const note = $('#veil-note');
  const step = (msg) => { note.textContent = msg; console.log('[schola]', msg); };
  btn.disabled = true;
  btn.textContent = 'Lighting the candles…';
  step('waking the organ…');
  await engine.init();
  step('summoning the choir…');
  await engine.loadBank(makePlaceholders);
  step('');
  scene = new Scene(engine);

  buildPads();
  buildChoir();
  buildAntiphonal();
  buildDroneControls();
  buildConsole();
  buildHours();
  buildRecorder();
  buildVespers();
  buildKeyboard();
  $('#silence').addEventListener('click', () => silence());

  window.schola = { engine, scene, debug: { chains, isAntiphonal: () => antiphonal } }; // console/debug handle
  document.body.dataset.started = 'yes';
  $('#veil').classList.add('lifted');
  setTimeout(() => $('#veil').remove(), 2600);
  setTimeout(() => scene.singWords('Deo gratias', 5), 2200); // greet — and prove the words work
  if (engine.placeholder) {
    toast('Singing with stand-in voices until the bank is generated.', 5000);
  }
}

$('#enter').addEventListener('click', enter);

// automated-testing hook: /?enter skips the veil (audio may stay suspended
// until a real gesture unless the browser allows autoplay)
if (new URLSearchParams(location.search).has('enter')) enter();

// quick capability note on the veil
if (!('AudioContext' in window || 'webkitAudioContext' in window)) {
  $('#veil-note').textContent = 'This browser lacks Web Audio — the schola cannot sing here.';
  $('#enter').disabled = true;
}
