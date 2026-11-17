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
            scale: 'chromatic', snap: 60, theme: 'matrix'
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
            scale: 'major', snap: 50, theme: 'ocean'
        }
    };

    const THEME_COLORS = {
        cosmic:  { primary: [123, 47, 247], secondary: [0, 212, 255] },
        neon:    { primary: [255, 45, 117], secondary: [0, 255, 136] },
        fire:    { primary: [255, 102, 0],  secondary: [255, 204, 0] },
        ocean:   { primary: [0, 119, 204],  secondary: [0, 204, 170] },
        matrix:  { primary: [0, 255, 0],    secondary: [68, 255, 68] },
        // Kids themes
        rainbow: { primary: [255, 51, 153], secondary: [51, 255, 204] },
        candy:   { primary: [255, 45, 117], secondary: [0, 255, 170] },
        space:   { primary: [102, 0, 255],  secondary: [0, 136, 255] },
        jungle:  { primary: [68, 221, 0],   secondary: [255, 204, 0] }
    };

    const ANIMAL_WAVES = ['cat', 'dog', 'bird', 'whale'];
    // Base oscillator type per animal; null = use PeriodicWave
    const ANIMAL_OSC_TYPES = { cat: 'triangle', dog: 'sawtooth', bird: 'sine', whale: null };
    // Approximate fundamental pitch of each real audio sample (Hz)
    const ANIMAL_SAMPLE_BASE_FREQS = { cat: 440, dog: 280, bird: 800, whale: 180 };
    // Loop end for samples that should only loop a portion (whale is 30s)
    const ANIMAL_SAMPLE_LOOP_END = { whale: 4.0 };
    // Start offset (seconds) to skip leading silence in samples
    const ANIMAL_SAMPLE_START_OFFSET = { bird: 3.5 };

    // ---- State ----
    let audioCtx = null;
    let currentWaveform = 'sine';
    let octaveLow = 2;
    let octaveHigh = 6;
    let currentScale = 'free';
    let currentKey = 0;
    let snapStrength = 1; // 0..1, soft scale snap
    let currentTheme = 'cosmic';
    let portamentoTime = 50;
    let particleAmount = 60;
    let showGrid = false;

    // Kids mode
    let kidsMode = false;
    let currentKidsTheme = 'rainbow';
    let kidsRainbowHue = 0;

    let animalPeriodicWaves = {};
    let animalSampleBuffers = {}; // Real audio samples, loaded at startup
    let micSampleBuffer = null; // Raw AudioBuffer for sample playback
    let micSampleBaseFreq = 261.63; // Fixed C4 reference — playbackRate = targetHz / 261.63
    let micRecorder = null;
    let micStream = null;
    let micRecording = false;
    let micRecTimerInterval = null;

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
    let countInTimeout = null;
    let countInDisplayInterval = null;
    let countInVisualTimeouts = [];

    // Metronome
    let isMetronomeOn = false;
    let metronomeBpm = 120;
    let metronomeSchedulerInterval = null;
    let metronomeBeat = 0;
    let metronomeNextBeatTime = 0;
    const METRO_BEATS_PER_MEASURE = 4;

    // Visuals
    let vizCanvas, vizCtx, particleCanvas, particleCtx;
    let particles = [];
    let animFrameId = null;
    let waveformData, frequencyData;

    // Air mode (webcam hand tracking)
    let airActive = false;
    let airLoading = false;
    let airLandmarker = null;
    let airStream = null;
    let airDetectToggle = false;
    let airCamVisible = true;
    let airTipShown = false;
    const airHands = new Map(); // handedness label -> {tx, ty, sx, sy, lastSeen, cursorEl}
    let toastTimeout = null;

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

        initDrone();
        buildAnimalWaves();
        loadAnimalSamples(); // non-blocking, samples ready before user selects them
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
        // Whale only — cat/dog/bird use standard osc types + filter chains
        const whaleR = new Float32Array(16), whaleI = new Float32Array(16);
        whaleI[1] = 1; whaleI[2] = 0.7; whaleI[3] = 0.15; whaleI[4] = 0.1;
        whaleI[5] = 0.05;
        animalPeriodicWaves.whale = audioCtx.createPeriodicWave(whaleR, whaleI);
    }

    async function loadAnimalSamples() {
        const files = { cat: 'audio/cat.mp3', dog: 'audio/dog.mp3', bird: 'audio/bird.ogg', whale: 'audio/whale.ogg' };
        await Promise.all(Object.entries(files).map(async ([name, path]) => {
            try {
                const resp = await fetch(path);
                if (!resp.ok) return;
                const arrayBuf = await resp.arrayBuffer();
                animalSampleBuffers[name] = await audioCtx.decodeAudioData(arrayBuf);
            } catch (_) {}
        }));
    }

    // =======================================================
    // ANIMAL VOICE CHAINS (formant filters + LFOs per animal — fallback if samples not loaded)
    // =======================================================

    function buildAnimalChain(wave, osc) {
        if (wave === 'cat') {
            // Two vocal formant bandpass filters: ~750 Hz (F1) and ~1500 Hz (F2)
            const input = audioCtx.createGain();
            const f1 = audioCtx.createBiquadFilter();
            f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 5;
            const f2 = audioCtx.createBiquadFilter();
            f2.type = 'bandpass'; f2.frequency.value = 1500; f2.Q.value = 8;
            const merger = audioCtx.createGain();
            merger.gain.value = 0.6;
            input.connect(f1); input.connect(f2);
            f1.connect(merger); f2.connect(merger);
            return { input, output: merger, nodes: [input, f1, f2, merger], f1, f2 };
        }
        if (wave === 'dog') {
            // Bandpass resonance + lowpass + slow AM tremolo (~growl)
            const input = audioCtx.createGain();
            const bpf = audioCtx.createBiquadFilter();
            bpf.type = 'bandpass'; bpf.frequency.value = 480; bpf.Q.value = 3;
            const lpf = audioCtx.createBiquadFilter();
            lpf.type = 'lowpass'; lpf.frequency.value = 2200;
            const amCarrier = audioCtx.createGain();
            amCarrier.gain.value = 0.72;
            const amOsc = audioCtx.createOscillator();
            amOsc.type = 'sine'; amOsc.frequency.value = 7;
            const amDepth = audioCtx.createGain();
            amDepth.gain.value = 0.28; // carrier 0.72 ± 0.28 → range [0.44, 1.0]
            amOsc.connect(amDepth); amDepth.connect(amCarrier.gain);
            input.connect(bpf); bpf.connect(lpf); lpf.connect(amCarrier);
            amOsc.start();
            return { input, output: amCarrier, nodes: [input, bpf, lpf, amCarrier, amOsc, amDepth] };
        }
        if (wave === 'bird') {
            // Highpass to brighten + fast FM flutter
            const input = audioCtx.createGain();
            const hpf = audioCtx.createBiquadFilter();
            hpf.type = 'highpass'; hpf.frequency.value = 800; hpf.Q.value = 1;
            const fmOsc = audioCtx.createOscillator();
            fmOsc.type = 'sine'; fmOsc.frequency.value = 18;
            const fmGain = audioCtx.createGain();
            fmGain.gain.value = 0; // set per-frame: freq * 0.025
            fmOsc.connect(fmGain); fmGain.connect(osc.frequency);
            input.connect(hpf);
            fmOsc.start();
            return { input, output: hpf, nodes: [input, hpf, fmOsc, fmGain], fmGain };
        }
        if (wave === 'whale') {
            // Lowpass + slow AM pulse (whale song pulsation)
            const input = audioCtx.createGain();
            const lpf = audioCtx.createBiquadFilter();
            lpf.type = 'lowpass'; lpf.frequency.value = 1200; lpf.Q.value = 1;
            const amCarrier = audioCtx.createGain();
            amCarrier.gain.value = 0.6;
            const amOsc = audioCtx.createOscillator();
            amOsc.type = 'sine'; amOsc.frequency.value = 0.5;
            const amDepth = audioCtx.createGain();
            amDepth.gain.value = 0.4;
            amOsc.connect(amDepth); amDepth.connect(amCarrier.gain);
            input.connect(lpf); lpf.connect(amCarrier);
            amOsc.start();
            return { input, output: amCarrier, nodes: [input, lpf, amCarrier, amOsc, amDepth] };
        }
        return null;
    }

    // =======================================================
    // MIC SAMPLING
    // =======================================================

    function normalizeBuffer(audioBuf, target = 0.9) {
        const numCh = audioBuf.numberOfChannels;
        let peak = 0;
        for (let ch = 0; ch < numCh; ch++) {
            const data = audioBuf.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > peak) peak = abs;
            }
        }
        if (peak === 0 || peak >= target) return audioBuf;
        const gain = target / peak;
        const out = audioCtx.createBuffer(numCh, audioBuf.length, audioBuf.sampleRate);
        for (let ch = 0; ch < numCh; ch++) {
            const src = audioBuf.getChannelData(ch);
            const dst = out.getChannelData(ch);
            for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
        }
        return out;
    }

    function trimSilence(audioBuf, threshold = 0.015) {
        const sr = audioBuf.sampleRate;
        const numCh = audioBuf.numberOfChannels;
        const len = audioBuf.length;

        // Find first and last sample above threshold across all channels
        let startSample = 0, endSample = len - 1;

        outer: for (let i = 0; i < len; i++) {
            for (let ch = 0; ch < numCh; ch++) {
                if (Math.abs(audioBuf.getChannelData(ch)[i]) >= threshold) {
                    startSample = Math.max(0, i - Math.floor(sr * 0.01)); // 10ms pre-roll
                    break outer;
                }
            }
        }

        outer: for (let i = len - 1; i >= startSample; i--) {
            for (let ch = 0; ch < numCh; ch++) {
                if (Math.abs(audioBuf.getChannelData(ch)[i]) >= threshold) {
                    endSample = Math.min(len - 1, i + Math.floor(sr * 0.01)); // 10ms post-roll
                    break outer;
                }
            }
        }

        const trimmedLen = endSample - startSample + 1;
        if (trimmedLen <= 0) return audioBuf; // nothing to trim, return original

        const trimmed = audioCtx.createBuffer(numCh, trimmedLen, sr);
        for (let ch = 0; ch < numCh; ch++) {
            trimmed.copyToChannel(audioBuf.getChannelData(ch).slice(startSample, endSample + 1), ch);
        }
        return trimmed;
    }

    async function startMicSample() {
        if (micRecording) return;
        const btn = $('mic-sample-btn');
        const status = $('mic-status');

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            status.textContent = 'Mic denied';
            return;
        }

        const chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        micRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
        micRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        micRecorder.onstop = async () => {
            clearInterval(micRecTimerInterval);
            micRecording = false;
            btn.textContent = '\uD83C\uDFA4 SAMPLE MIC';
            btn.classList.remove('sampling');
            if (kidsMode) {
                const kb = $('kids-mic-btn');
                if (kb) { kb.innerHTML = '&#127908;<span>Sample</span>'; kb.classList.remove('sampling'); }
            }
            status.textContent = 'Processing...';
            status.className = 'mic-status';

            try {
                const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
                const arrayBuf = await blob.arrayBuffer();
                const decoded = await audioCtx.decodeAudioData(arrayBuf);
                micSampleBuffer = normalizeBuffer(trimSilence(decoded));
                // Fixed C4 as base — playbackRate = targetHz / 261.63
                micSampleBaseFreq = 261.63;

                status.textContent = 'Sampled!';
                status.className = 'mic-status ready';
                addSampleWaveButton();
                $('mic-preview-btn').disabled = false;
                selectWaveform('sample');
            } catch (e) {
                status.textContent = 'Decode error';
            }

            if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
        };

        micRecorder.start();
        micRecording = true;
        btn.textContent = '\u23F9 STOP REC';
        btn.classList.add('sampling');
        if (kidsMode) {
            const kb = $('kids-mic-btn');
            if (kb) { kb.innerHTML = '&#9209;<span>Stop</span>'; kb.classList.add('sampling'); }
        }

        // Auto-stop at 5 seconds, show elapsed time
        clearInterval(micRecTimerInterval);
        let elapsed = 0;
        status.textContent = 'Recording 0s...';
        status.className = 'mic-status sampling';
        micRecTimerInterval = setInterval(() => {
            elapsed++;
            status.textContent = `Recording ${elapsed}s...`;
            if (elapsed >= 5) stopMicSample();
        }, 1000);
    }

    function stopMicSample() {
        clearInterval(micRecTimerInterval);
        micRecTimerInterval = null;
        if (!micRecorder || !micRecording) return;
        micRecording = false;
        micRecorder.stop();
        const btn = $('mic-sample-btn');
        btn.textContent = '🎤 SAMPLE MIC';
        btn.classList.remove('sampling');
        if (kidsMode) {
            const kb = $('kids-mic-btn');
            if (kb) { kb.innerHTML = '&#127908;<span>Sample</span>'; kb.classList.remove('sampling'); }
        }
        $('mic-status').textContent = 'Processing...';
        $('mic-status').className = 'mic-status';
    }

    function playMicPreview() {
        if (!micSampleBuffer) return;
        const src = audioCtx.createBufferSource();
        src.buffer = micSampleBuffer;
        src.connect(audioCtx.destination);
        src.start();
    }

    function hslToRgb(h, s, l) {
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h * 12) % 12;
            return Math.round((l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)) * 255);
        };
        return [f(0), f(8), f(4)];
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
        if (!osc) return;
        if (ANIMAL_WAVES.includes(wave)) {
            const baseType = ANIMAL_OSC_TYPES[wave];
            if (baseType) {
                osc.type = baseType;
            } else if (animalPeriodicWaves[wave]) {
                osc.setPeriodicWave(animalPeriodicWaves[wave]);
            }
        } else {
            try { osc.type = wave; } catch (e) { osc.type = 'sine'; }
        }
    }

    function selectWaveform(wave) {
        currentWaveform = wave;
        document.querySelectorAll('.wave-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.wave === wave);
        });
        if (kidsMode) {
            document.querySelectorAll('.kids-sound-btn').forEach(b => b.classList.remove('active'));
            const kb = document.querySelector(`.kids-sound-btn[data-wave="${wave}"]`);
            if (kb) kb.classList.add('active');
            const kidsMicBtn = $('kids-mic-btn');
            if (kidsMicBtn) kidsMicBtn.classList.toggle('active', wave === 'sample');
        }
        for (const voice of voices.values()) {
            if (voice.osc) applyWaveformToOsc(voice.osc, wave);
            // Note: switching to/from sample mid-touch takes effect on next touch
        }
    }

    // =======================================================
    // VOICE MANAGEMENT (Multi-touch polyphony)
    // =======================================================

    function createVoice(pointerId) {
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime);

        const vibOsc = audioCtx.createOscillator();
        vibOsc.type = 'sine';
        vibOsc.frequency.value = parseFloat($('vibrato-rate').value);
        const vibGain = audioCtx.createGain();
        vibGain.gain.value = 0;
        vibOsc.start();

        let osc = null, srcNode = null;

        const animalBuf = ANIMAL_WAVES.includes(currentWaveform) ? animalSampleBuffers[currentWaveform] : null;
        const sampleBuf = currentWaveform === 'sample' ? micSampleBuffer : animalBuf;

        if (sampleBuf) {
            // Sample-based voice: loop buffer, pitch via playbackRate
            srcNode = audioCtx.createBufferSource();
            srcNode.buffer = sampleBuf;
            srcNode.loop = true;
            if (animalBuf && ANIMAL_SAMPLE_START_OFFSET[currentWaveform]) {
                srcNode.loopStart = ANIMAL_SAMPLE_START_OFFSET[currentWaveform];
            }
            if (animalBuf && ANIMAL_SAMPLE_LOOP_END[currentWaveform]) {
                srcNode.loopEnd = Math.min(sampleBuf.duration, ANIMAL_SAMPLE_LOOP_END[currentWaveform]);
            }
            srcNode.playbackRate.value = 1;
            vibOsc.connect(vibGain);
            vibGain.connect(srcNode.playbackRate);
            srcNode.connect(gain);
            const startOffset = (animalBuf && ANIMAL_SAMPLE_START_OFFSET[currentWaveform]) || 0;
            srcNode.start(0, startOffset);
        } else {
            // Oscillator-based voice
            osc = audioCtx.createOscillator();
            applyWaveformToOsc(osc, currentWaveform);
            osc.frequency.value = 440;
            vibOsc.connect(vibGain);
            vibGain.connect(osc.frequency);

            const animalChain = ANIMAL_WAVES.includes(currentWaveform)
                ? buildAnimalChain(currentWaveform, osc) : null;

            if (animalChain) {
                osc.connect(animalChain.input);
                animalChain.output.connect(gain);
            } else {
                osc.connect(gain);
            }
            osc.start();

            const glowEl = document.createElement('div');
            glowEl.className = 'touch-glow';
            $('glow-container').appendChild(glowEl);

            const voice = { pointerId, osc, srcNode: null, gain, vibOsc, vibGain, animalChain, glowEl, freq: 440, vol: 0, x: 0, y: 0 };
            voices.set(pointerId, voice);

            gain.connect(effectsInput);
            return voice;
        }

        gain.connect(effectsInput);

        // Create glow element
        const glowEl = document.createElement('div');
        glowEl.className = 'touch-glow';
        $('glow-container').appendChild(glowEl);

        const voice = { pointerId, osc, srcNode, gain, vibOsc, vibGain, animalChain: null, glowEl, freq: 440, vol: 0, x: 0, y: 0 };
        voices.set(pointerId, voice);
        return voice;
    }

    function destroyVoice(pointerId) {
        const v = voices.get(pointerId);
        if (!v) return;

        const now = audioCtx.currentTime;
        v.gain.gain.linearRampToValueAtTime(0, now + 0.08);

        setTimeout(() => {
            if (v.osc) { try { v.osc.stop(); v.osc.disconnect(); } catch (_) {} }
            if (v.srcNode) { try { v.srcNode.stop(); v.srcNode.disconnect(); } catch (_) {} }
            if (v.animalChain) {
                for (const node of v.animalChain.nodes) {
                    try { if (typeof node.stop === 'function') node.stop(); node.disconnect(); } catch (_) {}
                }
            }
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

        if (voice.srcNode) {
            // Sample voice: control pitch via playbackRate
            const baseFreq = ANIMAL_SAMPLE_BASE_FREQS[currentWaveform] || micSampleBaseFreq;
            const rate = freq / baseFreq;
            voice.srcNode.playbackRate.linearRampToValueAtTime(rate, now + portSec);
            const depth = parseFloat($('vibrato-depth').value);
            voice.vibGain.gain.setValueAtTime(depth > 0 ? rate * (depth / 100) * 0.05 : 0, now);
        } else {
            voice.osc.frequency.linearRampToValueAtTime(freq, now + portSec);
            const depth = parseFloat($('vibrato-depth').value);
            voice.vibGain.gain.setValueAtTime(depth > 0 ? freq * (depth / 100) * 0.05 : 0, now);
            if (voice.animalChain) {
                const chain = voice.animalChain;
                if (chain.f1) { // cat: scale formants with pitch
                    const ratio = freq / 220;
                    chain.f1.frequency.setValueAtTime(750 * ratio, now);
                    chain.f2.frequency.setValueAtTime(1500 * ratio, now);
                }
                if (chain.fmGain) { // bird: FM depth proportional to freq
                    chain.fmGain.gain.setValueAtTime(freq * 0.025, now);
                }
            }
        }

        const gainScale = voice.srcNode ? 1.0 : 0.4;
        voice.gain.gain.linearRampToValueAtTime(vol * gainScale, now + 0.05);

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

    // Snap a pitch toward the scale. strength 1 = hard snap, 0 = free.
    // A dead zone of width `strength` (as a fraction of the half-gap between
    // neighbouring scale notes) pulls fully onto the note; beyond it pitch
    // ramps linearly back to the midpoint, so gliding never jumps.
    function snapToScale(freq, scale, key, strength = 1) {
        if (!scale || scale === 'free' || strength <= 0) return freq;
        const intervals = SCALES[scale];
        if (!intervals) return freq;
        const n = 12 * Math.log2(freq / 440) + 69;
        const oct = Math.floor(n / 12);
        let lower = -Infinity, upper = Infinity;
        for (let o = oct - 1; o <= oct + 1; o++) {
            for (const iv of intervals) {
                const midi = o * 12 + ((iv + key) % 12);
                if (midi <= n && midi > lower) lower = midi;
                if (midi > n && midi < upper) upper = midi;
            }
        }
        if (!isFinite(lower) || !isFinite(upper)) return noteToFreq(Math.round(n));
        const half = (upper - lower) / 2;
        const target = (n - lower) <= half ? lower : upper;
        if (strength >= 1) return noteToFreq(target);
        const d = n - target;
        const t = Math.abs(d) / half;
        const t2 = t < strength ? 0 : (t - strength) / (1 - strength);
        return noteToFreq(target + Math.sign(d) * half * t2);
    }

    // Pitch range across the X axis, in (fractional) MIDI notes.
    // Play Along narrows it to the song's notes.
    function getRangeMidi() {
        if (game) return { lo: game.lo, hi: game.hi };
        return { lo: octaveLow * 12 + 12, hi: octaveHigh * 12 + 12 };
    }

    function mapXToFreq(xNorm) {
        const r = getRangeMidi();
        const raw = noteToFreq(r.lo + (r.hi - r.lo) * xNorm);
        if (game && game.assist) return snapToScale(raw, 'major', currentKey, kidsMode ? 0.85 : 0.7);
        return snapToScale(raw, currentScale, currentKey, snapStrength);
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
        if (e.target.closest('#controls-panel') || e.target.closest('#header') || e.target.closest('button')) return;
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
    // AIR MODE (hand tracking)
    // =======================================================
    // Each tracked hand acts like a touch point: index fingertip
    // position drives the same voice API as pointer events, keyed
    // 'air-Left' / 'air-Right' so it never collides with pointerIds.

    const AIR_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const AIR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
    const AIR_GRACE_MS = 250;   // keep a note alive this long after tracking loss
    const AIR_SMOOTH = 0.35;    // coordinate smoothing alpha (per frame)

    function airSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async function loadAirLandmarker() {
        const vision = await import(AIR_CDN + '/+esm');
        const fileset = await vision.FilesetResolver.forVisionTasks(AIR_CDN + '/wasm');
        return vision.HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: AIR_MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2
        });
    }

    async function startAirMode() {
        if (airActive || airLoading || !airSupported()) return;
        airLoading = true;
        setAirButtonState('loading');
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        try {
            if (!airLandmarker) airLandmarker = await loadAirLandmarker();
            airStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            const video = $('air-video');
            video.srcObject = airStream;
            await video.play();
            airActive = true;
            document.body.classList.add('air-mode');
            document.body.classList.toggle('air-cam-hidden', !airCamVisible);
            setAirButtonState('active');
            if (!airTipShown) {
                showToast('Move right for higher pitch, up for louder');
                airTipShown = true;
            }
        } catch (err) {
            const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
            showToast(denied ? 'Camera access needed for Air Mode' : "Couldn't load hand tracking");
            stopAirMode();
        }
        airLoading = false;
    }

    function stopAirMode() {
        airActive = false;
        document.body.classList.remove('air-mode');
        removeAllAirHands();
        if (airStream) {
            airStream.getTracks().forEach(t => t.stop());
            airStream = null;
        }
        $('air-video').srcObject = null;
        setAirButtonState('idle');
    }

    function toggleAirMode() {
        if (airActive) stopAirMode();
        else startAirMode();
    }

    function setAirButtonState(state) {
        for (const id of ['air-btn', 'kids-air-btn']) {
            const btn = $(id);
            if (!btn) continue;
            btn.classList.toggle('loading', state === 'loading');
            btn.classList.toggle('active', state === 'active');
        }
    }

    // Map a mirrored normalized video coordinate into play-area pixels,
    // matching the object-fit:cover rendering of the overlay video so
    // cursors line up with what the user sees.
    function airToPlayCoords(nx, ny) {
        const pa = $('play-area');
        const W = pa.clientWidth, H = pa.clientHeight;
        const video = $('air-video');
        const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
        const scale = Math.max(W / vw, H / vh);
        const dw = vw * scale, dh = vh * scale;
        const x = Math.max(0, Math.min(W, (W - dw) / 2 + nx * dw));
        const y = Math.max(0, Math.min(H, (H - dh) / 2 + ny * dh));
        return { xNorm: W ? x / W : 0, yNorm: H ? y / H : 0 };
    }

    function updateAirTracking() {
        const video = $('air-video');
        // Detect on every other frame (~30 Hz); smooth/render every frame
        airDetectToggle = !airDetectToggle;
        if (airDetectToggle && airLandmarker && video.readyState >= 2) {
            let result = null;
            try { result = airLandmarker.detectForVideo(video, performance.now()); } catch (_) {}
            if (result && result.landmarks) {
                const handedness = result.handednesses || result.handedness || [];
                result.landmarks.forEach((lm, i) => {
                    const label = (handedness[i] && handedness[i][0] && handedness[i][0].categoryName) || ('hand' + i);
                    const tip = lm[8]; // index fingertip
                    const t = airToPlayCoords(1 - tip.x, tip.y); // mirror X
                    let hand = airHands.get(label);
                    if (!hand) {
                        hand = createAirHand(label, t.xNorm, t.yNorm);
                        airHands.set(label, hand);
                    }
                    hand.tx = t.xNorm;
                    hand.ty = t.yNorm;
                    hand.lastSeen = performance.now();
                });
            }
        }

        const now = performance.now();
        const pa = $('play-area');
        const W = pa.clientWidth, H = pa.clientHeight;
        for (const [label, hand] of airHands) {
            if (now - hand.lastSeen > AIR_GRACE_MS) { removeAirHand(label); continue; }
            hand.sx += (hand.tx - hand.sx) * AIR_SMOOTH;
            hand.sy += (hand.ty - hand.sy) * AIR_SMOOTH;
            const voice = voices.get('air-' + label);
            if (voice) {
                updateVoiceFromCoords(voice, { x: hand.sx * W, y: hand.sy * H, xNorm: hand.sx, yNorm: hand.sy });
            }
            hand.cursorEl.style.left = (hand.sx * W) + 'px';
            hand.cursorEl.style.top = (hand.sy * H) + 'px';
            hand.cursorEl.classList.toggle('lost', now - hand.lastSeen > 120);
        }

        $('air-hint').classList.toggle('visible', airHands.size === 0);
    }

    function createAirHand(label, xNorm, yNorm) {
        createVoice('air-' + label);
        const el = document.createElement('div');
        el.className = 'air-cursor ' + (label === 'Left' ? 'hand-left' : 'hand-right');
        $('air-cursors').appendChild(el);
        return { tx: xNorm, ty: yNorm, sx: xNorm, sy: yNorm, lastSeen: performance.now(), cursorEl: el };
    }

    function removeAirHand(label) {
        const hand = airHands.get(label);
        if (!hand) return;
        destroyVoice('air-' + label);
        if (hand.cursorEl.parentNode) hand.cursorEl.parentNode.removeChild(hand.cursorEl);
        airHands.delete(label);
    }

    function removeAllAirHands() {
        for (const label of [...airHands.keys()]) removeAirHand(label);
        $('air-hint').classList.remove('visible');
    }

    function bindAirControls() {
        if (!airSupported()) {
            for (const id of ['air-btn', 'kids-air-btn']) {
                const b = $(id);
                if (b) b.style.display = 'none';
            }
            return;
        }
        $('air-btn').addEventListener('click', toggleAirMode);
        $('kids-air-btn').addEventListener('click', toggleAirMode);
        $('air-cam-toggle').addEventListener('click', () => {
            airCamVisible = !airCamVisible;
            document.body.classList.toggle('air-cam-hidden', !airCamVisible);
            $('air-cam-toggle').classList.toggle('cam-off', !airCamVisible);
        });
        // rAF pauses in hidden tabs — release air voices so no note sticks
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) removeAllAirHands();
        });
    }

    function showToast(msg) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => t.classList.remove('show'), 3500);
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
        const waveAlpha = game ? 0.15 : 0.6; // keep the hit line the only strong horizontal in Play Along
        grad.addColorStop(0, `rgba(${c.primary.join(',')},${waveAlpha})`);
        grad.addColorStop(1, `rgba(${c.secondary.join(',')},${waveAlpha})`);
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

        if (game) drawGame(vizCtx, W, H);
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
        if (kidsMode && currentKidsTheme === 'rainbow') {
            kidsRainbowHue = (kidsRainbowHue + 0.7) % 360;
            const p = hslToRgb(kidsRainbowHue / 360, 1, 0.6);
            const s = hslToRgb(((kidsRainbowHue + 150) % 360) / 360, 1, 0.6);
            THEME_COLORS.rainbow.primary = p;
            THEME_COLORS.rainbow.secondary = s;
            const root = document.documentElement;
            root.style.setProperty('--theme-primary', `rgb(${p.join(',')})`);
            root.style.setProperty('--theme-secondary', `rgb(${s.join(',')})`);
            root.style.setProperty('--theme-glow', `rgba(${p.join(',')},0.45)`);
            root.style.setProperty('--theme-particle', `rgb(${p.join(',')})`);
        }
        if (airActive) updateAirTracking();
        if (game) { updateGame(); updateGameHud(); }
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
        if (countInTimeout !== null) { cancelCountIn(); return; }

        if (loopLength > 0) {
            beginCountInSync();
        } else {
            beginCountInFirst();
        }
    }

    function cancelCountIn() {
        clearTimeout(countInTimeout);
        clearInterval(countInDisplayInterval);
        countInVisualTimeouts.forEach(clearTimeout);
        countInTimeout = null;
        countInDisplayInterval = null;
        countInVisualTimeouts = [];
        $('loop-rec-btn').innerHTML = '&#9679; LOOP';
        $('loop-rec-btn').classList.remove('counting');
        $('loop-timer').textContent = '0:00';
    }

    function playCountInClick(accent) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination); // bypass destNode so clicks don't end up in recording
        osc.frequency.value = accent ? 1200 : 900;
        gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);
    }

    // =======================================================
    // METRONOME
    // =======================================================

    function startMetronome() {
        stopMetronome();
        isMetronomeOn = true;
        metronomeBeat = 0;
        metronomeNextBeatTime = audioCtx.currentTime;
        metronomeSchedulerInterval = setInterval(metronomeScheduler, 25);
        $('metro-btn').textContent = '\u25a0 METRO';
        $('metro-btn').classList.add('metro-on');
    }

    function stopMetronome() {
        isMetronomeOn = false;
        clearInterval(metronomeSchedulerInterval);
        metronomeSchedulerInterval = null;
        $('metro-btn').textContent = '\u25b6 METRO';
        $('metro-btn').classList.remove('metro-on');
        document.querySelectorAll('.metro-beat-dot').forEach(d => d.classList.remove('active', 'accent'));
    }

    function toggleMetronome() {
        if (isMetronomeOn) stopMetronome(); else startMetronome();
    }

    function metronomeScheduler() {
        const lookahead = 0.1; // seconds to schedule ahead
        const interval = 60 / metronomeBpm;
        while (metronomeNextBeatTime < audioCtx.currentTime + lookahead) {
            const isAccent = metronomeBeat === 0;
            // Schedule audio click via AudioContext clock for accurate timing
            scheduleMetronomeClick(metronomeNextBeatTime, isAccent);
            // Pad chord changes follow the metronome's downbeat
            if (isAccent && droneMode === 'pad' && !droneSuspended()) droneBar(metronomeNextBeatTime);
            // Schedule visual update with matching delay
            const delayMs = Math.max(0, (metronomeNextBeatTime - audioCtx.currentTime) * 1000);
            const beatIdx = metronomeBeat;
            setTimeout(() => updateMetronomeDots(beatIdx), delayMs);
            metronomeBeat = (metronomeBeat + 1) % METRO_BEATS_PER_MEASURE;
            metronomeNextBeatTime += interval;
        }
    }

    function scheduleMetronomeClick(time, accent) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = accent ? 1200 : 900;
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
        osc.start(time);
        osc.stop(time + 0.06);
    }

    function updateMetronomeDots(beatIdx) {
        document.querySelectorAll('.metro-beat-dot').forEach((d, i) => {
            d.classList.toggle('active', i === beatIdx);
            d.classList.toggle('accent', i === beatIdx && beatIdx === 0);
        });
    }

    function setMetronomeBpm(bpm) {
        metronomeBpm = Math.max(40, Math.min(240, bpm));
        $('metro-bpm').value = metronomeBpm;
        $('metro-bpm-val').textContent = metronomeBpm;
        // If running, reset the scheduler so tempo change takes effect immediately
        if (isMetronomeOn) {
            metronomeNextBeatTime = audioCtx.currentTime;
            metronomeBeat = 0;
        }
    }

    function beginCountInFirst() {
        if (isMetronomeOn) {
            beginCountInFirstMetroSync();
        } else {
            beginCountInFirstFixed();
        }
    }

    function beginCountInFirstFixed() {
        // 3-2-1 count-in at 1s per beat
        let count = 3;
        $('loop-rec-btn').innerHTML = 'IN ' + count + '...';
        $('loop-rec-btn').classList.add('counting');
        $('loop-timer').textContent = count.toString();
        playCountInClick(true);

        const tick = () => {
            count--;
            if (count <= 0) {
                countInTimeout = null;
                $('loop-rec-btn').classList.remove('counting');
                _actuallyStartLoopRecording();
            } else {
                $('loop-timer').textContent = count.toString();
                $('loop-rec-btn').innerHTML = 'IN ' + count + '...';
                playCountInClick(count === 1);
                countInTimeout = setTimeout(tick, 1000);
            }
        };
        countInTimeout = setTimeout(tick, 1000);
    }

    function beginCountInFirstMetroSync() {
        // Align count-in and recording start to metronome beat boundaries.
        // Recording starts on the first beat-1 (downbeat) that is at least
        // 3 beats away, so 3, 2, 1 fall on the preceding metronome beats.
        // Audio clicks come from the metronome itself — no duplicates needed.
        const beatInterval = 60 / metronomeBpm; // seconds
        const now = audioCtx.currentTime;

        // metronomeNextBeatTime is the AudioContext time of the next scheduled beat,
        // whose index is metronomeBeat. Walk forward to find the next downbeat (0)
        // that leaves room for a 3-beat count-in.
        const beatsToNext0 = (METRO_BEATS_PER_MEASURE - metronomeBeat) % METRO_BEATS_PER_MEASURE;
        let beat0Time = metronomeNextBeatTime + beatsToNext0 * beatInterval;
        while (beat0Time - now < 3 * beatInterval + 0.1) {
            beat0Time += METRO_BEATS_PER_MEASURE * beatInterval;
        }

        $('loop-rec-btn').classList.add('counting');
        $('loop-rec-btn').innerHTML = 'IN...';
        $('loop-timer').textContent = '...';

        // Schedule visual count-in labels on the 3 beats before beat0Time
        [3, 2, 1].forEach((n, i) => {
            const delayMs = (beat0Time - (3 - i) * beatInterval - now) * 1000;
            countInVisualTimeouts.push(setTimeout(() => {
                $('loop-timer').textContent = n.toString();
                $('loop-rec-btn').innerHTML = 'IN ' + n + '...';
            }, delayMs));
        });

        // Start recording exactly on the downbeat
        countInTimeout = setTimeout(() => {
            countInVisualTimeouts = [];
            countInTimeout = null;
            $('loop-rec-btn').classList.remove('counting');
            _actuallyStartLoopRecording();
        }, (beat0Time - now) * 1000);
    }

    function beginCountInSync() {
        // Wait for the next loop boundary, playing click cues in the lead-up
        const waitStart = Date.now();
        const elapsed = (waitStart - loopPlaybackStart) % loopLength;
        const timeToNext = loopLength - elapsed;

        $('loop-rec-btn').innerHTML = 'SYNC...';
        $('loop-rec-btn').classList.add('counting');

        // Schedule clicks at 1s intervals counting down to the loop boundary
        // (accent on the 1-second-out click so you know "now!")
        const numClicks = Math.min(3, Math.floor(timeToNext / 1000));
        for (let i = numClicks; i >= 1; i--) {
            setTimeout(() => playCountInClick(i === 1), timeToNext - i * 1000);
        }

        countInDisplayInterval = setInterval(() => {
            const remaining = timeToNext - (Date.now() - waitStart);
            if (remaining <= 0) { clearInterval(countInDisplayInterval); countInDisplayInterval = null; return; }
            $('loop-timer').textContent = (remaining / 1000).toFixed(1) + 's';
        }, 50);

        countInTimeout = setTimeout(() => {
            clearInterval(countInDisplayInterval);
            countInDisplayInterval = null;
            countInTimeout = null;
            $('loop-rec-btn').classList.remove('counting');
            _actuallyStartLoopRecording();
        }, timeToNext);
    }

    function _actuallyStartLoopRecording() {
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
    // BACKING DRONE / PAD
    // =======================================================
    // Routed straight to the speakers (like the metronome), not into the
    // recorder: loop tracks would otherwise bake in a drone that doubles up
    // and drifts against the live one on playback.

    const CHORD_QUALITIES = { maj: [0, 4, 7], min: [0, 3, 7], dom7: [0, 4, 7, 10], aug: [0, 4, 8], fifth: [0, 7] };
    const CHORD_SUFFIX = { maj: '', min: 'm', dom7: '7', aug: '+', fifth: '5' };
    // [degree in semitones above key, quality], one chord per bar
    const PROGRESSIONS = {
        major:        [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],   // I–V–vi–IV
        minor:        [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],  // i–VI–III–VII
        blues:        [[0, 'dom7'], [5, 'dom7'], [0, 'dom7'], [7, 'dom7']],
        arabic:       [[0, 'maj'], [1, 'maj'], [0, 'maj'], [5, 'min']],
        'whole-tone': [[0, 'aug'], [2, 'aug']]
    };

    let droneMode = 'off'; // 'off' | 'drone' | 'pad'
    let droneBus = null, droneOut = null, droneLfoGain = null;
    let droneSegments = [];
    let droneSchedulerInterval = null;
    let droneNextBarTime = 0;
    let droneBarIdx = 0;
    let droneLabelTimeouts = [];

    function initDrone() {
        droneBus = audioCtx.createGain();
        droneOut = audioCtx.createGain();
        droneOut.gain.value = 0.4;
        droneBus.connect(droneOut);
        const verb = audioCtx.createConvolver();
        verb.buffer = createReverbIR(4);
        const wet = audioCtx.createGain();
        wet.gain.value = 0.5;
        droneOut.connect(audioCtx.destination);
        droneOut.connect(verb);
        verb.connect(wet);
        wet.connect(audioCtx.destination);
        // Slow shared LFO sweeping every chord's filter cutoff
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.07;
        droneLfoGain = audioCtx.createGain();
        droneLfoGain.gain.value = 220;
        lfo.connect(droneLfoGain);
        lfo.start();
    }

    function chordMidis(degree, quality) {
        let root = 48 + ((currentKey + degree) % 12);
        if (root > 54) root -= 12;
        return [root - 12, ...CHORD_QUALITIES[quality].map(iv => root + iv)];
    }

    function chordName(degree, quality) {
        return NOTE_NAMES[(currentKey + degree) % 12] + CHORD_SUFFIX[quality];
    }

    // Start a sustained chord at time t0, fading in over `fade` seconds.
    function startDroneChord(midis, t0, fade, cutoff) {
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.13 / Math.sqrt(midis.length), t0 + fade);
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.7;
        droneLfoGain.connect(filter.frequency);
        filter.connect(gain);
        gain.connect(droneBus);
        const oscs = [];
        for (const m of midis) {
            for (const detune of [-7, 7]) {
                const o = audioCtx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = noteToFreq(m);
                o.detune.value = detune;
                o.connect(filter);
                o.start(t0);
                oscs.push(o);
            }
        }
        const seg = { oscs, gain, filter, end: Infinity };
        droneSegments.push(seg);
        return seg;
    }

    // Fade a chord out starting at `when` (clamped to now) and free its nodes.
    function endDroneChord(seg, when, fade) {
        const now = audioCtx.currentTime;
        when = Math.max(when, now);
        if (when >= seg.end) return;
        seg.end = when;
        const gp = seg.gain.gain;
        if (when <= now + 0.02) {
            const v = gp.value;
            gp.cancelScheduledValues(now);
            gp.setValueAtTime(v, now);
        }
        gp.setTargetAtTime(0, when, fade / 3);
        const stopAt = when + fade * 2;
        for (const o of seg.oscs) { try { o.stop(stopAt); } catch (_) {} }
        setTimeout(() => {
            for (const o of seg.oscs) { try { o.disconnect(); } catch (_) {} }
            try { droneLfoGain.disconnect(seg.filter.frequency); } catch (_) {}
            try { seg.filter.disconnect(); seg.gain.disconnect(); } catch (_) {}
            droneSegments = droneSegments.filter(s => s !== seg);
        }, (stopAt - now) * 1000 + 250);
    }

    // Crossfade from whatever is sounding into a new chord at time t.
    function playDroneChordAt(t, degree, quality, fade, cutoff) {
        for (const seg of droneSegments) endDroneChord(seg, t, fade);
        startDroneChord(chordMidis(degree, quality), t, fade, cutoff);
        const name = chordName(degree, quality);
        const delay = Math.max(0, (t - audioCtx.currentTime) * 1000);
        droneLabelTimeouts.push(setTimeout(() => { $('drone-chord').textContent = name; }, delay));
    }

    function stopDroneSound(fade = 0.6) {
        for (const seg of droneSegments) endDroneChord(seg, audioCtx.currentTime, fade);
        droneLabelTimeouts.forEach(clearTimeout);
        droneLabelTimeouts = [];
        $('drone-chord').textContent = '—';
    }

    function droneSuspended() {
        return !!(game && game.chords);
    }

    function droneBarSeconds() {
        return METRO_BEATS_PER_MEASURE * 60 / metronomeBpm;
    }

    // One pad bar starting at time t. Called by the pad's own clock, or by
    // the metronome on its downbeat so chord changes land on beat 1.
    function droneBar(t) {
        const prog = PROGRESSIONS[currentScale] || PROGRESSIONS.major;
        const [deg, q] = prog[droneBarIdx % prog.length];
        droneBarIdx++;
        const fade = Math.min(0.9, droneBarSeconds() * 0.35);
        playDroneChordAt(t, deg, q, fade, 950);
        droneNextBarTime = t + droneBarSeconds();
    }

    function droneScheduler() {
        if (droneMode !== 'pad' || isMetronomeOn || droneSuspended()) return;
        const now = audioCtx.currentTime;
        if (droneNextBarTime < now) droneNextBarTime = now + 0.03;
        while (droneNextBarTime < now + 0.15) droneBar(droneNextBarTime);
    }

    function startStaticDrone() {
        if (droneMode !== 'drone' || droneSuspended()) return;
        playDroneChordAt(audioCtx.currentTime + 0.02, 0, 'fifth', 0.8, 650);
    }

    function setDroneMode(mode) {
        droneMode = mode;
        stopDroneSound(0.6);
        clearInterval(droneSchedulerInterval);
        droneSchedulerInterval = null;
        if (mode === 'drone') {
            startStaticDrone();
        } else if (mode === 'pad') {
            droneBarIdx = 0;
            droneNextBarTime = audioCtx.currentTime + 0.03;
            droneSchedulerInterval = setInterval(droneScheduler, 50);
            if (isMetronomeOn && !droneSuspended()) droneBar(audioCtx.currentTime + 0.03);
            else droneScheduler();
        }
        document.querySelectorAll('#drone-mode-buttons .seg-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.mode === mode));
        const kb = $('kids-music-btn');
        if (kb) kb.classList.toggle('active', mode !== 'off');
    }

    function cycleDroneMode() {
        const order = ['off', 'drone', 'pad'];
        setDroneMode(order[(order.indexOf(droneMode) + 1) % order.length]);
        showToast('Backing: ' + droneMode.charAt(0).toUpperCase() + droneMode.slice(1));
    }

    // Key changes retune the static drone at once; the pad picks them up next bar.
    function onKeyOrScaleChangeForDrone() {
        if (droneMode === 'drone') startStaticDrone();
    }

    // =======================================================
    // PLAY ALONG (trace-the-melody game)
    // =======================================================
    // Melodies are written in C (C4 = MIDI 60); "NOTE:beats", default 1 beat,
    // "R:beats" is a rest. Chords are "beat:Name", both transposed to the key.

    const SONG_CHORDS = { C: [0, 'maj'], F: [5, 'maj'], G: [7, 'maj'], G7: [7, 'dom7'], Am: [9, 'min'], Dm: [2, 'min'] };
    const SONGS = [
        {
            id: 'twinkle', title: 'Twinkle Twinkle', icon: '⭐', bpm: 100,
            melody: 'C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2 | G4 G4 F4 F4 E4 E4 D4:2 | ' +
                    'G4 G4 F4 F4 E4 E4 D4:2 | C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2',
            chords: '0:C 4:F 6:C 8:F 10:C 12:G 14:C 16:C 18:F 20:C 22:G 24:C 26:F 28:C 30:G ' +
                    '32:C 36:F 38:C 40:F 42:C 44:G 46:C'
        },
        {
            id: 'mary', title: 'Mary Had a Little Lamb', icon: '🐑', bpm: 108,
            melody: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4',
            chords: '0:C 8:G 12:C 24:G 28:C'
        },
        {
            id: 'frere', title: 'Frère Jacques', icon: '🔔', bpm: 100,
            melody: 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | ' +
                    'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2',
            chords: '0:C 25:G 26:C 29:G 30:C'
        },
        {
            id: 'ode', title: 'Ode to Joy', icon: '🎉', bpm: 104,
            melody: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | ' +
                    'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
            chords: '0:C 4:G 8:C 12:C 14:G 16:C 20:G 24:C 28:G 30:C'
        }
    ];

    // Boomwhacker-style colour per pitch class (C red … B magenta)
    const PITCH_CLASS_COLORS = [
        '255,64,64', '255,110,60', '255,150,30', '255,190,30', '255,230,60', '140,220,70',
        '60,220,120', '0,210,190', '0,170,255', '80,110,255', '160,80,255', '240,70,190'
    ];
    const GAME_FALL_SEC = 3.0;  // time for a note bar to fall from the top to the hit line
    const GAME_LINE = 0.62;     // hit line, as a fraction of play-area height
    const GAME_SPEEDS = { slow: 0.7, medium: 0.85, normal: 1.0 };
    const GRADES = [
        { min: 0.8, key: 'perfect', text: 'Perfect!', color: '255,230,80' },
        { min: 0.5, key: 'great', text: 'Great!', color: '80,255,170' },
        { min: 0.2, key: 'ok', text: 'OK', color: '120,190,255' },
        { min: -1, key: 'miss', text: 'Miss', color: '255,110,130' }
    ];

    let game = null; // active Play Along round
    let gameLastSong = null;
    const gameOpts = { speed: 'medium', guide: true, assist: true, chords: true };

    function parseMelody(str) {
        const out = [];
        let beat = 0;
        for (const tok of str.split(/\s+/)) {
            const m = tok.match(/^(R|[A-G]#?)(-?\d)?(?::([\d.]+))?$/);
            if (!m) continue;
            const dur = m[3] ? parseFloat(m[3]) : 1;
            if (m[1] !== 'R') {
                out.push({ midi: NOTE_NAMES.indexOf(m[1]) + (parseInt(m[2]) + 1) * 12, beat, dur });
            }
            beat += dur;
        }
        return out;
    }

    function parseChords(str) {
        return str.split(/\s+/).filter(Boolean).map(tok => {
            const [beat, name] = tok.split(':');
            return { beat: parseFloat(beat), chord: SONG_CHORDS[name] };
        });
    }

    function gameBest(id) {
        return parseInt(localStorage.getItem('aetheremin-best-' + id) || '0', 10);
    }

    function starsFor(pct) {
        return pct >= 88 ? 3 : pct >= 70 ? 2 : pct >= 45 ? 1 : 0;
    }

    function starString(n) {
        return '★'.repeat(n) + '☆'.repeat(3 - n);
    }

    function startGame(songId) {
        const song = SONGS.find(s => s.id === songId);
        if (!song) return;
        if (game) teardownGame();
        hideGameOverlays();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const opts = kidsMode
            ? { speed: 'slow', guide: true, assist: true, chords: true }
            : { ...gameOpts };
        const shift = currentKey <= 6 ? currentKey : currentKey - 12;
        const spb = 60 / (song.bpm * GAME_SPEEDS[opts.speed]);
        const t0 = audioCtx.currentTime + GAME_FALL_SEC + 0.4;

        const notes = parseMelody(song.melody).map(n => ({
            midi: n.midi + shift,
            t0: t0 + n.beat * spb,
            t1: t0 + (n.beat + n.dur) * spb,
            on: 0, judged: false, grade: null, hitNow: false
        }));
        const midis = notes.map(n => n.midi);

        game = {
            song, opts, notes, spb, t0,
            end: notes[notes.length - 1].t1,
            lo: Math.min(...midis) - 1.5,
            hi: Math.max(...midis) + 1.5,
            lanes: [...new Set(midis)],
            assist: opts.assist,
            chords: opts.chords,
            tolerance: kidsMode ? 100 : 50,
            weighted: 0, judgedDur: 0, totalDur: 0,
            counts: { perfect: 0, great: 0, ok: 0, miss: 0 },
            combo: 0, maxCombo: 0,
            popups: [], guide: null,
            lastTime: audioCtx.currentTime, finished: false
        };
        game.totalDur = notes.reduce((a, n) => a + (n.t1 - n.t0), 0);
        gameLastSong = song.id;

        if (opts.guide) scheduleGameGuide();
        if (opts.chords) scheduleGameChords(shift);

        document.body.classList.add('game-active');
        if ($('songs-btn')) $('songs-btn').classList.add('active');
        $('game-title').textContent = song.icon + ' ' + song.title;
        updateGameHud();
    }

    function scheduleGameGuide() {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        const g = audioCtx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(audioCtx.destination);
        for (const n of game.notes) {
            osc.frequency.setValueAtTime(noteToFreq(n.midi), n.t0);
            g.gain.setTargetAtTime(0.08, n.t0, 0.015);
            g.gain.setTargetAtTime(0, Math.max(n.t0 + 0.05, n.t1 - 0.06), 0.015);
        }
        osc.start();
        osc.stop(game.end + 0.5);
        game.guide = { osc, g };
    }

    // The pad plays the song's own harmony, scheduled on the audio clock.
    function scheduleGameChords() {
        stopDroneSound(0.4);
        const evs = parseChords(game.song.chords);
        const fade = Math.min(0.5, game.spb * 0.5);
        evs.forEach((ev, i) => {
            const t = game.t0 + ev.beat * game.spb;
            const tEnd = i + 1 < evs.length ? game.t0 + evs[i + 1].beat * game.spb : game.end + 0.3;
            const seg = startDroneChord(chordMidis(ev.chord[0], ev.chord[1]), t, fade, 1000);
            endDroneChord(seg, tEnd, i + 1 < evs.length ? fade : 1.2);
            const name = chordName(ev.chord[0], ev.chord[1]);
            droneLabelTimeouts.push(setTimeout(() => { $('drone-chord').textContent = name; },
                Math.max(0, (t - audioCtx.currentTime) * 1000)));
        });
    }

    function gameOnPitch(midi) {
        const target = noteToFreq(midi);
        for (const v of voices.values()) {
            if (v.vol < 0.03) continue;
            if (Math.abs(1200 * Math.log2(v.freq / target)) <= game.tolerance) return true;
        }
        return false;
    }

    function gameXOf(midi, W) {
        return (midi - game.lo) / (game.hi - game.lo) * W;
    }

    function judgeGameNote(n) {
        n.judged = true;
        const dur = n.t1 - n.t0;
        const acc = Math.min(1, n.on / Math.max(0.1, dur - 0.12));
        const grade = GRADES.find(g => acc >= g.min);
        n.grade = grade.key;
        game.counts[grade.key]++;
        game.weighted += acc * dur;
        game.judgedDur += dur;
        if (grade.key === 'perfect' || grade.key === 'great') {
            game.combo++;
            game.maxCombo = Math.max(game.maxCombo, game.combo);
        } else {
            game.combo = 0;
        }
        const W = vizCanvas.width, H = vizCanvas.height;
        const x = gameXOf(n.midi, W);
        game.popups.push({ x, text: grade.text, color: grade.color, t: audioCtx.currentTime });
        if (grade.key === 'perfect') spawnParticles(x, H * GAME_LINE, 24);
        else if (grade.key === 'great') spawnParticles(x, H * GAME_LINE, 12);
        updateGameHud();
    }

    function updateGame() {
        if (!game || game.finished) return;
        const now = audioCtx.currentTime;
        const dt = Math.min(0.1, Math.max(0, now - game.lastTime));
        game.lastTime = now;
        for (const n of game.notes) {
            if (n.judged) continue;
            if (now < n.t0) break;
            if (now < n.t1) {
                n.hitNow = gameOnPitch(n.midi);
                if (n.hitNow) n.on += dt;
            } else {
                n.hitNow = false;
                judgeGameNote(n);
            }
        }
        if (now > game.end + 0.8) finishGame();
    }

    function updateGameHud() {
        if (!game) return;
        const pct = game.judgedDur > 0 ? Math.round(100 * game.weighted / game.judgedDur) : 0;
        $('game-score').textContent = game.judgedDur > 0 ? pct + '%' : '';
        $('game-combo').textContent = game.combo >= 2 ? 'combo ×' + game.combo : '';
        const now = audioCtx.currentTime;
        const prog = Math.max(0, Math.min(1, (now - game.t0) / (game.end - game.t0)));
        $('game-progress-fill').style.width = (prog * 100) + '%';
    }

    function finishGame() {
        const g = game;
        g.finished = true;
        const pct = Math.round(100 * g.weighted / g.totalDur);
        const stars = starsFor(pct);
        const prevBest = gameBest(g.song.id);
        if (pct > prevBest) localStorage.setItem('aetheremin-best-' + g.song.id, String(pct));
        teardownGame();

        const msgs = ['Keep practicing!', 'Nice start!', 'Great job!', 'Amazing!'];
        $('game-stars').textContent = starString(stars);
        $('game-final').textContent = pct + '%';
        $('game-message').textContent = msgs[stars];
        $('game-breakdown').textContent =
            `${g.counts.perfect} perfect · ${g.counts.great} great · ${g.counts.ok} ok · ` +
            `${g.counts.miss} miss · best combo ${g.maxCombo}`;
        $('game-newbest').classList.toggle('show', pct > prevBest && prevBest > 0);
        $('game-results').classList.add('open');
        if (stars >= 2) {
            const W = vizCanvas.width, H = vizCanvas.height;
            for (let i = 0; i < 6; i++) spawnParticles(W * (0.15 + 0.14 * i), H * 0.5, 20);
        }
    }

    // Stop a round (finished or quit) and restore normal playing.
    function teardownGame() {
        if (!game) return;
        const now = audioCtx.currentTime;
        if (game.guide) {
            const gp = game.guide.g.gain;
            gp.cancelScheduledValues(now);
            gp.setTargetAtTime(0, now, 0.02);
            try { game.guide.osc.stop(now + 0.15); } catch (_) {}
        }
        const hadChords = game.chords;
        if (hadChords) stopDroneSound(0.6);
        game = null;
        document.body.classList.remove('game-active');
        if ($('songs-btn')) $('songs-btn').classList.remove('active');
        if (hadChords && droneMode !== 'off') setDroneMode(droneMode);
        buildFreqGuides();
    }

    function quitGame() {
        teardownGame();
    }

    function drawGame(ctx, W, H) {
        const now = audioCtx.currentTime;
        const lineY = H * GAME_LINE;
        const pps = lineY / GAME_FALL_SEC;
        const laneW = W / (game.hi - game.lo);
        const barW = Math.max(14, Math.min(laneW * 0.72, 90));
        const light = document.body.classList.contains('light-mode');
        const c = THEME_COLORS[currentTheme];
        const current = game.notes.find(n => now >= n.t0 && now < n.t1);

        // Lanes + note-name labels
        ctx.textAlign = 'center';
        ctx.font = `bold ${kidsMode ? 18 : 13}px system-ui, sans-serif`;
        for (const m of game.lanes) {
            const col = PITCH_CLASS_COLORS[((m % 12) + 12) % 12];
            const x = gameXOf(m, W);
            ctx.fillStyle = `rgba(${col},${light ? 0.1 : 0.06})`;
            ctx.fillRect(x - barW / 2, 0, barW, H);
            ctx.fillStyle = `rgba(${col},0.9)`;
            ctx.fillText(NOTE_NAMES[((m % 12) + 12) % 12], x, H - 34);
        }

        // Full-height glow on the column you should be in right now
        if (current) {
            const col = PITCH_CLASS_COLORS[((current.midi % 12) + 12) % 12];
            const x = gameXOf(current.midi, W);
            const a = current.hitNow ? 0.38 : 0.2;
            const grad = ctx.createLinearGradient(x - barW, 0, x + barW, 0);
            grad.addColorStop(0, `rgba(${col},0)`);
            grad.addColorStop(0.5, `rgba(${col},${a})`);
            grad.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x - barW, 0, barW * 2, H);
        }

        // Hit line
        ctx.save();
        ctx.strokeStyle = `rgba(${c.secondary.join(',')},0.8)`;
        ctx.lineWidth = 2;
        ctx.shadowColor = `rgba(${c.secondary.join(',')},0.8)`;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(W, lineY);
        ctx.stroke();
        ctx.restore();

        // Falling note bars: bottom edge reaches the line at the note's start
        for (const n of game.notes) {
            const yBottom = lineY - (n.t0 - now) * pps;
            const yTop = lineY - (n.t1 - now) * pps;
            if (yBottom < 0) break;
            if (yTop > H) continue;
            const col = PITCH_CLASS_COLORS[((n.midi % 12) + 12) % 12];
            const x = gameXOf(n.midi, W) - barW / 2;
            const h = Math.max(4, yBottom - yTop - 3);
            let alpha = 0.85;
            if (n.judged) alpha = n.grade === 'miss' ? 0.15 : 0.3;
            ctx.save();
            ctx.fillStyle = `rgba(${col},${alpha})`;
            if (n.hitNow) {
                ctx.shadowColor = `rgba(${col},1)`;
                ctx.shadowBlur = 24;
            }
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, yTop + 1.5, barW, h, Math.min(10, barW / 3));
            else ctx.rect(x, yTop + 1.5, barW, h);
            ctx.fill();
            if (n.hitNow) {
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        }

        // Grade popups
        ctx.font = `bold ${kidsMode ? 26 : 18}px system-ui, sans-serif`;
        game.popups = game.popups.filter(p => now - p.t < 0.9);
        for (const p of game.popups) {
            const age = now - p.t;
            ctx.fillStyle = `rgba(${p.color},${1 - age / 0.9})`;
            ctx.fillText(p.text, p.x, lineY - 24 - age * 45);
        }

        // Lead-in countdown
        if (now < game.t0) {
            const secs = Math.ceil(game.t0 - now);
            ctx.font = `bold ${kidsMode ? 72 : 56}px system-ui, sans-serif`;
            ctx.fillStyle = light ? 'rgba(40,40,80,0.5)' : 'rgba(255,255,255,0.5)';
            ctx.fillText(secs <= 3 ? String(secs) : '', W / 2, H * 0.3);
        }
    }

    function renderSongList() {
        const list = $('game-song-list');
        list.innerHTML = '';
        for (const s of SONGS) {
            const best = gameBest(s.id);
            const btn = document.createElement('button');
            btn.className = 'game-song-btn';
            btn.dataset.song = s.id;
            btn.innerHTML = `<span class="game-song-icon">${s.icon}</span>` +
                `<span class="game-song-name">${s.title}</span>` +
                `<span class="game-song-best">${best ? starString(starsFor(best)) + ' ' + best + '%' : 'New'}</span>`;
            btn.addEventListener('click', () => startGame(s.id));
            list.appendChild(btn);
        }
    }

    function openGamePicker() {
        if (game) quitGame();
        $('game-results').classList.remove('open');
        renderSongList();
        $('game-picker').classList.add('open');
    }

    function hideGameOverlays() {
        $('game-picker').classList.remove('open');
        $('game-results').classList.remove('open');
    }

    function gameOverlayOpen() {
        return $('game-picker').classList.contains('open') || $('game-results').classList.contains('open');
    }

    function syncGameOptionUI() {
        document.querySelectorAll('#game-speed .seg-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.speed === gameOpts.speed));
        document.querySelectorAll('.game-opt-toggle').forEach(b => {
            const on = gameOpts[b.dataset.opt];
            b.classList.toggle('active', on);
        });
    }

    function bindGameControls() {
        const songsBtn = kidsMode ? $('kids-songs-btn') : $('songs-btn');
        songsBtn.addEventListener('click', openGamePicker);
        $('game-quit').addEventListener('click', quitGame);
        $('game-picker-close').addEventListener('click', hideGameOverlays);
        $('game-again').addEventListener('click', () => startGame(gameLastSong));
        $('game-songs').addEventListener('click', openGamePicker);
        $('game-done').addEventListener('click', hideGameOverlays);
        document.querySelectorAll('.game-overlay').forEach(ov =>
            ov.addEventListener('click', e => { if (e.target === ov) hideGameOverlays(); }));
        document.querySelectorAll('#game-speed .seg-btn').forEach(b =>
            b.addEventListener('click', () => { gameOpts.speed = b.dataset.speed; syncGameOptionUI(); }));
        document.querySelectorAll('.game-opt-toggle').forEach(b =>
            b.addEventListener('click', () => { gameOpts[b.dataset.opt] = !gameOpts[b.dataset.opt]; syncGameOptionUI(); }));
        syncGameOptionUI();
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
        pa.addEventListener('contextmenu', e => e.preventDefault());

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
        $('scale-select').addEventListener('change', e => { currentScale = e.target.value; buildFreqGuides(); updateSnapControl(); });
        $('key-select').addEventListener('change', e => {
            currentKey = parseInt(e.target.value);
            buildFreqGuides();
            onKeyOrScaleChangeForDrone();
        });

        $('snap-strength').addEventListener('input', e => setSnapStrength(parseInt(e.target.value)));
        updateSnapControl();

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
        $('light-mode-btn').addEventListener('click', () => {
            setLightMode(!document.body.classList.contains('light-mode'));
        });

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

        // Metronome
        const metroDots = $('metro-beats');
        for (let i = 0; i < METRO_BEATS_PER_MEASURE; i++) {
            const d = document.createElement('div');
            d.className = 'metro-beat-dot';
            metroDots.appendChild(d);
        }
        $('metro-btn').addEventListener('click', toggleMetronome);
        $('metro-bpm').addEventListener('input', e => setMetronomeBpm(parseInt(e.target.value)));
        $('metro-minus').addEventListener('click', () => setMetronomeBpm(metronomeBpm - 1));
        $('metro-plus').addEventListener('click', () => setMetronomeBpm(metronomeBpm + 1));

        // Loop station
        $('loop-rec-btn').addEventListener('click', startLoopRecording);
        $('loop-play-btn').addEventListener('click', startLoopPlayback);
        $('loop-stop-btn').addEventListener('click', () => { stopLoopRecording(); stopLoopPlayback(); });
        $('loop-clear-btn').addEventListener('click', clearLoopTracks);

        // Mic sample — click/tap to start, click/tap again to stop
        const micBtn = $('mic-sample-btn');
        micBtn.addEventListener('click', () => {
            if (micRecording) stopMicSample();
            else startMicSample();
        });
        $('mic-preview-btn').addEventListener('click', playMicPreview);

        // Backing drone / pad
        document.querySelectorAll('#drone-mode-buttons .seg-btn').forEach(b =>
            b.addEventListener('click', () => setDroneMode(b.dataset.mode)));
        $('drone-volume').addEventListener('input', e => {
            droneOut.gain.setTargetAtTime(e.target.value / 100, audioCtx.currentTime, 0.05);
            $('drone-vol-val').textContent = e.target.value + '%';
        });

        // Play Along
        bindGameControls();

        // Air mode
        bindAirControls();

        // Resize
        window.addEventListener('resize', resizeCanvases);
    }

    // =======================================================
    // KIDS MODE CONTROLS
    // =======================================================

    function bindKidsControls() {
        document.body.classList.add('kids-mode');

        // Play area — same pointer handling as normal mode
        const pa = $('play-area');
        pa.style.touchAction = 'none';
        pa.addEventListener('pointerdown', onPointerDown);
        pa.addEventListener('pointermove', onPointerMove);
        pa.addEventListener('pointerup', onPointerUp);
        pa.addEventListener('pointercancel', onPointerUp);
        pa.addEventListener('pointerleave', onPointerUp);
        pa.addEventListener('contextmenu', e => e.preventDefault());

        // Animal sound buttons
        document.querySelectorAll('.kids-sound-btn').forEach(btn => {
            btn.addEventListener('click', () => selectWaveform(btn.dataset.wave));
        });

        // Preset buttons
        document.querySelectorAll('.kids-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        // Mic sample button
        $('kids-mic-btn').addEventListener('click', () => {
            if (micRecording) stopMicSample();
            else startMicSample();
        });

        // Effect sliders
        $('kids-echo').addEventListener('input', e => {
            const v = e.target.value / 100;
            delayGain.gain.setValueAtTime(v, audioCtx.currentTime);
            $('delay-mix').value = e.target.value;
            $('delay-val').textContent = e.target.value + '%';
        });
        $('kids-space').addEventListener('input', e => {
            const v = e.target.value / 100;
            reverbGain.gain.setValueAtTime(v, audioCtx.currentTime);
            dryGain.gain.setValueAtTime(1 - v * 0.5, audioCtx.currentTime);
            $('reverb-mix').value = e.target.value;
            $('reverb-val').textContent = e.target.value + '%';
        });
        $('kids-wobble').addEventListener('input', e => {
            $('vibrato-depth').value = e.target.value;
            $('vibrato-val').textContent = e.target.value + '%';
        });
        $('kids-shimmer').addEventListener('input', e => {
            const v = e.target.value / 100;
            chorusMixGain.gain.setValueAtTime(v, audioCtx.currentTime);
            chorusDryGain.gain.setValueAtTime(1 - v * 0.3, audioCtx.currentTime);
            $('chorus-mix').value = e.target.value;
            $('chorus-val').textContent = e.target.value + '%';
        });

        // Theme picker
        document.querySelectorAll('.kids-theme-btn').forEach(btn => {
            btn.addEventListener('click', () => setKidsTheme(btn.dataset.ktheme));
        });

        // Backing music + Play Along
        $('kids-music-btn').addEventListener('click', () => setDroneMode(droneMode === 'off' ? 'pad' : 'off'));
        bindGameControls();

        // Air mode
        bindAirControls();

        // Boost particles and start on cat
        particleAmount = 90;
        selectWaveform('cat');

        window.addEventListener('resize', resizeCanvases);
    }

    function setKidsTheme(ktheme) {
        currentKidsTheme = ktheme;
        currentTheme = ktheme;
        [...document.body.classList].filter(c => c.startsWith('kids-theme-')).forEach(c => document.body.classList.remove(c));
        document.body.classList.add('kids-theme-' + ktheme);
        document.querySelectorAll('.kids-theme-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.ktheme === ktheme)
        );
        // For non-rainbow themes, push colors into CSS vars immediately
        if (ktheme !== 'rainbow') {
            const c = THEME_COLORS[ktheme];
            const root = document.documentElement;
            root.style.setProperty('--theme-primary', `rgb(${c.primary.join(',')})`);
            root.style.setProperty('--theme-secondary', `rgb(${c.secondary.join(',')})`);
            root.style.setProperty('--theme-glow', `rgba(${c.primary.join(',')},0.45)`);
            root.style.setProperty('--theme-particle', `rgb(${c.primary.join(',')})`);
        }
    }

    // =======================================================
    // THEME & PRESETS
    // =======================================================

    function setTheme(theme) {
        currentTheme = theme;
        [...document.body.classList].filter(c => c.startsWith('theme-')).forEach(c => document.body.classList.remove(c));
        document.body.classList.add('theme-' + theme);
        $('theme-select').value = theme;
    }

    function setLightMode(enabled) {
        if (enabled) {
            document.body.classList.add('light-mode');
            $('light-mode-btn').textContent = '\u263D'; // moon
            $('light-mode-btn').title = 'Switch to Dark Mode';
        } else {
            document.body.classList.remove('light-mode');
            $('light-mode-btn').textContent = '\u2600'; // sun
            $('light-mode-btn').title = 'Switch to Light Mode';
        }
        localStorage.setItem('aetheremin-light-mode', enabled ? '1' : '0');
    }

    function setSnapStrength(pct) {
        snapStrength = pct / 100;
        $('snap-strength').value = pct;
        $('snap-val').textContent = pct + '%';
        updateSnapControl();
    }

    function updateSnapControl() {
        $('snap-control').classList.toggle('disabled', currentScale === 'free');
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
        setSnapStrength(p.snap ?? 100);

        if (!kidsMode) setTheme(p.theme);
        if (kidsMode) {
            $('kids-echo').value = p.delayMix;
            $('kids-space').value = p.reverbMix;
            $('kids-wobble').value = p.vibratoDepth;
            $('kids-shimmer').value = p.chorusMix;
        }
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
            if (e.key === '9' && micSampleBuffer) selectWaveform('sample');
            // Space: toggle controls
            if (e.key === ' ' && !e.target.closest('button')) {
                e.preventDefault();
                $('controls-panel').classList.toggle('collapsed');
            }
            // R: record
            if (e.key === 'r' || e.key === 'R') toggleRecording();
            // L: loop
            if (e.key === 'l' || e.key === 'L') startLoopRecording();
            // T: metronome
            if (e.key === 't' || e.key === 'T') toggleMetronome();
            // M: mic sample
            if (e.key === 'm' || e.key === 'M') { if (micRecording) stopMicSample(); else startMicSample(); }
            // A: air mode
            if (e.key === 'a' || e.key === 'A') toggleAirMode();
            // D: cycle backing (off / drone / pad)
            if (e.key === 'd' || e.key === 'D') cycleDroneMode();
            // G: Play Along — open song picker, or quit the current round
            if (e.key === 'g' || e.key === 'G') {
                if (game) quitGame();
                else if (gameOverlayOpen()) hideGameOverlays();
                else openGamePicker();
            }
            // Esc: quit round / close Play Along dialogs
            if (e.key === 'Escape') {
                if (game) quitGame();
                hideGameOverlays();
            }
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
        if ($('build-info').textContent === '__BUILD_INFO__') $('build-info').textContent = 'dev';
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
            setLightMode(localStorage.getItem('aetheremin-light-mode') === '1');
            animate();
        });

        $('kids-start-btn').addEventListener('click', () => {
            kidsMode = true;
            initAudio();
            $('start-screen').classList.add('hidden');
            buildFreqGuides();
            bindKidsControls();
            setKidsTheme('rainbow');
            animate();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
