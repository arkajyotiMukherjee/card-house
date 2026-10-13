import * as ex from 'excalibur';
import { cardAtlas, chipsImage, pixelFont, tableSprites } from './boot-scene';
import { ChipAtlas, type ChipColor } from './chip-atlas';
import type { Rank, Suit } from './card-atlas';
import { GAME_CATALOG, applyCodeKey, applyFieldKey, NAME_MAX } from './lobby';
import {
  HOW_TO_PLAY,
  MENU_BACKDROP,
  MENU_BUTTONS,
  MENU_TAGLINE,
  MENU_THEME_BUTTON,
  MENU_TITLE,
  MENU_VERSION,
  PROMPT,
  floaterPose,
  makeFloaters,
  nextFieldAfterEnter,
  promptError,
  promptFields,
  promptSubmitLabel,
  promptTitle,
  splitHowToPlay,
  stepIndex,
  themeButtonLabel,
  wrapText,
  type FloaterSpec,
  type MenuAction,
  type PromptKind,
} from './menu-layout';
import {
  preferredNameForPrompt,
  rememberPreferredName,
} from './preferred-name';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';
import { TABLE_STYLES, type TableStyle } from './table-atlas';

const FELT = ex.Color.fromHex('#145c38');
const GOLD = ex.Color.fromHex('#f4e4b3');
const DIM = ex.Color.fromHex('#d7c08a');
const FIELD = ex.Color.fromHex('#0b2418');
const BUTTON = ex.Color.fromHex('#1b5c38');
const BUTTON_DOWN = ex.Color.fromHex('#0e3d24');
const STROKE = ex.Color.fromHex('#e6c27a');
const STROKE_HOT = ex.Color.fromHex('#fff6d0');
const DANGER = ex.Color.fromHex('#e85d4c');
const PANEL = ex.Color.fromHex('#0a2e1c');
const SHADE = ex.Color.fromRGB(4, 16, 10, 0.72);
const PLATE = ex.Color.fromRGB(4, 16, 10, 0.62);
const TITLE_SHADOW = ex.Color.fromHex('#07140d');

const FLOATER_COUNT = 14;
const TITLE_DROP = 4;

export interface MenuEntry {
  kind: PromptKind;
  name: string;
  code: string;
}

/** Resolves to an error message, or undefined once the lobby was entered. */
export type MenuEnter = (entry: MenuEntry) => Promise<string | undefined>;

type Mode = 'main' | PromptKind | 'howto';

