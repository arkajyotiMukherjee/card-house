import type {
  DbConnection,
  EventContext,
} from '../../client/src/module_bindings/index.ts';
import type {
  GameTable,
  Lobby,
} from '../../client/src/module_bindings/types.ts';
import { DiscordHttpError, type DiscordApi } from './discord-http.ts';
import {
  createDiscordLobby,
  type CreateLobbyHooks,
  type CreatedLobby,
  type LobbyConnection,
} from './lobby-client.ts';

const SNOWFLAKE = /^\d{17,20}$/;
const VOICE = 2;

export interface VoiceChannelClient {
  createVoiceChannel(
    guildId: string,
    name: string,
  ): Promise<{ id: string; name: string }>;
  deleteChannel(channelId: string): Promise<void>;
}

export interface AttachedLobbyVoice {
  discordGuildId: string;
  discordLobbyVoiceChannelId: string;
}

export interface VoiceLobbyRow {
  id: string;
  code: string;
  status: { tag: string };
  discordGuildId: string;
  discordLobbyVoiceChannelId: string;
}

export interface VoiceTableRow {
  id: string;
  lobbyId: string;
  gameType: string;
  name: string;
  status: { tag: string };
  discordVoiceChannelId: string;
}

export interface VoiceSnapshot {
  reducers: {
    setLobbyDiscordVoice(args: {
      lobbyCode: string;
      discordGuildId: string;
      discordLobbyVoiceChannelId: string;
    }): Promise<unknown>;
    clearLobbyDiscordVoice(args: { lobbyCode: string }): Promise<unknown>;
    setTableDiscordVoice(args: {
      tableId: string;
      discordVoiceChannelId: string;
    }): Promise<unknown>;
    clearTableDiscordVoice(args: { tableId: string }): Promise<unknown>;
  };
  db: {
    lobby: { iter(): Iterable<VoiceLobbyRow> };
    gameTable: { iter(): Iterable<VoiceTableRow> };
  };
}

export interface VoiceSession {
  onTableInsert(snapshot: VoiceSnapshot, table: VoiceTableRow): Promise<void>;
  onTableUpdate(
    snapshot: VoiceSnapshot,
    previous: VoiceTableRow,
    next: VoiceTableRow,
  ): Promise<void>;
  onTableDelete(table: VoiceTableRow): Promise<void>;
  onLobbyUpdate(
    snapshot: VoiceSnapshot,
    previous: VoiceLobbyRow,
    next: VoiceLobbyRow,
  ): Promise<void>;
  onLobbyDelete(lobby: VoiceLobbyRow): Promise<void>;
  reconcile(snapshot: VoiceSnapshot): Promise<void>;
}

export function lobbyVoiceChannelName(code: string): string {
  return clip(`room-${slug(code)}-voice`);
}

export function tableVoiceChannelName(
  code: string,
  gameType: string,
  tableName: string,
): string {
  const numbered = /#(\d+)\s*$/.exec(tableName.trim());
  const index = numbered?.[1] ?? '1';
  return clip(`${slug(code)}-${slug(gameType)}-${index}`);
}

export function voiceChannelClient(api: DiscordApi): VoiceChannelClient {
  return {
    async createVoiceChannel(
      guildId: string,
      name: string,
    ): Promise<{ id: string; name: string }> {
      const response = await api.request({
        method: 'POST',
        path: `/guilds/${guildId}/channels`,
        body: { name, type: VOICE },
      });
      if (response.status !== 200 && response.status !== 201) {
        throw new DiscordHttpError(response.status);
      }
      return readChannel(response.body);
    },
    async deleteChannel(channelId: string): Promise<void> {
      const response = await api.request({
        method: 'DELETE',
        path: `/channels/${channelId}`,
      });
      if (
        response.status === 200 ||
        response.status === 204 ||
        response.status === 404
      ) {
        return;
      }
      throw new DiscordHttpError(response.status);
    },
  };
}

export async function createDiscordLobbyWithVoice(
  connection: LobbyConnection & VoiceSnapshot,
  discord: VoiceChannelClient | undefined,
  discordChannelId: string,
  guildId: string | undefined,
  publicBase: string,
  hooks?: CreateLobbyHooks,
): Promise<CreatedLobby> {
  const created = await createDiscordLobby(
    connection,
    discordChannelId,
    publicBase,
    hooks,
  );
  if (discord && (guildId?.trim().length ?? 0) > 0) {
    await attachLobbyVoice(connection, discord, created.code, guildId ?? '');
  }
  return created;
}

