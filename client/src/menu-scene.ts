import { uiCaption, uiFieldLabel, uiSingleLine, uiText } from './ui-text';
import { classicText } from './classic-table-design';
import {
  openCasinoAvatarEditor,
  casinoAvatarEditorOpen,
} from './casino-profile';
import type { DbConnection } from './module_bindings';
import { coinDialog } from './coin-dialog';
import { audioSettingsOpen, openAudioSettings } from './audio-settings';
import { gameAudio } from './game-audio';
import { bindButtonPress } from './button-press';
import { MENU_TRACK, MUSIC_ARTIST, openMusicCredit } from './game-music';
import * as ex from 'excalibur';
import { LoadingScreen } from './loading-screen';
import { isMobileDevice } from './mobile-shell';
import {
  casinoEntrance,
  personalCardAtlas,
  pixelFont,
  tableSprites,
} from './boot-scene';
import {
  CARD_BACK_LABELS,
  CARD_FRONT_LABELS,
  setCardBackStyle,
  setCardFrontStyle,
  stepCardBackStyle,
  stepCardFrontStyle,
} from './card-appearance';
import { readClientLook, type ClientLook } from './client-look';
import {
  GAME_CATALOG,
  applyCodeKey,
  applyCodeText,
  CODE_MAX,
  POKER_GAME_TYPE,
  POKER_VARIATION_LABELS,
  POKER_VARIATIONS,
} from './lobby';
import {
  bindCanvasTextField,
  eventTargetsHtmlField,
  layoutFieldCaret,
  refreshCanvasTextFields,
  type CanvasTextFieldHandle,
} from './html-field';
import { makeFieldCaret, showFieldCaret } from './canvas-ui';
import {
  linkStatusLine,
  RECONNECTING_LABEL,
  roomEntryError,
  SERVER_UNREACHABLE,
  type ConnectionPhase,
} from './connect';
import {
  HOW_TO_PLAY,
  MENU_BACKDROP,
  MENU_BUTTONS,
  MENU_TAGLINE,
  MENU_TITLE,
  MENU_VERSION,
  PROMPT,
  SOLO_PICKER,
  THEME_PANEL,
  menuAcceptsAction,
  joinPromptError,
  soloSeatCount,
  soloSettingsJson,
  splitHowToPlay,
  stepIndex,
  wrapText,
  type MenuAction,
  type MenuMode,
  type PromptKind,
  type ThemeChoiceId,
} from './menu-layout';
import { lifetimeWinningsCaption } from './lifetime-winnings';
import { preferredPlayerName } from './preferred-name';
import {
  BUTTON_FONT_SIZE,
  BUTTON_PRESS_SHIFT,
  buttonCaptionPos,
} from './button-style';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './sheets';
import {
  backgroundHex,
  saveBackground,
  saveTheme,
  stepBackgroundStyle,
  stepTableStyle,
} from './theme';

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

const TITLE_DROP = 4;
/** Below the Theme button (y 408, h 44) and above the version marker. */
const STATS_Y = typeof window !== 'undefined' && isMobileDevice() ? 150 : 480;

export interface MenuEntry {
  kind: PromptKind;
  name: string;
  code: string;
}

/** Resolves to an error message, or undefined once the lobby was entered. */
export type MenuEnter = (entry: MenuEntry) => Promise<string | undefined>;

export interface SoloStart {
  name: string;
  gameType: string;
  seatCount: number;
  settings?: string;
}

/** Resolves to an error message, or undefined once the solo table is open. */
export type SoloEnter = (start: SoloStart) => Promise<string | undefined>;

type Mode = MenuMode;

const codeMetrics = uiFieldLabel(PROMPT.codeField, PROMPT.font.value, 16);

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

