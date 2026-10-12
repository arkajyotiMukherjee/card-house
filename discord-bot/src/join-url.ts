export function joinUrl(publicBase: string, code: string): string {
  const base = publicBase.trim().replace(/\/+$/, '');
  const room = code.trim();
  if (base.length === 0) {
    throw new Error('Public URL is required');
  }
  if (room.length === 0) {
    throw new Error('Lobby code is required');
  }
  return `${base}/${room}`;
}

export function createReplyContent(code: string, url: string): string {
  return `Lobby ${code}\n${url}`;
}
