import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { PokerState } from '../../src/shared/games/poker';
import { PokerDriver } from './poker-driver';
import type { CardAtlas } from './card-atlas';
import type { RenderContext } from './game-driver';
import { Actor, Rectangle, Scene, Text } from 'excalibur';

function seat(
  chips: number,
  hole: string[],
  streetBet: number,
): PokerState['seats'][string] {
  return {
    chips,
    hole,
    streetBet,
    committed: 20,
    folded: false,
    allIn: false,
    acted: false,
    mustDiscard: false,
  };
}

function state(overrides: Partial<PokerState> = {}): PokerState {
  return {
    phase: 'play',
    variation: 'holdem',
    street: 'flop',
    step: 'bet',
    handNumber: 1,
    deck: [],
    board: ['2C', '3D', '4H'],
    seats: {
      '0': seat(980, ['AS', 'KD'], 0),
      '1': seat(980, ['QC', 'JH'], 0),
    },
    order: [0, 1],
    dealerSeatIndex: 0,
    turnSeatIndex: 0,
    currentBet: 0,
    minRaise: 20,
    pot: 40,
    pots: [],
    winnerSeatIndexes: [],
    hands: {},
    end: null,
    smallBlind: 10,
    bigBlind: 20,
    limit: 'no-limit',
    ...overrides,
  };
}

function context(
  sent: unknown[],
  seatIndex: number | null,
  blocked = false,
): RenderContext {
  return {
    scene: {} as Scene,
    seats: [
      { seatIndex: 0, name: 'Ada', self: seatIndex === 0, x: 480, y: 456 },
      { seatIndex: 1, name: 'Bea', self: seatIndex === 1, x: 780, y: 310 },
    ],
    meSeatIndex: seatIndex,
    cards: {} as CardAtlas,
    myCards: {} as CardAtlas,
    sendIntent: (intent) => {
      sent.push(intent);
    },
    inputBlocked: () => blocked,
  };
}

function renderContext(seatIndex: number): RenderContext {
  const createElement = vi
    .spyOn(document, 'createElement')
    .mockImplementation(() => {
      const canvas = { width: 0, height: 0 };
      return {
        ...canvas,
        setAttribute() {},
        getContext: () => ({
          canvas,
          clearRect() {},
          fillRect() {},
          strokeRect() {},
          save() {},
          restore() {},
          setLineDash() {},
          getLineDash: () => [],
          resetTransform() {},
          translate() {},
          scale() {},
          measureText: (text: string) => ({
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: text.length * 8,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 0,
          }),
        }),
      } as unknown as HTMLElement;
    });
  onTestFinished(() => {
    createElement.mockRestore();
  });
  const ctx = context([], seatIndex);
  const graphic = () => new Rectangle({ width: 64, height: 64 });
  const atlas = { back: graphic, sprite: graphic } as unknown as CardAtlas;
  ctx.scene = new Scene();
  ctx.cards = atlas;
  ctx.myCards = atlas;
  return ctx;
}

