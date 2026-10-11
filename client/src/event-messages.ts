import {
  BLUFF_GAME_TYPE,
  readBluffEventNote,
} from '../../src/shared/games/bluff';
import {
  GO_FISH_GAME_TYPE,
  readGoFishEventNote,
} from '../../src/shared/games/go-fish';

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
  if (gameType === GO_FISH_GAME_TYPE) {
    return goFishMessage(note, seatName);
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

function goFishMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readGoFishEventNote(note);
  if (!parsed) {
    return null;
  }
  const from = shortName(seatName(parsed.from));
  const to = shortName(seatName(parsed.to));
  if (parsed.given > 0) {
    return clip(`${from} took ${parsed.given} ${parsed.rank} from ${to}`);
  }
  if (parsed.drawn) {
    return clip(`${from} asked ${to} for ${parsed.rank}. Go fish`);
  }
  return clip(`${from} asked ${to} for ${parsed.rank}`);
}
