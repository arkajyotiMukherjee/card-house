import * as ex from 'excalibur';
import {
  DEFAULT_AVATAR,
  readCasinoAvatar,
  type CasinoAvatar,
} from '../../src/shared/casino-avatar';
import {
  FLOOR_COLUMNS,
  FLOOR_STEP_MS,
  LOBBY_ROWS,
  LOUNGE_CHAIRS,
  RECEPTION,
  SPAWN,
  WING_ROWS,
  floorDirectionPath,
  floorPath,
  floorRows,
  floorRowsAt,
  floorTable,
  redirectFloorWalk,
  tableEntrance,
  walkable,
  type FloorPoint,
} from '../../src/shared/casino-floor';
import {
  avatarSprite,
  casinoChair,
  CASINO_PALETTE as ink,
  floorLamp,
  floorPlant,
  casinoRug,
  suitStatue,
  woodPanel,
  type Direction,
} from './casino-art';
import { bindCanvasTextField, refreshCanvasTextFields } from './html-field';
import { isMobileDevice } from './mobile-shell';

const TILE = 24;
const W = 960,
  H = 540,
  TOP = 48,
  BOTTOM = 452;
const FIELD = { x: 20, y: 486, w: 810, h: 36 };
const WIDTH = FLOOR_COLUMNS * TILE;
const wingNames = [
  'Gaming salon',
  'The gallery',
  'The club wing',
  'The emerald room',
  'The grand hall',
];
const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const KEYBOARD_INTERVAL_MS = FLOOR_STEP_MS * 2;
const REMOTE_RENDER_DELAY_MS = 80;
const WALK_DIRECTIONS: Partial<Record<string, FloorPoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
};
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Hit extends Box {
  action: () => void;
}
export interface FloorPerson {
  id: string;
  name: string;
  state: string;
  connected: boolean;
  tableId?: string;
  avatar?: CasinoAvatar;
  voice: boolean;
  speaking: boolean;
}
export interface FloorPosition extends FloorPoint {
  id: string;
  started: number;
  path: FloorPoint[];
  chair: number;
}
export interface FloorTable {
  id: string;
  name: string;
  slot: number;
  game: string;
  status: string;
  stakes: string;
  seats: FloorPerson[];
  capacity: number;
  host: string;
  join: boolean;
  returning: boolean;
  countdown: string;
}
export interface FloorChat {
  id: string;
  author: string;
  memberId: string;
  body: string;
  at: number;
  discord?: boolean;
}
export interface FloorSnapshot {
  code: string;
  self: string;
  chips: string;
  lifetimeWinnings: string;
  players: FloorPerson[];
  positions: FloorPosition[];
  tables: FloorTable[];
  ranks: {
    id: string;
    name: string;
    rank: number;
    net: string;
    chips: string;
    crowned: boolean;
  }[];
  chat: FloorChat[];
  unread: number;
  notice: string;
  tier: string;
  roomVoice?: string;
}
interface Actions {
  snapshot(): FloorSnapshot;
  active(): boolean;
  blocked(): boolean;
  move(to: FloorPoint, chair: number): Promise<void>;
  steer(direction: FloorPoint): Promise<void>;
  create(): void;
  join(id: string): void;
  watch(id: string): void;
  leave(): void;
  refill(): void;
  avatar(): void;
  send(body: string): Promise<void>;
  readChat(): void;
}

function box(
  g: CanvasRenderingContext2D,
  rect: Box,
  fill: string,
  stroke?: string,
): void {
  g.fillStyle = fill;
  g.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1;
    g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  }
}

function label(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 17,
  color = ink.cream,
  max = Infinity,
  retro = false,
): void {
  g.font = `${size}px '${retro ? 'Press Start 2P' : 'Chakra Petch'}', sans-serif`;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  if (g.measureText(value).width > max) {
    let short = value;
    while (short && g.measureText(`${short}…`).width > max)
      short = short.slice(0, -1);
    value = `${short}…`;
  }
  g.fillText(value, x, y);
}

function position(
  row: FloorPosition | undefined,
  now: number,
  reduce: boolean,
): FloorPoint & { walked: boolean; direction: Direction; frame: number } {
  if (!row) return { ...SPAWN, walked: false, direction: 'down', frame: 0 };
  const t = Math.max(0, (now - row.started) / FLOOR_STEP_MS);
  const i = Math.min(row.path.length, Math.floor(t));
  const from = row.path[i - 1] ?? row;
  const to = row.path[i] ?? from;
  const headingFrom = i < row.path.length ? from : (row.path[i - 2] ?? row);
  const f = reduce ? 0 : t - Math.floor(t);
  return {
    x: from.x + (to.x - from.x) * f,
    y: from.y + (to.y - from.y) * f,
    walked: i < row.path.length,
    frame: !reduce && i < row.path.length ? Math.floor(now / 78) + 1 : 0,
    direction:
      to.x > headingFrom.x
        ? 'right'
        : to.x < headingFrom.x
          ? 'left'
          : to.y < headingFrom.y
            ? 'up'
            : 'down',
  };
}

export class CasinoFloor {
  private readonly actor: ex.Actor;
  private readonly field;
  private hits: Hit[] = [];
  private snapshot: FloorSnapshot;
  private camera = { x: 0, y: 0 };
  private selected = '';
  private destination?: FloorPoint;
  private seatTarget = -1;
  private reception = false;
  private focusPlayer = '';
  private mode: 'floor' | 'tables' | 'ranks' | 'chat' = 'floor';
  private rankOffset = 0;
  private tableOffset = 0;
  private chatOffset = 0;
  private chatLayout?: { key: string; lines: FloorChat[] };
  private scrollDrag?: { x: number; y: number; last: number; dragged: boolean };
  private lastData = 0;
  private quickChat = false;
  private draft = '';
  private busy = false;
  private error = '';
  private readonly walkingKeys = new Set<string>();
  private walkingDirection?: FloorPoint;
  private lastSteer = 0;
  private localWalk?: FloorPosition;
  private walkRequest = 0;
  private walkAwaiting = false;
  private correction?: FloorPoint & { started: number };
  private code = '';
  private readonly tableArt = new Image();
  private readonly reducedMotion = reducedMotion();