describe('PokerDriver input', () => {
  it('supports exact slider endpoints and keyboard fine adjustment', () => {
    const driver = new PokerDriver(),
      sent: unknown[] = [],
      table = state(),
      ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    driver['sliderKey']({ key: 'End', preventDefault() {} } as KeyboardEvent);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([{ type: 'bet', amount: 980 }]);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    driver['sliderKey']({ key: 'Home', preventDefault() {} } as KeyboardEvent);
    driver['sliderKey']({
      key: 'ArrowRight',
      preventDefault() {},
    } as KeyboardEvent);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent[1]).toEqual({ type: 'bet', amount: 40 });
  });
  it('submits a full all-in street total while the UI shows only the remaining stack', () => {
    const driver = new PokerDriver(),
      sent: unknown[] = [],
      table = state({ currentBet: 10, minRaise: 10, pot: 15 });
    Object.assign(table.seats['0'], { chips: 395, streetBet: 5 });
    Object.assign(table.seats['1'], { chips: 390, streetBet: 10 });
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'raise' }, table, ctx);
    driver['sliderKey']({ key: 'End', preventDefault() {} } as KeyboardEvent);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([{ type: 'raise', amount: 400 }]);
  });
  it('sends fold and check immediately, and a bet only after confirm', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'fold' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'check' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    expect(sent).toEqual([{ type: 'fold' }, { type: 'check' }]);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([
      { type: 'fold' },
      { type: 'check' },
      { type: 'bet', amount: 20 },
    ]);
  });

  it('steps a bet up to all-in and can cancel without sending', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state();
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stake-down' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stake-up' }, table, ctx);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([{ type: 'bet', amount: 40 }]);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stake-max' }, table, ctx);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([
      { type: 'bet', amount: 40 },
      { type: 'bet', amount: 980 },
    ]);
    driver.handleInput({ type: 'pointerup', target: 'bet' }, table, ctx);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-cancel' },
      table,
      ctx,
    );
    driver.handleInput({ type: 'pointerup', target: 'check' }, table, ctx);
    expect(sent).toEqual([
      { type: 'bet', amount: 40 },
      { type: 'bet', amount: 980 },
      { type: 'check' },
    ]);
  });

  it('sends call immediately and a chosen raise only after confirm', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state({
      currentBet: 20,
      seats: {
        '0': seat(980, ['AS', 'KD'], 0),
        '1': seat(960, ['QC', 'JH'], 20),
      },
    });
    const ctx = context(sent, 0);
    driver.handleInput({ type: 'pointerup', target: 'call' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'raise' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'check' }, table, ctx);
    expect(sent).toEqual([{ type: 'call' }]);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent).toEqual([{ type: 'call' }, { type: 'raise', amount: 40 }]);
    driver.handleInput({ type: 'pointerup', target: 'raise' }, table, ctx);
    driver.handleInput({ type: 'pointerup', target: 'stake-up' }, table, ctx);
    driver.handleInput(
      { type: 'pointerup', target: 'stake-confirm' },
      table,
      ctx,
    );
    expect(sent[sent.length - 1]).toEqual({ type: 'raise', amount: 60 });
  });

  it('sends a discard for the clicked hole card in Oklahoma', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state({
      variation: 'oklahoma',
      limit: 'pot-limit',
      step: 'discard',
      seats: {
        '0': {
          ...seat(980, ['AS', 'KD', 'QC', 'JH'], 0),
          mustDiscard: true,
        },
      },
    });
    driver.handleInput(
      { type: 'pointerup', target: 'KD' },
      table,
      context(sent, 0),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'bet' },
      table,
      context(sent, 0),
    );
    expect(sent).toEqual([{ type: 'discard', card: 'KD' }]);
  });

  it('shows the Drop marker only while the hovered card can be discarded', () => {
    const driver = new PokerDriver();
    const ctx = renderContext(0);

    const holdEm = state({ pot: 0 });
    driver.render(holdEm, ctx);
    driver.render({ ...holdEm, turnSeatIndex: 1 }, ctx);
    expect(
      driver['buttons'].every(
        (button) =>
          !button.actor.graphics.isVisible &&
          !button.caption.graphics.isVisible &&
          !button.actor.pointer.useGraphicsBounds &&
          !button.actor.pointer.useColliderShape,
      ),
    ).toBe(true);
    driver.render(holdEm, ctx);
    expect(
      driver['buttons'].every(
        (button) =>
          button.actor.graphics.isVisible &&
          button.actor.pointer.useColliderShape,
      ),
    ).toBe(true);
    driver['followHole']('KD', 480, true);
    driver['easeHand'](16);
    expect(driver['dropMarks']).toHaveLength(0);

    const oklahoma = {
      ...holdEm,
      variation: 'oklahoma',
      step: 'discard',
      seats: {
        ...holdEm.seats,
        '0': { ...holdEm.seats['0']!, mustDiscard: true },
      },
    } satisfies PokerState;
    driver.render(oklahoma, ctx);
    expect(driver['dropMarks']).toHaveLength(1);

    driver.render({ ...oklahoma, step: 'bet' }, ctx);
    expect(driver['dropMarks']).toHaveLength(0);

    driver.render({ ...oklahoma, turnSeatIndex: 1 }, ctx);
    driver['easeHand'](16);
    expect(driver['dropMarks']).toHaveLength(0);
  });

  it('does not send a move when it is not your turn or the overlay is open', () => {
    const driver = new PokerDriver();
    const sent: unknown[] = [];
    const table = state();
    driver.handleInput(
      { type: 'pointerup', target: 'fold' },
      table,
      context(sent, 1),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'check' },
      table,
      context(sent, 0, true),
    );
    driver.handleInput(
      { type: 'pointerup', target: 'fold' },
      { ...table, phase: 'finished', end: 'fold', winnerSeatIndexes: [1] },
      context(sent, 0),
    );
    expect(sent).toEqual([]);
  });
});

describe('PokerDriver results', () => {
  it.each([
    { end: 'fold', detail: 'Uncalled hand', cards: 0, caption: undefined },
    {
      end: 'showdown',
      detail: 'Flush',
      cards: 4,
      caption: 'Winning hand · Flush',
    },
  ] as const)(
    'renders the correct Omaha result after $end',
    ({ end, detail, cards, caption }) => {
      const ctx = renderContext(0);
      const add = vi.spyOn(ctx.scene, 'add');
      const board = ['2C', '3D', '4C', '7C', '8S'];
      const afterFold = end === 'fold';
      new PokerDriver().render(
        state({
          phase: 'finished',
          variation: 'omaha',
          street: 'river',
          turnSeatIndex: null,
          end,
          board,
          pots: [{ amount: 40, eligible: afterFold ? [1] : [0, 1] }],
          winnerSeatIndexes: [1],
          seats: {
            '0': {
              ...seat(980, ['AS', 'KD', 'JS', '9H'], 0),
              folded: afterFold,
            },
            '1': seat(1020, ['QC', 'JC', '7D', '5H'], 0),
          },
          hands: afterFold
            ? {}
            : {
                '1': {
                  name: 'flush',
                  score: [5],
                  cards: ['QC', 'JC', '7C', '4C', '2C'],
                },
              },
        }),
        ctx,
      );

      const actors = add.mock.calls
        .map(([entity]) => entity)
        .filter((entity) => entity instanceof Actor);
      const label = (name: string) => {
        const graphic = actors.find((actor) => actor.name === name)?.graphics
          .current;
        return graphic instanceof Text ? graphic.text : undefined;
      };
      expect(
        actors.filter((actor) => actor.name === 'winner-focus-card'),
      ).toHaveLength(cards);
      expect(label('winner-focus-caption')).toBe(caption);
      expect(label('poker-panel-detail')).toContain(detail);
    },
  );
});