export async function attachLobbyVoice(
  snapshot: VoiceSnapshot,
  discord: VoiceChannelClient,
  code: string,
  guildId: string,
): Promise<AttachedLobbyVoice | undefined> {
  const guild = guildId.trim();
  if (!SNOWFLAKE.test(guild)) {
    return undefined;
  }
  const name = lobbyVoiceChannelName(code);
  let created: { id: string; name: string };
  try {
    created = await discord.createVoiceChannel(guild, name);
  } catch (error: unknown) {
    skipVoice('Lobby voice channel', error);
    return undefined;
  }
  try {
    await snapshot.reducers.setLobbyDiscordVoice({
      lobbyCode: code,
      discordGuildId: guild,
      discordLobbyVoiceChannelId: created.id,
    });
  } catch (error: unknown) {
    await deleteQuiet(discord, created.id);
    skipVoice('Lobby voice channel', error);
    return undefined;
  }
  return {
    discordGuildId: guild,
    discordLobbyVoiceChannelId: created.id,
  };
}

export function createVoiceSession(discord: VoiceChannelClient): VoiceSession {
  const pending = new Set<string>();
  const orphans = new Set<string>();
  let pausedUntil = 0;

  function noteDiscordFailure(error: unknown): void {
    if (!(error instanceof DiscordHttpError)) {
      return;
    }
    if (error.status !== 401 && error.status !== 403 && error.status !== 429) {
      return;
    }
    const waitMs =
      error.status === 429
        ? Math.max(error.retryAfterMs ?? 5_000, 1_000)
        : 60_000;
    pausedUntil = Date.now() + waitMs;
  }

  function paused(): boolean {
    return Date.now() < pausedUntil;
  }

  async function deleteChannel(channelId: string): Promise<boolean> {
    if (channelId.length === 0) {
      return true;
    }
    if (paused()) {
      orphans.add(channelId);
      return false;
    }
    try {
      await discord.deleteChannel(channelId);
      orphans.delete(channelId);
      return true;
    } catch (error: unknown) {
      orphans.add(channelId);
      noteDiscordFailure(error);
      skipVoice('Voice channel delete', error);
      return false;
    }
  }

  async function ensureTable(
    snapshot: VoiceSnapshot,
    table: VoiceTableRow,
  ): Promise<void> {
    if (
      table.discordVoiceChannelId.length > 0 ||
      isFinished(table.status.tag)
    ) {
      return;
    }
    if (pending.has(table.id) || paused()) {
      return;
    }
    const lobby = findLobby(snapshot, table.lobbyId);
    if (
      !lobby ||
      !isOpen(lobby.status.tag) ||
      lobby.discordGuildId.length === 0
    ) {
      return;
    }
    pending.add(table.id);
    try {
      const created = await discord.createVoiceChannel(
        lobby.discordGuildId,
        tableVoiceChannelName(lobby.code, table.gameType, table.name),
      );
      const latestLobby = findLobby(snapshot, table.lobbyId);
      const latestTable = findTable(snapshot, table.id);
      if (
        !latestLobby ||
        !isOpen(latestLobby.status.tag) ||
        !latestTable ||
        isFinished(latestTable.status.tag)
      ) {
        await deleteChannel(created.id);
        return;
      }
      try {
        await snapshot.reducers.setTableDiscordVoice({
          tableId: table.id,
          discordVoiceChannelId: created.id,
        });
      } catch (error: unknown) {
        await deleteChannel(created.id);
        skipVoice('Table voice channel', error);
      }
    } catch (error: unknown) {
      noteDiscordFailure(error);
      skipVoice('Table voice channel', error);
    } finally {
      pending.delete(table.id);
    }
  }

  async function releaseTable(
    snapshot: VoiceSnapshot,
    table: VoiceTableRow,
  ): Promise<void> {
    if (table.discordVoiceChannelId.length === 0) {
      return;
    }
    const deleted = await deleteChannel(table.discordVoiceChannelId);
    if (!deleted || !findTable(snapshot, table.id)) {
      return;
    }
    try {
      await snapshot.reducers.clearTableDiscordVoice({ tableId: table.id });
    } catch (error: unknown) {
      skipVoice('Table voice clear', error);
    }
  }

  async function releaseLobby(
    snapshot: VoiceSnapshot,
    lobby: VoiceLobbyRow,
  ): Promise<void> {
    for (const table of tablesInLobby(snapshot, lobby.id)) {
      await releaseTable(snapshot, table);
    }
    if (lobby.discordLobbyVoiceChannelId.length === 0) {
      return;
    }
    const deleted = await deleteChannel(lobby.discordLobbyVoiceChannelId);
    if (!deleted) {
      return;
    }
    try {
      await snapshot.reducers.clearLobbyDiscordVoice({ lobbyCode: lobby.code });
    } catch (error: unknown) {
      skipVoice('Lobby voice clear', error);
    }
  }

  let reconciling = false;

  return {
    onTableInsert(
      snapshot: VoiceSnapshot,
      table: VoiceTableRow,
    ): Promise<void> {
      return ensureTable(snapshot, table);
    },
    onTableUpdate(
      snapshot: VoiceSnapshot,
      previous: VoiceTableRow,
      next: VoiceTableRow,
    ): Promise<void> {
      if (!isFinished(previous.status.tag) && isFinished(next.status.tag)) {
        return releaseTable(snapshot, next);
      }
      return Promise.resolve();
    },
    onTableDelete(table: VoiceTableRow): Promise<void> {
      return deleteChannel(table.discordVoiceChannelId).then(() => undefined);
    },
    onLobbyUpdate(
      snapshot: VoiceSnapshot,
      previous: VoiceLobbyRow,
      next: VoiceLobbyRow,
    ): Promise<void> {
      if (!isClosed(previous.status.tag) && isClosed(next.status.tag)) {
        return releaseLobby(snapshot, next);
      }
      return Promise.resolve();
    },
    onLobbyDelete(lobby: VoiceLobbyRow): Promise<void> {
      return deleteChannel(lobby.discordLobbyVoiceChannelId).then(
        () => undefined,
      );
    },
    async reconcile(snapshot: VoiceSnapshot): Promise<void> {
      if (reconciling || paused()) {
        return;
      }
      reconciling = true;
      try {
        for (const channelId of [...orphans]) {
          await deleteChannel(channelId);
        }
        for (const lobby of snapshot.db.lobby.iter()) {
          if (isClosed(lobby.status.tag)) {
            await releaseLobby(snapshot, lobby);
          }
        }
        for (const table of snapshot.db.gameTable.iter()) {
          if (isFinished(table.status.tag)) {
            await releaseTable(snapshot, table);
          } else {
            await ensureTable(snapshot, table);
          }
        }
      } finally {
        reconciling = false;
      }
    },
  };
}

