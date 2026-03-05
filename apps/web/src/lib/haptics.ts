const STORAGE_KEY = 'coinflip-haptics';

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const val = localStorage.getItem(STORAGE_KEY);
  return val !== 'false'; // default true
}

function vibrate(pattern: number | number[]): void {
  if (!isEnabled() || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // silently ignore if vibration fails
  }
}

export const haptics = {
  tap(): void {
    vibrate(25);
  },

  success(): void {
    vibrate([25, 60, 25]);
  },

  error(): void {
    vibrate([40, 40, 40]);
  },

  heavy(): void {
    vibrate(60);
  },

  setEnabled(v: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(v));
    // Give immediate feedback when enabling
    if (v && canVibrate()) {
      try { navigator.vibrate(30); } catch { /* ignore */ }
    }
  },

  isEnabled,
};
