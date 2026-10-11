import {
  BLACKJACK_GAME_TYPE,
  readBlackjackEventNote,
} from '../../src/shared/games/blackjack';
import {
  BLUFF_GAME_TYPE,
  readBluffEventNote,
} from '../../src/shared/games/bluff';

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

function blackjackMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readBlackjackEventNote(note);
  if (!parsed) {
    return null;
  }
  const name = shortName(seatName(parsed.seat));
  if (parsed.kind === 'bet') {
    return clip(`${name} bets ${parsed.amount}`);
  }
  if (parsed.kind === 'split') {
    return clip(`${name} splits`);
  }
  if (parsed.kind === 'hit') {
    return clip(parsed.bust ? `${name} busts` : `${name} hits ${parsed.total}`);
  }
  if (parsed.kind === 'stand') {
    return clip(`${name} stands on ${parsed.total}`);
  }
  return clip(
    parsed.bust
      ? `${name} doubles and busts`
      : `${name} doubles to ${parsed.total}`,
  );
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
  if (gameType === BLACKJACK_GAME_TYPE) {
    return blackjackMessage(note, seatName);
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
