import { soundManager } from './sounds';
import { haptics } from './haptics';

type FeedbackType = 'tap' | 'win' | 'lose' | 'coinFlip' | 'notification' | 'jackpot' | 'success';

const hapticMap: Record<FeedbackType, () => void> = {
  tap: () => haptics.tap(),
  win: () => haptics.success(),
  lose: () => haptics.error(),
  coinFlip: () => haptics.tap(),
  notification: () => haptics.tap(),
  jackpot: () => haptics.heavy(),
  success: () => haptics.success(),
};

export function feedback(type: FeedbackType): void {
  soundManager.play(type);
  hapticMap[type]();
}
