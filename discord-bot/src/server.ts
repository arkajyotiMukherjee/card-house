import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import express, { type Express } from 'express';
import type { PlayerNameLookup } from './discord-user.ts';
import { handleInteraction, type DiscordInteraction } from './interactions.ts';
import type { CreatedLobby } from './lobby-client.ts';
import type { LobbyStatusReport } from './lobby-status.ts';

export interface AppOptions {
  publicKey: string;
  createLobby: (
    discordChannelId: string,
    guildId?: string,
  ) => Promise<CreatedLobby>;
  lookupPlayerName?: (discordUserId: string) => Promise<PlayerNameLookup>;
  lobbyStatus: (
    roomCode: string,
  ) => Promise<LobbyStatusReport> | LobbyStatusReport;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.get('/default-player-name', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const lookup = options.lookupPlayerName;
    const raw = req.query.discord_user_id;
    const queryId = Array.isArray(raw) ? raw[0] : raw;
    const discordUserId = typeof queryId === 'string' ? queryId : '';
    if (!lookup) {
      res.status(503).json({
        discordUserId,
        name: null,
        status: 503,
      });
      return;
    }
    void lookup(discordUserId)
      .then((result) => {
        const httpStatus = result.ok
          ? 200
          : result.status >= 400 && result.status <= 599
            ? result.status
            : 502;
        res.status(httpStatus).json({
          discordUserId: result.discordUserId,
          name: result.ok ? result.name : null,
          status: result.ok ? 200 : result.status,
        });
      })
      .catch(() => {
        res.status(502).json({
          discordUserId,
          name: null,
          status: 502,
        });
      });
  });
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
        lobbyStatus: options.lobbyStatus,
      })
        .then((body) => {
          res.json(body);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not handle that command';
          res.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: message, flags: 1 << 6 },
          });
        });
    },
  );
  return app;
}
