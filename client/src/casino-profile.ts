import * as ex from 'excalibur';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  readCasinoAvatar,
  type CasinoAvatar,
} from '../../src/shared/casino-avatar';
import { avatarSprite, CASINO_PALETTE } from './casino-art';
import { classicText } from './classic-table-design';
import { uiText, uiCaption } from './ui-text';
import { panelRect } from './canvas-ui';
import { bindButtonPress } from './button-press';
import { cardroomBotUrl, discordLinkAvailable } from './discord-join';
import type { DbConnection } from './module_bindings';

const AVATAR_STORAGE = 'casinoAvatar';
const avatarControls = [
  ['skin', 'Skin'],
  ['hair', 'Hair'],
  ['hairColor', 'Hair color'],
  ['outfit', 'Outfit'],
  ['color', 'Top color'],
  ['pantsColor', 'Pants & shoes'],
] as const;
export function localCasinoAvatar(): CasinoAvatar {
  try {
    return (
      readCasinoAvatar(localStorage.getItem(AVATAR_STORAGE) ?? '') ??
      DEFAULT_AVATAR
    );
  } catch {
    return DEFAULT_AVATAR;
  }
}

export async function syncCasinoAvatar(
  connection: DbConnection,
  lobbyId: string,
): Promise<void> {
  await connection.reducers.enterCasinoFloor({ lobbyId });
  if (![...connection.db.myCasinoProfile.iter()].length)
    await connection.reducers.saveCasinoAvatar({
      lobbyId,
      avatar: JSON.stringify(localCasinoAvatar()),
    });
}

