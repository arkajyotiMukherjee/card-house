import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import express, { type Express } from 'express';
import { handleInteraction, type DiscordInteraction } from './interactions.ts';
import type { CreatedLobby } from './lobby-client.ts';

export interface AppOptions {
  publicKey: string;
  createLobby: (
    discordChannelId: string,
    guildId?: string,
  ) => Promise<CreatedLobby>;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.post(
    '/interactions',
    verifyKeyMiddleware(options.publicKey),
    (req, res) => {
      const interaction = req.body as DiscordInteraction;
      if (interaction.type === InteractionType.PING) {
        res.json({ type: InteractionResponseType.PONG });
        return;
      }
      void handleInteraction(interaction, {
        createLobby: options.createLobby,
      })
        .then((body) => {
          res.json(body);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Could not create a lobby';
          res.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: message, flags: 1 << 6 },
          });
        });
    },
  );
  return app;
}
