export interface VoiceLobbyRef {
  id: string;
  discordLobbyVoiceChannelId: string;
}

export interface VoiceTableRef {
  id: string;
  lobbyId: string;
  discordVoiceChannelId: string;
}

export interface VoicePlace {
  lobbyId: string;
  tableId: string;
}

/**
 * Lobby voice uses an empty `tableId`. A channel that is not stored is absent.
 */
export function voicePlace(
  lobbies: Iterable<VoiceLobbyRef>,
  tables: Iterable<VoiceTableRef>,
  channelId: string,
): VoicePlace | undefined {
  const channel = channelId.trim();
  if (channel.length === 0) {
    return undefined;
  }
  for (const lobby of lobbies) {
    if (lobby.discordLobbyVoiceChannelId === channel) {
      return { lobbyId: lobby.id, tableId: '' };
    }
  }
  for (const table of tables) {
    if (table.discordVoiceChannelId === channel) {
      return { lobbyId: table.lobbyId, tableId: table.id };
    }
  }
  return undefined;
}

export function speakingRowId(lobbyMemberId: string, tableId: string): string {
  const place = tableId.length === 0 ? 'lobby' : tableId;
  return `speaking_${lobbyMemberId}_${place}`;
}
