import * as ex from 'excalibur';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  readCasinoAvatar,
  type CasinoAvatar,
} from '../../src/shared/casino-avatar';
import {
  DISCORD_LINK_MESSAGES,
  readDiscordLinkResult,
  type DiscordLinkResult,
} from '../../src/shared/casino-discord-link';
import { discordDisplayUsername } from '../../src/shared/discord-player-name';
import { avatarSprite, CASINO_PALETTE } from './casino-art';
import { classicText } from './classic-table-design';
import { uiText, uiCaption } from './ui-text';
import {
  canvasText,
  makeFieldCaret,
  panelRect,
  showFieldCaret,
} from './canvas-ui';
import { bindButtonPress } from './button-press';
import {
  cardroomBotUrl,
  discordLinkAvailable,
  discordLinkChannel,
  fetchDiscordUsername,
} from './discord-join';
import { getOrCreateClientId } from './client-id';
import { bindCanvasTextField, layoutFieldCaret } from './html-field';
import { applyFieldText, NAME_MAX } from './lobby';
import { rememberLobby } from './last-room';
import {
  customPlayerName,
  readPlayerNamePreference,
  rememberPlayerNamePreference,
} from './preferred-name';
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
  linkResult?: DiscordLinkResult,
): void {
  if (editors.has(scene)) return;
  editors.add(scene);
  const profile = () =>
    connection && [...connection.db.myCasinoProfile.iter()][0];
  const clientId = getOrCreateClientId();
  const lobby =
    connection && lobbyId
      ? [...connection.db.lobby.iter()].find((row) => row.id === lobbyId)
      : undefined;
  const roomMember = () =>
    lobby && !lobby.solo && connection
      ? [...connection.db.lobbyMember.iter()].find(
          (member) =>
            member.lobbyId === lobbyId &&
            member.clientId === clientId &&
            !member.leftRoom,
        )
      : undefined;
  const member = roomMember();
  const preference = readPlayerNamePreference(clientId);
  const linkedId = profile()?.discordUserId;
  const savedDiscord = preference.discord;
  let linkedUsername =
    savedDiscord?.userId === linkedId ? (savedDiscord?.username ?? '') : '';
  let useDiscordUsername = !!linkedUsername;
  let customName =
    preference.customName || customPlayerName(member?.name) || 'Guest';
  const linkedCaption = () =>
    linkedUsername
      ? `Discord · @${linkedUsername}`
      : 'Checking Discord username…';
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
  let linkFlow: string | undefined;
  const linkChannel = discordLinkChannel();
  const linkMessage = (result: DiscordLinkResult): string =>
    result === 'linked'
      ? profile()
        ? linkedCaption()
        : 'Checking Discord link…'
      : DISCORD_LINK_MESSAGES[result];
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
    linkChannel?.close();
    nameField.close();
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
    linkResult
      ? linkMessage(linkResult)
      : profile()
        ? linkedCaption()
        : 'Saved on this browser',
    16,
    ink,
  );
  add(181, 105, 182, status);
  linkChannel?.addEventListener(
    'message',
    (event: MessageEvent<{ result?: unknown; flow?: unknown }>) => {
      const result = readDiscordLinkResult(event.data?.result);
      if (!result || !linkPopup || !linkFlow || event.data.flow !== linkFlow)
        return;
      linkPopup.close();
      linkPopup = null;
      linkFlow = undefined;
      status.text = linkMessage(result);
    },
  );
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
    return actor;
  };
  const refreshAvatarLabels: (() => void)[] = [];
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
    refreshAvatarLabels.push(() => {
      value.text = variants[look[field]];
    });
    button(525, y, 38, '‹', () => cycle(-1));
    button(741, y, 38, '›', () => cycle(1));
  }
  const botUrl = cardroomBotUrl();
  const refreshLinkedCaption = (): void => {
    const id = profile()?.discordUserId;
    if (!id) return;
    if (savedDiscord?.userId === id && !linkedUsername) {
      linkedUsername = savedDiscord.username;
      useDiscordUsername = true;
    }
    status.text = linkedCaption();
    paintNameMode();
    void fetchDiscordUsername(botUrl, id).then((result) => {
      if (closed || profile()?.discordUserId !== id) return;
      const username = discordDisplayUsername(result);
      if (username) {
        linkedUsername = username;
        if (!savedDiscord && member?.name === id) useDiscordUsername = true;
      }
      status.text = linkedUsername
        ? linkedCaption()
        : 'Discord username unavailable';
      paintNameMode();
    });
  };
  let linkButton: ex.Actor | undefined;
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
      if (!ready && (!linkResult || retry))
        status.text = 'Discord linking is unavailable';
      else if (retry) status.text = 'Select Link Discord to continue';
    };
    void check(false);
    linkButton = button(181, 434, 212, 'Link Discord', () => {
      if (busy || profile() || (linkPopup && !linkPopup.closed)) return;
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
      const flow = crypto.randomUUID().replaceAll('-', '');
      linkFlow = flow;
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
        url.searchParams.set('flow', flow);
        popup.location.href = url.toString();
        status.text = 'Finish linking in Discord';
      })().catch(() => {
        popup.close();
        if (!closed) status.text = 'Could not start Discord linking';
      });
    });
  }
  const refreshProfile = () => {
    const row = profile();
    if (!row) return;
    refreshLinkedCaption();
    linkButton?.kill();
    const saved = readCasinoAvatar(row.avatar);
    if (busy) return;
    if (saved) {
      Object.assign(look, saved);
      localStorage.setItem(AVATAR_STORAGE, JSON.stringify(saved));
      refreshAvatarLabels.forEach((refresh) => refresh());
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
  const save = () => {
    if (busy) return;
    const discordUserId = profile()?.discordUserId;
    const discord =
      useDiscordUsername && discordUserId && linkedUsername
        ? { userId: discordUserId, username: linkedUsername }
        : undefined;
    const name = discord?.username ?? customPlayerName(customName);
    if (!name) {
      status.text = 'Enter a display name';
      return;
    }
    const avatar = JSON.stringify(look);
    const namePreference = { customName, discord };
    busy = true;
    void (async () => {
      await connection?.reducers.saveCasinoAvatar({ lobbyId, avatar });
      if (
        connection &&
        lobby &&
        member &&
        name &&
        name !== roomMember()?.name
      ) {
        await connection.reducers.joinLobby({
          lobbyCode: lobby.code,
          clientId,
          name,
        });
        rememberLobby(lobby.code, name);
      }
    })()
      .then(() => {
        rememberPlayerNamePreference(clientId, namePreference);
        localStorage.setItem(AVATAR_STORAGE, avatar);
        close();
      })
      .catch((error) => {
        status.text =
          error instanceof Error ? error.message : 'Avatar could not be saved';
        busy = false;
      });
  };
  add(181, 389, 182, uiText('Display name', 17, ink));
  const box = { x: 294, y: 382, w: 244, h: 34 };
  const face = add(box.x, box.y, 182, panelRect(box.w, box.h, dark, gold));
  const custom = canvasText(customName, 10, ink);
  const customActor = add(box.x + 10, box.y + 12, 183, custom);
  const usernameText = uiText('', 16, ink);
  const usernameActor = add(box.x + 10, box.y + 8, 183, usernameText);
  const caret = makeFieldCaret(10, 185);
  scene.add(caret);
  actors.push(caret);
  let focused = false;
  const paintName = (index = customName.length) => {
    const layout = layoutFieldCaret({
      value: customName,
      index,
      originX: box.x + 10,
      originY: box.y + 12,
      size: 10,
      columns: NAME_MAX,
    });
    custom.text = layout.text;
    showFieldCaret(caret, focused && !useDiscordUsername, layout.x, layout.y);
  };
  const nameField = bindCanvasTextField({
    id: 'casino-display-name',
    label: 'Display name',
    box,
    maxLength: NAME_MAX,
    active: () => !closed && !useDiscordUsername,
    read: () => customName,
    sanitize: (value) => applyFieldText(value, NAME_MAX),
    write: (value) => {
      customName = value;
      paintName();
    },
    onCaret: paintName,
    onFocus: () => {
      focused = true;
      paintName(nameField.selectionIndex());
    },
    onBlur: () => {
      focused = false;
      paintName();
    },
    submit: save,
    cancel: close,
    metrics: { x: box.x + 10, y: box.y + 12, size: 10, columns: NAME_MAX },
  });
  const checkBox = { x: 551, y: 382, w: 228, h: 34, size: 20 };
  const checkInsetY = (checkBox.h - checkBox.size) / 2;
  const checkFace = panelRect(
    checkBox.size,
    checkBox.size,
    ex.Color.fromHex('#215642'),
    gold,
  );
  const checkbox = add(
    checkBox.x,
    checkBox.y,
    184,
    checkFace,
    checkBox.w,
    checkBox.h,
  );
  checkbox.graphics.offset = ex.vec(0, checkInsetY);
  const tick = new ex.Canvas({
    width: checkBox.size,
    height: checkBox.size,
    draw: (g) => {
      g.strokeStyle = CASINO_PALETTE.cream;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(5, 10);
      g.lineTo(8, 14);
      g.lineTo(15, 6);
      g.stroke();
    },
  });
  tick.origin = ex.vec(0, 0);
  const check = add(checkBox.x, checkBox.y + checkInsetY, 185, tick);
  const checkLabel = add(
    580,
    389,
    182,
    uiText('Use Discord username', 16, ink),
  );
  bindButtonPress(checkbox, undefined, undefined, (event) => {
    event.cancel();
    if (!linkedUsername || busy) return;
    useDiscordUsername = !useDiscordUsername;
    paintNameMode();
    if (!useDiscordUsername) nameField.focus(true);
  });
  face.on('pointerup', () => {
    if (!useDiscordUsername) nameField.focus(true);
  });

  function paintNameMode(): void {
    customActor.graphics.isVisible = !useDiscordUsername;
    usernameActor.graphics.isVisible = useDiscordUsername;
    usernameText.text = linkedUsername;
    usernameActor.scale = ex.vec(
      Math.min(1, (box.w - 20) / Math.max(1, usernameText.width)),
      1,
    );
    const showCheckbox = !!profile()?.discordUserId;
    checkbox.graphics.isVisible = showCheckbox;
    checkLabel.graphics.isVisible = showCheckbox;
    checkLabel.graphics.opacity = linkedUsername ? 1 : 0.55;
    check.graphics.isVisible = showCheckbox && useDiscordUsername;
    nameField.refresh();
    paintName();
  }
  if (profile()) refreshLinkedCaption();
  else paintNameMode();
  button(544, 434, 113, 'Cancel', close);
  button(667, 434, 112, 'Save', save);
}
