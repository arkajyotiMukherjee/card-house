import { describe, expect, it } from 'vitest';
import {
  BET_10_BUTTON,
  BET_25_BUTTON,
  BET_50_BUTTON,
  DOUBLE_BUTTON,
  HIT_BUTTON,
  SPLIT_BUTTON,
  STAND_BUTTON,
} from './blackjack-layout';
import {
  BLUFF_CHALLENGE_BUTTON,
  BLUFF_PASS_BUTTON,
  BLUFF_PLAY_BUTTON,
} from './bluff-layout';
import {
  BUTTON_FONT_SIZE,
  BUTTON_HEIGHT,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { SUIT_BUTTON_H } from './crazy-eights-layout';
import {
  HOW_TO_PLAY_BUTTON,
  LEAVE_TABLE_BUTTON,
  TABLE_CHAT_BUTTON,
  TABLE_CHAT_SEND_BUTTON,
} from './game-scene';
import { ASK_BUTTON } from './go-fish-layout';
import {
  PASS_BUTTON as HEARTS_PASS,
  PLAY_BUTTON as HEARTS_PLAY,
} from './hearts-layout';
import {
  CHAT_PANEL,
  CREATE_TABLE,
  LEAVE_CONFIRM,
  LEAVE_ROOM,
  LOBBY_PANEL,
  TABLE_LIST,
  WATCH_BUTTON,
} from './lobby';
import { HOW_TO_PLAY, MENU_BUTTONS, PROMPT, THEME_PANEL } from './menu-layout';
import {
  BET_BUTTON,
  CALL_BUTTON,
  CHECK_BUTTON,
  FOLD_BUTTON,
  RAISE_BUTTON,
} from './poker-layout';
import {
  PASS_BUTTON as PRESIDENT_PASS,
  PLAY_BUTTON as PRESIDENT_PLAY,
} from './president-layout';
import {
  DISCARD_BUTTON,
  DRAW_DISCARD_BUTTON,
  DRAW_STOCK_BUTTON,
  MELD_BUTTON,
} from './rummy-layout';
import { bidButtonBox } from './spades-layout';

describe('button captions', () => {
  it('centers the em box in the button face', () => {
    expect(buttonCaptionPos('Leave Table', 168, BUTTON_HEIGHT)).toEqual({
      x: 38,
      y: 8,
    });
    expect(buttonCaptionPos('Send', 96, BUTTON_HEIGHT)).toEqual({
      x: 30,
      y: 8,
    });
    expect(buttonCaptionPos('Save', 128, BUTTON_HEIGHT)).toEqual({
      x: 46,
      y: 8,
    });
    expect(buttonCaptionPos('Play', 96, BUTTON_HEIGHT)).toEqual({
      x: 30,
      y: 8,
    });
    expect(buttonCaptionPos('Create Room', 400, 44, 16)).toEqual({
      x: 110,
      y: 12,
    });
  });

  it('keeps the caption on a whole pixel', () => {
    const pos = buttonCaptionPos('A', 15, BUTTON_HEIGHT);
    expect(pos.x).toBe(2);
    expect(Number.isInteger(pos.x)).toBe(true);
    expect(Number.isInteger(pos.y)).toBe(true);
  });

  it('drops one pixel while the button is held', () => {
    expect(BUTTON_PRESS_SHIFT).toBe(1);
    const rest = buttonCaptionPos('Close', 120, BUTTON_HEIGHT);
    expect(rest.y + BUTTON_PRESS_SHIFT).toBe(rest.y + 1);
  });
});

describe('shared button height', () => {
  const standard = [
    PROMPT.submit,
    PROMPT.cancel,
    HOW_TO_PLAY.back,
    THEME_PANEL.close,
    LOBBY_PANEL.createButton,
    LOBBY_PANEL.joinButton,
    LOBBY_PANEL.saveButton,
    TABLE_LIST.create,
    WATCH_BUTTON,
    CHAT_PANEL.send,
    LEAVE_ROOM,
    LEAVE_CONFIRM.leave,
    LEAVE_CONFIRM.cancel,
    CREATE_TABLE.prev,
    CREATE_TABLE.next,
    CREATE_TABLE.minus,
    CREATE_TABLE.plus,
    CREATE_TABLE.varPrev,
    CREATE_TABLE.varNext,
    CREATE_TABLE.create,
    CREATE_TABLE.cancel,
    LEAVE_TABLE_BUTTON,
    TABLE_CHAT_BUTTON,
    TABLE_CHAT_SEND_BUTTON,
    HOW_TO_PLAY_BUTTON,
    BLUFF_PLAY_BUTTON,
    BLUFF_PASS_BUTTON,
    BLUFF_CHALLENGE_BUTTON,
    PRESIDENT_PLAY,
    PRESIDENT_PASS,
    HEARTS_PLAY,
    HEARTS_PASS,
    DRAW_STOCK_BUTTON,
    DRAW_DISCARD_BUTTON,
    MELD_BUTTON,
    DISCARD_BUTTON,
    HIT_BUTTON,
    STAND_BUTTON,
    DOUBLE_BUTTON,
    SPLIT_BUTTON,
    BET_10_BUTTON,
    BET_25_BUTTON,
    BET_50_BUTTON,
    FOLD_BUTTON,
    CHECK_BUTTON,
    CALL_BUTTON,
    BET_BUTTON,
    RAISE_BUTTON,
    bidButtonBox(0),
  ];

  it('uses one face height and one pixel font', () => {
    expect(BUTTON_FONT_SIZE).toBe(8);
    expect(BUTTON_HEIGHT).toBe(28);
    expect(SUIT_BUTTON_H).toBe(BUTTON_HEIGHT);
    for (const box of standard) {
      expect(box.h).toBe(BUTTON_HEIGHT);
    }
  });

  it('keeps a different size only for a different kind of control', () => {
    for (const button of MENU_BUTTONS) {
      expect(button.h).toBe(44);
    }
    expect(THEME_PANEL.arrow.h).toBe(24);
    expect(ASK_BUTTON.h).toBe(22);
  });
});
