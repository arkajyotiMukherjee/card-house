export interface RankedWallet {
  id: string;
  profit: bigint;
}

/** A crown means one positive-profit leader, never the initial zero-profit tie. */
export function leaderboardRows<T extends RankedWallet>(
  wallets: readonly T[],
): (T & { rank: number; crowned: boolean })[] {
  const sorted = [...wallets].sort((a, b) =>
    a.profit === b.profit
      ? a.id.localeCompare(b.id)
      : a.profit > b.profit
        ? -1
        : 1,
  );
  const leader =
    sorted[0]?.profit > 0n &&
    (sorted.length === 1 || sorted[0].profit > sorted[1].profit);
  return sorted.map((wallet, index) => ({
    ...wallet,
    rank: sorted.findIndex((row) => row.profit === wallet.profit) + 1,
    crowned: index === 0 && leader,
  }));
}

export function clampLeaderboardOffset(
  offset: number,
  total: number,
  capacity: number,
): number {
  return Math.max(
    0,
    Math.min(Math.round(offset), Math.max(0, total - capacity)),
  );
}

export function leaderboardScrollThumb(
  offset: number,
  total: number,
  capacity: number,
  height: number,
): { y: number; h: number } {
  const h =
    total <= capacity
      ? height
      : Math.max(28, Math.floor((height * capacity) / total));
  const max = Math.max(0, total - capacity);
  return {
    h,
    y: max
      ? Math.round(
          ((height - h) * clampLeaderboardOffset(offset, total, capacity)) /
            max,
        )
      : 0,
  };
}
