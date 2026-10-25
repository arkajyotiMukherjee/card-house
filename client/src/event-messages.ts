import {
  BLUFF_GAME_TYPE,
  readBluffEventNote,
} from '../../src/shared/games/bluff';
import { challengeLine } from './bluff-challenge';
import {
  CRAZY_EIGHTS_GAME_TYPE,
  CRAZY_EIGHTS_SUIT_NAMES,
  rankOfCard,
  readCrazyEightsEventNote,
} from '../../src/shared/games/crazy-eights';
import {
  GO_FISH_GAME_TYPE,
  readGoFishEventNote,
} from '../../src/shared/games/go-fish';
import {
  PRESIDENT_GAME_TYPE,
  readPresidentEventNote,
} from '../../src/shared/games/president';
import {
  RUMMY_GAME_TYPE,
  readRummyEventNote,
  type RummyEventNote,
} from '../../src/shared/games/rummy';
import {
  BLACKJACK_GAME_TYPE,
  readBlackjackEventNote,
} from '../../src/shared/games/blackjack';
import {
  readSpadesEventNote,
  SPADES_GAME_TYPE,
} from '../../src/shared/games/spades';
import {
  HEARTS_GAME_TYPE,
  readHeartsEventNote,
} from '../../src/shared/games/hearts';
import {
  POKER_GAME_TYPE,
  readPokerEventNote,
} from '../../src/shared/games/poker';

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

function crazyEightsMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readCrazyEightsEventNote(note);
  if (!parsed) {
    return null;
  }
  const name = shortName(seatName(parsed.seat));
  if (parsed.kind === 'play') {
    if (rankOfCard(parsed.card) === '8') {
      return clip(
        `${name} played an 8, suit ${CRAZY_EIGHTS_SUIT_NAMES[parsed.suit]}`,
      );
    }
    return clip(`${name} played ${parsed.card}`);
  }
  if (parsed.kind === 'draw') {
    return clip(`${name} draws`);
  }
  if (parsed.kind === 'pass') {
    return clip(`${name} passes`);
  }
  return clip(`${name} wins, score ${parsed.score}`);
}

/**
 * One short line for the message strip, or `null` when the event has nothing
 * to announce. Dummy and stub events carry no note, so they stay silent.
 */
export function eventMessage(
  gameType: string,
  note: unknown,
  seatName: (seatIndex: number) => string,
  viewerSeat: number | null = null,
): string | null {
  if (gameType === PRESIDENT_GAME_TYPE) {
    return presidentEventMessage(note, seatName);
  }
  if (gameType === GO_FISH_GAME_TYPE) {
    return goFishMessage(note, seatName);
  }
  if (gameType === CRAZY_EIGHTS_GAME_TYPE) {
    return crazyEightsMessage(note, seatName);
  }
  if (gameType === RUMMY_GAME_TYPE) {
    return rummyMessage(readRummyEventNote(note), seatName);
  }
  if (gameType === BLACKJACK_GAME_TYPE) {
    return blackjackMessage(note, seatName);
  }
  if (gameType === SPADES_GAME_TYPE) {
    return spadesEventMessage(note, seatName);
  }
  if (gameType === HEARTS_GAME_TYPE) {
    return heartsEventMessage(note, seatName);
  }
  if (gameType === POKER_GAME_TYPE) {
    return pokerEventMessage(note, seatName);
  }
  if (gameType !== BLUFF_GAME_TYPE) {
    return null;
  }
  const parsed = readBluffEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'pass') {
    return clip(`${shortName(seatName(parsed.seat))} passed`);
  }
  if (parsed.kind === 'play') {
    const cards = parsed.count === 1 ? 'card' : 'cards';
    return clip(
      `${shortName(seatName(parsed.seat))} played ${parsed.count} ${cards} as ${parsed.claimRank}`,
    );
  }
  return clip(
    challengeLine(parsed.challenger, parsed.accused, viewerSeat, (seatIndex) =>
      shortName(seatName(seatIndex)),
    ),
  );
}

function presidentEventMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readPresidentEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'pass') {
    return clip(`${shortName(seatName(parsed.seat))} passed`);
  }
  if (parsed.kind === 'finish') {
    const president = shortName(seatName(parsed.president));
    if (parsed.president === parsed.scum) {
      return clip(`${president} is President`);
    }
    const scum = shortName(seatName(parsed.scum));
    return clip(`${president} is President. ${scum} is Scum`);
  }
  const cards = parsed.count === 1 ? 'card' : 'cards';
  return clip(
    `${shortName(seatName(parsed.seat))} played ${parsed.count} ${cards} of ${parsed.rank}`,
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

function spadesEventMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readSpadesEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'bid') {
    const name = shortName(seatName(parsed.seat));
    if (parsed.tricks === 0) {
      return clip(`${name} bid nil`);
    }
    return clip(`${name} bid ${parsed.tricks}`);
  }
  if (parsed.kind === 'play') {
    return clip(`${shortName(seatName(parsed.seat))} played ${parsed.card}`);
  }
  if (parsed.kind === 'trick') {
    return clip(`${shortName(seatName(parsed.winner))} won the trick`);
  }
  if (parsed.winner === 'ns') {
    return clip(`NS wins ${parsed.ns} to ${parsed.ew}`);
  }
  if (parsed.winner === 'ew') {
    return clip(`EW wins ${parsed.ew} to ${parsed.ns}`);
  }
  return clip(`Scores NS ${parsed.ns} EW ${parsed.ew}`);
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

function pokerEventMessage(
  note: unknown,
  seatName: (seatIndex: number) => string,
): string | null {
  const parsed = readPokerEventNote(note);
  if (!parsed) {
    return null;
  }
  if (parsed.kind === 'finished') {
    if (parsed.winners.length === 0) {
      return clip('Hand over');
    }
    const names = parsed.winners.map((seat) => shortName(seatName(seat)));
    if (parsed.winners.length === 1) {
      return clip(`${names[0]} wins`);
    }
    return clip(`${names.join(', ')} split`);
  }
  const name = shortName(seatName(parsed.seat));
  if (parsed.kind === 'fold') {
    return clip(`${name} folds`);
  }
  if (parsed.kind === 'check') {
    return clip(`${name} checks`);
  }
  if (parsed.kind === 'call') {
    return clip(`${name} calls ${parsed.amount}`);
  }
  if (parsed.kind === 'bet') {
    return clip(`${name} bets ${parsed.amount}`);
  }
  if (parsed.kind === 'raise') {
    return clip(`${name} raises to ${parsed.amount}`);
  }
  return clip(`${name} discards`);
}