  constructor(
    scene: ex.Scene,
    private readonly actions: Actions,
  ) {
    this.snapshot = actions.snapshot();
    this.tableArt.src = '/assets/table-green.png';
    this.actor = new ex.Actor({
      name: 'casino-floor',
      x: 0,
      y: 0,
      width: W,
      height: H,
      anchor: ex.vec(0, 0),
      z: 34,
    });
    const graphic = new ex.Canvas({
      width: W,
      height: H,
      cache: false,
      draw: (g) => this.draw(g),
    });
    graphic.origin = ex.vec(0, 0);
    this.actor.graphics.use(graphic);
    this.actor.on('pointerdown', (e) => {
      if (!this.actions.active()) return;
      e.cancel();
      if (!this.interactive()) return;
      this.scrollDrag = {
        x: e.worldPos.x,
        y: e.worldPos.y,
        last: e.worldPos.y,
        dragged: false,
      };
    });
    this.actor.on('pointermove', (e) => {
      const drag = this.scrollDrag;
      if (!drag || !this.interactive()) return;
      const delta = drag.last - e.worldPos.y;
      if (Math.abs(e.worldPos.y - drag.y) > 10) drag.dragged = true;
      if (drag.dragged && Math.abs(delta) > 18) {
        this.scroll(drag.x, drag.y, Math.sign(delta));
        drag.last = e.worldPos.y;
      }
    });
    this.actor.on('pointerup', (e) => {
      if (!this.actions.active()) return;
      e.cancel();
      if (!this.interactive()) return;
      const gesture = this.scrollDrag;
      this.scrollDrag = undefined;
      if (!gesture?.dragged) this.hit(e.worldPos.x, e.worldPos.y);
    });
    this.actor.on('pointercancel', () => {
      this.scrollDrag = undefined;
    });
    this.actor.on('pointerleave', () => {
      this.scrollDrag = undefined;
    });
    this.actor.on('pointerwheel', (e) => {
      if (!this.actions.active()) return;
      e.cancel();
      if (!this.interactive()) return;
      this.scroll(e.x, e.y, Math.sign(e.deltaY));
    });
    this.field = bindCanvasTextField({
      id: 'casino-chat',
      label: 'Room chat',
      box: FIELD,
      maxLength: 500,
      active: () =>
        this.interactive() && (this.quickChat || this.mode === 'chat'),
      read: () => this.draft,
      write: (value) => {
        this.draft = value;
      },
      sanitize: (value) => value.replace(/[\r\n]/g, ' '),
      submit: () => void this.send(),
      enterKeyHint: 'send',
    });
    document.addEventListener('keydown', (event) => this.key(event));
    document.addEventListener('keyup', (event) => {
      if (this.walkingKeys.delete(event.code)) this.keyboardStep(Date.now());
    });
    window.addEventListener('blur', () => this.stopKeyboardWalk());
    scene.on('preupdate', () => this.tick());
    scene.on('deactivate', () => {
      this.resetWalk();
      this.quickChat = false;
      this.draft = '';
      this.field.refresh();
    });
    scene.add(this.actor);
  }

  private interactive(): boolean {
    return this.actions.active() && !this.actions.blocked();
  }
  invalidate(): void {
    this.lastData = 0;
  }
  isChatOpen(): boolean {
    return this.mode === 'chat';
  }