const editors = new WeakSet<ex.Scene>();
export function casinoAvatarEditorOpen(scene: ex.Scene): boolean {
  return editors.has(scene);
}
export function openCasinoAvatarEditor(
  scene: ex.Scene,
  connection?: DbConnection,
  lobbyId = '',
): void {
  if (editors.has(scene)) return;
  editors.add(scene);
  const profile = () =>
    connection && [...connection.db.myCasinoProfile.iter()][0];
  const look = {
    ...(readCasinoAvatar(profile()?.avatar ?? '') ?? localCasinoAvatar()),
  };
  const actors: ex.Actor[] = [];
  const ink = ex.Color.fromHex(CASINO_PALETTE.cream);
  const gold = ex.Color.fromHex(CASINO_PALETTE.gold);
  const dark = ex.Color.fromHex(CASINO_PALETTE.dark);
  let busy = false;
  let closed = false;
  let linkPopup: Window | null = null;
  const add = (
    x: number,
    y: number,
    z: number,
    graphic: ex.Graphic,
    w = 0,
    h = 0,
  ): ex.Actor => {
    const actor = new ex.Actor({
      name: 'casino-avatar-editor',
      x,
      y,
      z,
      width: w,
      height: h,
      anchor: ex.vec(0, 0),
    });
    actor.graphics.use(graphic);
    scene.add(actor);
    actors.push(actor);
    return actor;
  };
  let detach = () => {};
  const close = () => {
    closed = true;
    linkPopup?.close();
    detach();
    document.removeEventListener('keydown', key);
    scene.off('deactivate', close);
    for (const actor of actors) actor.kill();
    editors.delete(scene);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', key);
  scene.on('deactivate', close);
  const shade = add(
    -240,
    0,
    180,
    panelRect(1440, 540, ex.Color.fromHex('#081a15df'), dark),
    1440,
    540,
  );
  for (const event of ['pointerdown', 'pointerup'] as const)
    shade.on(event, (e) => e.cancel());
  add(148, 48, 181, panelRect(664, 444, dark, gold));
  add(181, 74, 182, classicText('YOUR AVATAR', 24));
  const preview = new ex.Canvas({
    width: 153,
    height: 174,
    cache: false,
    draw: (g) => avatarSprite(g, 18, 4, 7, look),
  });
  preview.origin = ex.vec(0, 0);
  add(186, 165, 182, preview);
  const status = uiText(
    profile() ? 'Discord linked' : 'Saved on this browser',
    16,
    ink,
  );
  add(181, 387, 182, status);
  const button = (
    x: number,
    y: number,
    w: number,
    caption: string,
    action: () => void,
  ) => {
    const actor = add(
      x,
      y,
      184,
      panelRect(w, 34, ex.Color.fromHex('#215642'), gold),
      w,
      34,
    );
    const text = uiText(caption, 17, ink),
      pos = uiCaption(caption, w, 34, 17);
    const child = new ex.Actor({
      x: pos.x,
      y: pos.y,
      z: 1,
      anchor: ex.vec(0, 0),
    });
    child.graphics.use(text);
    actor.addChild(child);
    bindButtonPress(actor, undefined, undefined, (event) => {
      event.cancel();
      action();
    });
  };
  for (const [index, [field, caption]] of avatarControls.entries()) {
    const y = 124 + index * 42;
    add(373, y + 7, 182, uiText(caption, 17, ink));
    const variants = AVATAR_OPTIONS[field];
    const value = uiText(variants[look[field]], 17, ink);
    add(575, y + 7, 182, value);
    const cycle = (delta: number) => {
      look[field] = (look[field] + delta + variants.length) % variants.length;
      value.text = variants[look[field]];
    };
    button(525, y, 38, '‹', () => cycle(-1));
    button(741, y, 38, '›', () => cycle(1));
  }
  const botUrl = cardroomBotUrl();
  if (connection && botUrl && !profile()) {
    let ready = false;
    let checking = false;
    const check = async (retry: boolean) => {
      if (checking) return;
      checking = true;
      if (retry) status.text = 'Checking Discord…';
      ready = await discordLinkAvailable(botUrl);
      checking = false;
      if (closed || profile() || busy) return;
      if (!ready) status.text = 'Discord linking is unavailable';
      else if (retry) status.text = 'Select Link Discord to continue';
    };
    void check(false);
    button(181, 434, 212, 'Link Discord', () => {
      if (busy || profile() || linkPopup) return;
      if (!ready) {
        void check(true);
        return;
      }
      const popup = window.open('', '_blank');
      if (!popup) {
        status.text = 'Allow popups to link Discord';
        return;
      }
      linkPopup = popup;
      popup.opener = null;
      const id = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      void (async () => {
        ready = await discordLinkAvailable(botUrl);
        if (!ready) {
          popup.close();
          if (!closed) status.text = 'Discord linking is unavailable';
          return;
        }
        if (closed || popup.closed) return;
        await connection.reducers.beginCasinoDiscordLink({ id });
        if (closed || popup.closed) return;
        const url = new URL('/casino/discord/link', botUrl);
        url.searchParams.set('challenge', id);
        popup.location.href = url.toString();
        linkPopup = null;
        status.text = 'Finish linking in Discord';
      })()
        .catch(() => {
          popup.close();
          if (!closed) status.text = 'Could not start Discord linking';
        })
        .finally(() => {
          linkPopup = null;
        });
    });
  }
  const refreshProfile = () => {
    const row = profile();
    if (!row) return;
    status.text = 'Discord linked';
    const saved = readCasinoAvatar(row.avatar);
    if (busy) return;
    if (saved) {
      Object.assign(look, saved);
      localStorage.setItem(AVATAR_STORAGE, JSON.stringify(saved));
      close();
    } else if (connection) {
      const persisted = localStorage.getItem(AVATAR_STORAGE);
      if (persisted && readCasinoAvatar(persisted)) {
        void connection.reducers
          .saveCasinoAvatar({ lobbyId, avatar: persisted })
          .catch(() => {
            status.text = 'Linked. Save to sync your avatar.';
          });
      }
    }
  };
  let linked = !!profile();
  const update = () => {
    if (linked || !profile()) return;
    linked = true;
    refreshProfile();
  };
  scene.on('preupdate', update);
  detach = () => scene.off('preupdate', update);
  button(544, 434, 113, 'Cancel', close);
  button(667, 434, 112, 'Save', () => {
    if (busy) return;
    busy = true;
    const avatar = JSON.stringify(look);
    void Promise.resolve(
      connection?.reducers.saveCasinoAvatar({ lobbyId, avatar }),
    )
      .then(() => {
        localStorage.setItem(AVATAR_STORAGE, avatar);
        close();
      })
      .catch((error) => {
        status.text =
          error instanceof Error ? error.message : 'Avatar could not be saved';
        busy = false;
      });
  });
}
