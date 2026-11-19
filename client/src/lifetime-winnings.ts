import { formatCoins } from '../../src/shared/economy';

export function lifetimeWinningsCaption(units = 0n): string {
  return `Lifetime winnings ${formatCoins(units)} chips`;
}
