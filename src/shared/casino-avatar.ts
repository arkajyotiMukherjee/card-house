export interface CasinoAvatar {
  body: number;
  skin: number;
  hair: number;
  hairColor: number;
  outfit: number;
  color: number;
  pantsColor: number;
}
export const NO_AVATAR_HAIR = 4;

export const AVATAR_OPTIONS = {
  body: ['Straight', 'Tailored'],
  skin: ['Ivory', 'Peach', 'Bronze', 'Umber'],
  hair: ['Crop', 'Swept', 'Long', 'High top', 'No hair'],
  hairColor: ['Ink', 'Chestnut', 'Honey', 'Silver', 'Plum'],
  outfit: ['Jacket', 'Vest', 'Shirt'],
  color: ['Teal', 'Burgundy', 'Gold', 'Indigo', 'Rose'],
  pantsColor: ['Black', 'Slate', 'Navy', 'Brown', 'Olive', 'Wine'],
} as const;
export const AVATAR_FIELDS = Object.keys(
  AVATAR_OPTIONS,
) as (keyof CasinoAvatar)[];
export const DEFAULT_AVATAR: CasinoAvatar = {
  body: 0,
  skin: 1,
  hair: 1,
  hairColor: 1,
  outfit: 0,
  color: 0,
  pantsColor: 0,
};
export function readCasinoAvatar(raw: string): CasinoAvatar | undefined {
  if (raw.length > 128) return undefined;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return undefined;
    const avatar = { ...DEFAULT_AVATAR };
    for (const field of AVATAR_FIELDS) {
      // Avatars saved before the pants and shoes selector used black.
      if (field === 'pantsColor' && !(field in value)) continue;
      const index = value[field];
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= AVATAR_OPTIONS[field].length
      )
        return undefined;
      avatar[field] = index;
    }
    return avatar;
  } catch {
    return undefined;
  }
}
