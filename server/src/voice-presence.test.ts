import { voiceScopeForChannel } from './voice-presence.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const lobbies = [
  { id: 'lobby_a', discordLobbyVoiceChannelId: '111111111111111111' },
  { id: 'lobby_b', discordLobbyVoiceChannelId: '' },
];
const tables = [
  {
    id: 'table_1',
    lobbyId: 'lobby_a',
    discordVoiceChannelId: '222222222222222222',
  },
  { id: 'table_2', lobbyId: 'lobby_b', discordVoiceChannelId: '' },
];

const inLobby = voiceScopeForChannel('111111111111111111', lobbies, tables);
assert(
  inLobby?.lobbyId === 'lobby_a' && inLobby.tableId === '',
  'lobby voice channel has no table id',
);

const atTable = voiceScopeForChannel('222222222222222222', lobbies, tables);
assert(
  atTable?.lobbyId === 'lobby_a' && atTable.tableId === 'table_1',
  'table voice channel names its table',
);

assert(
  voiceScopeForChannel('333333333333333333', lobbies, tables) === undefined,
  'an unknown channel is not tracked',
);
assert(
  voiceScopeForChannel('', lobbies, tables) === undefined,
  'leaving voice is not a channel',
);

console.log('voice-presence ok');
