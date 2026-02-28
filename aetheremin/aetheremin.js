/* ============================
   Aetheremin - Web Theremin Engine
   Multi-touch, Animal Sounds, Mic Sampling, Loop Station
   ============================ */

(() => {
    'use strict';

    // ---- Constants ----
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    const SCALES = {
        free: null,
        chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
        major: [0,2,4,5,7,9,11],
        minor: [0,2,3,5,7,8,10],
        pentatonic: [0,2,4,7,9],
        blues: [0,3,5,6,7,10],
        'whole-tone': [0,2,4,6,8,10],
        arabic: [0,1,4,5,7,8,11]
    };

    const PRESETS = {
        classic: {
            waveform: 'sine', delayMix: 0, reverbMix: 20, vibratoDepth: 8,
            vibratoRate: 5, distortion: 0, chorusMix: 0, portamento: 50,
            scale: 'free', theme: 'cosmic'
        },
        spooky: {
            waveform: 'sine', delayMix: 40, reverbMix: 60, vibratoDepth: 25,
            vibratoRate: 4, distortion: 0, chorusMix: 20, portamento: 120,
            scale: 'chromatic', theme: 'matrix'
        },
        ambient: {
            waveform: 'triangle', delayMix: 55, reverbMix: 70, vibratoDepth: 10,
            vibratoRate: 3, distortion: 0, chorusMix: 40, portamento: 100,
            scale: 'pentatonic', theme: 'ocean'
        },
        'synth-lead': {
            waveform: 'sawtooth', delayMix: 15, reverbMix: 15, vibratoDepth: 0,
            vibratoRate: 5, distortion: 25, chorusMix: 30, portamento: 20,
            scale: 'free', theme: 'neon'
        },
        'sci-fi': {
            waveform: 'sawtooth', delayMix: 35, reverbMix: 40, vibratoDepth: 50,
            vibratoRate: 12, distortion: 15, chorusMix: 50, portamento: 5,
            scale: 'whole-tone', theme: 'cosmic'
        },
        underwater: {
            waveform: 'sine', delayMix: 50, reverbMix: 80, vibratoDepth: 15,
            vibratoRate: 2, distortion: 0, chorusMix: 60, portamento: 150,
            scale: 'major', theme: 'ocean'
        },
        'cat-chorus': {
            waveform: 'cat', delayMix: 20, reverbMix: 30, vibratoDepth: 30,
            vibratoRate: 6, distortion: 0, chorusMix: 40, portamento: 80,
            scale: 'pentatonic', theme: 'neon'
        },
        'whale-song': {
            waveform: 'whale', delayMix: 60, reverbMix: 90, vibratoDepth: 15,
            vibratoRate: 1.5, distortion: 0, chorusMix: 50, portamento: 180,
            scale: 'major', theme: 'ocean'
        }
    };

    const THEME_COLORS = {
        cosmic: { primary: [123, 47, 247], secondary: [0, 212, 255] },
        neon:   { primary: [255, 45, 117], secondary: [0, 255, 136] },
        fire:   { primary: [255, 102, 0],  secondary: [255, 204, 0] },
        ocean:  { primary: [0, 119, 204],  secondary: [0, 204, 170] },
        matrix: { primary: [0, 255, 0],    secondary: [68, 255, 68] }
    };

    const ANIMAL_WAVES = ['cat', 'dog', 'bird', 'whale'];

    // ---- State ----
    let audioCtx = null;
    let currentWaveform = 'sine';
    let octaveLow = 2;
    let octaveHigh = 6;
    let currentScale = 'free';
    let currentKey = 0;
    let currentTheme = 'cosmic';
    let portamentoTime = 50;
    let particleAmount = 60;
    let showGrid = false;
    let animalPeriodicWaves = {};
    let micSampleWave = null; // PeriodicWave from mic sample
    let micSampleBuffer = null; // Raw AudioBuffer for playback preview

    // Multi-touch voices: pointerId -> voice
    const voices = new Map();

    // Shared effects chain nodes
    let effectsInput = null;
    let delayNode = null, delayGain = null, delayFeedback = null;
    let convolverNode = null, reverbGain = null, dryGain = null;
    let distortionNode = null, distortionMix = null, distortionDry = null;
    let chorusDelay = null, chorusOsc = null, chorusGain = null;
    let chorusMixGain = null, chorusDryGain = null;
    let masterGain = null;
    let analyser = null;
    let destNode = null;

    // Recording
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let recordStartTime = 0;
    let recTimerInterval = null;

    // Loop station
    let loopTracks = [];
    let loopLength = 0;
    let loopStartTime = 0;
    let isLoopRecording = false;
    let loopRecorder = null;
    let loopChunks = [];
    let loopTimerInterval = null;
    let loopPlaybackInterval = null;
    let loopPlaybackStart = 0;
    let isLoopPlaying = false;
    let nextTrackId = 1;

    // Visuals
    let vizCanvas, vizCtx, particleCanvas, particleCtx;
    let particles = [];
    let animFrameId = null;
    let waveformData, frequencyData;

    // DOM shorthand
    const $ = id => document.getElementById(id);

    // =======================================================
    // AUDIO ENGINE INIT
    // =======================================================

    function initAudio() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        effectsInput = audioCtx.createGain();

        // Distortion
        distortionNode = audioCtx.createWaveShaper();
        distortionNode.oversample = '4x';
        distortionMix = audioCtx.createGain();
        distortionMix.gain.value = 0;
        distortionDry = audioCtx.createGain();
        distortionDry.gain.value = 1;

        // Delay
        delayNode = audioCtx.createDelay(2);
        delayNode.delayTime.value = 0.3;
        delayGain = audioCtx.createGain();
        delayGain.gain.value = 0;
        delayFeedback = audioCtx.createGain();
        delayFeedback.gain.value = 0.4;

        // Reverb
        convolverNode = audioCtx.createConvolver();
        convolverNode.buffer = createReverbIR(3);
        reverbGain = audioCtx.createGain();
        reverbGain.gain.value = 0.2;
        dryGain = audioCtx.createGain();
        dryGain.gain.value = 0.8;

        // Chorus
        chorusDelay = audioCtx.createDelay(0.1);
        chorusDelay.delayTime.value = 0.015;
        chorusOsc = audioCtx.createOscillator();
        chorusOsc.type = 'sine';
        chorusOsc.frequency.value = 1.5;
        chorusGain = audioCtx.createGain();
        chorusGain.gain.value = 0.005;
        chorusOsc.connect(chorusGain);
        chorusGain.connect(chorusDelay.delayTime);
        chorusOsc.start();
        chorusMixGain = audioCtx.createGain();
        chorusMixGain.gain.value = 0;
        chorusDryGain = audioCtx.createGain();
        chorusDryGain.gain.value = 1;

        // Master
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.8;

        // Analyser
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        waveformData = new Uint8Array(analyser.frequencyBinCount);
        frequencyData = new Uint8Array(analyser.frequencyBinCount);

        // Recording dest
        destNode = audioCtx.createMediaStreamDestination();

        // ---- Wire effects chain ----
        effectsInput.connect(distortionNode);
        distortionNode.connect(distortionMix);
        effectsInput.connect(distortionDry);

        const postDist = audioCtx.createGain();
        distortionMix.connect(postDist);
        distortionDry.connect(postDist);

        postDist.connect(delayNode);
        delayNode.connect(delayGain);
        delayNode.connect(delayFeedback);
        delayFeedback.connect(delayNode);

        const preChorus = audioCtx.createGain();
        postDist.connect(preChorus);
        delayGain.connect(preChorus);

        preChorus.connect(chorusDelay);
        chorusDelay.connect(chorusMixGain);
        preChorus.connect(chorusDryGain);

        const preReverb = audioCtx.createGain();
        chorusMixGain.connect(preReverb);
        chorusDryGain.connect(preReverb);

        preReverb.connect(convolverNode);
        convolverNode.connect(reverbGain);
        preReverb.connect(dryGain);

        reverbGain.connect(masterGain);
        dryGain.connect(masterGain);

        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.connect(destNode);

        buildAnimalWaves();
        updateDistortionCurve(0);
    }

    function createReverbIR(duration) {
        const sr = audioCtx.sampleRate;
        const len = sr * duration;
        const buf = audioCtx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
            }
        }
        return buf;
    }

    function updateDistortionCurve(amount) {
        if (amount === 0) {
            distortionNode.curve = null;
            distortionMix.gain.setValueAtTime(0, audioCtx.currentTime);
            distortionDry.gain.setValueAtTime(1, audioCtx.currentTime);
            return;
        }
        const k = amount * 4;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        const mix = amount / 100;
        distortionMix.gain.setValueAtTime(mix, audioCtx.currentTime);
        distortionDry.gain.setValueAtTime(1 - mix * 0.5, audioCtx.currentTime);
    }

    // =======================================================
    // ANIMAL SOUND SYNTHESIS (PeriodicWave)
    // =======================================================

    function buildAnimalWaves() {
        // Cat - nasal, strong odd harmonics
        const catR = new Float32Array(32), catI = new Float32Array(32);
        catI[1] = 1; catI[2] = 0.6; catI[3] = 0.8; catI[4] = 0.3;
        catI[5] = 0.5; catI[6] = 0.15; catI[7] = 0.35; catI[8] = 0.1;
        catI[9] = 0.2; catI[10] = 0.15;
        for (let i = 11; i < 32; i++) catI[i] = 0.05 * Math.random();
        animalPeriodicWaves.cat = audioCtx.createPeriodicWave(catR, catI);

        // Dog - rich warm harmonics
        const dogR = new Float32Array(32), dogI = new Float32Array(32);
        dogI[1] = 1; dogI[2] = 0.8; dogI[3] = 0.5; dogI[4] = 0.6;
        dogI[5] = 0.3; dogI[6] = 0.4; dogI[7] = 0.2; dogI[8] = 0.25;
        dogI[9] = 0.15; dogI[10] = 0.2; dogI[11] = 0.1; dogI[12] = 0.12;
        for (let i = 13; i < 32; i++) dogI[i] = 0.02;
        animalPeriodicWaves.dog = audioCtx.createPeriodicWave(dogR, dogI);

        // Bird - bright, high harmonics
        const birdR = new Float32Array(32), birdI = new Float32Array(32);
        birdI[1] = 0.5; birdI[2] = 0.3; birdI[3] = 0.7; birdI[4] = 0.9;
        birdI[5] = 1; birdI[6] = 0.8; birdI[7] = 0.6; birdI[8] = 0.7;
        birdI[9] = 0.4; birdI[10] = 0.5; birdI[11] = 0.3; birdI[12] = 0.4;
        for (let i = 13; i < 24; i++) birdI[i] = Math.abs(0.2 * Math.cos(i * 0.5));
        for (let i = 24; i < 32; i++) birdI[i] = 0.05;
        animalPeriodicWaves.bird = audioCtx.createPeriodicWave(birdR, birdI);

        // Whale - deep, ethereal
        const whaleR = new Float32Array(32), whaleI = new Float32Array(32);
        whaleI[1] = 1; whaleI[2] = 0.9; whaleI[3] = 0.4; whaleI[4] = 0.3;
        whaleI[5] = 0.5; whaleI[6] = 0.1; whaleI[7] = 0.3; whaleI[8] = 0.05;
        whaleI[9] = 0.2; whaleI[10] = 0.03;
        for (let i = 11; i < 32; i++) whaleI[i] = 0.02;
        animalPeriodicWaves.whale = audioCtx.createPeriodicWave(whaleR, whaleI);
    }

    // =======================================================
    // MIC SAMPLING
    // =======================================================

    async function startMicSample() {
        const btn = $('mic-sample-btn');
        const status = $('mic-status');

        try {
            status.textContent = 'Listening...';
            status.className = 'mic-status sampling';
            btn.classList.add('sampling');

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Use MediaRecorder to capture the full audio
            const chunks = [];
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

            const recordingDone = new Promise(resolve => { recorder.onstop = resolve; });
            recorder.start();

            // 3-second countdown
            for (let i = 3; i >= 1; i--) {
                status.textContent = `Recording ${i}s...`;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            recorder.stop();
            stream.getTracks().forEach(t => t.stop());
            await recordingDone;

            status.textContent = 'Processing...';

            // Decode the recorded audio into a buffer
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const arrayBuf = await blob.arrayBuffer();
            const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
            micSampleBuffer = audioBuf;

            // Extract waveform: analyze a stable middle section
            const channelData = audioBuf.getChannelData(0);
            const fftSize = 4096;
            // Use the middle of the recording for the most stable signal
            const midStart = Math.max(0, Math.floor(channelData.length / 2) - fftSize / 2);
            const segment = channelData.slice(midStart, midStart + fftSize);

            // Compute FFT manually using the segment
            const numHarmonics = 64;
            const realCoeffs = new Float32Array(numHarmonics);
            const imagCoeffs = new Float32Array(numHarmonics);
            const N = segment.length;

            for (let k = 1; k < numHarmonics; k++) {
                let re = 0, im = 0;
                for (let n = 0; n < N; n++) {
                    const angle = (2 * Math.PI * k * n) / N;
                    re += segment[n] * Math.cos(angle);
                    im -= segment[n] * Math.sin(angle);
                }
                realCoeffs[k] = re / N;
                imagCoeffs[k] = im / N;
            }

            // Normalize by peak magnitude
            let maxMag = 0;
            for (let k = 1; k < numHarmonics; k++) {
                const mag = Math.sqrt(realCoeffs[k] ** 2 + imagCoeffs[k] ** 2);
                if (mag > maxMag) maxMag = mag;
            }
            if (maxMag > 0) {
                for (let k = 1; k < numHarmonics; k++) {
                    realCoeffs[k] /= maxMag;
                    imagCoeffs[k] /= maxMag;
                }
            }

            micSampleWave = audioCtx.createPeriodicWave(realCoeffs, imagCoeffs);

            status.textContent = 'Sampled!';
            status.className = 'mic-status ready';
            btn.classList.remove('sampling');

            addSampleWaveButton();
            $('mic-preview-btn').disabled = false;
            selectWaveform('sample');

        } catch (err) {
            status.textContent = 'Mic denied';
            status.className = 'mic-status';
            btn.classList.remove('sampling');
        }
    }

    function playMicPreview() {
        if (!micSampleBuffer) return;
        const src = audioCtx.createBufferSource();
        src.buffer = micSampleBuffer;
        src.connect(audioCtx.destination);
        src.start();
    }

    function addSampleWaveButton() {
        if (document.querySelector('[data-wave="sample"]')) return;
        const container = $('mic-sample-btn').parentElement;
        const btn = document.createElement('button');
        btn.className = 'wave-btn sample-btn';
        btn.dataset.wave = 'sample';
        btn.title = 'Mic Sample';
        btn.innerHTML = '<span class="animal-icon">&#127908;</span><span>Sample</span>';
        btn.addEventListener('click', () => selectWaveform('sample'));
        container.appendChild(btn);
    }

    // =======================================================
    // WAVEFORM HELPERS
    // =======================================================

    function applyWaveformToOsc(osc, wave) {
        if (wave === 'sample' && micSampleWave) {
            osc.setPeriodicWave(micSampleWave);
        } else if (ANIMAL_WAVES.includes(wave) && animalPeriodicWaves[wave]) {
            osc.setPeriodicWave(animalPeriodicWaves[wave]);
        } else {
            // Standard waveforms: sine, triangle, sawtooth, square
            try { osc.type = wave; } catch (e) { osc.type = 'sine'; }
        }
    }

    function selectWaveform(wave) {
        currentWaveform = wave;
        document.querySelectorAll('.wave-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.wave === wave);
        });
        for (const voice of voices.values()) {
            applyWaveformToOsc(voice.osc, wave);
        }
    }

    // =======================================================
    // VOICE MANAGEMENT (Multi-touch polyphony)
    // =======================================================

    function createVoice(pointerId) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);

        // Per-voice vibrato LFO
        const vibOsc = audioCtx.createOscillator();
        vibOsc.type = 'sine';
        vibOsc.frequency.value = parseFloat($('vibrato-rate').value);
        const vibGain = audioCtx.createGain();
        vibGain.gain.value = 0;
        vibOsc.connect(vibGain);
        vibGain.connect(osc.frequency);
        vibOsc.start();

        applyWaveformToOsc(osc, currentWaveform);
        osc.frequency.value = 440;
        osc.connect(gain);
        gain.connect(effectsInput);
        osc.start();

        // Create glow element
        const glowEl = document.createElement('div');
        glowEl.className = 'touch-glow';
        $('glow-container').appendChild(glowEl);

        const voice = { pointerId, osc, gain, vibOsc, vibGain, glowEl, freq: 440, vol: 0, x: 0, y: 0 };
        voices.set(pointerId, voice);
        return voice;
    }

    function destroyVoice(pointerId) {
        const v = voices.get(pointerId);
        if (!v) return;

        const now = audioCtx.currentTime;
        v.gain.gain.linearRampToValueAtTime(0, now + 0.08);

        setTimeout(() => {
            try { v.osc.stop(); v.osc.disconnect(); } catch (_) {}
            try { v.vibOsc.stop(); v.vibOsc.disconnect(); v.vibGain.disconnect(); } catch (_) {}
            try { v.gain.disconnect(); } catch (_) {}
            if (v.glowEl && v.glowEl.parentNode) v.glowEl.parentNode.removeChild(v.glowEl);
        }, 150);

        voices.delete(pointerId);
    }

    function updateVoiceFromCoords(voice, coords) {
        const freq = mapXToFreq(coords.xNorm);
        const vol = mapYToVol(coords.yNorm);
        const now = audioCtx.currentTime;
        const portSec = portamentoTime / 1000;

        voice.freq = freq;
        voice.vol = vol;
        voice.x = coords.x;
        voice.y = coords.y;

        voice.osc.frequency.linearRampToValueAtTime(freq, now + portSec);
        voice.gain.gain.linearRampToValueAtTime(vol * 0.4, now + 0.05);

        // Vibrato depth
        const depth = parseFloat($('vibrato-depth').value);
        voice.vibGain.gain.setValueAtTime(depth > 0 ? freq * (depth / 100) * 0.05 : 0, now);

        // Glow
        if (voice.glowEl) {
            voice.glowEl.style.left = coords.x + 'px';
            voice.glowEl.style.top = coords.y + 'px';
            const size = 40 + vol * 60;
            voice.glowEl.style.width = size + 'px';
            voice.glowEl.style.height = size + 'px';
        }
    }

    // =======================================================
    // FREQUENCY / NOTE HELPERS
    // =======================================================

    function freqToNote(freq) {
        const n = 12 * Math.log2(freq / 440) + 69;
        const r = Math.round(n);
        return { name: NOTE_NAMES[((r % 12) + 12) % 12], octave: Math.floor(r / 12) - 1, midi: r };
    }

    function noteToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function snapToScale(freq, scale, key) {
        if (!scale || scale === 'free') return freq;
        const intervals = SCALES[scale];
        if (!intervals) return freq;
        const n = 12 * Math.log2(freq / 440) + 69;
        const oct = Math.floor(n / 12);
        let best = Infinity, bestMidi = Math.round(n);
        for (let o = oct - 1; o <= oct + 1; o++) {
            for (const iv of intervals) {
                const midi = o * 12 + ((iv + key) % 12);
                const d = Math.abs(n - midi);
                if (d < best) { best = d; bestMidi = midi; }
            }
        }
        return noteToFreq(bestMidi);
    }

    function mapXToFreq(xNorm) {
        const lo = noteToFreq(octaveLow * 12 + 12);
        const hi = noteToFreq(octaveHigh * 12 + 12);
        return snapToScale(lo * Math.pow(hi / lo, xNorm), currentScale, currentKey);
    }

    function mapYToVol(yNorm) {
        return Math.pow(1 - yNorm, 1.5);
    }

    // =======================================================
    // POINTER / TOUCH EVENTS
    // =======================================================

    function getPlayAreaCoords(clientX, clientY) {
        const rect = $('play-area').getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        return {
            x, y,
            xNorm: Math.max(0, Math.min(1, x / rect.width)),
            yNorm: Math.max(0, Math.min(1, y / rect.height))
        };
    }

    function onPointerDown(e) {
        if (e.target.closest('#controls-panel') || e.target.closest('#header')) return;
        e.preventDefault();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        const voice = createVoice(e.pointerId);
        updateVoiceFromCoords(voice, getPlayAreaCoords(e.clientX, e.clientY));
    }

    function onPointerMove(e) {
        const voice = voices.get(e.pointerId);
        if (!voice) return;
        e.preventDefault();
        updateVoiceFromCoords(voice, getPlayAreaCoords(e.clientX, e.clientY));
    }

    function onPointerUp(e) {
        destroyVoice(e.pointerId);
    }

    // =======================================================
    // PARTICLES
    // =======================================================

    class Particle {
        constructor(x, y, color) {
            this.x = x; this.y = y;
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = (Math.random() - 0.5) * 3 - 1;
            this.life = 1;
            this.decay = 0.01 + Math.random() * 0.025;
            this.size = 2 + Math.random() * 4;
            this.color = color;
        }
        update() { this.x += this.vx; this.y += this.vy; this.vy += 0.02; this.life -= this.decay; }
        draw(ctx) {
            if (this.life <= 0) return;
            ctx.save();
            ctx.globalAlpha = this.life * 0.8;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function spawnParticles(x, y, count) {
        const c = THEME_COLORS[currentTheme];
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const r = Math.round(c.primary[0] * (1-t) + c.secondary[0] * t);
            const g = Math.round(c.primary[1] * (1-t) + c.secondary[1] * t);
            const b = Math.round(c.primary[2] * (1-t) + c.secondary[2] * t);
            particles.push(new Particle(x, y, `rgb(${r},${g},${b})`));
        }
        if (particles.length > 600) particles = particles.slice(-500);
    }

    // =======================================================
    // VISUALIZATION
    // =======================================================

    function drawVisualization() {
        if (!vizCtx || !analyser) return;
        const W = vizCanvas.width, H = vizCanvas.height;
        const c = THEME_COLORS[currentTheme];
        vizCtx.clearRect(0, 0, W, H);

        // Waveform
        analyser.getByteTimeDomainData(waveformData);
        vizCtx.beginPath();
        const sw = W / waveformData.length;
        for (let i = 0; i < waveformData.length; i++) {
            const y = (waveformData[i] / 128) * H / 2;
            i === 0 ? vizCtx.moveTo(0, y) : vizCtx.lineTo(i * sw, y);
        }
        const grad = vizCtx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, `rgba(${c.primary.join(',')},0.6)`);
        grad.addColorStop(1, `rgba(${c.secondary.join(',')},0.6)`);
        vizCtx.strokeStyle = grad;
        vizCtx.lineWidth = 2;
        vizCtx.shadowColor = `rgba(${c.primary.join(',')},0.4)`;
        vizCtx.shadowBlur = 10;
        vizCtx.stroke();
        vizCtx.shadowBlur = 0;

        // Frequency bars
        if (voices.size > 0) {
            analyser.getByteFrequencyData(frequencyData);
            const bc = 64, bw = W / bc;
            for (let i = 0; i < bc; i++) {
                const bh = (frequencyData[i] / 255) * H * 0.4;
                const t = i / bc;
                const r = Math.round(c.primary[0]*(1-t) + c.secondary[0]*t);
                const g = Math.round(c.primary[1]*(1-t) + c.secondary[1]*t);
                const b = Math.round(c.primary[2]*(1-t) + c.secondary[2]*t);
                vizCtx.fillStyle = `rgba(${r},${g},${b},0.15)`;
                vizCtx.fillRect(i * bw, H - bh, bw - 1, bh);
            }
        }

        // Multi-touch connection lines
        if (voices.size > 1) {
            const pts = Array.from(voices.values());
            vizCtx.strokeStyle = `rgba(${c.secondary.join(',')},0.2)`;
            vizCtx.lineWidth = 1;
            vizCtx.setLineDash([4, 8]);
            vizCtx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                    vizCtx.moveTo(pts[i].x, pts[i].y);
                    vizCtx.lineTo(pts[j].x, pts[j].y);
                }
            }
            vizCtx.stroke();
            vizCtx.setLineDash([]);
        }
    }

    function drawParticles() {
        if (!particleCtx) return;
        particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
        particles.forEach(p => { p.update(); p.draw(particleCtx); });
        particles = particles.filter(p => p.life > 0);
    }

    // =======================================================
    // ANIMATION LOOP
    // =======================================================

    function animate() {
        drawVisualization();
        drawParticles();
        for (const v of voices.values()) {
            if (v.vol > 0.05) {
                spawnParticles(v.x, v.y, Math.ceil(v.vol * particleAmount / 50));
            }
        }
        updateUI();
        updateLoopProgress();
        animFrameId = requestAnimationFrame(animate);
    }

    // =======================================================
    // UI
    // =======================================================

    function updateUI() {
        let pVoice = null;
        for (const v of voices.values()) { pVoice = v; break; }

        if (pVoice && pVoice.vol > 0.01) {
            const note = freqToNote(pVoice.freq);
            $('note-display').textContent = note.name + note.octave;
            $('freq-display').textContent = Math.round(pVoice.freq) + ' Hz';
        } else {
            $('note-display').textContent = '--';
            $('freq-display').textContent = '0 Hz';
        }

        $('touch-count').textContent = voices.size > 1 ? voices.size + ' voices' : '';

        let maxVol = 0;
        for (const v of voices.values()) if (v.vol > maxVol) maxVol = v.vol;
        $('volume-fill').style.height = (maxVol * 100) + '%';

        if (pVoice) {
            const pct = (pVoice.x / $('play-area').clientWidth) * 100;
            $('pitch-indicator').style.left = Math.max(0, Math.min(100, pct)) + '%';
        }
    }

    // =======================================================
    // FREQUENCY GUIDES
    // =======================================================

    function buildFreqGuides() {
        const el = $('freq-guides');
        el.innerHTML = '';
        const lo = noteToFreq(octaveLow * 12 + 12);
        const hi = noteToFreq(octaveHigh * 12 + 12);

        // Octave markers (C notes)
        for (let oct = octaveLow; oct <= octaveHigh; oct++) {
            const f = noteToFreq(oct * 12 + 12);
            const x = Math.log(f / lo) / Math.log(hi / lo);
            if (x < 0 || x > 1) continue;
            const g = document.createElement('div');
            g.className = 'freq-guide';
            g.style.left = (x * 100) + '%';
            const lbl = document.createElement('span');
            lbl.className = 'freq-guide-label';
            lbl.textContent = 'C' + oct;
            lbl.style.left = (x * 100) + '%';
            el.appendChild(g);
            el.appendChild(lbl);
        }

        if (!showGrid) return;

        // Scale grid lines: use the active scale intervals, or all 12 chromatic for free mode
        const intervals = (currentScale === 'free' || !SCALES[currentScale])
            ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
            : SCALES[currentScale];
        // Only show note labels when there are few enough notes to be readable
        const showLabels = intervals.length < 12;

        for (let oct = octaveLow; oct <= octaveHigh; oct++) {
            for (const iv of intervals) {
                const semitone = (iv + currentKey) % 12;
                const midi = oct * 12 + 12 + semitone;
                const f = noteToFreq(midi);
                const x = Math.log(f / lo) / Math.log(hi / lo);
                if (x < 0 || x > 1) continue;

                // Tonic highlights only make sense when a scale is active
                const isTonic = iv === 0 && currentScale !== 'free';

                const g = document.createElement('div');
                g.className = 'scale-guide' + (isTonic ? ' is-tonic' : '');
                g.style.left = (x * 100) + '%';
                el.appendChild(g);

                if (showLabels) {
                    const noteOct = Math.floor(midi / 12) - 1;
                    const lbl = document.createElement('span');
                    lbl.className = 'scale-guide-label' + (isTonic ? ' is-tonic' : '');
                    lbl.textContent = NOTE_NAMES[semitone] + noteOct;
                    lbl.style.left = (x * 100) + '%';
                    el.appendChild(lbl);
                }
            }
        }
    }

    // =======================================================
    // LOOP STATION
    // =======================================================

    function startLoopRecording() {
        if (isLoopRecording) { stopLoopRecording(); return; }

        loopChunks = [];
        loopRecorder = new MediaRecorder(destNode.stream, { mimeType: 'audio/webm' });
        loopRecorder.ondataavailable = e => { if (e.data.size > 0) loopChunks.push(e.data); };
        loopRecorder.onstop = () => {
            if (loopChunks.length === 0) return;
            const blob = new Blob(loopChunks, { type: 'audio/webm' });
            const dur = Date.now() - loopStartTime;
            if (loopTracks.length === 0) loopLength = dur;
            loopTracks.push({ id: nextTrackId++, blob, audio: null, muted: false, duration: Math.min(dur, loopLength || dur) });
            renderLoopTracks();
            startLoopPlayback();
            updateLoopButtons();
        };

        isLoopRecording = true;
        loopStartTime = Date.now();
        loopRecorder.start();
        $('loop-rec-btn').classList.add('recording');
        $('loop-rec-btn').innerHTML = '&#9632; END';

        loopTimerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - loopStartTime) / 1000);
            $('loop-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
            if (loopLength > 0 && (Date.now() - loopStartTime) >= loopLength + 100) stopLoopRecording();
        }, 100);
    }

    function stopLoopRecording() {
        if (!isLoopRecording) return;
        isLoopRecording = false;
        if (loopRecorder && loopRecorder.state !== 'inactive') loopRecorder.stop();
        $('loop-rec-btn').classList.remove('recording');
        $('loop-rec-btn').innerHTML = '&#9679; LOOP';
        clearInterval(loopTimerInterval);
    }

    function startLoopPlayback() {
        stopLoopPlayback();
        if (loopTracks.length === 0) return;
        isLoopPlaying = true;
        playAllLoopTracks();
        if (loopLength > 0) {
            loopPlaybackInterval = setInterval(playAllLoopTracks, loopLength);
        }
        updateLoopButtons();
    }

    function playAllLoopTracks() {
        loopPlaybackStart = Date.now();
        for (const t of loopTracks) {
            if (t.muted) continue;
            const url = URL.createObjectURL(t.blob);
            const a = new Audio(url);
            a.volume = 0.8;
            a.play().catch(() => {});
            t.audio = a;
            a.onended = () => URL.revokeObjectURL(url);
        }
    }

    function stopLoopPlayback() {
        isLoopPlaying = false;
        clearInterval(loopPlaybackInterval);
        loopPlaybackInterval = null;
        for (const t of loopTracks) {
            if (t.audio) { t.audio.pause(); t.audio = null; }
        }
        updateLoopButtons();
    }

    function updateLoopButtons() {
        const hasTracks = loopTracks.length > 0;
        $('loop-play-btn').disabled = !hasTracks || isLoopPlaying;
        $('loop-stop-btn').disabled = !hasTracks || !isLoopPlaying;
        $('loop-clear-btn').disabled = !hasTracks;
    }

    function clearLoopTracks() {
        stopLoopPlayback();
        loopTracks = [];
        loopLength = 0;
        nextTrackId = 1;
        renderLoopTracks();
        updateLoopButtons();
        $('loop-timer').textContent = '0:00';
    }

    function renderLoopTracks() {
        const c = $('loop-tracks');
        c.innerHTML = '';
        for (const t of loopTracks) {
            const el = document.createElement('div');
            el.className = 'loop-track';
            el.innerHTML = `
                <span class="loop-track-name">Track ${t.id}</span>
                <div class="loop-track-bar"><div class="loop-track-progress" data-track-id="${t.id}"></div></div>
                <button class="loop-track-btn ${t.muted ? 'muted' : ''}" data-action="mute" data-track-id="${t.id}">${t.muted ? 'MUTED' : 'MUTE'}</button>
                <button class="loop-track-btn" data-action="delete" data-track-id="${t.id}">&#10005;</button>
            `;
            c.appendChild(el);
        }
        c.querySelectorAll('.loop-track-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const id = parseInt(e.target.dataset.trackId);
                if (e.target.dataset.action === 'mute') {
                    const tr = loopTracks.find(x => x.id === id);
                    if (tr) { tr.muted = !tr.muted; if (tr.muted && tr.audio) { tr.audio.pause(); tr.audio = null; } }
                    renderLoopTracks();
                } else {
                    const tr = loopTracks.find(x => x.id === id);
                    if (tr && tr.audio) tr.audio.pause();
                    loopTracks = loopTracks.filter(x => x.id !== id);
                    loopTracks.length === 0 ? clearLoopTracks() : renderLoopTracks();
                }
            });
        });
    }

    function updateLoopProgress() {
        if (loopLength <= 0 || loopTracks.length === 0) return;
        const pct = ((Date.now() - loopPlaybackStart) % loopLength) / loopLength * 100;
        document.querySelectorAll('.loop-track-progress').forEach(el => { el.style.width = pct + '%'; });
    }

    // =======================================================
    // RECORDING / EXPORT
    // =======================================================

    function toggleRecording() {
        isRecording ? stopRecording() : startRecording();
    }

    function startRecording() {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(destNode.stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => { $('play-btn').disabled = false; $('download-btn').disabled = false; };
        mediaRecorder.start();
        isRecording = true;
        recordStartTime = Date.now();
        $('record-btn').classList.add('recording');
        $('record-btn').textContent = '\u25A0 STOP';
        $('play-btn').disabled = true;
        $('download-btn').disabled = true;
        recTimerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - recordStartTime) / 1000);
            $('rec-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        }, 200);
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        isRecording = false;
        $('record-btn').classList.remove('recording');
        $('record-btn').textContent = '\u25CF REC';
        clearInterval(recTimerInterval);
    }

    function playRecording() {
        if (!recordedChunks.length) return;
        const url = URL.createObjectURL(new Blob(recordedChunks, { type: 'audio/webm' }));
        const a = new Audio(url);
        a.play();
        a.onended = () => URL.revokeObjectURL(url);
    }

    function downloadRecording() {
        if (!recordedChunks.length) return;
        const url = URL.createObjectURL(new Blob(recordedChunks, { type: 'audio/webm' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aetheremin-recording.webm';
        a.click();
        URL.revokeObjectURL(url);
    }

    // =======================================================
    // CONTROLS BINDING
    // =======================================================

    function bindControls() {
        const pa = $('play-area');
        pa.style.touchAction = 'none';
        pa.addEventListener('pointerdown', onPointerDown);
        pa.addEventListener('pointermove', onPointerMove);
        pa.addEventListener('pointerup', onPointerUp);
        pa.addEventListener('pointercancel', onPointerUp);
        pa.addEventListener('pointerleave', onPointerUp);

        // Waveform buttons (standard + animal)
        document.querySelectorAll('#waveform-buttons .wave-btn, #animal-buttons .wave-btn').forEach(btn => {
            btn.addEventListener('click', () => selectWaveform(btn.dataset.wave));
        });

        // Octave range
        $('octave-low').addEventListener('input', e => {
            octaveLow = parseInt(e.target.value);
            if (octaveLow >= octaveHigh) { octaveHigh = octaveLow + 1; $('octave-high').value = octaveHigh; }
            $('octave-label').textContent = octaveLow + ' - ' + octaveHigh;
            buildFreqGuides();
        });
        $('octave-high').addEventListener('input', e => {
            octaveHigh = parseInt(e.target.value);
            if (octaveHigh <= octaveLow) { octaveLow = octaveHigh - 1; $('octave-low').value = octaveLow; }
            $('octave-label').textContent = octaveLow + ' - ' + octaveHigh;
            buildFreqGuides();
        });

        // Scale & key
        $('scale-select').addEventListener('change', e => { currentScale = e.target.value; buildFreqGuides(); });
        $('key-select').addEventListener('change', e => { currentKey = parseInt(e.target.value); buildFreqGuides(); });

        // Grid toggle
        $('grid-toggle').addEventListener('click', () => {
            showGrid = !showGrid;
            $('grid-toggle').textContent = showGrid ? 'On' : 'Off';
            $('grid-toggle').classList.toggle('active', showGrid);
            buildFreqGuides();
        });

        // Effects
        $('delay-mix').addEventListener('input', e => {
            delayGain.gain.setValueAtTime(e.target.value / 100, audioCtx.currentTime);
            $('delay-val').textContent = e.target.value + '%';
        });
        $('delay-time').addEventListener('input', e => {
            delayNode.delayTime.setValueAtTime(e.target.value / 1000, audioCtx.currentTime);
            $('delay-time-val').textContent = e.target.value + 'ms';
        });
        $('delay-feedback').addEventListener('input', e => {
            delayFeedback.gain.setValueAtTime(e.target.value / 100, audioCtx.currentTime);
            $('delay-fb-val').textContent = e.target.value + '%';
        });
        $('reverb-mix').addEventListener('input', e => {
            const v = e.target.value / 100;
            reverbGain.gain.setValueAtTime(v, audioCtx.currentTime);
            dryGain.gain.setValueAtTime(1 - v * 0.5, audioCtx.currentTime);
            $('reverb-val').textContent = e.target.value + '%';
        });
        $('reverb-decay').addEventListener('input', e => {
            convolverNode.buffer = createReverbIR(parseFloat(e.target.value));
            $('reverb-decay-val').textContent = e.target.value + 's';
        });
        $('vibrato-depth').addEventListener('input', e => { $('vibrato-val').textContent = e.target.value + '%'; });
        $('vibrato-rate').addEventListener('input', e => {
            const r = parseFloat(e.target.value);
            for (const v of voices.values()) v.vibOsc.frequency.setValueAtTime(r, audioCtx.currentTime);
            $('vibrato-rate-val').textContent = e.target.value + ' Hz';
        });
        $('distortion-amount').addEventListener('input', e => {
            updateDistortionCurve(parseFloat(e.target.value));
            $('distortion-val').textContent = e.target.value + '%';
        });
        $('chorus-mix').addEventListener('input', e => {
            const v = e.target.value / 100;
            chorusMixGain.gain.setValueAtTime(v, audioCtx.currentTime);
            chorusDryGain.gain.setValueAtTime(1 - v * 0.3, audioCtx.currentTime);
            $('chorus-val').textContent = e.target.value + '%';
        });
        $('portamento').addEventListener('input', e => {
            portamentoTime = parseFloat(e.target.value);
            $('portamento-val').textContent = e.target.value + 'ms';
        });
        $('particle-amount').addEventListener('input', e => {
            particleAmount = parseInt(e.target.value);
            $('particle-val').textContent = e.target.value;
        });
        $('theme-select').addEventListener('change', e => setTheme(e.target.value));

        // Toggle controls
        $('toggle-controls').addEventListener('click', () => $('controls-panel').classList.toggle('collapsed'));

        // Presets
        $('preset-buttons').addEventListener('click', e => {
            const btn = e.target.closest('.preset-btn');
            if (btn) applyPreset(btn.dataset.preset);
        });

        // Record/Export
        $('record-btn').addEventListener('click', toggleRecording);
        $('play-btn').addEventListener('click', playRecording);
        $('download-btn').addEventListener('click', downloadRecording);

        // Loop station
        $('loop-rec-btn').addEventListener('click', startLoopRecording);
        $('loop-play-btn').addEventListener('click', startLoopPlayback);
        $('loop-stop-btn').addEventListener('click', () => { stopLoopRecording(); stopLoopPlayback(); });
        $('loop-clear-btn').addEventListener('click', clearLoopTracks);

        // Mic sample
        $('mic-sample-btn').addEventListener('click', startMicSample);
        $('mic-preview-btn').addEventListener('click', playMicPreview);

        // Resize
        window.addEventListener('resize', resizeCanvases);
    }

    // =======================================================
    // THEME & PRESETS
    // =======================================================

    function setTheme(theme) {
        currentTheme = theme;
        document.body.className = 'theme-' + theme;
        $('theme-select').value = theme;
    }

    function applyPreset(name) {
        const p = PRESETS[name];
        if (!p) return;

        selectWaveform(p.waveform);

        $('delay-mix').value = p.delayMix;
        delayGain.gain.setValueAtTime(p.delayMix / 100, audioCtx.currentTime);
        $('delay-val').textContent = p.delayMix + '%';

        $('reverb-mix').value = p.reverbMix;
        reverbGain.gain.setValueAtTime(p.reverbMix / 100, audioCtx.currentTime);
        dryGain.gain.setValueAtTime(1 - (p.reverbMix / 100) * 0.5, audioCtx.currentTime);
        $('reverb-val').textContent = p.reverbMix + '%';

        $('vibrato-depth').value = p.vibratoDepth;
        $('vibrato-val').textContent = p.vibratoDepth + '%';
        $('vibrato-rate').value = p.vibratoRate;
        for (const v of voices.values()) v.vibOsc.frequency.setValueAtTime(p.vibratoRate, audioCtx.currentTime);
        $('vibrato-rate-val').textContent = p.vibratoRate + ' Hz';

        $('distortion-amount').value = p.distortion;
        updateDistortionCurve(p.distortion);
        $('distortion-val').textContent = p.distortion + '%';

        $('chorus-mix').value = p.chorusMix;
        chorusMixGain.gain.setValueAtTime(p.chorusMix / 100, audioCtx.currentTime);
        chorusDryGain.gain.setValueAtTime(1 - (p.chorusMix / 100) * 0.3, audioCtx.currentTime);
        $('chorus-val').textContent = p.chorusMix + '%';

        $('portamento').value = p.portamento;
        portamentoTime = p.portamento;
        $('portamento-val').textContent = p.portamento + 'ms';

        $('scale-select').value = p.scale;
        currentScale = p.scale;

        setTheme(p.theme);
    }

    // =======================================================
    // KEYBOARD SHORTCUTS
    // =======================================================

    function bindKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.target.closest('input, select')) return;
            // 1-4: standard waveforms
            if (e.key >= '1' && e.key <= '4') {
                selectWaveform(['sine','triangle','sawtooth','square'][e.key - 1]);
            }
            // 5-8: animal waveforms
            if (e.key >= '5' && e.key <= '8') {
                selectWaveform(ANIMAL_WAVES[e.key - 5]);
            }
            // 9: mic sample
            if (e.key === '9' && micSampleWave) selectWaveform('sample');
            // Space: toggle controls
            if (e.key === ' ' && !e.target.closest('button')) {
                e.preventDefault();
                $('controls-panel').classList.toggle('collapsed');
            }
            // R: record
            if (e.key === 'r' || e.key === 'R') toggleRecording();
            // L: loop
            if (e.key === 'l' || e.key === 'L') startLoopRecording();
            // M: mic sample
            if (e.key === 'm' || e.key === 'M') startMicSample();
        });
    }

    // =======================================================
    // CANVAS RESIZE
    // =======================================================

    function resizeCanvases() {
        const pa = $('play-area');
        vizCanvas.width = particleCanvas.width = pa.clientWidth;
        vizCanvas.height = particleCanvas.height = pa.clientHeight;
    }

    // =======================================================
    // INIT
    // =======================================================

    function init() {
        vizCanvas = $('viz-canvas');
        vizCtx = vizCanvas.getContext('2d');
        particleCanvas = $('particle-canvas');
        particleCtx = particleCanvas.getContext('2d');
        resizeCanvases();

        $('start-btn').addEventListener('click', () => {
            initAudio();
            $('start-screen').classList.add('hidden');
            buildFreqGuides();
            bindControls();
            bindKeyboard();
            setTheme('cosmic');
            animate();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
