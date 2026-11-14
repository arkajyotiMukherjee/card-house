import type { NamedSeat } from './game-scene';
interface Settlement {
  tableId: string;
  handNumber: number;
  summaryJson: string;
}
/** Result participants outlive paid seats, so cashing out never erases the winner's name. */
export function settledSeats(
  rows: Iterable<Settlement>,
  tableId: string,
  handNumber: number,
  memberId: string,
): NamedSeat[] {
  const row = [...rows].find(
    (item) => item.tableId === tableId && item.handNumber === handNumber,
  );
  if (!row) return [];
  try {
    const summary: unknown = JSON.parse(row.summaryJson);
    if (!Array.isArray(summary)) return [];
    return summary.flatMap((item: unknown): NamedSeat[] => {
      if (
        !item ||
        typeof item !== 'object' ||
        !('seatIndex' in item) ||
        !('walletId' in item) ||
        !('name' in item) ||
        typeof item.seatIndex !== 'number' ||
        !Number.isSafeInteger(item.seatIndex) ||
        item.seatIndex < 0 ||
        typeof item.walletId !== 'string' ||
        typeof item.name !== 'string'
      )
        return [];
      return [
        {
          seatIndex: item.seatIndex,
          name: item.name,
          lobbyMemberId: item.walletId,
          self: item.walletId === memberId,
          inVoice: false,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Paid results name every winner, including tied zero-profit outcomes. */
export function finishedPrizeMessage(
  rows: Iterable<Settlement>,
  tableId: string,
  handNumber: number,
): string | undefined {
  const row = [...rows].find(
    (item) => item.tableId === tableId && item.handNumber === handNumber,
  );
  if (!row) return undefined;
  try {
    const summary: unknown = JSON.parse(row.summaryJson);
    if (!Array.isArray(summary) || !summary.length) return undefined;
    if (summary.every((item) => item?.refunded === true))
      return 'Entry fees refunded';
    const names = summary
      .filter((item) => item?.won === true && typeof item.name === 'string')
      .map((item) => item.name.slice(0, 10));
    if (!names.length) return undefined;
    return `${names.length === 1 ? 'Winner' : 'Winners'}: ${names.join(', ')}`;
  } catch {
    return undefined;
  }
}
