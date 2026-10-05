/** localStorage key for the anonymous per-browser identity. Keep this name stable. */
export const CLIENT_ID_STORAGE_KEY = 'clientId';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): string {
  const existing = storage.getItem(CLIENT_ID_STORAGE_KEY)?.trim() ?? '';
  if (existing.length > 0 && UUID_PATTERN.test(existing)) {
    return existing;
  }
  const clientId = crypto.randomUUID();
  storage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  return clientId;
}
