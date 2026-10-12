const SNOWFLAKE = /^\d{17,20}$/;

/** A Discord voice state: where one user is now. No channel means they left voice. */
export interface VoiceStateEvent {
  userId: string;
  channelId: string | null;
}

export interface PresenceLobbyRow {
  id: string;
  discordGuildId: string;
  discordLobbyVoiceChannelId: string;
}

export interface PresenceTableRow {
  discordVoiceChannelId: string;
}

export interface PresenceRow {
  discordUserId: string;
  lobbyId: string;
}

export interface PresenceSnapshot {
  reducers: {
    updateVoicePresence(args: {
      discordUserId: string;
      discordVoiceChannelId: string;
    }): Promise<unknown>;
  };
  db: {
    lobby: { iter(): Iterable<PresenceLobbyRow> };
    gameTable: { iter(): Iterable<PresenceTableRow> };
    voicePresence: { iter(): Iterable<PresenceRow> };
  };
}

/**
 * Sends one voice state to `update_voice_presence`. Only a user id and a
 * channel id leave this function. The module decides whether that channel is a
 * lobby or table voice channel and whether the user is a mapped member.
 */
export async function recordVoiceState(
  snapshot: PresenceSnapshot,
  event: VoiceStateEvent,
): Promise<void> {
  if (!SNOWFLAKE.test(event.userId)) {
    return;
  }
  const channelId = event.channelId ?? '';
  if (channelId.length > 0 && !SNOWFLAKE.test(channelId)) {
    return;
  }
  if (!isTracked(snapshot, event.userId, channelId)) {
    return;
  }
  try {
    await snapshot.reducers.updateVoicePresence({
      discordUserId: event.userId,
      discordVoiceChannelId: channelId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Voice presence update failed';
    console.error(`Voice presence skipped: ${message}`);
  }
}

/**
 * Applies everyone in a guild's voice channels after the gateway connects.
 * A stored presence row for a user the guild no longer lists is cleared, so a
 * restart does not leave a headset behind.
 */
export async function syncGuildVoice(
  snapshot: PresenceSnapshot,
  guildId: string,
  states: readonly VoiceStateEvent[],
): Promise<void> {
  const inVoice = new Set<string>();
  for (const state of states) {
    if (state.channelId !== null) {
      inVoice.add(state.userId);
    }
    await recordVoiceState(snapshot, state);
  }
  const lobbyIds = new Set<string>();
  for (const lobby of snapshot.db.lobby.iter()) {
    if (lobby.discordGuildId === guildId) {
      lobbyIds.add(lobby.id);
    }
  }
  const stale = new Set<string>();
  for (const row of snapshot.db.voicePresence.iter()) {
    if (lobbyIds.has(row.lobbyId) && !inVoice.has(row.discordUserId)) {
      stale.add(row.discordUserId);
    }
  }
  for (const userId of stale) {
    await recordVoiceState(snapshot, { userId, channelId: null });
  }
}

/** A channel the module stores, or a user who has a headset to take down. */
function isTracked(
  snapshot: PresenceSnapshot,
  userId: string,
  channelId: string,
): boolean {
  if (channelId.length > 0) {
    for (const lobby of snapshot.db.lobby.iter()) {
      if (lobby.discordLobbyVoiceChannelId === channelId) {
        return true;
      }
    }
    for (const table of snapshot.db.gameTable.iter()) {
      if (table.discordVoiceChannelId === channelId) {
        return true;
      }
    }
  }
  for (const row of snapshot.db.voicePresence.iter()) {
    if (row.discordUserId === userId) {
      return true;
    }
  }
  return false;
}
