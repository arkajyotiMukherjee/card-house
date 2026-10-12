import type { DbConnection } from '../../client/src/module_bindings/index.ts';
import type { SpeakingGateway } from './speaking-gateway.ts';

const SNOWFLAKE = /^\d{17,20}$/;

/** Trailing quiet period. The subscribed row should land inside 500ms. */
export const SPEAKING_DEBOUNCE_MS = 40;

export interface SpeakingSignal {
  discordUserId: string;
  discordVoiceChannelId: string;
  isSpeaking: boolean;
}

export interface WatchedVoiceChannel {
  guildId: string;
  channelId: string;
}

interface Timer {
  cancel(): void;
}

export interface SpeakingReporter {
  note(input: SpeakingSignal): void;
}

export function speakingSignal(input: SpeakingSignal): SpeakingSignal {
  const discordUserId = input.discordUserId.trim();
  const discordVoiceChannelId = input.discordVoiceChannelId.trim();
  if (
    !SNOWFLAKE.test(discordUserId) ||
    !SNOWFLAKE.test(discordVoiceChannelId) ||
    typeof input.isSpeaking !== 'boolean'
  ) {
    throw new Error('Speaking update is invalid');
  }
  return {
    discordUserId,
    discordVoiceChannelId,
    isSpeaking: input.isSpeaking,
  };
}

export function createSpeakingReporter(
  send: (signal: SpeakingSignal) => Promise<void>,
  options?: {
    debounceMs?: number;
    now?: () => number;
    schedule?: (run: () => void, ms: number) => Timer;
    onSend?: (signal: SpeakingSignal, waitedMs: number) => void;
  },
): SpeakingReporter {
  const debounceMs = options?.debounceMs ?? SPEAKING_DEBOUNCE_MS;
  const now = options?.now ?? Date.now;
  const schedule = options?.schedule ?? defaultSchedule;
  const pending = new Map<string, Timer>();

  return {
    note(input: SpeakingSignal): void {
      const signal = speakingSignal(input);
      const key = `${signal.discordVoiceChannelId}:${signal.discordUserId}`;
      pending.get(key)?.cancel();
      const startedAt = now();
      const timer = schedule(() => {
        pending.delete(key);
        const waitedMs = now() - startedAt;
        options?.onSend?.(signal, waitedMs);
        void send(signal).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Speaking update failed';
          console.error(`Speaking update failed: ${message}`);
        });
      }, debounceMs);
      pending.set(key, timer);
    },
  };
}

export function watchedVoiceChannels(snapshot: {
  db: {
    lobby: {
      iter(): Iterable<{
        id: string;
        discordGuildId: string;
        discordLobbyVoiceChannelId: string;
      }>;
    };
    gameTable: {
      iter(): Iterable<{
        lobbyId: string;
        discordVoiceChannelId: string;
      }>;
    };
  };
}): WatchedVoiceChannel[] {
  const guildByLobby = new Map<string, string>();
  const channels: WatchedVoiceChannel[] = [];
  const seen = new Set<string>();
  for (const lobby of snapshot.db.lobby.iter()) {
    if (SNOWFLAKE.test(lobby.discordGuildId)) {
      guildByLobby.set(lobby.id, lobby.discordGuildId);
    }
    pushChannel(
      channels,
      seen,
      lobby.discordGuildId,
      lobby.discordLobbyVoiceChannelId,
    );
  }
  for (const table of snapshot.db.gameTable.iter()) {
    pushChannel(
      channels,
      seen,
      guildByLobby.get(table.lobbyId) ?? '',
      table.discordVoiceChannelId,
    );
  }
  return channels;
}

export function attachSpeakingWatch(
  connection: DbConnection,
  gateway: SpeakingGateway,
): () => void {
  const reporter = createSpeakingReporter((signal) =>
    connection.reducers.updateSpeakingState(signal),
  );
  const session = gateway.listen(
    () => watchedVoiceChannels(connection),
    (signal) => {
      reporter.note(signal);
    },
  );
  const refresh = (): void => {
    session.sync();
  };
  connection.db.lobby.onInsert(refresh);
  connection.db.lobby.onUpdate(refresh);
  connection.db.gameTable.onInsert(refresh);
  connection.db.gameTable.onUpdate(refresh);
  connection.db.gameTable.onDelete(refresh);
  session.sync();
  return () => {
    session.stop();
    connection.db.lobby.removeOnInsert(refresh);
    connection.db.lobby.removeOnUpdate(refresh);
    connection.db.gameTable.removeOnInsert(refresh);
    connection.db.gameTable.removeOnUpdate(refresh);
    connection.db.gameTable.removeOnDelete(refresh);
  };
}

function pushChannel(
  channels: WatchedVoiceChannel[],
  seen: Set<string>,
  guildId: string,
  channelId: string,
): void {
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId)) {
    return;
  }
  const key = `${guildId}:${channelId}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  channels.push({ guildId, channelId });
}

function defaultSchedule(run: () => void, ms: number): Timer {
  const timer = setTimeout(run, ms);
  return {
    cancel(): void {
      clearTimeout(timer);
    },
  };
}
