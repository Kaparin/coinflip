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

function playTap(ac: AudioContext) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1800;
  gain.gain.setValueAtTime(0.08, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.05);
}

function playCoinFlip(ac: AudioContext) {
  const now = ac.currentTime;
  const ticks = 16;
  for (let i = 0; i < ticks; i++) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    // Accelerating frequency
    const freq = 800 + i * 80;
    osc.frequency.value = freq;
    // Interval shrinks (accelerating spin)
    const t = now + i * (0.12 - i * 0.005);
    const vol = 0.04 + (i / ticks) * 0.06;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }
}

function playWin(ac: AudioContext) {
  const now = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

function playLose(ac: AudioContext) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.4);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

function playNotification(ac: AudioContext) {
  const now = ac.currentTime;
  [880, 1108.73].forEach((freq, i) => { // A5, C#6
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.12;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

function playJackpot(ac: AudioContext) {
  const now = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]; // C5→G6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = now + i * 0.08;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
  // Shimmer — high frequency trill
  const shimmer = ac.createOscillator();
  const sGain = ac.createGain();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(2000, now + 0.4);
  shimmer.frequency.linearRampToValueAtTime(4000, now + 0.9);
  sGain.gain.setValueAtTime(0.04, now + 0.4);
  sGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  shimmer.connect(sGain).connect(ac.destination);
  shimmer.start(now + 0.4);
  shimmer.stop(now + 1.0);
}

function playSuccess(ac: AudioContext) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1200;
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.25);
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
