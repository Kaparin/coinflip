const STORAGE_KEY = 'coinflip-sound';

type SoundId = 'tap' | 'coinFlip' | 'win' | 'lose' | 'notification' | 'jackpot' | 'success';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** Create a simple convolver for reverb-like tail. */
function createReverb(ac: AudioContext, duration: number, decay: number): ConvolverNode {
  const rate = ac.sampleRate;
  const length = rate * duration;
  const impulse = ac.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const conv = ac.createConvolver();
  conv.buffer = impulse;
  return conv;
}

/** Play a note with harmonics for a warmer, richer tone. */
function playRichNote(
  ac: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  dest: AudioNode,
  waveform: OscillatorType = 'sine',
  harmonics: Array<{ ratio: number; gain: number }> = [],
) {
  // Fundamental
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = waveform;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);

  // Overtones for richness
  for (const h of harmonics) {
    const hOsc = ac.createOscillator();
    const hGain = ac.createGain();
    hOsc.type = 'sine';
    hOsc.frequency.value = freq * h.ratio;
    hGain.gain.setValueAtTime(0.001, startTime);
    hGain.gain.linearRampToValueAtTime(volume * h.gain, startTime + 0.01);
    hGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.8);
    hOsc.connect(hGain).connect(dest);
    hOsc.start(startTime);
    hOsc.stop(startTime + duration + 0.05);
  }
}

// ── Tap: soft wooden knock ──────────────────────────────────
function playTap(ac: AudioContext) {
  const now = ac.currentTime;
  // Filtered noise burst — like a soft click/knock
  const bufferSize = ac.sampleRate * 0.03;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
  }
  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.5;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(now);
  source.stop(now + 0.04);

  // Subtle tonal body
  const osc = ac.createOscillator();
  const oGain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 600;
  oGain.gain.setValueAtTime(0.04, now);
  oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  osc.connect(oGain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.04);
}

// ── Coin Flip: metallic spinning with acceleration ──────────
function playCoinFlip(ac: AudioContext) {
  const now = ac.currentTime;
  const ticks = 18;
  const totalDuration = 1.6;

  // Create a subtle reverb bus
  const reverb = createReverb(ac, 0.3, 3);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.15;
  reverb.connect(reverbGain).connect(ac.destination);

  for (let i = 0; i < ticks; i++) {
    const progress = i / ticks;
    // Accelerating interval (starts slow, gets faster)
    const interval = 0.15 * Math.pow(0.88, i);
    let t = now;
    for (let j = 0; j < i; j++) {
      t += 0.15 * Math.pow(0.88, j);
    }
    if (t - now > totalDuration) break;

    // Metallic "clink" — two detuned tones
    const freq1 = 1200 + Math.sin(i * 1.8) * 300; // Wobble between pitches
    const freq2 = freq1 * 1.502; // Metallic interval

    const vol = 0.03 + progress * 0.06;
    const dur = Math.max(0.02, interval * 0.7);

    for (const freq of [freq1, freq2]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = freq === freq1 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(freq === freq1 ? vol : vol * 0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      gain.connect(reverb);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }
}

// ── Win: bright major arpeggio with shimmer ─────────────────
function playWin(ac: AudioContext) {
  const now = ac.currentTime;

  // Reverb bus
  const reverb = createReverb(ac, 0.8, 2);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.25;
  reverb.connect(reverbGain).connect(ac.destination);

  const mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(ac.destination);
  mix.connect(reverb);

  // C major arpeggio: C5→E5→G5→C6 with harmonics
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const harmonics = [
    { ratio: 2, gain: 0.3 },
    { ratio: 3, gain: 0.1 },
  ];

  notes.forEach((freq, i) => {
    const t = now + i * 0.1;
    const vol = 0.1 - i * 0.01;
    playRichNote(ac, freq, t, 0.6 - i * 0.05, vol, mix, 'triangle', harmonics);
  });

  // Final bright chord (all notes together)
  const chordTime = now + 0.45;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.04, chordTime);
    gain.gain.linearRampToValueAtTime(0.06, chordTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.8);
    osc.connect(gain).connect(mix);
    osc.start(chordTime);
    osc.stop(chordTime + 0.85);
  });

  // High sparkle
  const sparkle = ac.createOscillator();
  const sGain = ac.createGain();
  sparkle.type = 'sine';
  sparkle.frequency.value = 2093; // C7
  sGain.gain.setValueAtTime(0.001, chordTime);
  sGain.gain.linearRampToValueAtTime(0.03, chordTime + 0.1);
  sGain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.6);
  sparkle.connect(sGain).connect(mix);
  sparkle.start(chordTime);
  sparkle.stop(chordTime + 0.65);
}

// ── Lose: gentle descending minor phrase ────────────────────
function playLose(ac: AudioContext) {
  const now = ac.currentTime;

  // Soft reverb
  const reverb = createReverb(ac, 0.6, 2.5);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.3;
  reverb.connect(reverbGain).connect(ac.destination);

  const mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(ac.destination);
  mix.connect(reverb);

  // Two descending notes — E4→C4 (minor feel, gentle)
  const notes = [329.63, 261.63];
  notes.forEach((freq, i) => {
    const t = now + i * 0.2;
    playRichNote(ac, freq, t, 0.5, 0.07, mix, 'triangle', [
      { ratio: 2, gain: 0.15 },
    ]);
  });

  // Soft pad underneath
  const pad = ac.createOscillator();
  const pGain = ac.createGain();
  pad.type = 'sine';
  pad.frequency.value = 196; // G3
  pGain.gain.setValueAtTime(0.001, now);
  pGain.gain.linearRampToValueAtTime(0.04, now + 0.1);
  pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
  pad.connect(pGain).connect(mix);
  pad.start(now);
  pad.stop(now + 0.75);
}

