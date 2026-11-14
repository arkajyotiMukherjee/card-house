import { InteractionResponseType, InteractionType } from 'discord-interactions';
import { ROOM_CODE_OPTION, SLASH_COMMAND_NAME } from './commands.ts';
import { createReplyContent } from './join-url.ts';
import { closeReplyContent, type CloseRoomReport } from './lobby-close.ts';
import type { CreatedLobby } from './lobby-client.ts';
import {
  normalizeRoomCode,
  statusReplyContent,
  type LobbyStatusReport,
} from './lobby-status.ts';

const EPHEMERAL = 1 << 6;
const DISCORD_CHANNEL_ID = /^\d{17,20}$/;

export interface DiscordOption {
  name?: string;
  type?: number;
  value?: string | number | boolean;
  options?: DiscordOption[];
}

export interface DiscordInteraction {
  type: number;
  channel_id?: string;
  guild_id?: string;
  data?: {
    name?: string;
    options?: DiscordOption[];
  };
}

export interface DiscordReply {
  type: number;
  data?: {
    content: string;
    flags?: number;
  };
}

export interface InteractionDeps {
  createLobby: (
    discordChannelId: string,
    guildId?: string,
    startingCoins?: number,
  ) => Promise<CreatedLobby>;
  lobbyStatus: (
    roomCode: string,
  ) => Promise<LobbyStatusReport> | LobbyStatusReport;
  leaderboard?: (
    channelId: string,
    roomCode: string,
    page: number,
  ) => string | Promise<string>;
  closeRoom: (roomCode: string) => Promise<CloseRoomReport> | CloseRoomReport;
}

type Subcommand = (
  interaction: DiscordInteraction,
  deps: InteractionDeps,
) => Promise<DiscordReply>;

const subcommands: Record<string, Subcommand> = {
  leaderboard: async (interaction, deps) => {
    if (!interaction.channel_id || !deps.leaderboard)
      return ephemeral('Leaderboard is unavailable.');
    const page = interaction.data?.options?.[0]?.options?.find(
      (option) => option.name === 'page',
    )?.value;
    const content = await deps.leaderboard(
      interaction.channel_id,
      optionValue(interaction, ROOM_CODE_OPTION),
      typeof page === 'number' ? page : 1,
    );
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content },
    };
  },
  create: handleCreate,
  status: handleStatus,
  close: handleClose,
};

export async function handleInteraction(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return ephemeral('Unsupported interaction');
  }
  if (interaction.data?.name !== SLASH_COMMAND_NAME) {
    return ephemeral('Unknown command');
  }
  const name = interaction.data.options?.[0]?.name ?? '';
  const handler = subcommands[name];
  if (!handler) {
    return ephemeral('Unknown command');
  }
  try {
    return await handler(interaction, deps);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Could not handle that command';
    return ephemeral(message);
  }
}

async function handleCreate(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  const channelId = interaction.channel_id?.trim() ?? '';
  if (!DISCORD_CHANNEL_ID.test(channelId)) {
    return ephemeral('This command needs a Discord channel');
  }
  const guildId = interaction.guild_id?.trim() ?? '';
  const coins = interaction.data?.options?.[0]?.options?.find(
    (option) => option.name === 'startingcoins',
  )?.value;
  const created = await deps.createLobby(
    channelId,
    guildId,
    typeof coins === 'number' ? coins : undefined,
  );
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: createReplyContent(created.code, created.joinUrl),
    },
  };
}

async function handleStatus(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  const raw = optionValue(interaction, ROOM_CODE_OPTION);
  if (normalizeRoomCode(raw).length === 0) {
    return ephemeral('Room code is required');
  }
  const report = await deps.lobbyStatus(raw);
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: statusReplyContent(report),
    },
  };
}

async function handleClose(
  interaction: DiscordInteraction,
  deps: InteractionDeps,
): Promise<DiscordReply> {
  const raw = optionValue(interaction, ROOM_CODE_OPTION);
  if (normalizeRoomCode(raw).length === 0) {
    return ephemeral('Room code is required');
  }
  const report = await deps.closeRoom(raw);
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: closeReplyContent(report),
    },
  };
}

function optionValue(interaction: DiscordInteraction, name: string): string {
  const sub = interaction.data?.options?.[0];
  const option = sub?.options?.find((item) => item.name === name);
  if (typeof option?.value !== 'string') {
    return '';
  }
  return option.value;
}

function ephemeral(content: string): DiscordReply {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  };
}
