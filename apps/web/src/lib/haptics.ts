const STORAGE_KEY = 'coinflip-haptics';

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export const haptics = {
  tap(): void {
    if (!this.isEnabled() || !canVibrate()) return;
    navigator.vibrate(10);
  },

  success(): void {
    if (!this.isEnabled() || !canVibrate()) return;
    navigator.vibrate([15, 50, 15]);
  },

  error(): void {
    if (!this.isEnabled() || !canVibrate()) return;
    navigator.vibrate([30, 30, 30]);
  },

  heavy(): void {
    if (!this.isEnabled() || !canVibrate()) return;
    navigator.vibrate(40);
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
