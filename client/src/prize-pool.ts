const PRIZE_GAMES = new Set([
  'bluff',
  'president',
  'go_fish',
  'crazy_eights',
  'rummy',
  'spades',
  'hearts',
]);
interface PrizeTable {
  id: string;
  gameType: string;
  economyJson?: string;
  handNumber: number;
}
interface Funding {
  tableId: string;
  units: bigint;
}
interface Settlement {
  tableId: string;
  handNumber: number;
  summaryJson: string;
}

/** Contributions outlive a departing player; settled results outlive those contributions. */
export function entryFeePrizePool(
  table: PrizeTable,
  fundings: Iterable<Funding>,
  settlements: Iterable<Settlement>,
): number | undefined {
  if (!PRIZE_GAMES.has(table.gameType) || !table.economyJson) return undefined;
  const result = [...settlements].find(
    (row) => row.tableId === table.id && row.handNumber === table.handNumber,
  );
  if (result) {
    try {
      const summary: unknown = JSON.parse(result.summaryJson);
      const fee: unknown = JSON.parse(table.economyJson).entryFee;
      if (
        !Array.isArray(summary) ||
        !summary.length ||
        typeof fee !== 'number' ||
        !Number.isSafeInteger(fee) ||
        fee < 1 ||
        summary.some((row) => !row || typeof row.seatIndex !== 'number') ||
        summary.every((row) => row.refunded === true)
      )
        return undefined;
      // Entry fees are fixed for the life of a table, including absent/CPU participants.
      return fee * summary.length;
    } catch {
      return undefined;
    }
  }
  const units = [...fundings]
    .filter((row) => row.tableId === table.id)
    .reduce((sum, row) => sum + row.units, 0n);
  return units > 0n ? Number(units) / 2 : undefined;
}
