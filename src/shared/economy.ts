/** Chips are stored as integer half-chips; public controls accept whole chips. */
export const DEFAULT_ROOM_GRANT = 10_000;
export const MAX_COINS = 1_000_000_000;
export interface TableEconomy {
  entryFee: number;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  minBet: number;
  maxBet: number;
}
export function coinSetting(value: unknown, fallback: number): number {
  value = value === undefined ? fallback : value;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_COINS
  )
    throw new Error(
      'Chips must be a positive whole number up to 1,000,000,000',
    );
  return value;
}
export function tableEconomy(
  gameType: string,
  values: Partial<TableEconomy> = {},
): TableEconomy {
  const bigBlind = coinSetting(values.bigBlind, 20);
  const smallBlind = coinSetting(
    values.smallBlind,
    Math.max(1, Math.floor(bigBlind / 2)),
  );
  const minBet = coinSetting(values.minBet, 10);
  const maxBet = coinSetting(values.maxBet, 50);
  const minBuyIn = coinSetting(
    values.minBuyIn,
    gameType === 'poker' ? bigBlind * 20 : 200,
  );
  const maxBuyIn = coinSetting(
    values.maxBuyIn,
    gameType === 'poker' ? bigBlind * 100 : 2_000,
  );
  if (
    smallBlind > bigBlind ||
    minBuyIn > maxBuyIn ||
    minBet > maxBet ||
    (gameType === 'poker' && minBuyIn < bigBlind) ||
    (gameType === 'blackjack' && minBuyIn < minBet)
  )
    throw new Error('Stake and buy-in limits are inconsistent');
  return {
    entryFee: coinSetting(values.entryFee, 20),
    smallBlind,
    bigBlind,
    minBuyIn,
    maxBuyIn,
    minBet,
    maxBet,
  };
}
export function coinUnits(coins: number): bigint {
  if (!Number.isFinite(coins) || !Number.isSafeInteger(coins * 2) || coins < 0)
    throw new Error('Invalid chip amount');
  return BigInt(coins * 2);
}
export function formatCoins(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  return `${negative ? '-' : ''}${(absolute / 2n).toLocaleString('en-US')}${absolute % 2n ? '.5' : ''}`;
}
export function casinoGame(gameType: string): boolean {
  return gameType === 'poker' || gameType === 'blackjack';
}
export function splitPool(
  pool: bigint,
  winners: readonly number[],
): Map<number, bigint> {
  const seats = [...new Set(winners)].sort((a, b) => a - b);
  if (pool < 0n || seats.length === 0)
    throw new Error('Cannot split this pool');
  const count = BigInt(seats.length);
  return new Map(
    seats.map((seat, index) => [
      seat,
      pool / count + (BigInt(index) < pool % count ? 1n : 0n),
    ]),
  );
}