  private tick(): void {
    const active = this.actions.active();
    this.actor.graphics.isVisible = active;
    this.actor.pointer.useColliderShape = active;
    if (!active) return;
    const now = Date.now();
    if (now - this.lastData >= 150) {
      this.snapshot = this.actions.snapshot();
      this.lastData = now;
    }
    if (this.snapshot.code !== this.code) {
      this.resetWalk();
      this.code = this.snapshot.code;
      this.selected = '';
      this.destination = undefined;
      this.mode = 'floor';
      this.quickChat = false;
      this.rankOffset = 0;
      this.tableOffset = 0;
      this.error = '';
      this.draft = '';
      refreshCanvasTextFields();
    }
    if (
      this.selected &&
      !this.snapshot.tables.some((table) => table.id === this.selected)
    ) {
      this.selected = '';
      this.destination = undefined;
      this.error = 'That table closed';
    }
    if (!this.interactive() || this.quickChat || this.mode !== 'floor') {
      this.stopKeyboardWalk();
    } else {
      this.keyboardStep(now);
    }
    if (!this.walkAwaiting && !this.walkingDirection && this.localWalk) {
      const predicted = position(this.localWalk, now, this.reducedMotion);
      const settled = position(this.selfRow(), now, this.reducedMotion);
      if (!predicted.walked && !settled.walked) {
        this.localWalk = undefined;
        this.correction = {
          x: predicted.x - settled.x,
          y: predicted.y - settled.y,
          started: now,
        };
      }
    }
    if (this.seatTarget >= 0 && !this.walkAwaiting && !this.self().walked) {
      const current = position(this.selfRow(), now, this.reducedMotion);
      if (current.walked) return;
      const seat = this.seatTarget;
      this.seatTarget = -1;
      const point = LOUNGE_CHAIRS[seat];
      if (current.x === point.x && current.y === point.y)
        void this.move(point, seat);
    }
  }
  private self(now = Date.now()) {
    const pose = position(
      this.localWalk ?? this.selfRow(),
      now,
      this.reducedMotion,
    );
    const offset = this.correction;
    if (!offset || this.reducedMotion) return pose;
    const weight = Math.max(0, 1 - (now - offset.started) / FLOOR_STEP_MS);
    return {
      ...pose,
      x: pose.x + offset.x * weight,
      y: pose.y + offset.y * weight,
    };
  }
  private selfRow() {
    return this.snapshot.positions.find((row) => row.id === this.snapshot.self);
  }
  private avatarPosition(row: FloorPosition | undefined, now: number) {
    if (row?.id === this.snapshot.self) return this.self(now);
    return position(row, now - REMOTE_RENDER_DELAY_MS, this.reducedMotion);
  }
  private get mapWidth() {
    return isMobileDevice() ? W : 672;
  }
  private get rows() {
    return Math.max(
      floorRows(
        Math.max(0, ...this.snapshot.tables.map((table) => table.slot + 1)),
      ),
      floorRowsAt(this.self().y),
    );
  }
  private get tableSlots(): ReadonlySet<number> {
    return new Set(this.snapshot.tables.map((table) => table.slot));
  }
  private get mapScale() {
    return Math.max(1, this.mapWidth / WIDTH);
  }
  private move(to: FloorPoint, chair = -1): void {
    this.walkingKeys.clear();
    this.walkingDirection = undefined;
    if (chair === -1) {
      this.predictWalk(Date.now(), (from) =>
        floorPath(from, to, this.rows, this.tableSlots),
      );
      this.destination = to;
    }
    this.sendWalk(this.actions.move(to, chair));
  }
  private predictWalk(
    now: number,
    next: (point: FloorPoint) => FloorPoint[],
  ): void {
    const start = this.localWalk ?? this.selfRow();
    if (!start) return;
    this.correction = undefined;
    this.localWalk = {
      ...start,
      ...redirectFloorWalk(start, now, next),
      chair: -1,
    };
  }
  private sendWalk(request: Promise<void>): void {
    const revision = ++this.walkRequest;
    this.walkAwaiting = true;
    this.error = '';
    void request
      .catch((error: unknown) => {
        if (revision !== this.walkRequest) return;
        this.walkingKeys.clear();
        this.walkingDirection = undefined;
        this.predictWalk(Date.now(), () => []);
        this.destination = undefined;
        this.error =
          error instanceof Error ? error.message : 'Could not walk there';
      })
      .finally(() => {
        if (revision !== this.walkRequest) return;
        this.snapshot = this.actions.snapshot();
        this.lastData = Date.now();
        this.walkAwaiting = false;
      });
  }
  private selectTable(table: FloorTable): void {
    this.selected = table.id;
    this.reception = false;
    this.focusPlayer = '';
    this.seatTarget = -1;
    this.move(tableEntrance(table.slot));
  }
  private tableDistance(table: FloorTable): number {
    const { x, y } = this.self();
    const entrance = tableEntrance(table.slot);
    return Math.abs(entrance.x - x) + Math.abs(entrance.y - y);
  }
  private nearTable(table: FloorTable): boolean {
    return this.tableDistance(table) <= 2;
  }
  private walkToTable(table: FloorTable): void {
    this.changeMode('floor');
    this.selectTable(table);
  }
  private changeMode(mode: CasinoFloor['mode']): void {
    this.stopKeyboardWalk();
    this.mode = mode;
    this.quickChat = false;
    this.chatOffset = 0;
    if (mode === 'chat') this.actions.readChat();
    refreshCanvasTextFields();
  }
  private key(event: KeyboardEvent): void {
    if (!this.interactive() || event.metaKey || event.ctrlKey || event.altKey)
      return;
    if (event.key === 'Escape' && (this.quickChat || this.mode !== 'floor')) {
      this.changeMode('floor');
      event.preventDefault();
      return;
    }
    if (
      (event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable]',
      )
    )
      return;
    if (event.key === '/' && !isMobileDevice() && this.mode !== 'chat') {
      this.quickChat = true;
      event.preventDefault();
      refreshCanvasTextFields();
      this.field.focus();
      return;
    }
    if (this.mode !== 'floor' || this.quickChat) return;
    if (!WALK_DIRECTIONS[event.code]) return;
    event.preventDefault();
    if (event.repeat) return;
    this.walkingKeys.add(event.code);
    this.seatTarget = -1;
    this.destination = undefined;
    this.keyboardStep(Date.now());
  }
  private stopKeyboardWalk(): void {
    this.walkingKeys.clear();
    if (this.walkingDirection) this.keyboardStep(Date.now());
  }
  private resetWalk(): void {
    this.walkingKeys.clear();
    this.walkingDirection = undefined;
    this.localWalk = undefined;
    this.correction = undefined;
    this.walkRequest += 1;
    this.walkAwaiting = false;
  }
  private keyboardStep(now: number): void {
    const key = [...this.walkingKeys].at(-1);
    const direction = key ? WALK_DIRECTIONS[key] : undefined;
    if (!direction) {
      if (!this.walkingDirection) return;
      this.walkingDirection = undefined;
      this.predictWalk(now, () => []);
      this.sendWalk(this.actions.steer({ x: 0, y: 0 }));
      return;
    }
    if (direction !== this.walkingDirection) {
      this.predictWalk(now, (from) =>
        floorDirectionPath(
          from,
          direction,
          this.rows,
          this.tableSlots,
          Math.max(FLOOR_COLUMNS, this.rows),
        ),
      );
      this.walkingDirection = direction;
    } else {
      if (now - this.lastSteer < KEYBOARD_INTERVAL_MS) return;
      if (
        !this.self(now).walked &&
        !position(this.selfRow(), now, this.reducedMotion).walked
      )
        return;
    }
    this.lastSteer = now;
    this.sendWalk(this.actions.steer(direction));
  }
  private async send(): Promise<void> {
    const body = this.draft.trim();
    if (!body || this.busy) return;
    this.busy = true;
    try {
      await this.actions.send(body);
      this.draft = '';
      this.field.sync();
      if (this.quickChat) this.changeMode('floor');
      this.invalidate();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Message could not be sent';
    } finally {
      this.busy = false;
    }
  }
  private scroll(x: number, y: number, steps: number): void {
    if (y < TOP || y >= BOTTOM) return;
    if (this.mode === 'chat')
      this.chatOffset = Math.max(
        0,
        Math.min(
          (this.chatLayout?.lines.length ?? 0) - 11,
          this.chatOffset - steps,
        ),
      );
    else if (this.mode === 'tables' && x < this.mapWidth)
      this.tableOffset = Math.max(
        0,
        Math.min(this.snapshot.tables.length - 5, this.tableOffset + steps),
      );
    else if (this.mode === 'ranks' || x >= this.mapWidth)
      this.rankOffset = Math.max(
        0,
        Math.min(this.snapshot.ranks.length - 7, this.rankOffset + steps),
      );
  }
  private hit(x: number, y: number): void {
    for (const row of [...this.hits].reverse()) {
      if (x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h) {
        row.action();
        return;
      }
    }
    if (
      this.mode !== 'floor' ||
      x >= this.mapWidth ||
      y < TOP ||
      y >= BOTTOM ||
      this.quickChat
    )
      return;
    const to = {
      x: Math.floor((x / this.mapScale + this.camera.x) / TILE),
      y: Math.floor(((y - TOP) / this.mapScale + this.camera.y) / TILE),
    };
    if (!walkable(to, this.rows, this.tableSlots)) return;
    this.seatTarget = -1;
    this.focusPlayer = '';
    this.reception = false;
    void this.move(to);
  }
  private button(
    g: CanvasRenderingContext2D,
    rect: Box,
    text: string,
    action: () => void,
    tone: 'quiet' | 'gold' | 'red' = 'quiet',
  ): void {
    const fill =
      tone === 'gold' ? ink.gold : tone === 'red' ? ink.red : '#164332';
    box(g, rect, fill, tone === 'quiet' ? '#68806b' : ink.gold);
    g.textAlign = 'center';
    label(
      g,
      text,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      17,
      tone === 'gold' ? ink.dark : ink.cream,
      rect.w - 8,
    );
    g.textAlign = 'left';
    this.hits.push({ ...rect, action });
  }
  private draw(g: CanvasRenderingContext2D): void {
    g.imageSmoothingEnabled = false;
    this.hits = [];
    box(g, { x: 0, y: 0, w: W, h: H }, ink.dark);
    const now = Date.now();
    if (this.mode === 'floor') this.drawMap(g, now);
    if (this.mode === 'tables') this.drawTables(g);
    if (this.mode === 'chat') this.drawChat(g);
    else if (this.mode === 'ranks' || !isMobileDevice()) this.drawRanks(g);
    this.drawHeader(g);
    if (this.mode !== 'chat') this.drawFooter(g);
    if (this.mode === 'chat' || this.quickChat) this.drawComposer(g);
    const notice = this.error || this.snapshot.notice;
    if (notice) {
      box(
        g,
        { x: 16, y: BOTTOM - 31, w: Math.min(this.mapWidth - 32, 625), h: 27 },
        '#40221f',
        '#b87657',
      );
      label(
        g,
        notice,
        26,
        BOTTOM - 17,
        16,
        '#ffe9c1',
        Math.min(this.mapWidth - 52, 605),
      );
    }
  }
  private drawHeader(g: CanvasRenderingContext2D): void {
    box(g, { x: 0, y: 0, w: W, h: TOP }, '#0b2e23');
    g.fillStyle = ink.gold;
    g.fillRect(0, TOP - 2, W, 2);
    label(g, 'CARD HOUSE', 16, 25, 20, ink.gold, 210, true);
    label(g, this.snapshot.code, 225, 25, 18, ink.cream, 80);
    this.button(g, { x: 308, y: 8, w: 72, h: 31 }, 'Floor', () =>
      this.changeMode('floor'),
    );
    this.button(g, { x: 388, y: 8, w: 82, h: 31 }, 'Tables', () =>
      this.changeMode('tables'),
    );
    this.button(g, { x: 478, y: 8, w: 94, h: 31 }, 'Rankings', () =>
      this.changeMode('ranks'),
    );
    this.button(
      g,
      { x: 580, y: 8, w: 102, h: 31 },
      this.mode === 'chat'
        ? 'Close chat'
        : `Chat${this.snapshot.unread ? ` (${this.snapshot.unread})` : ''}`,
      () => this.changeMode(this.mode === 'chat' ? 'floor' : 'chat'),
    );
    this.button(
      g,
      { x: 690, y: 8, w: 128, h: 31 },
      'Create Table',
      () => this.actions.create(),
      'gold',
    );
    this.button(
      g,
      { x: 826, y: 8, w: 120, h: 31 },
      'Leave Room',
      () => this.actions.leave(),
      'red',
    );
  }
  private drawMap(g: CanvasRenderingContext2D, now: number): void {
    const width = this.mapWidth,
      height = BOTTOM - TOP;
    const walkToGames = () => {
      this.focusPlayer = '';
      this.reception = false;
      this.seatTarget = -1;
      void this.move({ x: 10, y: LOBBY_ROWS + 2 });
    };
    const scale = this.mapScale;
    const viewWidth = width / scale,
      viewHeight = height / scale;
    const self = this.self();
    const targetX = Math.max(
      0,
      Math.min(WIDTH - viewWidth, (self.x + 0.5) * TILE - viewWidth / 2),
    );
    const targetY = Math.max(
      0,
      Math.min(
        this.rows * TILE - viewHeight,
        (self.y + 0.5) * TILE - viewHeight / 2,
      ),
    );
    const ease = this.reducedMotion ? 1 : 0.26;
    this.camera.x += (targetX - this.camera.x) * ease;
    this.camera.y += (targetY - this.camera.y) * ease;
    g.save();
    g.beginPath();
    g.rect(0, TOP, width, height);
    g.clip();
    g.translate(
      -Math.round(this.camera.x * scale),
      TOP - Math.round(this.camera.y * scale),
    );
    g.scale(scale, scale);
    const start = Math.max(0, Math.floor(this.camera.y / TILE));
    const end = Math.min(this.rows, start + Math.ceil(viewHeight / TILE) + 2);
    for (let y = start; y < end; y += 1)
      for (let x = 0; x < FLOOR_COLUMNS; x += 1) {
        const hall =
          (x >= 12 && x <= 19 && y < LOBBY_ROWS) ||
          (y >= LOBBY_ROWS &&
            (x === 1 || x === 30 || (y - LOBBY_ROWS) % 8 < 2));
        const offset = (x * 31 + y * 19) % 5;
        g.fillStyle = hall
          ? ['#703840', '#763c43'][offset % 2]
          : ['#214d3b', '#25523d', '#244e39'][offset % 3];
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
        g.fillStyle = hall ? '#b9755044' : '#101f1b50';
        g.fillRect(x * TILE, y * TILE, TILE, 1);
        g.fillRect(x * TILE, y * TILE + (y % 2) * 8, 1, TILE - (y % 2) * 8);
        if (offset < 2) g.fillRect(x * TILE + 13, y * TILE + 10, 2, 2);
      }
    woodPanel(g, 0, start * TILE, 17, (end - start) * TILE + 12);
    woodPanel(g, WIDTH - 18, start * TILE, 18, (end - start) * TILE + 12);
    if (start < LOBBY_ROWS) {
      casinoRug(g, 287, 34, 194, 375, '#6f303b');
      casinoRug(g, 37, 62, 231, 98, '#284c3a');
      woodPanel(g, 18, 0, WIDTH - 36, 42);
      for (const x of [55, 266, 474, 682]) {
        box(g, { x, y: 3, w: 57, h: 33 }, '#5d3925', '#b57b4e');
        box(g, { x: x + 7, y: 7, w: 43, h: 24 }, '#132b38', '#b4864f');
        g.fillStyle = '#46718a';
        g.fillRect(x + 11, 9, 14, 8);
        g.fillRect(x + 29, 9, 16, 8);
        g.fillStyle = '#b18655';
        g.fillRect(x + 27, 7, 2, 24);
        g.fillRect(x + 7, 18, 43, 2);
      }
      floorPlant(g, 54, 146);
      floorPlant(g, 248, 146);
      floorPlant(g, 536, 310);
      floorPlant(g, 701, 86);
      suitStatue(g, 212, 281, true);
      woodPanel(g, 70, 75, 170, 64);
      label(g, 'RECEPTION', 89, 107, 13, ink.gold, 150, true);
      avatarSprite(g, 126, 49, 2, { ...DEFAULT_AVATAR, outfit: 1 });
      this.mapHit(70, 58, 170, 85, () => {
        this.selected = '';
        this.focusPlayer = '';
        this.reception = true;
        this.seatTarget = -1;
        void this.move(RECEPTION);
      });
      casinoRug(g, 491, 96, 238, 205, '#6b2f3c');
      woodPanel(g, 523, 177, 174, 42);
      label(g, 'THE LOUNGE', 541, 196, 14, ink.gold, 146, true);
      for (const [i, chair] of LOUNGE_CHAIRS.entries()) {
        const x = (chair.x + 0.5) * TILE,
          y = (chair.y + 0.5) * TILE;
        casinoChair(g, x, y);
        this.mapHit(x - 13, y - 13, 26, 26, () => {
          this.reception = false;
          this.focusPlayer = '';
          this.selected = '';
          this.seatTarget = i;
          void this.move(chair);
        });
      }
      suitStatue(g, 60, 298, false);
      suitStatue(g, 708, 320, true);
      const glow = this.reducedMotion
        ? 0.18
        : 0.16 + Math.sin(now / 450) * 0.04;
      for (const [x, y] of [
        [42, 48],
        [260, 70],
        [472, 90],
        [733, 73],
        [463, 281],
      ])
        floorLamp(g, x, y, glow);
      if (!isMobileDevice()) {
        box(g, { x: 286, y: 316, w: 195, h: 40 }, '#183831', ink.gold);
        label(g, 'Gaming floor ↓', 310, 338, 21, ink.gold);
        this.mapHit(286, 316, 195, 40, walkToGames);
      }
    }
    const firstWing = Math.max(0, Math.floor((start - LOBBY_ROWS) / WING_ROWS));
    const lastWing = Math.floor((end - LOBBY_ROWS) / WING_ROWS);
    for (let wing = firstWing; wing <= lastWing; wing += 1) {
      const y = (LOBBY_ROWS + wing * WING_ROWS) * TILE;
      casinoRug(g, 24, y + 1, 719, 28, '#6f303b');
      label(
        g,
        wingNames[wing] ?? 'Gaming wing',
        46,
        y + 15,
        16,
        ink.gold,
        420,
        true,
      );
      suitStatue(g, 695, y + 22, wing % 2 === 0);
      floorPlant(g, 38, y + 176);
      floorPlant(g, 728, y + 284);
    }
    for (const table of this.snapshot.tables)
      this.drawMapTable(g, table, start, end);
    const route = this.localWalk ?? this.selfRow();
    if (route && self.walked && this.destination) {
      const index = Math.max(
        0,
        Math.floor((now - route.started) / FLOOR_STEP_MS),
      );
      g.beginPath();
      g.moveTo((self.x + 0.5) * TILE, (self.y + 0.5) * TILE);
      for (const point of route.path.slice(index))
        g.lineTo((point.x + 0.5) * TILE, (point.y + 0.5) * TILE);
      g.setLineDash([5, 6]);
      g.strokeStyle = '#efd180bb';
      g.lineWidth = 3;
      g.stroke();
      g.setLineDash([]);
    }
    const mapPlayers = this.snapshot.players.filter(
      (player) => player.connected && !player.tableId,
    );
    const bubbleByPlayer = new Map<string, FloorChat>();
    for (const line of this.snapshot.chat.slice(-60))
      if (now - line.at < 6500 && line.memberId)
        bubbleByPlayer.set(line.memberId, line);
    const drawnPlayers = mapPlayers
      .map((player) => {
        const row = this.snapshot.positions.find(
          (point) => point.id === player.id,
        );
        return { player, row, pose: this.avatarPosition(row, now) };
      })
      .filter(({ pose }) => pose.y >= start - 2 && pose.y <= end + 1)
      .sort((a, b) => a.pose.y - b.pose.y);
    const useNames = drawnPlayers.length <= 10;
    const placards = this.snapshot.tables.map((table) =>
      floorTable(table.slot),
    );
    for (const { player, pose, row } of drawnPlayers) {
      const x = (pose.x + 0.5) * TILE,
        y = (pose.y + 0.5) * TILE;
      const me = player.id === this.snapshot.self;
      avatarSprite(
        g,
        x - 16,
        y - 35,
        2,
        player.avatar,
        pose.direction,
        pose.frame,
        ((me ? (this.localWalk ?? row) : row)?.chair ?? -1) >= 0,
      );
      if (player.speaking) {
        box(g, { x: x + 13, y: y - 36, w: 28, h: 18 }, '#143e2f', '#9cd9af');
        label(g, '•••', x + 16, y - 27, 14, '#b8efbd', 24);
      } else if (player.voice) label(g, '♫', x + 15, y - 30, 16, '#a9c9af');
      const bubble = bubbleByPlayer.get(player.id);
      if (bubble) {
        const left = Math.min(x, this.camera.x + viewWidth - 148);
        box(g, { x: left - 6, y: y - 63, w: 146, h: 23 }, '#f5dca4', '#573624');
        label(g, bubble.body, left, y - 51, 15, '#32251e', 134);
      }
      const overlapsSign = placards.some(
        (table) =>
          Math.abs(pose.x - table.x) < 6 &&
          pose.y >= table.y - 5 &&
          pose.y <= table.y - 2,
      );
      if (!overlapsSign && (me || useNames || player.id === this.focusPlayer)) {
        box(g, { x: x - 72, y: y + 11, w: 144, h: 20 }, '#112d25e6');
        g.textAlign = 'center';
        label(
          g,
          me ? `${player.name} · You` : player.name,
          x,
          y + 21,
          14,
          ink.cream,
          138,
        );
        g.textAlign = 'left';
      }
      if (!me)
        this.mapHit(x - 16, y - 35, 32, 40, () => {
          this.focusPlayer = player.id;
          this.selected = '';
          this.reception = false;
        });
    }
    if (this.destination && self.walked) {
      const x = (this.destination.x + 0.5) * TILE,
        y = (this.destination.y + 0.5) * TILE;
      box(g, { x: x - 7, y: y - 7, w: 14, h: 14 }, '#f3ca6650', ink.gold);
    }
    g.restore();
    if (isMobileDevice() && self.y < LOBBY_ROWS) {
      this.button(
        g,
        { x: 788, y: 397, w: 152, h: 42 },
        'Gaming floor ↓',
        walkToGames,
      );
    }
  }
  private mapHit(
    x: number,
    y: number,
    w: number,
    h: number,
    action: () => void,
  ): void {
    const scale = this.mapScale;
    const screenX = x * scale - Math.round(this.camera.x * scale);
    const screenY = y * scale + TOP - Math.round(this.camera.y * scale);
    const x0 = Math.max(0, screenX),
      y0 = Math.max(TOP, screenY);
    const x1 = Math.min(this.mapWidth, screenX + w * scale),
      y1 = Math.min(BOTTOM, screenY + h * scale);
    if (x0 < x1 && y0 < y1)
      this.hits.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, action });
  }
  private drawMapTable(
    g: CanvasRenderingContext2D,
    table: FloorTable,
    start: number,
    end: number,
  ): void {
    const point = floorTable(table.slot);
    if (point.y < start - 3 || point.y > end + 3) return;
    const x = (point.x + 0.5) * TILE,
      y = (point.y + 0.5) * TILE;
    casinoRug(g, x - 79, y - 50, 158, 102, '#244c3c');
    if (table.id === this.selected)
      box(g, { x: x - 71, y: y - 47, w: 142, h: 94 }, '#ffdf6f20', '#f4cf70');
    if (this.tableArt.complete && this.tableArt.naturalWidth)
      g.drawImage(this.tableArt, x - 62, y - 36, 124, 76);
    else box(g, { x: x - 60, y: y - 30, w: 120, h: 60 }, ink.green, ink.wood);
    for (let index = 0; index < table.capacity; index += 1) {
      const angle = (2 * Math.PI * index) / table.capacity + 0.25;
      const chairX = x + Math.round(53 * Math.cos(angle)),
        chairY = y + Math.round(35 * Math.sin(angle));
      casinoChair(g, chairX, chairY);
      const member = table.seats[index];
      if (member)
        avatarSprite(
          g,
          chairX - 8,
          chairY - 20,
          1,
          member.avatar,
          chairY >= y ? 'up' : 'down',
          0,
          true,
        );
    }
    box(
      g,
      { x: x - 72, y: y - 78, w: 144, h: 35 },
      '#0b2a22',
      table.id === this.selected ? ink.gold : '#8b7450',
    );
    g.textAlign = 'center';
    label(g, table.name, x, y - 66, 16, ink.cream, 135);
    label(
      g,
      `${table.seats.length}/${table.capacity} · ${table.countdown || table.stakes.split(' · ')[0]}`,
      x,
      y - 51,
      12,
      '#efd2a0',
      136,
    );
    g.textAlign = 'left';
    this.mapHit(x - 70, y - 78, 140, 122, () => this.selectTable(table));
  }
  private drawRanks(g: CanvasRenderingContext2D): void {
    const x = this.mode === 'ranks' ? 24 : this.mapWidth + 9;
    const w = W - x - 10;
    box(g, { x, y: TOP + 3, w, h: BOTTOM - TOP - 6 }, '#103527');
    label(g, 'LEADERBOARD', x + 12, 76, 17, ink.gold, w - 26, true);
    label(g, 'Player', x + 15, 105, 15, '#adcab4');
    g.textAlign = 'right';
    label(g, 'Net', x + w - 86, 105, 14, '#adcab4');
    label(g, 'Chips', x + w - 14, 105, 14, '#adcab4');
    g.textAlign = 'left';
    const count = 7;
    const offset = Math.min(
      this.rankOffset,
      Math.max(0, this.snapshot.ranks.length - count),
    );
    this.snapshot.ranks.slice(offset, offset + count).forEach((row, index) => {
      const y = 120 + index * 42;
      const person = this.snapshot.players.find(
        (player) => player.id === row.id,
      );
      const mine = row.id === this.snapshot.self;
      box(
        g,
        { x: x + 4, y, w: w - 12, h: 40 },
        mine ? '#29523e' : index % 2 ? '#123c2b' : '#153c2f',
      );
      label(
        g,
        `${row.rank}`,
        x + 10,
        y + 14,
        14,
        mine ? ink.gold : ink.cream,
        29,
      );
      if (row.crowned) label(g, '♛', x + 32, y + 14, 17, ink.gold);
      const textX = x + (row.crowned ? 51 : 35);
      label(
        g,
        row.name,
        textX,
        y + 13,
        15,
        ink.cream,
        Math.max(28, x + w - 145 - textX),
      );
      label(
        g,
        mine
          ? `You · ${person?.state ?? 'Lobby'}`
          : (person?.state ?? 'Offline'),
        textX,
        y + 30,
        13,
        '#a9c6b0',
        Math.max(28, x + w - 120 - textX),
      );
      g.textAlign = 'right';
      const netColor = row.net.startsWith('+')
        ? '#b7d987'
        : row.net.startsWith('-')
          ? '#ef9884'
          : '#d2c9ac';
      label(
        g,
        row.net,
        x + w - 86,
        y + 17,
        row.net.length > 9 ? 12 : 14,
        netColor,
        70,
      );
      label(
        g,
        row.chips,
        x + w - 14,
        y + 17,
        row.chips.length > 9 ? 12 : 14,
        ink.cream,
        70,
      );
      g.textAlign = 'left';
      this.hits.push({
        x,
        y,
        w: w - 16,
        h: 40,
        action: () => {
          if (!person?.connected) return;
          const table = this.snapshot.tables.find(
            (value) => value.id === person.tableId,
          );
          this.changeMode('floor');
          if (table) this.selectTable(table);
          else {
            this.focusPlayer = person.id;
            this.selected = '';
            this.reception = false;
          }
        },
      });
    });
    if (this.snapshot.ranks.length > count) {
      const track = 286,
        thumb = Math.max(26, (track * count) / this.snapshot.ranks.length);
      box(g, { x: x + w - 6, y: 124, w: 4, h: track }, '#203e30');
      box(
        g,
        {
          x: x + w - 6,
          y:
            124 +
            ((track - thumb) * offset) / (this.snapshot.ranks.length - count),
          w: 4,
          h: thumb,
        },
        '#dbc092',
      );
    }
    label(
      g,
      `Ranked by net winnings · ${this.snapshot.players.filter((p) => p.connected).length} online`,
      x + 11,
      432,
      13,
      '#afc4b0',
      w - 20,
    );
  }
  private drawTables(g: CanvasRenderingContext2D): void {
    label(g, 'TABLES', 22, 80, 22, ink.gold, 300, true);
    const offset = Math.min(
      this.tableOffset,
      Math.max(0, this.snapshot.tables.length - 5),
    );
    if (!this.snapshot.tables.length)
      label(g, 'Create a table to open the gaming floor.', 22, 151, 18);
    this.snapshot.tables.slice(offset, offset + 5).forEach((table, index) => {
      const y = 105 + index * 63;
      const width = this.mapWidth - 36;
      box(
        g,
        { x: 18, y, w: width, h: 57 },
        table.id === this.selected ? '#284d3a' : '#153c30',
        '#776344',
      );
      label(g, table.name, 29, y + 15, 19, ink.cream, width - 213);
      label(
        g,
        `${table.game} · ${table.stakes} · ${table.seats.length}/${table.capacity} · ${table.countdown || table.status}`,
        29,
        y + 39,
        15,
        '#c8d4ba',
        width - 213,
      );
      if (this.nearTable(table)) {
        if (table.returning || table.join)
          this.button(
            g,
            { x: width - 184, y: y + 10, w: 95, h: 37 },
            table.returning ? 'Rejoin' : 'Sit down',
            () => {
              if (this.nearTable(table)) this.actions.join(table.id);
            },
          );
        this.button(
          g,
          { x: width - 80, y: y + 10, w: 87, h: 37 },
          'Watch',
          () => {
            if (this.nearTable(table)) this.actions.watch(table.id);
          },
        );
      } else {
        this.button(
          g,
          { x: width - 108, y: y + 10, w: 115, h: 37 },
          'Walk over',
          () => this.walkToTable(table),
        );
      }
    });
    if (this.snapshot.tables.length > 5)
      label(
        g,
        `${offset + 1}–${Math.min(offset + 5, this.snapshot.tables.length)} of ${this.snapshot.tables.length} · Scroll to browse`,
        22,
        438,
        15,
        '#bfccb6',
      );
  }
  private drawFooter(g: CanvasRenderingContext2D): void {
    box(g, { x: 0, y: BOTTOM, w: W, h: H - BOTTOM }, '#0c3024', '#977b51');
    const me = this.snapshot.players.find(
      (player) => player.id === this.snapshot.self,
    );
    avatarSprite(g, 17, 458, 2, me?.avatar);
    label(g, me?.name ?? 'Guest', 60, 472, 17, ink.cream, 150);
    label(g, `${this.snapshot.chips} chips`, 60, 496, 18, ink.gold, 150);
    label(g, this.snapshot.lifetimeWinnings, 60, 521, 14, ink.cream, 252);
    this.button(g, { x: 214, y: 466, w: 97, h: 34 }, 'Edit avatar', () =>
      this.actions.avatar(),
    );
    const selected = this.snapshot.tables.find(
      (value) => value.id === this.selected,
    );
    const nearby =
      this.mode === 'floor' && !this.focusPlayer && !this.reception
        ? this.snapshot.tables
            .filter((table) => this.nearTable(table))
            .sort((a, b) => this.tableDistance(a) - this.tableDistance(b))[0]
        : undefined;
    const table =
      selected && this.nearTable(selected) ? selected : (nearby ?? selected);
    const friend = this.snapshot.players.find(
      (player) => player.id === this.focusPlayer,
    );
    if (table) {
      label(g, table.name, 330, 474, 21, ink.gold, 410);
      label(
        g,
        `${table.stakes} · ${table.seats.length}/${table.capacity} seated · Host ${table.host}`,
        330,
        508,
        15,
        ink.cream,
        418,
      );
      if (!this.nearTable(table)) {
        this.button(g, { x: 826, y: 473, w: 120, h: 43 }, 'Walk over', () =>
          this.walkToTable(table),
        );
      } else {
        if (table.returning || table.join)
          this.button(
            g,
            { x: 753, y: 473, w: 99, h: 43 },
            table.returning ? 'Rejoin' : 'Sit down',
            () => {
              if (this.nearTable(table)) this.actions.join(table.id);
            },
            'gold',
          );
        this.button(g, { x: 861, y: 473, w: 85, h: 43 }, 'Watch', () => {
          if (this.nearTable(table)) this.actions.watch(table.id);
        });
      }
    } else if (friend) {
      avatarSprite(g, 334, 463, 2, friend.avatar);
      label(g, friend.name, 379, 476, 20, ink.gold, 300);
      label(g, friend.state, 379, 508, 16);
      const target = this.snapshot.positions.find(
        (row) => row.id === friend.id,
      );
      if (target)
        this.button(g, { x: 742, y: 473, w: 109, h: 43 }, 'Walk over', () => {
          const to = position(target, Date.now(), this.reducedMotion);
          void this.move({ x: Math.round(to.x), y: Math.round(to.y) });
        });
    } else {
      label(
        g,
        this.reception
          ? 'Reception'
          : this.snapshot.tier === 'pro'
            ? 'Pro room'
            : 'Casino floor',
        330,
        474,
        22,
        ink.gold,
        330,
      );
      label(
        g,
        this.reception
          ? 'Room wallet · Refill if eligible'
          : isMobileDevice()
            ? 'Tap the floor to walk · Tap a table for details'
            : 'Click to walk · Arrow keys or WASD · / to chat',
        330,
        506,
        15,
        '#c4d3ba',
        510,
      );
      if (this.reception && this.snapshot.roomVoice)
        this.button(g, { x: 720, y: 473, w: 94, h: 43 }, 'Voice', () =>
          window.open(this.snapshot.roomVoice, '_blank', 'noopener,noreferrer'),
        );
      this.button(g, { x: 826, y: 473, w: 120, h: 43 }, 'Refill chips', () =>
        this.actions.refill(),
      );
    }
  }
  private drawChat(g: CanvasRenderingContext2D): void {
    label(g, 'ROOM CHAT', 24, 81, 23, ink.gold, 400, true);
    const history = this.snapshot.chat;
    const key = JSON.stringify(
      history.map((row) => [row.id, row.author, row.body]),
    );
    if (this.chatLayout?.key !== key) {
      const lines = history.flatMap((message) => {
        g.font = "17px 'Chakra Petch', sans-serif";
        const lines: string[] = [];
        let line = '';
        for (const char of message.body) {
          if (g.measureText(line + char).width > 686 && line) {
            const space = line.lastIndexOf(' ');
            if (space > line.length / 2) {
              lines.push(line.slice(0, space));
              line = line.slice(space + 1);
            } else {
              lines.push(line);
              line = '';
            }
          }
          line += char;
        }
        if (line) lines.push(line);
        return lines.map((body, index) => ({
          ...message,
          body,
          author: index === 0 ? message.author : '',
        }));
      });
      this.chatLayout = { key, lines };
    }
    const last = Math.max(0, this.chatLayout.lines.length - this.chatOffset);
    const messages = this.chatLayout.lines.slice(Math.max(0, last - 11), last);
    if (!messages.length) label(g, 'Say something to the room.', 24, 126);
    for (const [index, message] of messages.entries()) {
      const y = 111 + index * 29;
      box(
        g,
        { x: 18, y: y - 9, w: 924, h: 27 },
        index % 2 ? '#12382a' : '#153d2d',
      );
      label(
        g,
        message.author,
        26,
        y + 4,
        16,
        message.discord ? '#aabaff' : ink.gold,
        197,
      );
      label(g, message.body, 234, y + 4, 17, ink.cream, 694);
    }
    if (this.chatLayout.lines.length > 11)
      label(g, 'Scroll to read earlier messages', 24, 438, 15, '#c8dac4');
  }
  private drawComposer(g: CanvasRenderingContext2D): void {
    this.hits = this.hits.filter((row) => row.y < BOTTOM);
    box(g, { x: 0, y: BOTTOM, w: W, h: H - BOTTOM }, '#123b2e', ink.gold);
    label(
      g,
      this.quickChat
        ? 'Quick chat · Enter to send · Esc to close'
        : 'Message the room',
      22,
      470,
      16,
      '#cae0c8',
    );
    box(g, FIELD, '#0a241b', ink.gold);
    const cursor = this.field.selectionIndex();
    const focused =
      document.activeElement?.getAttribute('data-cardhouse-field') ===
      'casino-chat';
    let start = 0;
    g.font = "18px 'Chakra Petch', sans-serif";
    while (g.measureText(this.draft.slice(start, cursor)).width > FIELD.w - 24)
      start++;
    label(
      g,
      this.draft.slice(start) || 'Type a message…',
      FIELD.x + 9,
      FIELD.y + FIELD.h / 2,
      18,
      this.draft ? ink.cream : '#9bb4a0',
      FIELD.w - 20,
    );
    if (focused) {
      g.fillStyle = ink.gold;
      g.fillRect(
        FIELD.x + 9 + g.measureText(this.draft.slice(start, cursor)).width,
        FIELD.y + 8,
        2,
        20,
      );
    }
    this.button(
      g,
      { x: 842, y: 486, w: 104, h: 36 },
      this.busy ? 'Sending…' : 'Send',
      () => void this.send(),
      'gold',
    );
  }
}

export function casinoAppearance(
  value: string | undefined,
): CasinoAvatar | undefined {
  return value ? readCasinoAvatar(value) : undefined;
}
