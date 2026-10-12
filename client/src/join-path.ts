/** Same 32 characters as `CODE_ALPHABET` in `server/src/index.ts`. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Room code from a join URL path such as `/AB3D`. */
export function roomCodeFromPath(pathname: string): string | undefined {
  const segments = pathname.split('/').filter((part) => part.length > 0);
  if (segments.length !== 1) {
    return undefined;
  }
  const code = (segments[0] ?? '').toUpperCase();
  if (code.length !== 4) {
    return undefined;
  }
  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) {
      return undefined;
    }
  }
  return code;
}
