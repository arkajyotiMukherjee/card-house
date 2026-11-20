import * as ex from 'excalibur';
import { bindButtonPress } from './button-press';
import { gameAudio } from './game-audio';
import {
  BUTTON_HEIGHT,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
  buttonFontSize,
} from './button-style';
import {
  BUTTON,
  BUTTON_DOWN,
  canvasText,
  DIM,
  GOLD,
  panelRect,
  PLATE,
  STROKE,
  STROKE_HOT,
} from './canvas-ui';
import {
  HOW_TO_PLAY_BUTTON,
  HOW_TO_PLAY_PANEL,
  HOW_TO_PLAY_TEXT,
} from './game-scene';
import { clampScroll, definitionFor, layoutHowToPlay } from './how-to-play';
import { isMobileDevice } from './mobile-shell';
import { LOGICAL_HEIGHT } from './sheets';
import {
  anchorTableActor,
  TABLE_BACKDROP_LEFT,
  TABLE_VIEWPORT_MAX_WIDTH,
} from './table-viewport';
import { uiCaption, uiText } from './ui-text';

const BACKDROP = new ex.Color(0, 0, 0, 0.65);
const OFFSCREEN_Y = -200;
const Z_BACKDROP = 100;
/** Above the backdrop so `?` still closes the overlay it opened. */
const Z_BUTTON = 103;
const Z_PANEL = 101;
const Z_TEXT = 102;
const SCROLL_STEP = 3;

/**
 * Per-game instructions drawn on top of the table.
 * Text comes from the `GameDefinition` for the table's `gameType`.
 * While open, a full-screen backdrop sits above every table actor.
 */
export class HowToPlayOverlay {
  private opened = false;
  private triggerVisible = true;
  private gameType = '';
  private lines: string[] = [];
  private scroll = 0;
  private readonly button: ex.Actor;
  private overlayActors: ex.Actor[] = [];
  private lineTexts: ex.Text[] = [];
  private hintText: ex.Text | undefined;

  constructor(
    private readonly scene: ex.Scene,
    private readonly onBeforeOpen: () => void = () => {},
  ) {
    this.button = this.buildButton();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  setTriggerVisible(visible: boolean): void {
    this.triggerVisible = visible;
    const show = visible && definitionFor(this.gameType) !== undefined;
    this.button.graphics.isVisible = show;
    for (const child of this.button.children)
      if (child instanceof ex.Actor) {
        child.graphics.isVisible = show;
        child.pointer.useGraphicsBounds = show;
        child.pointer.useColliderShape = show;
      }
    this.button.pointer.useColliderShape = show;
    this.button.pointer.useGraphicsBounds = show;
  }

  /** Shows the `?` control only for a game that has a definition. */
  setGameType(gameType: string): void {
    this.gameType = gameType;
    const available = definitionFor(gameType) !== undefined;
    this.button.pos = ex.vec(
      HOW_TO_PLAY_BUTTON.x,
      available ? HOW_TO_PLAY_BUTTON.y : OFFSCREEN_Y,
    );
    anchorTableActor(this.button, 'right', HOW_TO_PLAY_BUTTON.x);
    this.setTriggerVisible(this.triggerVisible);
    if (!available && this.opened) {
      this.close();
    }
  }

  toggle(): void {
    if (this.opened) {
      gameAudio.play('back');
      this.close();
    } else if (definitionFor(this.gameType)) {
      gameAudio.play('button');
      this.open();
    }
  }

  open(): void {
    const definition = definitionFor(this.gameType);
    if (!definition || this.opened) {
      return;
    }
    this.onBeforeOpen();
    const layout = layoutHowToPlay(definition, HOW_TO_PLAY_TEXT.columns);
    this.lines = layout.lines;
    this.scroll = 0;
    this.opened = true;
    this.buildOverlay(layout.title);
    this.paintLines();
  }

  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    for (const actor of this.overlayActors) {
      actor.kill();
    }
    this.overlayActors = [];
    this.lineTexts = [];
    this.hintText = undefined;
  }

  /** Moves long text up or down by a few lines, clamped to the text. */
  scrollBy(direction: number): void {
    if (!this.opened) {
      return;
    }
    this.scroll = clampScroll(
      this.scroll +
        Math.sign(direction) *
          (isMobileDevice() ? HOW_TO_PLAY_TEXT.rows : SCROLL_STEP),
      this.lines.length,
      HOW_TO_PLAY_TEXT.rows,
    );
    this.paintLines();
  }

  private track(actor: ex.Actor): ex.Actor {
    this.overlayActors.push(actor);
    this.scene.add(actor);
    return actor;
  }

