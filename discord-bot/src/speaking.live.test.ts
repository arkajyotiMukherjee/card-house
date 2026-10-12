import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import { connectLobby } from './lobby-client.ts';
import { createSpeakingReporter, type SpeakingSignal } from './speaking.ts';
import { probeSpeakingGateway } from './speaking-gateway.ts';

const execFileAsync = promisify(execFile);
const live = process.env.CARDROOM_LIVE === '1';
const USER_A = '111111111111111111';
const USER_B = '222222222222222222';
const STRANGER = '333333333333333333';
const AUDIO_MARKERS = [
  'opus',
  'pcm',
  'waveform',
  'rtp',
  '"audio"',
  'voice_data',
  'ssrc',
];

test(
  'speaking state follows each discord user and a hand still plays',
  { skip: live ? false : 'set CARDROOM_LIVE=1 to call the published module' },
  async () => {
    const logs: string[] = [];
    const TEXT = snowflake(1);
    const GUILD = snowflake(2);
    const LOBBY_VOICE = snowflake(3);
    const TABLE_VOICE = snowflake(4);
    const token = process.env.DISCORD_BOT_TOKEN ?? '';
    assert.ok(token.length > 0, 'DISCORD_BOT_TOKEN is unset');
    const probe = await probeSpeakingGateway(token);
    logs.push(`discord speaking gateway status ${probe.status}`);
    assert.equal(probe.status, 401);
    assert.equal(probe.url, '');
    assert.equal(JSON.stringify(probe).includes(token), false);

    const botUp = await portOpen(8787);
    const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
    const database = process.env.SPACETIMEDB_DB ?? 'cardroom';
    const connection = await connectLobby(host, database);
    await subscribeRows(connection);
    const sent: SpeakingSignal[] = [];
    const reporter = createSpeakingReporter(
      async (signal) => {
        sent.push(signal);
        logs.push(
          `speaking ${signal.discordUserId} ${signal.discordVoiceChannelId} ${signal.isSpeaking}`,
        );
        await connection.reducers.updateSpeakingState(signal);
      },
      {
        onSend: (_signal, waitedMs) => {
          logs.push(`debounce ${waitedMs}ms`);
        },
      },
    );

    try {
      const knownIds = new Set(
        [...connection.db.lobby.iter()].map((lobby) => lobby.id),
      );
      await connection.reducers.createLobby({});
      const lobby = await waitFor(
        () =>
          [...connection.db.lobby.iter()].find((row) => !knownIds.has(row.id)),
        'lobby',
      );
      await connection.reducers.setLobbyDiscordChannel({
        lobbyCode: lobby.code,
        discordChannelId: TEXT,
      });
      await connection.reducers.setLobbyDiscordVoice({
        lobbyCode: lobby.code,
        discordGuildId: GUILD,
        discordLobbyVoiceChannelId: LOBBY_VOICE,
      });
      await connection.reducers.joinLobbyWithDiscord({
        lobbyCode: lobby.code,
        clientId: 'discord-ada',
        name: 'Ada',
        discordUserId: USER_A,
        discordUsername: 'ada_cards',
        discordGlobalName: 'Ada Cards',
        discordDiscriminator: undefined,
      });
      await connection.reducers.joinLobbyWithDiscord({
        lobbyCode: lobby.code,
        clientId: 'discord-bea',
        name: 'Bea',
        discordUserId: USER_B,
        discordUsername: 'bea_cards',
        discordGlobalName: 'Bea Cards',
        discordDiscriminator: undefined,
      });
      const members = await waitFor(() => {
        const rows = [...connection.db.lobbyMember.iter()].filter(
          (row) => row.lobbyId === lobby.id,
        );
        return rows.length === 2 ? rows : undefined;
      }, 'members');
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
        'table',
      );
      await connection.reducers.setTableDiscordVoice({
        tableId: table.id,
        discordVoiceChannelId: TABLE_VOICE,
      });
      for (const member of members) {
        await connection.reducers.joinTable({
          tableId: table.id,
          lobbyMemberId: member.id,
        });
      }
      await waitFor(() => {
        const row = [...connection.db.gameTable.iter()].find(
          (item) => item.id === table.id,
        );
        return row?.stateJson.includes('"phase":"play"') ? row : undefined;
      }, 'dealt table');

      const memberA = members.find((row) => row.discordUserId === USER_A);
      const memberB = members.find((row) => row.discordUserId === USER_B);
      assert.ok(memberA);
      assert.ok(memberB);

      const latencies: number[] = [];
      const startedA = Date.now();
      reporter.note({
        discordUserId: USER_A,
        discordVoiceChannelId: TABLE_VOICE,
        isSpeaking: true,
      });
      const speakingA = await waitForSpeaking(
        () => findSpeaking(connection, memberA.id, table.id, true),
        startedA,
      );
      latencies.push(speakingA.ms);
      assert.equal(findSpeaking(connection, memberB.id, table.id), undefined);

      const stoppedA = Date.now();
      reporter.note({
        discordUserId: USER_A,
        discordVoiceChannelId: TABLE_VOICE,
        isSpeaking: false,
      });
      const silentA = await waitForSpeaking(
        () => findSpeaking(connection, memberA.id, table.id, false),
        stoppedA,
      );
      latencies.push(silentA.ms);
      assert.equal(findSpeaking(connection, memberB.id, table.id), undefined);

      const startedB = Date.now();
      reporter.note({
        discordUserId: USER_B,
        discordVoiceChannelId: TABLE_VOICE,
        isSpeaking: true,
      });
      const speakingB = await waitForSpeaking(
        () => findSpeaking(connection, memberB.id, table.id, true),
        startedB,
      );
      latencies.push(speakingB.ms);
      assert.equal(
        findSpeaking(connection, memberA.id, table.id)?.isSpeaking,
        false,
      );

      const stoppedB = Date.now();
      reporter.note({
        discordUserId: USER_B,
        discordVoiceChannelId: TABLE_VOICE,
        isSpeaking: false,
      });
      const silentB = await waitForSpeaking(
        () => findSpeaking(connection, memberB.id, table.id, false),
        stoppedB,
      );
      latencies.push(silentB.ms);
      assert.equal(
        findSpeaking(connection, memberA.id, table.id)?.isSpeaking,
        false,
      );

      const lobbyAt = Date.now();
      reporter.note({
        discordUserId: USER_A,
        discordVoiceChannelId: LOBBY_VOICE,
        isSpeaking: true,
      });
      const lobbySpeaking = await waitForSpeaking(
        () => findSpeaking(connection, memberA.id, '', true),
        lobbyAt,
      );
      latencies.push(lobbySpeaking.ms);
      assert.equal(lobbySpeaking.row.tableId, '');
      assert.equal(
        findSpeaking(connection, memberA.id, table.id)?.isSpeaking,
        false,
      );

      reporter.note({
        discordUserId: STRANGER,
        discordVoiceChannelId: TABLE_VOICE,
        isSpeaking: true,
      });
      await delay(200);
      const strangerRows = [...connection.db.speakingState.iter()].filter(
        (row) => row.lobbyId === lobby.id && row.lobbyMemberId.length === 0,
      );
      assert.equal(strangerRows.length, 0);
      const memberIds = new Set(members.map((row) => row.id));
      for (const row of connection.db.speakingState.iter()) {
        if (row.lobbyId === lobby.id) {
          assert.equal(memberIds.has(row.lobbyMemberId), true);
        }
      }

      for (const signal of sent) {
        assert.deepEqual(Object.keys(signal).sort(), [
          'discordUserId',
          'discordVoiceChannelId',
          'isSpeaking',
        ]);
      }
      for (const ms of latencies) {
        assert.ok(ms < 500, `speaking update took ${ms}ms`);
      }

      const rows = [...connection.db.speakingState.iter()].filter(
        (row) => row.lobbyId === lobby.id,
      );
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), [
          'id',
          'isSpeaking',
          'lastUpdatedAt',
          'lobbyId',
          'lobbyMemberId',
          'tableId',
        ]);
      }

      const stillDown = await portOpen(8787);
      assert.equal(botUp, false);
      assert.equal(stillDown, false);
      const playing = [...connection.db.gameTable.iter()].find(
        (row) => row.id === table.id,
      );
      assert.ok(playing);
      const state = JSON.parse(playing.stateJson) as {
        hands: Record<string, string[]>;
        turnSeatIndex: number;
      };
      const turn = String(state.turnSeatIndex);
      const card = state.hands[turn]?.[0];
      assert.ok(card);
      const seats = [...connection.db.gameSeat.iter()].filter(
        (seat) => seat.tableId === table.id,
      );
      const turnSeat = seats.find(
        (seat) => seat.seatIndex === state.turnSeatIndex,
      );
      assert.ok(turnSeat);
      const turnMember = members.find(
        (row) => row.id === turnSeat.lobbyMemberId,
      );
      assert.ok(turnMember);
      await connection.reducers.handleGameIntent({
        tableId: table.id,
        clientId: turnMember.clientId,
        intentPayload: JSON.stringify({ type: 'play', cards: [card] }),
      });
      const event = await waitFor(
        () =>
          [...connection.db.gameEvent.iter()].find(
            (row) => row.tableId === table.id && row.type === 'play',
          ),
        'played card',
      );

      const sql = await readSpeakingSql(database);
      const evidence = {
        gatewayStatus: probe.status,
        botListening: stillDown,
        latenciesMs: latencies,
        sent,
        speakingRows: rows.map((row) => ({
          lobbyId: row.lobbyId,
          tableId: row.tableId,
          lobbyMemberId: row.lobbyMemberId,
          isSpeaking: row.isSpeaking,
        })),
        logs,
        sql,
        played: {
          eventType: event.type,
          lobbyMemberId: event.lobbyMemberId,
          card,
        },
      };
      const packed = JSON.stringify(evidence);
      for (const marker of AUDIO_MARKERS) {
        assert.equal(packed.includes(marker), false, `found ${marker}`);
      }
      assert.equal(packed.includes(token), false);
      await mkdir('/opt/cursor/artifacts', { recursive: true });
      await writeFile(
        '/opt/cursor/artifacts/speaking-validation.json',
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
      console.log(JSON.stringify(evidence, null, 2));
    } finally {
      connection.disconnect();
    }
  },
);

