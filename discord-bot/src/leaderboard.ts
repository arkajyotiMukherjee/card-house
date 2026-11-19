import { publicPlayerName } from '../../src/shared/discord-player-name.ts';
import { createHash } from 'node:crypto';
import { formatCoins } from '../../src/shared/economy.ts';
import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import { DiscordHttpError, type DiscordApi } from './discord-http.ts';

interface Wallet {
  id: string;
  name: string;
  available: bigint;
  profit: bigint;
  committed?: bigint;
}
function safeName(value: string): string {
  return value.replace(/[\r\n@`*_~|<>]/g, '').slice(0, 24) || 'Player';
}
export function leaderboardContent(
  code: string,
  wallets: readonly Wallet[],
  page = 1,
): string {
  const rows = [...wallets].sort((a, b) =>
    a.profit === b.profit
      ? a.id.localeCompare(b.id)
      : a.profit > b.profit
        ? -1
        : 1,
  );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const selected = Math.min(pages, Math.max(1, Math.floor(page)));
  const lines = rows.slice((selected - 1) * 10, selected * 10).map((row) => {
    const rank = rows.findIndex((wallet) => wallet.profit === row.profit) + 1;
    return `${rank}. ${safeName(publicPlayerName(row.name))} — ${row.profit > 0n ? '+' : ''}${formatCoins(row.profit)} net · ${formatCoins(row.available + (row.committed ?? 0n))} total (${formatCoins(row.available)} available)`;
  });
  return `**Room ${code} leaderboard**\nRanked by net winnings; grants and refills excluded.\n${lines.join('\n') || 'No players yet.'}\nPage ${selected}/${pages} · /cardhouse leaderboard${pages > 1 ? ' page:<number>' : ''}`;
}

function roomWallets(connection: DbConnection, lobbyId: string): Wallet[] {
  return [...connection.db.roomWallet.iter()]
    .filter((row) => row.lobbyId === lobbyId)
    .map((wallet) => ({
      ...wallet,
      committed: [...connection.db.tableFunding.iter()]
        .filter((row) => row.walletId === wallet.id)
        .reduce((sum, row) => sum + row.units, 0n),
    }));
}

export function readLeaderboard(
  connection: DbConnection,
  channelId: string,
  rawCode = '',
  page = 1,
): string {
  const code = rawCode.trim().toUpperCase();
  const rooms = [...connection.db.lobby.iter()].filter(
    (row) =>
      row.status.tag === 'Open' &&
      row.discordChannelId === channelId &&
      (!code || row.code === code),
  );
  if (rooms.length !== 1)
    throw new Error(
      code
        ? 'Room not found in this channel.'
        : 'Specify a room code when this channel has multiple rooms.',
    );
  const room = rooms[0];
  return leaderboardContent(room.code, roomWallets(connection, room.id), page);
}

/** One coalesced room message. Persist the delivered revision only after Discord accepts it. */
export function attachLeaderboardWatch(
  connection: DbConnection,
  discord: DiscordApi,
  onError: (error: unknown) => void = () => {},
): () => void {
  let stopped = false;
  const busy = new Set<string>();
  const update = async (lobbyId: string): Promise<void> => {
    if (stopped || busy.has(lobbyId)) return;
    const room = connection.db.lobby.id.find(lobbyId);
    if (!room || room.status.tag !== 'Open' || !room.discordChannelId) return;
    const settlements = [...connection.db.gameSettlement.iter()]
      .filter((row) => row.lobbyId === lobbyId)
      .sort((a, b) =>
        a.createdAt.microsSinceUnixEpoch === b.createdAt.microsSinceUnixEpoch
          ? a.id.localeCompare(b.id)
          : a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch
            ? -1
            : 1,
      );
    const revision = settlements.at(-1)?.id;
    if (!revision) return;
    const previous = connection.db.discordLeaderboard.lobbyId.find(lobbyId);
    if (previous?.revision === revision) return;
    busy.add(lobbyId);
    try {
      const marker = `Card House room ${lobbyId}`;
      const content = leaderboardContent(
        room.code,
        roomWallets(connection, lobbyId),
      );
      const body = {
        content,
        embeds: [{ footer: { text: marker } }],
        allowed_mentions: { parse: [] },
      };
      let messageId = previous?.messageId;
      // Recover a POST accepted just before a process crash, before creating another message.
      if (!messageId) {
        const recent = await discord.request({
          method: 'GET',
          path: `/channels/${room.discordChannelId}/messages?limit=100`,
        });
        if (recent.status !== 200) throw new DiscordHttpError(recent.status);
        if (Array.isArray(recent.body)) {
          const message = recent.body.find(
            (value) =>
              value?.author?.bot &&
              value?.embeds?.some(
                (embed: { footer?: { text?: string } }) =>
                  embed.footer?.text === marker,
              ),
          );
          if (typeof message?.id === 'string') messageId = message.id;
        }
      }
      if (messageId) {
        const response = await discord.request({
          method: 'PATCH',
          path: `/channels/${room.discordChannelId}/messages/${messageId}`,
          body,
        });
        if (response.status === 404) messageId = undefined;
        else if (response.status !== 200)
          throw new DiscordHttpError(response.status);
      }
      if (!messageId) {
        const nonce = BigInt(
          `0x${createHash('sha256').update(lobbyId).digest('hex').slice(0, 20)}`,
        ).toString();
        const response = await discord.request({
          method: 'POST',
          path: `/channels/${room.discordChannelId}/messages`,
          body: { ...body, nonce, enforce_nonce: true },
        });
        if (response.status !== 200 && response.status !== 201)
          throw new DiscordHttpError(response.status);
        const message = response.body as { id?: unknown };
        if (typeof message.id !== 'string')
          throw new Error('Discord did not return a message id');
        messageId = message.id;
      }
      await connection.reducers.recordDiscordLeaderboard({
        lobbyId,
        messageId,
        revision,
      });
    } catch (error) {
      onError(error);
    } finally {
      busy.delete(lobbyId);
    }
  };
  const refresh = (): void => {
    for (const room of connection.db.lobby.iter()) void update(room.id);
  };
  connection.db.gameSettlement.onInsert(refresh);
  const timer = setInterval(refresh, 5_000);
  timer.unref();
  refresh();
  return () => {
    stopped = true;
    clearInterval(timer);
    connection.db.gameSettlement.removeOnInsert(refresh);
  };
}