function canvasText(text: string, size: number, color: ex.Color): ex.Text {
  const graphic = new ex.Text({
    text,
    color,
    font: pixelFont.toFont({
      family: '"Press Start 2P"',
      size,
      color,
      quality: 1,
      filtering: ex.ImageFiltering.Pixel,
    }),
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

function rect(
  width: number,
  height: number,
  fill: ex.Color,
  stroke: ex.Color,
): ex.Rectangle {
  const graphic = new ex.Rectangle({
    width,
    height,
    color: fill,
    strokeColor: stroke,
    lineWidth: 2,
    smoothing: false,
  });
  graphic.origin = ex.vec(0, 0);
  return graphic;
}

function scaled(sprite: ex.Sprite, scale: number): ex.Sprite {
  sprite.scale = ex.vec(scale, scale);
  return sprite;
}

interface Drifter {
  actor: ex.Actor;
  spec: FloaterSpec;
}

export class MenuScene extends ex.Scene {
  constructor(private readonly clientId = '') {
    super();
  }

  private mode: Mode = 'main';
  private enter: MenuEnter = () =>
    Promise.resolve('Still connecting to the server');
  private onEntered: () => void = () => {};
  private statusText = canvasText('SpacetimeDB: starting', 8, DIM);
  private readonly drifters: Drifter[] = [];
  private readonly overlay: ex.Actor[] = [];
  private elapsed = 0;
  private busy = false;

  private name = '';
  private code = '';
  private focused: 'name' | 'code' = 'name';
  private nameText: ex.Text | undefined;
  private codeText: ex.Text | undefined;
  private nameBox: ex.Rectangle | undefined;
  private codeBox: ex.Rectangle | undefined;
  private errorText: ex.Text | undefined;

  private gameIndex = 0;
  private listRows: Array<{ face: ex.Rectangle; label: ex.Text }> = [];
  private bodyActors: ex.Actor[] = [];

  private style: TableStyle = 'green';
  private onThemeChange: (style: TableStyle) => void = () => {};
  private tableActor: ex.Actor | undefined;
  private themeCaption: ex.Text | undefined;

  setStatus(line: string): void {
    this.statusText.text = line;
  }

  /**
   * Sets the starting theme and the handler the Theme button calls on each
   * switch. Repaints immediately if the menu table already exists.
   */
  connectTheme(style: TableStyle, onChange: (style: TableStyle) => void): void {
    this.style = style;
    this.onThemeChange = onChange;
    this.repaintTheme();
  }

  /** Called once the lobby panel can accept a name and code. */
  connect(enter: MenuEnter, onEntered: () => void): void {
    this.enter = enter;
    this.onEntered = onEntered;
  }

  /**
   * Opens Join Room with the code from a `/cardroom create` join URL.
   * A default Discord name joins without asking the player to type one.
   * A saved preferred name only fills the field. It does not submit.
   */
  openJoin(code: string, defaultName = ''): void {
    if (this.mode !== 'main') {
      return;
    }
    const name = defaultName.trim().slice(0, NAME_MAX);
    this.openPrompt('join', code, name);
    if (name.length > 0) {
      void this.submitPrompt();
    }
  }

  onInitialize(engine: ex.Engine): void {
    this.backgroundColor = FELT;
    this.buildTable();
    this.buildDrifters();
    this.buildBackdrop();
    this.buildTitle();
    this.buildButtons();
    this.buildThemeButton();
    this.buildFooter();
    engine.input.keyboard.on('press', (evt) => {
      if (engine.currentScene !== this) {
        return;
      }
      if (evt.originalEvent?.ctrlKey || evt.originalEvent?.metaKey) {
        return;
      }
      this.onKey(evt.key, evt.value ?? '');
    });
  }

  onActivate(): void {
    this.closeOverlay();
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.elapsed += delta / 1000;
    for (const drifter of this.drifters) {
      const pose = floaterPose(drifter.spec, this.elapsed);
      drifter.actor.pos = ex.vec(Math.round(pose.x), Math.round(pose.y));
      drifter.actor.rotation = pose.rotation;
    }
  }

  private buildTable(): void {
    const table = new ex.Actor({
      pos: ex.vec(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2),
      anchor: ex.vec(0.5, 0.5),
      z: 0,
    });
    table.graphics.use(scaled(tableSprites[this.style].clone(), 8));
    this.tableActor = table;
    this.add(table);
  }

  private buildThemeButton(): void {
    const box = MENU_THEME_BUTTON;
    const face = rect(box.w, box.h, BUTTON, STROKE);
    const actor = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 10,
    });
    actor.graphics.use(face);
    const caption = canvasText(themeButtonLabel(this.style), 8, GOLD);
    const captionActor = new ex.Actor({
      pos: ex.vec(8, (box.h - 8) / 2),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(caption);
    actor.addChild(captionActor);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
    });
    actor.on('pointerup', () => {
      this.cycleTheme();
    });
    this.add(actor);
    this.themeCaption = caption;
  }

  private cycleTheme(): void {
    if (this.mode !== 'main') {
      return;
    }
    const index = TABLE_STYLES.indexOf(this.style);
    const next = TABLE_STYLES[(index + 1) % TABLE_STYLES.length] ?? 'green';
    this.style = next;
    this.repaintTheme();
    this.onThemeChange(next);
  }

  private repaintTheme(): void {
    this.tableActor?.graphics.use(scaled(tableSprites[this.style].clone(), 8));
    if (this.themeCaption) {
      this.themeCaption.text = themeButtonLabel(this.style);
    }
  }

  private buildDrifters(): void {
    const chips = new ChipAtlas(chipsImage);
    for (const spec of makeFloaters(FLOATER_COUNT)) {
      const actor = new ex.Actor({
        pos: ex.vec(spec.x, spec.y),
        anchor: ex.vec(0.5, 0.5),
        z: 1,
      });
      actor.graphics.use(scaled(this.floaterSprite(spec, chips), spec.scale));
      actor.graphics.opacity = 0.9;
      this.add(actor);
      this.drifters.push({ actor, spec });
    }
  }

  private floaterSprite(spec: FloaterSpec, chips: ChipAtlas): ex.Sprite {
    if (spec.kind === 'chip') {
      return chips.sprite(spec.face as ChipColor);
    }
    if (spec.kind === 'back') {
      return cardAtlas.back();
    }
    const [rank, suit] = spec.face.split(':');
    return cardAtlas.sprite({ rank: rank as Rank, suit: suit as Suit });
  }

  private buildBackdrop(): void {
    const box = MENU_BACKDROP;
    const plate = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      z: 3,
    });
    plate.graphics.use(rect(box.w, box.h, PLATE, PLATE));
    this.add(plate);
  }

  private buildTitle(): void {
    const width = MENU_TITLE.text.length * MENU_TITLE.size;
    const x = (LOGICAL_WIDTH - width) / 2;
    this.addText(
      x + TITLE_DROP,
      MENU_TITLE.y + TITLE_DROP,
      MENU_TITLE.text,
      MENU_TITLE.size,
      TITLE_SHADOW,
      4,
    );
    this.addText(x, MENU_TITLE.y, MENU_TITLE.text, MENU_TITLE.size, GOLD, 5);
    const tagWidth = MENU_TAGLINE.text.length * MENU_TAGLINE.size;
    this.addText(
      (LOGICAL_WIDTH - tagWidth) / 2,
      MENU_TAGLINE.y,
      MENU_TAGLINE.text,
      MENU_TAGLINE.size,
      GOLD,
      5,
    );
  }

  private buildButtons(): void {
    for (const spec of MENU_BUTTONS) {
      this.button(
        spec.x,
        spec.y,
        spec.w,
        spec.h,
        spec.caption,
        16,
        () => {
          this.onAction(spec.action);
        },
        10,
      );
    }
  }

  private buildFooter(): void {
    const status = new ex.Actor({
      pos: ex.vec(12, LOGICAL_HEIGHT - 20),
      anchor: ex.vec(0, 0),
      z: 10,
    });
    status.graphics.use(this.statusText);
    this.add(status);
    const width = MENU_VERSION.length * 8;
    this.addText(
      LOGICAL_WIDTH - width - 12,
      LOGICAL_HEIGHT - 20,
      MENU_VERSION,
      8,
      DIM,
      10,
    );
  }

  private onAction(action: MenuAction): void {
    if (this.mode !== 'main') {
      return;
    }
    if (action === 'howto') {
      this.openHowToPlay();
      return;
    }
    this.openPrompt(action);
  }

  private closeOverlay(): void {
    for (const actor of this.overlay) {
      actor.kill();
    }
    this.overlay.length = 0;
    this.listRows = [];
    this.bodyActors = [];
    this.nameText = undefined;
    this.codeText = undefined;
    this.nameBox = undefined;
    this.codeBox = undefined;
    this.errorText = undefined;
    this.mode = 'main';
    this.busy = false;
  }

  private shade(): void {
    const shade = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: LOGICAL_WIDTH,
      height: LOGICAL_HEIGHT,
      z: 30,
    });
    shade.graphics.use(rect(LOGICAL_WIDTH, LOGICAL_HEIGHT, SHADE, SHADE));
    this.add(shade);
    this.overlay.push(shade);
  }

  private openPrompt(kind: PromptKind, code = '', name = ''): void {
    this.mode = kind;
    this.name = preferredNameForPrompt(this.clientId, name);
    this.code = code;
    this.focused = 'name';
    this.shade();

    const box = PROMPT.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.add(panel);
    this.overlay.push(panel);

    this.overlayText(PROMPT.panel.x + 24, PROMPT.panel.y + 20, 16, GOLD, () =>
      promptTitle(kind),
    );
    const fields = promptFields(kind);
    for (const field of fields) {
      const spec = field.id === 'name' ? PROMPT.nameField : PROMPT.codeField;
      this.overlayText(spec.x, spec.y - 16, 8, DIM, () => field.label);
      const face = rect(spec.w, spec.h, FIELD, STROKE);
      const actor = new ex.Actor({
        pos: ex.vec(spec.x, spec.y),
        anchor: ex.vec(0, 0),
        width: spec.w,
        height: spec.h,
        z: 32,
      });
      actor.graphics.use(face);
      actor.on('pointerup', () => {
        this.focused = field.id;
        this.paintPrompt();
      });
      this.add(actor);
      this.overlay.push(actor);
      const text = canvasText('_', 16, GOLD);
      const textActor = new ex.Actor({
        pos: ex.vec(spec.x + 8, spec.y + (spec.h - 16) / 2),
        anchor: ex.vec(0, 0),
        z: 33,
      });
      textActor.graphics.use(text);
      this.add(textActor);
      this.overlay.push(textActor);
      if (field.id === 'name') {
        this.nameBox = face;
        this.nameText = text;
      } else {
        this.codeBox = face;
        this.codeText = text;
      }
    }

    const error = canvasText('', 8, DANGER);
    const errorActor = new ex.Actor({
      pos: ex.vec(
        PROMPT.error.x,
        PROMPT.error.y + (fields.length > 1 ? 0 : -24),
      ),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    errorActor.graphics.use(error);
    this.add(errorActor);
    this.overlay.push(errorActor);
    this.errorText = error;

    const submit = this.button(
      PROMPT.submit.x,
      PROMPT.submit.y,
      PROMPT.submit.w,
      PROMPT.submit.h,
      promptSubmitLabel(kind),
      16,
      () => {
        void this.submitPrompt();
      },
      32,
    );
    const cancel = this.button(
      PROMPT.cancel.x,
      PROMPT.cancel.y,
      PROMPT.cancel.w,
      PROMPT.cancel.h,
      'Cancel',
      16,
      () => {
        this.closeOverlay();
      },
      32,
    );
    this.overlay.push(submit, cancel);
    this.paintPrompt();
  }

  private paintPrompt(): void {
    if (this.mode !== 'create' && this.mode !== 'join') {
      return;
    }
    if (this.nameBox) {
      this.nameBox.strokeColor = this.focused === 'name' ? STROKE_HOT : STROKE;
    }
    if (this.codeBox) {
      this.codeBox.strokeColor = this.focused === 'code' ? STROKE_HOT : STROKE;
    }
    if (this.nameText) {
      this.nameText.text =
        this.name.length > 0 ? this.name : this.focused === 'name' ? '_' : '';
    }
    if (this.codeText) {
      this.codeText.text =
        this.code.length > 0 ? this.code : this.focused === 'code' ? '_' : '';
    }
  }

  private async submitPrompt(): Promise<void> {
    const kind = this.mode;
    if ((kind !== 'create' && kind !== 'join') || this.busy) {
      return;
    }
    const problem = promptError(kind, this.name, this.code);
    if (problem) {
      this.setError(problem);
      return;
    }
    rememberPreferredName(this.clientId, this.name);
    this.busy = true;
    this.setError('Working...', DIM);
    let failure: string | undefined;
    try {
      failure = await this.enter({
        kind,
        name: this.name,
        code: this.code,
      });
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'Could not join';
    }
    if (this.mode !== kind) {
      return;
    }
    this.busy = false;
    if (failure) {
      this.setError(failure);
      return;
    }
    this.closeOverlay();
    this.onEntered();
  }

  private setError(message: string, color: ex.Color = DANGER): void {
    if (this.errorText) {
      this.errorText.text = message;
      this.errorText.color = color;
    }
  }

  private openHowToPlay(): void {
    this.mode = 'howto';
    this.gameIndex = 0;
    this.shade();

    const box = HOW_TO_PLAY.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.add(panel);
    this.overlay.push(panel);
    this.overlayText(box.x + 16, box.y + 16, 16, GOLD, () => 'How to Play');

    this.listRows = [];
    for (let index = 0; index < GAME_CATALOG.length; index += 1) {
      const game = GAME_CATALOG[index];
      if (!game) {
        continue;
      }
      const list = HOW_TO_PLAY.list;
      const face = rect(list.w, list.rowH - 4, FIELD, STROKE);
      const row = new ex.Actor({
        pos: ex.vec(list.x, list.y + index * list.rowH),
        anchor: ex.vec(0, 0),
        width: list.w,
        height: list.rowH - 4,
        z: 32,
      });
      row.graphics.use(face);
      row.on('pointerup', () => {
        this.selectGame(index);
      });
      this.add(row);
      this.overlay.push(row);
      const label = canvasText(game.name, 8, GOLD);
      const labelActor = new ex.Actor({
        pos: ex.vec(list.x + 10, list.y + index * list.rowH + 8),
        anchor: ex.vec(0, 0),
        z: 33,
      });
      labelActor.graphics.use(label);
      this.add(labelActor);
      this.overlay.push(labelActor);
      this.listRows.push({ face, label });
    }

    const back = HOW_TO_PLAY.back;
    this.overlay.push(
      this.button(
        back.x,
        back.y,
        back.w,
        back.h,
        'Back',
        16,
        () => {
          this.closeOverlay();
        },
        32,
      ),
    );
    this.renderGame();
  }

  private selectGame(index: number): void {
    if (this.mode !== 'howto') {
      return;
    }
    this.gameIndex = stepIndex(index, 0, GAME_CATALOG.length);
    this.renderGame();
  }

  private renderGame(): void {
    for (let index = 0; index < this.listRows.length; index += 1) {
      const row = this.listRows[index];
      if (row) {
        row.face.strokeColor = index === this.gameIndex ? STROKE_HOT : STROKE;
        row.face.color = index === this.gameIndex ? BUTTON : FIELD;
      }
    }
    for (const actor of this.bodyActors) {
      actor.kill();
    }
    this.bodyActors = [];
    const game = GAME_CATALOG[this.gameIndex];
    if (!game) {
      return;
    }
    const body = HOW_TO_PLAY.body;
    const parts = splitHowToPlay(game.howToPlay);
    const title = parts.title.length > 0 ? parts.title : game.name;
    const lines = wrapText(parts.body, Math.floor(body.w / 8)).slice(
      0,
      body.maxLines,
    );
    const rows: Array<{ text: string; size: number; color: ex.Color }> = [
      { text: title, size: 16, color: GOLD },
      { text: '', size: 8, color: GOLD },
      ...lines.map((text) => ({ text, size: 8, color: GOLD })),
    ];
    let y = body.y;
    for (const row of rows) {
      if (row.text.length > 0) {
        const actor = this.addText(
          body.x,
          y,
          row.text,
          row.size,
          row.color,
          33,
        );
        this.overlay.push(actor);
        this.bodyActors.push(actor);
      }
      y += row.size === 16 ? 24 : body.lineH;
    }
  }

  private onKey(key: ex.Keys, value: string): void {
    if (this.mode === 'main') {
      return;
    }
    if (key === ex.Keys.Escape) {
      this.closeOverlay();
      return;
    }
    if (this.mode === 'howto') {
      if (key === ex.Keys.ArrowUp) {
        this.selectGame(stepIndex(this.gameIndex, -1, GAME_CATALOG.length));
      } else if (key === ex.Keys.ArrowDown) {
        this.selectGame(stepIndex(this.gameIndex, 1, GAME_CATALOG.length));
      }
      return;
    }
    if (this.busy) {
      return;
    }
    const kind = this.mode;
    if (key === ex.Keys.Enter) {
      const next = nextFieldAfterEnter(kind, this.focused, this.name);
      if (next === 'submit') {
        void this.submitPrompt();
      } else {
        this.focused = next;
        this.paintPrompt();
      }
      return;
    }
    if (kind === 'join') {
      if (
        key === ex.Keys.Tab ||
        key === ex.Keys.ArrowUp ||
        key === ex.Keys.ArrowDown
      ) {
        this.focused = this.focused === 'name' ? 'code' : 'name';
        this.paintPrompt();
        return;
      }
    }
    if (key === ex.Keys.Backspace) {
      this.writeField('Backspace');
      return;
    }
    if (value.length === 1) {
      this.writeField(value);
    }
  }

  private writeField(key: string): void {
    this.setError('');
    if (this.focused === 'name') {
      this.name = applyFieldKey(this.name, key, NAME_MAX);
      rememberPreferredName(this.clientId, this.name);
    } else {
      this.code = applyCodeKey(this.code, key);
    }
    this.paintPrompt();
  }

  private overlayText(
    x: number,
    y: number,
    size: number,
    color: ex.Color,
    text: () => string,
  ): void {
    this.overlay.push(this.addText(x, y, text(), size, color, 33));
  }

  private addText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: ex.Color,
    z: number,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      z,
    });
    actor.graphics.use(canvasText(text, size, color));
    this.add(actor);
    return actor;
  }

  private button(
    x: number,
    y: number,
    w: number,
    h: number,
    caption: string,
    size: number,
    onPress: () => void,
    z: number,
  ): ex.Actor {
    const actor = new ex.Actor({
      pos: ex.vec(x, y),
      anchor: ex.vec(0, 0),
      width: w,
      height: h,
      z,
    });
    const face = rect(w, h, BUTTON, STROKE);
    actor.graphics.use(face);
    const captionX = (w - caption.length * size) / 2;
    const captionY = (h - size) / 2;
    const captionActor = new ex.Actor({
      pos: ex.vec(captionX, captionY),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(canvasText(caption, size, GOLD));
    actor.addChild(captionActor);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      captionActor.pos = ex.vec(captionX, captionY);
    });
    actor.on('pointerdown', () => {
      face.color = BUTTON_DOWN;
      captionActor.pos = ex.vec(captionX, captionY + 1);
    });
    actor.on('pointerup', () => {
      face.color = BUTTON;
      captionActor.pos = ex.vec(captionX, captionY);
      onPress();
    });
    this.add(actor);
    return actor;
  }
}
