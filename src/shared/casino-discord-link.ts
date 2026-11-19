export const DISCORD_LINK_MESSAGES = {
  linked: 'Discord linked',
  cancelled: 'Discord linking was cancelled',
  expired: 'Link expired. Select Link Discord to start again.',
  unavailable: 'Discord linking is temporarily unavailable',
  'discord-error': 'Discord could not verify this link. Try again.',
  'operator-required': 'The Card House bot needs permission to link accounts',
  'already-linked': 'This browser already has a linked Discord account',
  failed: 'Card House could not finish linking. Try again.',
} as const;

export type DiscordLinkResult = keyof typeof DISCORD_LINK_MESSAGES;
export const DISCORD_LINK_RESULT_PARAM = 'discordLink';
export const DISCORD_LINK_FLOW_PARAM = 'discordLinkFlow';

export function readDiscordLinkFlow(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
    ? value
    : undefined;
}

export function readDiscordLinkResult(
  value: unknown,
): DiscordLinkResult | undefined {
  return typeof value === 'string' &&
    Object.hasOwn(DISCORD_LINK_MESSAGES, value)
    ? (value as DiscordLinkResult)
    : undefined;
}
