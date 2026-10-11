import {
  BLUFF_GAME_TYPE,
  readBluffEventNote,
} from '../../src/shared/games/bluff';
import {
  HEARTS_GAME_TYPE,
  readHeartsEventNote,
} from '../../src/shared/games/hearts';

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
  if (gameType === HEARTS_GAME_TYPE) {
    return heartsEventMessage(note, seatName);
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

function heartsEventMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readHeartsEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'pass') {
    return clip(
      `${shortName(seatName(parsed.seat))} passed 3 ${parsed.direction}`,
    );
  }
  if (parsed.kind === 'moon') {
    const shooter = shortName(seatName(parsed.seat));
    if (parsed.winner === null) {
      return clip(`${shooter} shot the moon`);
    }
    return clip(
      `${shooter} shot the moon. ${shortName(seatName(parsed.winner))} wins`,
    );
  }
  if (parsed.kind === 'finished') {
    return clip(`${shortName(seatName(parsed.winner))} wins`);
  }
  const name = shortName(seatName(parsed.seat));
  if (parsed.trickWinner === null) {
    return clip(`${name} played ${parsed.card}`);
  }
  const taker = shortName(seatName(parsed.trickWinner));
  if (parsed.queen) {
    return clip(`${name} played ${parsed.card}. ${taker} takes the queen`);
  }
  if (parsed.points > 0) {
    return clip(
      `${name} played ${parsed.card}. ${taker} takes ${parsed.points}`,
    );
  }
  return clip(`${name} played ${parsed.card}. ${taker} takes the trick`);
}