function styleName(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function scaled(sprite: ex.Sprite, scale: number): ex.Sprite {
  sprite.scale = ex.vec(scale, scale);
  return sprite;
}

export class MenuScene extends ex.Scene {
  constructor(private readonly clientId = '') {
    super();
  }

  private mode: Mode = 'main';
  private phase: ConnectionPhase = 'connecting';
  private submitAttempt = 0;
  private clickClaimedByOverlay = false;
  private enter: MenuEnter = () =>
    Promise.resolve(roomEntryError('connecting'));
  private onEntered: () => void = () => {};
  private startSolo: SoloEnter = () =>
    Promise.resolve(roomEntryError('connecting'));
  private soloSeatIndex = 0;
  private soloVariationIndex = 0;
  private soloGameText: ex.Text | undefined;
  private soloSeatText: ex.Text | undefined;
  private soloVariationText: ex.Text | undefined;
  private winningsText = canvasText(lifetimeWinningsCaption(), 8, DIM);
  private winningsActor: ex.Actor | undefined;
  private readonly overlay: ex.Actor[] = [];
  private busy = false;
  private readonly loading = new LoadingScreen(this);

  private code = '';
  private codeFocused = false;
  private joinName = '';
  private codeField: CanvasTextFieldHandle | undefined;
  private menuFieldsReady = false;
  private codeText: ex.Text | undefined;
  private codeBox: ex.Rectangle | undefined;
  private codeCaret: ex.Actor | undefined;
  private errorText: ex.Text | undefined;
  private linkLine = '';
  private linkText = canvasText('', 8, GOLD);
  private linkActor: ex.Actor | undefined;

  private gameIndex = 0;
  private listRows: Array<{ face: ex.Rectangle; label: ex.Text }> = [];
  private bodyActors: ex.Actor[] = [];

  private frontValueText: ex.Text | undefined;
  private backValueText: ex.Text | undefined;
  private tableValueText: ex.Text | undefined;
  private backgroundValueText: ex.Text | undefined;
  private previewFront: ex.Actor | undefined;
  private previewBack: ex.Actor | undefined;
  private previewTable: ex.Actor | undefined;
  private previewBackground: ex.Actor | undefined;

  private look: ClientLook = readClientLook('');
  private onLookChange: (look: ClientLook) => void = () => {};
  casinoConnection?: DbConnection;

  /**
   * Create and Join read this before they call a reducer. A drop while the
   * dialog says Working clears that line so the player can try again.
   */
  setConnectionPhase(phase: ConnectionPhase): void {
    this.phase = phase;
    this.setLinkStatus(linkStatusLine(phase));
    if (phase === 'connected' && this.errorText?.text === RECONNECTING_LABEL) {
      this.setError('');
    }
    if (!this.busy || phase === 'connected' || phase === 'connecting') {
      return;
    }
    this.submitAttempt += 1;
    this.busy = false;
    this.loading.hide();
    this.setError(
      phase === 'reconnecting' ? RECONNECTING_LABEL : SERVER_UNREACHABLE,
    );
  }

  /** A short line while the socket is being replaced. Empty once it is up. */
  setLinkStatus(line: string): void {
    this.linkLine = line;
    this.linkText.text = line;
    if (!this.linkActor) {
      return;
    }
    this.linkActor.pos = ex.vec(16, 4);
  }

  setLifetimeWinnings(line: string): void {
    this.winningsText.text = line;
    if (this.winningsActor) {
      const width = line.length * 8;
      this.winningsActor.pos = ex.vec(
        Math.floor((LOGICAL_WIDTH - width) / 2),
        STATS_Y,
      );
    }
  }

  /**
   * Reads the saved Theme and tells the rest of the app whenever it changes.
   * Repaints the menu table, margin, and drifting cards immediately.
   */
  connectLook(onChange: (look: ClientLook) => void): void {
    this.onLookChange = onChange;
    this.look = readClientLook(this.clientId);
    this.paintLook();
    this.onLookChange(this.look);
  }

  /** Called once the lobby panel can accept a name and code. */
  connect(enter: MenuEnter, onEntered: () => void): void {
    this.enter = enter;
    this.onEntered = onEntered;
  }

  /** Called once a solo game can be started from the picker. */
  connectSolo(start: SoloEnter): void {
    this.startSolo = start;
  }

  /**
   * Opens Join Room with the code from a `/cardhouse create` join URL.
   * A default Discord name joins without asking the player to type one.
   */
  openJoin(code: string, defaultName = ''): void {
    if (this.mode !== 'main') {
      return;
    }
    const name = defaultName.trim();
    this.openJoinPrompt(code, name);
    if (name.length > 0) {
      void this.submitJoin();
    }
  }

  onInitialize(engine: ex.Engine): void {
    this.look = readClientLook(this.clientId);
    this.backgroundColor = ex.Color.fromHex(
      backgroundHex(this.look.background),
    );
    const room = new ex.Actor({ pos: ex.vec(480, 270), z: 0 });
    const artwork = casinoEntrance.toSprite();
    const cover = Math.max(960 / artwork.width, 540 / artwork.height);
    artwork.scale = ex.vec(cover, cover);
    room.graphics.use(artwork);
    this.add(room);
    this.buildBackdrop();
    this.buildTitle();
    this.buildButtons();
    this.buildFooter();
    this.bindMenuFields();
    engine.input.keyboard.on('press', (evt) => {
      if (
        engine.currentScene !== this ||
        casinoAvatarEditorOpen(this) ||
        audioSettingsOpen(this)
      ) {
        return;
      }
      if (eventTargetsHtmlField(evt.originalEvent)) {
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
    gameAudio.select('menu', MENU_TRACK.file);
  }

  onDeactivate(): void {
    gameAudio.stop('menu');
    this.loading.hide();
    this.closeOverlay();
  }

  private paintLook(): void {
    this.backgroundColor = ex.Color.fromHex(
      backgroundHex(this.look.background),
    );
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
    this.button(
      781,
      20,
      156,
      44,
      'Avatar',
      14,
      () => {
        if (
          this.mode !== 'main' ||
          casinoAvatarEditorOpen(this) ||
          audioSettingsOpen(this)
        )
          return;
        gameAudio.play('button');
        openCasinoAvatarEditor(this, this.casinoConnection);
      },
      10,
    );
    this.button(
      781,
      74,
      156,
      44,
      'Settings',
      13,
      () => {
        if (
          this.mode === 'main' &&
          !casinoAvatarEditorOpen(this) &&
          !audioSettingsOpen(this)
        ) {
          gameAudio.play('button');
          openAudioSettings(this);
        }
      },
      10,
    );
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
    const track = new ex.Actor({
      pos: ex.vec(20, 484),
      anchor: ex.vec(0, 0),
      z: 10,
    });
    track.graphics.use(uiText(MENU_TRACK.title, 16, GOLD));
    this.add(track);
    const credit = new ex.Actor({
      pos: ex.vec(20, 505),
      anchor: ex.vec(0, 0),
      width: 118,
      height: 27,
      z: 10,
    });
    const artist = uiText(MUSIC_ARTIST, 16, DIM);
    credit.graphics.use(artist);
    const underline = new ex.Actor({
      pos: ex.vec(0, 18),
      anchor: ex.vec(0, 0),
    });
    const line = new ex.Rectangle({
      width: Math.ceil(artist.width),
      height: 1,
      color: DIM,
    });
    line.origin = ex.vec(0, 0);
    underline.graphics.use(line);
    credit.addChild(underline);
    bindButtonPress(credit, undefined, undefined, () => {
      if (
        this.mode === 'main' &&
        !casinoAvatarEditorOpen(this) &&
        !audioSettingsOpen(this)
      ) {
        gameAudio.play('button');
        openMusicCredit();
      }
    });
    this.add(credit);
    const winningsLine = this.winningsText.text;
    const winningsWidth = winningsLine.length * 8;
    this.winningsActor = new ex.Actor({
      pos: ex.vec(Math.floor((LOGICAL_WIDTH - winningsWidth) / 2), STATS_Y),
      anchor: ex.vec(0, 0),
      z: 10,
    });
    this.winningsActor.graphics.use(this.winningsText);
    this.add(this.winningsActor);
    this.linkText.text = this.linkLine;
    this.linkActor = new ex.Actor({
      pos: ex.vec(16, 4),
      anchor: ex.vec(0, 0),
      z: 30,
    });
    this.linkActor.graphics.use(this.linkText);
    this.add(this.linkActor);
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
    if (!menuAcceptsAction(this.mode, this.clickClaimedByOverlay)) {
      return;
    }
    gameAudio.play('button');
    if (action === 'howto') {
      this.openHowToPlay();
      return;
    }
    if (action === 'theme') {
      this.openTheme();
      return;
    }
    if (action === 'solo') {
      this.openSolo();
      return;
    }
    if (action === 'create') {
      void this.openCreateRoom();
      return;
    }
    this.openJoinPrompt();
  }

  private closeOverlay(): void {
    for (const actor of this.overlay) {
      actor.kill();
    }
    this.overlay.length = 0;
    this.listRows = [];
    this.bodyActors = [];
    this.codeText = undefined;
    this.codeBox = undefined;
    this.soloGameText = undefined;
    this.soloSeatText = undefined;
    this.soloVariationText = undefined;
    this.codeCaret = undefined;
    this.errorText = undefined;
    this.frontValueText = undefined;
    this.backValueText = undefined;
    this.tableValueText = undefined;
    this.backgroundValueText = undefined;
    this.previewFront = undefined;
    this.previewBack = undefined;
    this.previewTable = undefined;
    this.previewBackground = undefined;
    this.mode = 'main';
    this.busy = false;
    this.loading.hide();
    refreshCanvasTextFields();
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
    this.claimOverlayPointer(shade);
    this.add(shade);
    this.overlay.push(shade);
  }

  /** Stops this click from reaching the menu buttons under the dialog. */
  private claimOverlayClick(event: { cancel: () => void }): void {
    event.cancel();
    this.clickClaimedByOverlay = true;
    queueMicrotask(() => {
      this.clickClaimedByOverlay = false;
    });
  }

  private claimOverlayPointer(actor: ex.Actor): void {
    const claim = (event: { cancel: () => void }): void => {
      this.claimOverlayClick(event);
    };
    actor.on('pointerdown', claim);
    actor.on('pointerup', claim);
  }

  private async openCreateRoom(): Promise<void> {
    this.mode = 'create';
    const name = this.playerName();
    const grant = await coinDialog(
      this.engine,
      this,
      'Create Room',
      'Each player receives this grant once per room.',
      [{ key: 'startingCoins', label: 'Starting chips', value: 10_000 }],
      'Create room',
      {
        playerName: name,
        focusFirst: true,
        onSubmit: async ({ startingCoins }) => {
          const blocked = roomEntryError(this.phase);
          if (blocked) return blocked;
          localStorage.setItem('roomStartingCoins', String(startingCoins));
          this.loading.show('Creating room');
          try {
            return await this.enter({ kind: 'create', name, code: '' });
          } finally {
            this.loading.hide();
          }
        },
      },
    );
    if (this.mode !== 'create') return;
    this.closeOverlay();
    if (grant) {
      gameAudio.play('door');
      this.onEntered();
    }
  }

  private openJoinPrompt(code = '', inviteName = ''): void {
    this.mode = 'join';
    this.joinName = this.playerName(inviteName);
    this.code = code;
    this.shade();

    const box = PROMPT.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.claimOverlayPointer(panel);
    this.add(panel);
    this.overlay.push(panel);

    const title = new ex.Actor({
      pos: ex.vec(box.x + PROMPT.padding, box.y + 20),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    title.graphics.use(classicText('Join Room', 24, GOLD));
    this.add(title);
    this.overlay.push(title);

    const nameLabel = new ex.Actor({
      pos: ex.vec(box.x + PROMPT.padding, PROMPT.nameY),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    nameLabel.graphics.use(
      uiSingleLine(
        `Playing as ${this.joinName}`,
        PROMPT.font.name,
        GOLD,
        box.w - 2 * PROMPT.padding,
      ),
    );
    this.add(nameLabel);
    this.overlay.push(nameLabel);

    const spec = PROMPT.codeField;
    const codeLabel = new ex.Actor({
      pos: ex.vec(spec.x, PROMPT.labelY),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    codeLabel.graphics.use(uiText('Room code', PROMPT.font.label, GOLD));
    this.add(codeLabel);
    this.overlay.push(codeLabel);
    const face = rect(spec.w, spec.h, FIELD, STROKE);
    const actor = new ex.Actor({
      pos: ex.vec(spec.x, spec.y),
      anchor: ex.vec(0, 0),
      width: spec.w,
      height: spec.h,
      z: 32,
    });
    actor.graphics.use(face);
    actor.on('pointerdown', (event) => {
      this.claimOverlayClick(event);
    });
    actor.on('pointerup', (event) => {
      this.claimOverlayClick(event);
      if (!isMobileDevice()) {
        this.codeField?.focus();
      }
    });
    this.add(actor);
    this.overlay.push(actor);
    const text = uiText('', codeMetrics.size, GOLD);
    const textActor = new ex.Actor({
      pos: ex.vec(codeMetrics.x, codeMetrics.y),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    textActor.graphics.use(text);
    const caret = makeFieldCaret(codeMetrics.size, 34);
    this.add(textActor);
    this.add(caret);
    this.overlay.push(textActor, caret);
    this.codeText = text;
    this.codeBox = face;
    this.codeCaret = caret;

    const error = uiText('', PROMPT.font.error, DANGER);
    error.maxWidth = spec.w;
    const errorActor = new ex.Actor({
      pos: ex.vec(PROMPT.error.x, PROMPT.error.y),
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
      'Join',
      PROMPT.font.button,
      () => {
        void this.submitJoin();
      },
      32,
      true,
      true,
    );
    const cancel = this.button(
      PROMPT.cancel.x,
      PROMPT.cancel.y,
      PROMPT.cancel.w,
      PROMPT.cancel.h,
      'Cancel',
      PROMPT.font.button,
      () => {
        this.closeOverlay();
      },
      32,
      true,
      true,
    );
    this.overlay.push(submit, cancel);
    this.paintPrompt();
    refreshCanvasTextFields();
    this.codeField?.focus();
  }

  private paintPrompt(): void {
    if (this.mode !== 'join') {
      return;
    }
    if (this.codeBox) {
      this.codeBox.strokeColor = this.codeFocused ? STROKE_HOT : STROKE;
    }
    if (!this.codeText || !this.codeCaret) return;
    const index = this.codeFocused
      ? (this.codeField?.selectionIndex() ?? this.code.length)
      : this.code.length;
    const layout = layoutFieldCaret({
      value: this.code,
      index,
      size: codeMetrics.size,
      originX: codeMetrics.x,
      originY: codeMetrics.y,
      measure: codeMetrics.measure,
    });
    this.codeText.text = layout.text;
    showFieldCaret(this.codeCaret, this.codeFocused, layout.x, layout.y);
  }

  private async submitJoin(): Promise<void> {
    if (this.mode !== 'join' || this.busy) return;
    const problem = joinPromptError(this.code);
    if (problem) {
      this.setError(problem);
      return;
    }
    const blocked = roomEntryError(this.phase);
    if (blocked) {
      this.setError(blocked);
      return;
    }
    this.busy = true;
    this.submitAttempt += 1;
    const attempt = this.submitAttempt;
    this.loading.show('Joining room');
    let failure: string | undefined;
    try {
      failure = await this.enter({
        kind: 'join',
        name: this.joinName,
        code: this.code,
      });
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'Could not join';
    }
    if (attempt !== this.submitAttempt || this.mode !== 'join') {
      return;
    }
    this.busy = false;
    this.loading.hide();
    if (failure) {
      this.setError(failure);
      return;
    }
    this.closeOverlay();
    gameAudio.play('door');
    this.onEntered();
  }

  private setError(message: string, color: ex.Color = DANGER): void {
    if (message && color === DANGER) gameAudio.play('blocked');
    if (this.errorText) {
      this.errorText.text = message;
      this.errorText.color = color;
    }
  }

  private soloGame(): (typeof GAME_CATALOG)[number] {
    return (
      GAME_CATALOG[stepIndex(this.gameIndex, 0, GAME_CATALOG.length)] ??
      GAME_CATALOG[0]
    );
  }

  private openSolo(): void {
    this.mode = 'solo';
    this.gameIndex = 0;
    this.soloSeatIndex = 0;
    this.soloVariationIndex = 0;
    this.shade();

    const box = SOLO_PICKER.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.claimOverlayPointer(panel);
    this.add(panel);
    this.overlay.push(panel);
    this.overlayText(box.x + 24, box.y + 20, 16, GOLD, () => 'Single Player');

    this.overlayText(
      SOLO_PICKER.gameRow.x,
      SOLO_PICKER.gameRow.y - 18,
      8,
      DIM,
      () => 'Game',
    );
    this.soloGameText = this.soloArrowRow(
      SOLO_PICKER.gameRow.x,
      SOLO_PICKER.gameRow.y,
      (delta) => {
        this.gameIndex = stepIndex(this.gameIndex, delta, GAME_CATALOG.length);
        this.paintSolo();
      },
    );
    this.overlayText(
      SOLO_PICKER.seatRow.x,
      SOLO_PICKER.seatRow.y - 18,
      8,
      DIM,
      () => 'Seats',
    );
    this.soloSeatText = this.soloArrowRow(
      SOLO_PICKER.seatRow.x,
      SOLO_PICKER.seatRow.y,
      (delta) => {
        const game = this.soloGame();
        const span = Math.max(game.maxPlayers - game.minPlayers + 1, 1);
        this.soloSeatIndex = stepIndex(this.soloSeatIndex, delta, span);
        this.paintSolo();
      },
    );
    this.overlayText(
      SOLO_PICKER.variationRow.x,
      SOLO_PICKER.variationRow.y - 18,
      8,
      DIM,
      () => 'Variation',
    );
    this.soloVariationText = this.soloArrowRow(
      SOLO_PICKER.variationRow.x,
      SOLO_PICKER.variationRow.y,
      (delta) => {
        if (this.soloGame().gameType !== POKER_GAME_TYPE) {
          return;
        }
        this.soloVariationIndex = stepIndex(
          this.soloVariationIndex,
          delta,
          POKER_VARIATIONS.length,
        );
        this.paintSolo();
      },
    );

    const error = canvasText('', 8, DANGER);
    const errorActor = new ex.Actor({
      pos: ex.vec(SOLO_PICKER.error.x, SOLO_PICKER.error.y),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    errorActor.graphics.use(error);
    this.add(errorActor);
    this.overlay.push(errorActor);
    this.errorText = error;

    this.overlay.push(
      this.button(
        SOLO_PICKER.play.x,
        SOLO_PICKER.play.y,
        SOLO_PICKER.play.w,
        SOLO_PICKER.play.h,
        'Play',
        isMobileDevice() ? 16 : BUTTON_FONT_SIZE,
        () => {
          void this.submitSolo();
        },
        32,
        true,
      ),
      this.button(
        SOLO_PICKER.cancel.x,
        SOLO_PICKER.cancel.y,
        SOLO_PICKER.cancel.w,
        SOLO_PICKER.cancel.h,
        'Cancel',
        isMobileDevice() ? 16 : BUTTON_FONT_SIZE,
        () => {
          this.closeOverlay();
        },
        32,
        true,
      ),
    );
    this.paintSolo();
    refreshCanvasTextFields();
  }

  private soloArrowRow(
    x: number,
    y: number,
    onCycle: (delta: number) => void,
  ): ex.Text {
    const arrow = isMobileDevice() ? { w: 64, h: 64 } : THEME_PANEL.arrow;
    this.overlay.push(
      this.button(x, y, arrow.w, arrow.h, '<', 16, () => onCycle(-1), 32, true),
    );
    this.overlay.push(
      this.button(
        x + SOLO_PICKER.arrowGap,
        y,
        arrow.w,
        arrow.h,
        '>',
        16,
        () => onCycle(1),
        32,
        true,
      ),
    );
    const text = canvasText('', 16, GOLD);
    const textActor = new ex.Actor({
      pos: ex.vec(x + arrow.w + 12, y + (arrow.h - 16) / 2),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    textActor.graphics.use(text);
    this.add(textActor);
    this.overlay.push(textActor);
    return text;
  }

  private paintSolo(): void {
    if (this.mode !== 'solo') {
      return;
    }
    const game = this.soloGame();
    if (this.soloGameText) {
      this.soloGameText.text = game.name;
    }
    if (this.soloSeatText) {
      const count = soloSeatCount(
        game.minPlayers,
        game.maxPlayers,
        this.soloSeatIndex,
      );
      this.soloSeatText.text =
        game.gameType === 'blackjack' && count === 1
          ? '1 vs dealer'
          : String(count);
    }
    if (this.soloVariationText) {
      if (game.gameType === POKER_GAME_TYPE) {
        const variation =
          POKER_VARIATIONS[
            stepIndex(this.soloVariationIndex, 0, POKER_VARIATIONS.length)
          ] ?? POKER_VARIATIONS[0];
        this.soloVariationText.text = POKER_VARIATION_LABELS[variation];
      } else {
        this.soloVariationText.text = 'None';
      }
    }
  }

  private async submitSolo(): Promise<void> {
    if (this.mode !== 'solo' || this.busy) {
      return;
    }
    const blocked = roomEntryError(this.phase);
    if (blocked) {
      this.setError(blocked);
      return;
    }
    const game = this.soloGame();
    const variation =
      game.gameType === POKER_GAME_TYPE
        ? (POKER_VARIATIONS[
            stepIndex(this.soloVariationIndex, 0, POKER_VARIATIONS.length)
          ] ?? POKER_VARIATIONS[0])
        : undefined;
    this.busy = true;
    this.submitAttempt += 1;
    const attempt = this.submitAttempt;
    this.loading.show('Opening table');
    let failure: string | undefined;
    try {
      failure = await this.startSolo({
        name: this.playerName(),
        gameType: game.gameType,
        seatCount: soloSeatCount(
          game.minPlayers,
          game.maxPlayers,
          this.soloSeatIndex,
        ),
        settings: soloSettingsJson(game.gameType, variation),
      });
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : 'Could not start';
    }
    if (attempt !== this.submitAttempt || this.mode !== 'solo') {
      return;
    }
    this.busy = false;
    this.loading.hide();
    if (failure) {
      this.setError(failure);
      return;
    }
    this.closeOverlay();
  }

  private openHowToPlay(): void {
    this.mode = 'howto';
    this.gameIndex = 0;
    this.shade();

    const box = HOW_TO_PLAY.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.claimOverlayPointer(panel);
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
      row.on('pointerdown', (event) => {
        this.claimOverlayClick(event);
      });
      row.on('pointerup', (event) => {
        this.claimOverlayClick(event);
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
        BUTTON_FONT_SIZE,
        () => {
          this.closeOverlay();
        },
        32,
        true,
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

  private openTheme(): void {
    this.mode = 'theme';
    this.shade();

    const box = THEME_PANEL.panel;
    const panel = new ex.Actor({
      pos: ex.vec(box.x, box.y),
      anchor: ex.vec(0, 0),
      width: box.w,
      height: box.h,
      z: 31,
    });
    panel.graphics.use(rect(box.w, box.h, PANEL, STROKE));
    this.claimOverlayPointer(panel);
    this.add(panel);
    this.overlay.push(panel);
    this.overlayText(box.x + 24, box.y + 16, 16, GOLD, () => 'Theme');
    this.overlayText(
      box.x + 24,
      box.y + 44,
      8,
      DIM,
      () => 'Saved on this browser.',
    );

    for (const choice of THEME_PANEL.choices) {
      this.overlayText(
        choice.x,
        choice.labelY,
        isMobileDevice() ? 12 : 8,
        DIM,
        () => choice.label,
      );
      const value = this.styleArrowRow(choice.x, choice.y, (delta) => {
        this.stepTheme(choice.id, delta);
      });
      if (choice.id === 'front') {
        this.frontValueText = value;
      } else if (choice.id === 'back') {
        this.backValueText = value;
      } else if (choice.id === 'table') {
        this.tableValueText = value;
      } else {
        this.backgroundValueText = value;
      }
      const preview = new ex.Actor({
        pos: ex.vec(choice.previewBox.x, choice.previewBox.y),
        anchor: ex.vec(0, 0),
        z: 33,
      });
      this.add(preview);
      this.overlay.push(preview);
      if (choice.preview === 'face') {
        this.previewFront = preview;
      } else if (choice.preview === 'back') {
        this.previewBack = preview;
      } else if (choice.preview === 'table') {
        this.previewTable = preview;
      } else {
        this.previewBackground = preview;
      }
    }

    const close = THEME_PANEL.close;
    this.overlay.push(
      this.button(
        close.x,
        close.y,
        close.w,
        close.h,
        'Close',
        isMobileDevice() ? 16 : BUTTON_FONT_SIZE,
        () => {
          this.closeOverlay();
        },
        32,
        true,
      ),
    );

    this.refreshTheme();
  }

  private stepTheme(id: ThemeChoiceId, delta: number): void {
    if (id === 'front') {
      const front = stepCardFrontStyle(this.look.front, delta);
      setCardFrontStyle(front);
      this.look = { ...this.look, front };
    } else if (id === 'back') {
      const back = stepCardBackStyle(this.look.back, delta);
      setCardBackStyle(back);
      this.look = { ...this.look, back };
    } else if (id === 'table') {
      const table = stepTableStyle(this.look.table, delta);
      saveTheme(this.clientId, table);
      this.look = { ...this.look, table };
    } else {
      const background = stepBackgroundStyle(this.look.background, delta);
      saveBackground(this.clientId, background);
      this.look = { ...this.look, background };
    }
    this.paintLook();
    this.refreshTheme();
    this.onLookChange(this.look);
  }

  /**
   * One row with a left arrow, the current name, and a right arrow.
   * Returns the text so `refreshTheme` can update it.
   */
  private styleArrowRow(
    x: number,
    y: number,
    onCycle: (delta: number) => void,
  ): ex.Text {
    const arrow = THEME_PANEL.arrow;
    this.overlay.push(
      this.button(x, y, arrow.w, arrow.h, '<', 16, () => onCycle(-1), 32, true),
    );
    this.overlay.push(
      this.button(
        x + THEME_PANEL.arrowGap,
        y,
        arrow.w,
        arrow.h,
        '>',
        16,
        () => onCycle(1),
        32,
        true,
      ),
    );
    const text = canvasText('', 16, GOLD);
    const textActor = new ex.Actor({
      pos: ex.vec(x + arrow.w + 12, y + (arrow.h - 16) / 2),
      anchor: ex.vec(0, 0),
      z: 33,
    });
    textActor.graphics.use(text);
    this.add(textActor);
    this.overlay.push(textActor);
    return text;
  }

  private refreshTheme(): void {
    if (this.frontValueText) {
      this.frontValueText.text = CARD_FRONT_LABELS[this.look.front];
    }
    if (this.backValueText) {
      this.backValueText.text = CARD_BACK_LABELS[this.look.back];
    }
    if (this.tableValueText) {
      this.tableValueText.text = styleName(this.look.table);
    }
    if (this.backgroundValueText) {
      this.backgroundValueText.text = styleName(this.look.background);
    }
    const mine = personalCardAtlas();
    this.previewFront?.graphics.use(
      scaled(mine.sprite({ rank: 'A', suit: 'spades' }), 1),
    );
    this.previewBack?.graphics.use(scaled(mine.back(), 1));
    this.previewTable?.graphics.use(
      scaled(tableSprites[this.look.table].clone(), 1),
    );
    const background = THEME_PANEL.choices.find(
      (choice) => choice.id === 'background',
    );
    if (background) {
      this.previewBackground?.graphics.use(
        rect(
          background.previewBox.w,
          background.previewBox.h,
          ex.Color.fromHex(backgroundHex(this.look.background)),
          STROKE,
        ),
      );
    }
  }

  private onKey(key: ex.Keys, value: string): void {
    if (this.mode === 'main' || this.mode === 'create') {
      return;
    }
    if (key === ex.Keys.Escape) {
      gameAudio.play('back');
      this.closeOverlay();
      return;
    }
    if (this.mode === 'howto') {
      if (key === ex.Keys.ArrowUp) {
        gameAudio.play('selector');
        this.selectGame(stepIndex(this.gameIndex, -1, GAME_CATALOG.length));
      } else if (key === ex.Keys.ArrowDown) {
        gameAudio.play('selector');
        this.selectGame(stepIndex(this.gameIndex, 1, GAME_CATALOG.length));
      }
      return;
    }
    if (this.mode === 'theme') {
      return;
    }
    if (this.mode === 'solo') {
      if (this.busy) {
        return;
      }
      if (key === ex.Keys.Enter) {
        void this.submitSolo();
      }
      return;
    }
    if (this.busy) {
      return;
    }
    if (key === ex.Keys.Enter) {
      void this.submitJoin();
    } else if (this.mode === 'join' && key === ex.Keys.Backspace) {
      this.storeCode(applyCodeKey(this.code, 'Backspace'));
    } else if (this.mode === 'join' && value.length === 1) {
      this.storeCode(applyCodeKey(this.code, value));
    }
  }

  private playerName(fallback = ''): string {
    const profile = this.casinoConnection?.db.myCasinoProfile.iter();
    const linked = profile && [...profile][0];
    return preferredPlayerName(this.clientId, fallback, linked?.discordUserId);
  }

  private bindMenuFields(): void {
    if (this.menuFieldsReady) {
      return;
    }
    this.menuFieldsReady = true;
    this.codeField = bindCanvasTextField({
      id: 'menu-code',
      label: 'Room Code',
      box: PROMPT.codeField,
      maxLength: CODE_MAX,
      active: () => this.mode === 'join',
      read: () => this.code,
      sanitize: (value) => applyCodeText(value),
      write: (value) => {
        this.storeCode(value);
      },
      submit: () => {
        void this.submitJoin();
      },
      cancel: () => {
        this.closeOverlay();
      },
      onFocus: () => {
        this.codeFocused = true;
        this.paintPrompt();
      },
      onBlur: () => {
        this.codeFocused = false;
        this.paintPrompt();
      },
      enterKeyHint: 'go',
      autoCapitalize: 'characters',
      metrics: codeMetrics,
      onCaret: () => {
        this.paintPrompt();
      },
    });
  }

  private storeCode(value: string): void {
    if (this.busy) {
      this.codeField?.sync();
      return;
    }
    this.setError('');
    this.code = value;
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
    claim = false,
    proportional = false,
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
    const rest = proportional
      ? uiCaption(caption, w, h, size)
      : buttonCaptionPos(caption, w, h, size);
    const captionActor = new ex.Actor({
      pos: ex.vec(rest.x, rest.y),
      anchor: ex.vec(0, 0),
    });
    captionActor.graphics.use(
      proportional
        ? uiText(caption, size, GOLD)
        : canvasText(caption, size, GOLD),
    );
    actor.addChild(captionActor);
    actor.on('pointerenter', () => {
      face.strokeColor = STROKE_HOT;
    });
    actor.on('pointerleave', () => {
      face.strokeColor = STROKE;
      face.color = BUTTON;
      captionActor.pos = ex.vec(rest.x, rest.y);
    });
    bindButtonPress(
      actor,
      (event) => {
        if (claim) this.claimOverlayClick(event);
        face.color = BUTTON_DOWN;
        captionActor.pos = ex.vec(rest.x, rest.y + BUTTON_PRESS_SHIFT);
      },
      () => {
        face.color = BUTTON;
        captionActor.pos = ex.vec(rest.x, rest.y);
      },
      (event) => {
        if (claim) this.claimOverlayClick(event);
        if (caption === '<' || caption === '>') gameAudio.play('selector');
        if (caption === 'Cancel' || caption === 'Close' || caption === 'Back')
          gameAudio.play('back');
        onPress();
      },
    );
    this.add(actor);
    return actor;
  }
}
