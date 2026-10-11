import {
  BLUFF_GAME_TYPE,
  readBluffEventNote,
} from '../../src/shared/games/bluff';
import {
  RUMMY_GAME_TYPE,
  readRummyEventNote,
  type RummyEventNote,
} from '../../src/shared/games/rummy';

const NAME_LIMIT = 10;
const MESSAGE_LIMIT = 64;

export interface StoredEvent {
  order: number;
  note: unknown;
}

/** Reads the `{ order, intent, note }` the module stores in `payloadJson`. */
export function readStoredEvent(payloadJson: string): StoredEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.order !== 'number' || !Number.isSafeInteger(record.order)) {
    return null;
  }
  return { order: record.order, note: record.note ?? null };
}

function shortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= NAME_LIMIT) {
    return trimmed;
  }
  return trimmed.slice(0, NAME_LIMIT - 1) + '~';
}

function clip(message: string): string {
  return message.length <= MESSAGE_LIMIT
    ? message
    : message.slice(0, MESSAGE_LIMIT);
}

/**
 * One short line for the message strip, or `null` when the event has nothing
 * to announce. Dummy and stub events carry no note, so they stay silent.
 */
export function eventMessage(
  gameType: string,
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  if (gameType === RUMMY_GAME_TYPE) {
    return rummyMessage(readRummyEventNote(note), seatName);
  }
  if (gameType !== BLUFF_GAME_TYPE) {
    return null;
  }
  const parsed = readBluffEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'play') {
    const cards = parsed.count === 1 ? 'card' : 'cards';
    return clip(
      `${shortName(seatName(parsed.seat))} played ${parsed.count} ${cards} as ${parsed.claimRank}`,
    );
  }
  const challenger = shortName(seatName(parsed.challenger));
  const accused = shortName(seatName(parsed.accused));
  if (parsed.bluff) {
    return clip(
      `${challenger} called bluff! ${accused} lied and takes the pile`,
    );
  }
  return clip(
    `${challenger} called bluff but ${accused} was honest. ${challenger} takes the pile`,
  );
}

function rummyMessage(
  note: RummyEventNote | null,
  seatName: (seatIndex: number) => string,
): string | null {
  if (!note) {
    return null;
  }
  const name = shortName(seatName(note.seat));
  if (note.kind === 'draw') {
    return note.source === 'stock'
      ? clip(`${name} drew from the stock`)
      : clip(`${name} took the discard`);
  }
  if (note.kind === 'meld') {
    return clip(
      note.out
        ? `${name} melded ${note.count} and went out`
        : `${name} melded ${note.count} cards`,
    );
  }
  if (note.kind === 'layoff') {
    const cards = note.count === 1 ? 'card' : 'cards';
    return clip(
      note.out
        ? `${name} laid off and went out`
        : `${name} laid off ${note.count} ${cards}`,
    );
  }
  if (note.out) {
    return clip(`${name} discarded and went out`);
  }
  if (note.ended) {
    const winner = note.winnerSeatIndex;
    const who = winner === null ? 'Nobody' : shortName(seatName(winner));
    return clip(`Stock is empty. ${who} has the low score`);
  }
  return clip(`${name} discarded`);
}
