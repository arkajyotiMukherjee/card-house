export const NAME_MAX = 12;
export const CODE_MAX = 6;

export const LOBBY_PANEL = {
  nameField: { x: 16, y: 68, w: 128, h: 24 },
  codeField: { x: 16, y: 116, w: 128, h: 24 },
  createButton: { x: 16, y: 152, w: 128, h: 26 },
  joinButton: { x: 16, y: 186, w: 128, h: 26 },
} as const;

export interface LobbyRow {
  id: string;
  code: string;
}

export interface MemberRow {
  lobbyId: string;
  clientId: string;
  name: string;
}

export interface MemberLine {
  name: string;
  clientId: string;
  self: boolean;
}

export function normalizePlayerName(raw: string): string {
  return raw.trim();
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function applyFieldKey(
  value: string,
  key: string,
  maxLength: number,
): string {
  if (key === 'Backspace') {
    return value.slice(0, -1);
  }
  if (key.length !== 1 || !/[a-zA-Z0-9 ]/.test(key)) {
    return value;
  }
  if (value.length >= maxLength) {
    return value;
  }
  return value + key;
}

export function applyCodeKey(value: string, key: string): string {
  if (key === ' ') {
    return value;
  }
  return applyFieldKey(value, key, CODE_MAX).toUpperCase();
}

export function lobbyByCode<T extends LobbyRow>(
  lobbies: Iterable<T>,
  rawCode: string,
): T | undefined {
  const code = normalizeRoomCode(rawCode);
  if (code.length === 0) {
    return undefined;
  }
  for (const lobby of lobbies) {
    if (lobby.code === code) {
      return lobby;
    }
  }
  return undefined;
}

export function findCreatedLobby<T extends LobbyRow>(
  lobbies: Iterable<T>,
  knownIds: ReadonlySet<string>,
  senderHex: string,
): T | undefined {
  const fresh: T[] = [];
  for (const lobby of lobbies) {
    if (!knownIds.has(lobby.id)) {
      fresh.push(lobby);
    }
  }
  const prefix = senderHex.length > 0 ? `lobby_${senderHex}_` : '';
  const owned =
    prefix.length > 0
      ? fresh.filter((lobby) => lobby.id.startsWith(prefix))
      : [];
  const pool = owned.length > 0 ? owned : fresh.length === 1 ? fresh : [];
  let match: T | undefined;
  for (const lobby of pool) {
    if (!match || lobby.id > match.id) {
      match = lobby;
    }
  }
  return match;
}

export function memberLines(
  members: Iterable<MemberRow>,
  lobbyId: string,
  selfClientId: string,
): MemberLine[] {
  const lines: MemberLine[] = [];
  for (const member of members) {
    if (member.lobbyId !== lobbyId) {
      continue;
    }
    lines.push({
      name: member.name,
      clientId: member.clientId,
      self: member.clientId === selfClientId,
    });
  }
  lines.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.clientId.localeCompare(b.clientId);
  });
  return lines;
}