// ── Notification: melodic two-tone chime ────────────────────
function playNotification(ac: AudioContext) {
  const now = ac.currentTime;

  // Reverb for bell-like tail
  const reverb = createReverb(ac, 0.5, 2);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.3;
  reverb.connect(reverbGain).connect(ac.destination);

  const mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(ac.destination);
  mix.connect(reverb);

  // Bell-like harmonics (inharmonic partials create bell character)
  const bellHarmonics = [
    { ratio: 2.0, gain: 0.5 },
    { ratio: 3.0, gain: 0.2 },
    { ratio: 4.2, gain: 0.15 }, // Slightly inharmonic — bell-like
    { ratio: 5.4, gain: 0.08 },
  ];

  // Two notes: G5 → B5 (bright, pleasant interval — major third)
  playRichNote(ac, 783.99, now, 0.6, 0.08, mix, 'sine', bellHarmonics);
  playRichNote(ac, 987.77, now + 0.15, 0.5, 0.07, mix, 'sine', bellHarmonics);
}

// ── Jackpot: celebratory cascade with fanfare ───────────────
function playJackpot(ac: AudioContext) {
  const now = ac.currentTime;

  // Rich reverb
  const reverb = createReverb(ac, 1.2, 1.8);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.3;
  reverb.connect(reverbGain).connect(ac.destination);

  const mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(ac.destination);
  mix.connect(reverb);

  const harmonics = [
    { ratio: 2, gain: 0.3 },
    { ratio: 3, gain: 0.15 },
    { ratio: 4, gain: 0.05 },
  ];

  // Ascending fanfare: C5→E5→G5→C6→E6→G6
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0];
  notes.forEach((freq, i) => {
    const t = now + i * 0.09;
    const vol = 0.08 + (i / notes.length) * 0.03;
    playRichNote(ac, freq, t, 0.5, vol, mix, 'triangle', harmonics);
  });

  // Grand chord at the peak
  const chordTime = now + 0.6;
  const chordNotes = [523.25, 659.25, 783.99, 1046.5];
  chordNotes.forEach((freq) => {
    playRichNote(ac, freq, chordTime, 1.0, 0.05, mix, 'triangle', [
      { ratio: 2, gain: 0.2 },
    ]);
  });

  // Sparkle cascade — descending bright particles
  for (let i = 0; i < 8; i++) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 3000 + Math.random() * 2000;
    const t = chordTime + 0.1 + i * 0.06;
    const vol = 0.02 + Math.random() * 0.02;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(mix);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Deep bass hit for impact
  const bass = ac.createOscillator();
  const bGain = ac.createGain();
  bass.type = 'sine';
  bass.frequency.value = 130.81; // C3
  bGain.gain.setValueAtTime(0.1, chordTime);
  bGain.gain.exponentialRampToValueAtTime(0.001, chordTime + 0.6);
  bass.connect(bGain).connect(ac.destination);
  bass.start(chordTime);
  bass.stop(chordTime + 0.65);
}

// ── Success: warm two-note confirmation ─────────────────────
function playSuccess(ac: AudioContext) {
  const now = ac.currentTime;

  // Light reverb
  const reverb = createReverb(ac, 0.4, 2.5);
  const reverbGain = ac.createGain();
  reverbGain.gain.value = 0.2;
  reverb.connect(reverbGain).connect(ac.destination);

  const mix = ac.createGain();
  mix.gain.value = 1;
  mix.connect(ac.destination);
  mix.connect(reverb);

  // G4 → C5 (perfect fourth up — classic "success" interval)
  playRichNote(ac, 392, now, 0.25, 0.08, mix, 'triangle', [
    { ratio: 2, gain: 0.25 },
    { ratio: 3, gain: 0.08 },
  ]);
  playRichNote(ac, 523.25, now + 0.12, 0.4, 0.09, mix, 'triangle', [
    { ratio: 2, gain: 0.25 },
    { ratio: 3, gain: 0.08 },
  ]);

  // Soft high shimmer on the second note
  const shimmer = ac.createOscillator();
  const sGain = ac.createGain();
  shimmer.type = 'sine';
  shimmer.frequency.value = 1046.5; // C6
  sGain.gain.setValueAtTime(0.001, now + 0.12);
  sGain.gain.linearRampToValueAtTime(0.02, now + 0.2);
  sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  shimmer.connect(sGain).connect(mix);
  shimmer.start(now + 0.12);
  shimmer.stop(now + 0.55);
}

const players: Record<SoundId, (ac: AudioContext) => void> = {
  tap: playTap,
  coinFlip: playCoinFlip,
  win: playWin,
  lose: playLose,
  notification: playNotification,
  jackpot: playJackpot,
  success: playSuccess,
};

export const soundManager = {
  play(id: SoundId): void {
    if (!this.isEnabled()) return;
    const ac = getCtx();
    if (!ac) return;
    players[id]?.(ac);
  },

  setEnabled(v: boolean): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(v));
    }
  },

  isEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem(STORAGE_KEY);
    return val !== 'false'; // default true
  },
};

export type { SoundId };