  private paintLines(): void {
    const slice = this.lines.slice(
      this.scroll,
      this.scroll + HOW_TO_PLAY_TEXT.rows,
    );
    this.lineTexts.forEach((text, index) => {
      text.text = slice[index] ?? '';
    });
    const more = this.lines.length > HOW_TO_PLAY_TEXT.rows;
    if (this.hintText) {
      this.hintText.text =
        more && !isMobileDevice() ? 'Scroll wheel for more' : '';
    }
  }

  private buildButton(): ex.Actor {
    const box = HOW_TO_PLAY_BUTTON;
    const actor = new ex.Actor({
      pos: ex.vec(box.x, OFFSCREEN_Y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: Z_BUTTON,
    });
    const face = panelRect(box.w, box.h, PLATE, STROKE);
    actor.graphics.use(face);
    const size = 28;
    const rest = uiCaption('?', box.w, box.h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(uiText('?', size, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.strokeColor = STROKE;
        face.color = PLATE;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      () => this.toggle(),
    );
    anchorTableActor(actor, 'right', box.x);
    this.scene.add(actor);
    return actor;
  }

  private buildOverlay(titleLabel: string): void {
    const panel = HOW_TO_PLAY_PANEL;
    const text = HOW_TO_PLAY_TEXT;

    const backdrop = new ex.Actor({
      pos: ex.vec(TABLE_BACKDROP_LEFT, 0),
      anchor: ex.vec(0, 0),
      width: TABLE_VIEWPORT_MAX_WIDTH,
      height: LOGICAL_HEIGHT,
      z: Z_BACKDROP,
    });
    const dim = new ex.Rectangle({
      width: TABLE_VIEWPORT_MAX_WIDTH,
      height: LOGICAL_HEIGHT,
      color: BACKDROP,
      smoothing: false,
    });
    dim.origin = ex.vec(0, 0);
    backdrop.graphics.use(dim);
    this.track(backdrop);

    const window = new ex.Actor({
      pos: ex.vec(panel.x, panel.y),
      anchor: ex.vec(0, 0),
      width: panel.w,
      height: panel.h,
      z: Z_PANEL,
    });
    window.graphics.use(panelRect(panel.w, panel.h, PLATE, STROKE_HOT));
    this.track(window);

    const title = new ex.Actor({
      pos: ex.vec(panel.x + text.padding, panel.y + 20),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    title.graphics.use(canvasText(titleLabel, 16, GOLD));
    this.track(title);

    for (let row = 0; row < text.rows; row += 1) {
      const lineText = canvasText('', text.size, GOLD);
      const actor = new ex.Actor({
        pos: ex.vec(
          panel.x + text.padding,
          panel.y + text.top + row * text.lineHeight,
        ),
        anchor: ex.vec(0, 0),
        z: Z_TEXT,
      });
      actor.graphics.use(lineText);
      this.track(actor);
      this.lineTexts.push(lineText);
    }

    const hint = new ex.Actor({
      pos: ex.vec(panel.x + text.padding, panel.y + panel.h - 36),
      anchor: ex.vec(0, 0),
      z: Z_TEXT,
    });
    this.hintText = canvasText('', 8, DIM);
    hint.graphics.use(this.hintText);
    this.track(hint);

    if (isMobileDevice() && this.lines.length > text.rows) {
      this.track(
        this.buildFooterButton('Previous', panel.x + text.padding, () => {
          this.scrollBy(-1);
        }),
      );
      this.track(
        this.buildFooterButton('Next', panel.x + text.padding + 176, () => {
          this.scrollBy(1);
        }),
      );
    }
    this.track(
      this.buildFooterButton(
        'Close',
        panel.x + panel.w - 120 - text.padding,
        () => {
          this.close();
        },
      ),
    );
  }

  private buildFooterButton(
    label: string,
    x: number,
    press: () => void,
  ): ex.Actor {
    const panel = HOW_TO_PLAY_PANEL;
    const w = label === 'Previous' ? 160 : 120;
    const h = isMobileDevice() ? 64 : BUTTON_HEIGHT;
    const actor = new ex.Actor({
      pos: ex.vec(x, panel.y + panel.h - h - 16),
      anchor: ex.vec(0, 0),
      width: w,
      height: h,
      z: Z_TEXT,
    });
    const face = panelRect(w, h, BUTTON, STROKE);
    actor.graphics.use(face);
    const size = buttonFontSize(label, w, h);
    const rest = buttonCaptionPos(label, w, h, size);
    const caption = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    caption.graphics.use(canvasText(label, size, GOLD));
    actor.addChild(caption);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    bindButtonPress(
      actor,
      () => {
        face.color = BUTTON_DOWN;
        caption.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.strokeColor = STROKE;
        face.color = BUTTON;
        caption.pos = ex.vec(rest.x, rest.y);
      },
      () => {
        gameAudio.play(label === 'Close' ? 'back' : 'button');
        press();
      },
    );
    return actor;
  }
}
