export interface PresenceLobby {
  id: string;
  discordLobbyVoiceChannelId: string;
}

export interface PresenceTable {
  id: string;
  lobbyId: string;
  discordVoiceChannelId: string;
}

export interface VoiceScope {
  lobbyId: string;
  /** Empty for the lobby voice channel. */
  tableId: string;
}

/**
 * Which lobby voice channel or table voice channel a Discord channel id is.
 * A channel the module does not know yields `undefined`, and so no presence.
 */
export function voiceScopeForChannel(
  channelId: string,
  lobbies: Iterable<PresenceLobby>,
  tables: Iterable<PresenceTable>,
): VoiceScope | undefined {
  if (channelId.length === 0) {
    return undefined;
  }
  for (const lobby of lobbies) {
    if (lobby.discordLobbyVoiceChannelId === channelId) {
      return { lobbyId: lobby.id, tableId: '' };
    }
  }
  for (const table of tables) {
    if (table.discordVoiceChannelId === channelId) {
      return { lobbyId: table.lobbyId, tableId: table.id };
    }
  }
  return undefined;
}