function findSpeaking(
  connection: DbConnection,
  lobbyMemberId: string,
  tableId: string,
  isSpeaking?: boolean,
):
  | {
      id: string;
      lobbyId: string;
      tableId: string;
      lobbyMemberId: string;
      isSpeaking: boolean;
      lastUpdatedAt: { microsSinceUnixEpoch: bigint };
    }
  | undefined {
  for (const row of connection.db.speakingState.iter()) {
    if (row.lobbyMemberId !== lobbyMemberId || row.tableId !== tableId) {
      continue;
    }
    if (isSpeaking !== undefined && row.isSpeaking !== isSpeaking) {
      continue;
    }
    return row;
  }
  return undefined;
}

async function waitForSpeaking<T extends { isSpeaking: boolean }>(
  read: () => T | undefined,
  startedAt: number,
): Promise<{ row: T; ms: number }> {
  for (;;) {
    const row = read();
    const ms = Date.now() - startedAt;
    if (row) {
      return { row, ms };
    }
    if (ms > 500) {
      throw new Error(`speaking row missed the 500ms budget (${ms}ms)`);
    }
    await delay(10);
  }
}

function subscribeRows(connection: DbConnection): Promise<void> {
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
      .subscribe((query) => [
        query.lobbyMember,
        query.gameSeat,
        query.gameEvent,
        query.speakingState,
      ]);
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
    await delay(50);
  }
  throw new Error(label);
}

function snowflake(offset: number): string {
  const value = BigInt(Date.now()) * 10000n + BigInt(offset);
  return value.toString().padStart(18, '0');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

async function readSpeakingSql(database: string): Promise<string> {
  const host = process.env.SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
  const server = host.replace(/^ws/, 'http');
  const result = await execFileAsync(
    'spacetime',
    [
      'sql',
      '--server',
      server,
      '--yes',
      '--format',
      'json',
      database,
      'SELECT * FROM SpeakingState',
    ],
    { timeout: 15000 },
  );
  return `${result.stdout}${result.stderr}`.trim();
}
