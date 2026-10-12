import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import { connectLobby } from './lobby-client.ts';

const live = process.env.CARDROOM_LIVE === '1';

test(
  'a web lobby still deals with the bot stopped',
  { skip: live ? false : 'set CARDROOM_LIVE=1 to call the published module' },
  async () => {
    const botUp = await portOpen(8787);
    const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
    const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
    const connection = await connectLobby(host, database);
    await subscribeMembers(connection);
    try {
      const knownIds = new Set(
        [...connection.db.lobby.iter()].map((lobby) => lobby.id),
      );
      await connection.reducers.createLobby({});
      const lobby = await waitFor(
        () =>
          [...connection.db.lobby.iter()].find((row) => !knownIds.has(row.id)),
        'web lobby',
      );
      await connection.reducers.joinLobby({
        lobbyCode: lobby.code,
        clientId: 'web-ada',
        name: 'Ada',
      });
      await connection.reducers.joinLobby({
        lobbyCode: lobby.code,
        clientId: 'web-bea',
        name: 'Bea',
      });
      await connection.reducers.createGameTable({
        lobbyId: lobby.id,
        gameType: 'bluff',
        settings: JSON.stringify({
          name: 'Bluff #1',
          minPlayers: 2,
          maxPlayers: 6,
        }),
      });
      const table = await waitFor(
        () =>
          [...connection.db.gameTable.iter()].find(
            (row) => row.lobbyId === lobby.id,
          ),
        'web table',
      );
      const members = await waitFor(() => {
        const rows = [...connection.db.lobbyMember.iter()].filter(
          (row) => row.lobbyId === lobby.id,
        );
        return rows.length === 2 ? rows : undefined;
      }, 'web members');
      for (const member of members) {
        await connection.reducers.joinTable({
          tableId: table.id,
          lobbyMemberId: member.id,
        });
      }
      const playing = await waitFor(() => {
        const row = [...connection.db.gameTable.iter()].find(
          (item) => item.id === table.id,
        );
        if (!row) {
          return undefined;
        }
        const tag = row.status.tag
          .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
          .replace(/^_/, '');
        if (tag === 'in_progress' && row.stateJson.includes('"phase":"play"')) {
          return row;
        }
        return undefined;
      }, 'dealt bluff table');
      const seats = [...connection.db.gameSeat.iter()].filter(
        (seat) => seat.tableId === table.id,
      );
      const evidence = {
        botListening: botUp,
        lobby: {
          id: lobby.id,
          code: lobby.code,
          discordChannelId: lobby.discordChannelId,
          discordGuildId: lobby.discordGuildId,
          discordLobbyVoiceChannelId: lobby.discordLobbyVoiceChannelId,
        },
        table: {
          id: playing.id,
          status: playing.status.tag,
          discordVoiceChannelId: playing.discordVoiceChannelId,
          phase: 'play',
        },
        seats: seats.length,
      };
      console.log(JSON.stringify(evidence, null, 2));
      assert.equal(botUp, false);
      assert.equal(lobby.discordChannelId, '');
      assert.equal(lobby.discordGuildId, '');
      assert.equal(lobby.discordLobbyVoiceChannelId, '');
      assert.equal(playing.discordVoiceChannelId, '');
      assert.equal(seats.length, 2);
    } finally {
      connection.disconnect();
    }
  },
);

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once('connect', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(false);
    });
    socket.once('timeout', () => {
      finish(false);
    });
  });
}

function subscribeMembers(connection: DbConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection
      .subscriptionBuilder()
      .onApplied(() => {
        resolve();
      })
      .onError((ctx) => {
        const detail =
          ctx.event instanceof Error
            ? ctx.event.message
            : 'subscription failed';
        reject(new Error(detail));
      })
      .subscribe((query) => [query.lobbyMember, query.gameSeat]);
  });
}

async function waitFor<T>(
  read: () => T | undefined,
  label: string,
): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value) {
      return value;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(label);
}