export function attachVoiceWatch(
  connection: DbConnection,
  discord: VoiceChannelClient,
): () => void {
  const session = createVoiceSession(discord);
  const onInsert = (_ctx: EventContext, row: GameTable): void => {
    void session.onTableInsert(connection, row);
  };
  const onUpdate = (
    _ctx: EventContext,
    previous: GameTable,
    row: GameTable,
  ): void => {
    void session.onTableUpdate(connection, previous, row);
  };
  const onDelete = (_ctx: EventContext, row: GameTable): void => {
    void session.onTableDelete(row);
  };
  const onLobby = (_ctx: EventContext, previous: Lobby, row: Lobby): void => {
    void session.onLobbyUpdate(connection, previous, row);
  };
  const onLobbyDelete = (_ctx: EventContext, row: Lobby): void => {
    void session.onLobbyDelete(row);
  };
  connection.db.gameTable.onInsert(onInsert);
  connection.db.gameTable.onUpdate(onUpdate);
  connection.db.gameTable.onDelete(onDelete);
  connection.db.lobby.onUpdate(onLobby);
  connection.db.lobby.onDelete(onLobbyDelete);
  void session.reconcile(connection);
  const timer = setInterval(() => {
    void session.reconcile(connection);
  }, 5_000);
  return () => {
    clearInterval(timer);
    connection.db.gameTable.removeOnInsert(onInsert);
    connection.db.gameTable.removeOnUpdate(onUpdate);
    connection.db.gameTable.removeOnDelete(onDelete);
    connection.db.lobby.removeOnUpdate(onLobby);
    connection.db.lobby.removeOnDelete(onLobbyDelete);
  };
}

function findLobby(
  snapshot: VoiceSnapshot,
  lobbyId: string,
): VoiceLobbyRow | undefined {
  for (const lobby of snapshot.db.lobby.iter()) {
    if (lobby.id === lobbyId) {
      return lobby;
    }
  }
  return undefined;
}

function findTable(
  snapshot: VoiceSnapshot,
  tableId: string,
): VoiceTableRow | undefined {
  for (const table of snapshot.db.gameTable.iter()) {
    if (table.id === tableId) {
      return table;
    }
  }
  return undefined;
}

function tablesInLobby(
  snapshot: VoiceSnapshot,
  lobbyId: string,
): VoiceTableRow[] {
  const rows: VoiceTableRow[] = [];
  for (const table of snapshot.db.gameTable.iter()) {
    if (table.lobbyId === lobbyId) {
      rows.push(table);
    }
  }
  return rows;
}

function normalizeTag(tag: string): string {
  const snake = tag
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, '');
  return snake;
}

function isOpen(tag: string): boolean {
  return normalizeTag(tag) === 'open';
}

function isClosed(tag: string): boolean {
  return normalizeTag(tag) === 'closed';
}

function isFinished(tag: string): boolean {
  return normalizeTag(tag) === 'finished';
}

function readChannel(body: unknown): { id: string; name: string } {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    !SNOWFLAKE.test(body.id)
  ) {
    throw new DiscordHttpError(502);
  }
  const name = typeof body.name === 'string' ? body.name : '';
  return { id: body.id, name };
}

async function deleteQuiet(
  discord: VoiceChannelClient,
  channelId: string,
): Promise<void> {
  try {
    await discord.deleteChannel(channelId);
  } catch (error: unknown) {
    skipVoice('Voice channel delete', error);
  }
}

function skipVoice(scope: string, error: unknown): void {
  const message =
    error instanceof Error ? error.message : 'Discord voice request failed';
  console.error(`${scope} skipped: ${message}`);
}

function slug(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'x';
}

function clip(name: string): string {
  return name.length > 100 ? name.slice(0, 100) : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
