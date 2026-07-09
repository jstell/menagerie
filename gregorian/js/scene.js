// The living cathedral: candle sprites, incense smoke particles, and the
// venue morph. The room's size is driven by the same value as the reverb.

export class Scene {
  constructor(engine) {
    this.engine = engine;
    this.canvas = document.getElementById('smoke');
    this.cx = this.canvas.getContext('2d');
    this.particles = [];
    this.voiceCount = 0;
    this.droneOn = false;
    this.smooth = 0;
    this._buildCandles();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    engine.onvoices = (n, drone) => { this.voiceCount = n; this.droneOn = drone; };
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame((t) => this._tick(t));
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _buildCandles() {
    const holder = document.getElementById('candles');
    holder.innerHTML = '';
    // three banks: left, right, and a distant altar row
    const banks = [
      { cls: 'bank-left', n: 5 },
      { cls: 'bank-right', n: 5 },
      { cls: 'bank-altar', n: 9 },
    ];
    for (const bank of banks) {
      const div = document.createElement('div');
      div.className = 'candle-bank ' + bank.cls;
      for (let i = 0; i < bank.n; i++) {
        const c = document.createElement('div');
        c.className = 'candle';
        c.style.setProperty('--h', (0.65 + Math.random() * 0.7).toFixed(2));
        c.style.setProperty('--fdur', (2.2 + Math.random() * 2.6).toFixed(2) + 's');
        c.style.setProperty('--fdel', (-Math.random() * 4).toFixed(2) + 's');
        c.innerHTML = '<div class="flame"></div><div class="stem"></div>';
        div.appendChild(c);
      }
      holder.appendChild(div);
    }
  }

  setVenue(v) { // 0..1 — drives CSS morph
    document.documentElement.style.setProperty('--venue', v.toFixed(3));
  }

  // Spectral Latin: the words of a phrase drift up through the nave, timed
  // across the phrase's sung duration. Returns a handle for cancelWords().
  // side: -1 words drift on the left (monks), +1 on the right (sisters), 0 full nave
  singWords(latin, durationS, side = 0) {
    let layer = document.getElementById('verba');
    if (!layer) { // stale cached markup — build the layer ourselves
      layer = document.createElement('div');
      layer.id = 'verba';
      document.getElementById('scene')?.appendChild(layer);
    }
    const words = (latin || '').replace(/[.,;:]/g, '').split(/\s+/).filter(Boolean);
    if (!layer || !words.length) return null;
    const windowS = Math.max(2, durationS * 0.82);
    const handle = { timers: [] };
    words.forEach((w, i) => {
      const at = ((i + 0.35) / words.length) * windowS * 1000;
      handle.timers.push(setTimeout(() => {
        const el = document.createElement('span');
        el.className = 'verbum';
        const drift = i / Math.max(1, words.length - 1); // procession across its side
        const xBase = side < 0 ? 7 : side > 0 ? 55 : 16;
        const xSpan = side === 0 ? 54 : 30;
        el.style.left = (xBase + drift * xSpan + Math.random() * 8) + '%';
        el.style.top = (22 + Math.random() * 26) + '%';
        el.style.fontSize = (1.3 + Math.random() * 1.9) + 'rem';
        el.style.setProperty('--vdur', (4.2 + Math.random() * 2.6).toFixed(2) + 's');
        el.style.setProperty('--vsway', (2.4 + Math.random() * 1.8).toFixed(2) + 's');
        el.style.setProperty('--vamp', (0.25 + Math.random() * 0.35).toFixed(2) + 'em');
        el.innerHTML = `<span class="verbum-inner">${w}</span>`;
        el.addEventListener('animationend', () => el.remove());
        layer.appendChild(el);
      }, at));
    });
    return handle;
  }

  cancelWords(handle) {
    if (!handle) return;
    handle.timers.forEach(clearTimeout);
    handle.timers.length = 0;
  }

  setHour(hour) {
    document.body.dataset.hour = hour;
  }

  _spawnSmoke() {
    const w = this.canvas.width, h = this.canvas.height;
    const originX = w * (0.3 + Math.random() * 0.4);
    this.particles.push({
      x: originX,
      y: h * (0.62 + Math.random() * 0.1),
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.18 + Math.random() * 0.25),
      r: 8 + Math.random() * 18,
      life: 0,
      max: 480 + Math.random() * 300,
      drift: Math.random() * Math.PI * 2,
    });
  }

  _tick(t) {
    requestAnimationFrame((tt) => this._tick(tt));
    if (this.reduced) return;

    // audio-reactive glow
    const lvl = this.engine.ctx ? this.engine.level() : 0;
    this.smooth += (lvl - this.smooth) * 0.06;
    const glow = Math.min(1, this.smooth * 6);
    document.documentElement.style.setProperty('--pulse', glow.toFixed(3));

    // smoke: emission scales with active voices
    const want = this.voiceCount * 0.05 + (this.droneOn ? 0.02 : 0) + 0.006;
    if (Math.random() < want && this.particles.length < 90) this._spawnSmoke();

    const cx = this.cx;
    cx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const hue = getComputedStyle(document.body).getPropertyValue('--smoke-rgb') || '210,190,160';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.drift += 0.006;
      p.x += p.vx + Math.sin(p.drift) * 0.35;
      p.y += p.vy;
      p.r += 0.05;
      const a = Math.sin(Math.PI * Math.min(1, p.life / p.max)) * 0.055;
      if (p.life >= p.max || p.y < -40) { this.particles.splice(i, 1); continue; }
      const grad = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `rgba(${hue},${a})`);
      grad.addColorStop(1, `rgba(${hue},0)`);
      cx.fillStyle = grad;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fill();
    }
  }
}

// Follow-the-clock: map local time to a liturgical hour.
export function hourFromClock(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'matins';      // the night office
  if (h < 12) return 'lauds';      // dawn and morning
  if (h < 20) return 'vespers';    // afternoon into dusk
  return 'compline';               // before sleep
}
