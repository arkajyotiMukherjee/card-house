const SUB_COMMAND = 1;
const STRING_OPTION = 3;

export const ROOM_CODE_OPTION = 'roomcode';

/** Discord application command name. Subcommands are `create` and `status`. */
export const SLASH_COMMAND_NAME = 'cardhouse';

export const CARDHOUSE_COMMAND = {
  name: SLASH_COMMAND_NAME,
  description: 'Card House lobbies',
  options: [
    {
      type: SUB_COMMAND,
      name: 'create',
      description: 'Create a lobby and get a code and join link',
    },
    {
      type: SUB_COMMAND,
      name: 'status',
      description: 'Check whether a room code is still live',
      options: [
        {
          type: STRING_OPTION,
          name: ROOM_CODE_OPTION,
          description: 'Lobby room code',
          required: true,
        },
      ],
    },
  ],
} as const;

/** Full command set. Later slash commands are added here. */
export const SLASH_COMMANDS = [CARDHOUSE_COMMAND] as const;

export interface RegisterCommandsConfig {
  token: string;
  applicationId: string;
  guildId?: string;
}

export async function registerSlashCommands(
  config: RegisterCommandsConfig,
): Promise<void> {
  const applicationId = config.applicationId.trim();
  const token = config.token.trim();
  if (applicationId.length === 0 || token.length === 0) {
    throw new Error('Discord application id and bot token are required');
  }
  const guildId = config.guildId?.trim() ?? '';
  const url =
    guildId.length > 0
      ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(SLASH_COMMANDS),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Discord command registration failed (${response.status}): ${detail}`,
    );
  }
}
