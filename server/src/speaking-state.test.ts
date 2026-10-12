import { speakingRowId, voicePlace } from './speaking-state.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const lobbies = [
  { id: 'lobby_1', discordLobbyVoiceChannelId: '423456789012345678' },
];
const tables = [
  {
    id: 'table_1',
    lobbyId: 'lobby_1',
    discordVoiceChannelId: '523456789012345678',
  },
];

const lobbyVoice = voicePlace(lobbies, tables, '423456789012345678');
assert(lobbyVoice?.lobbyId === 'lobby_1', 'lobby voice finds the lobby');
assert(lobbyVoice?.tableId === '', 'lobby voice leaves tableId empty');

const tableVoice = voicePlace(lobbies, tables, '523456789012345678');
assert(tableVoice?.lobbyId === 'lobby_1', 'table voice finds the lobby');
assert(tableVoice?.tableId === 'table_1', 'table voice stores the table');

assert(
  voicePlace(lobbies, tables, '623456789012345678') === undefined,
  'an unknown channel is ignored',
);
assert(
  voicePlace(lobbies, tables, '  ') === undefined,
  'a blank channel is ignored',
);

assert(
  speakingRowId('member_1', '') === 'speaking_member_1_lobby',
  'lobby speaking id uses the lobby place',
);
assert(
  speakingRowId('member_1', 'table_1') === 'speaking_member_1_table_1',
  'table speaking id includes the table',
);

console.log('speaking state place ok');
