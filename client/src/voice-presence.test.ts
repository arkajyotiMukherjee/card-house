import { describe, expect, it } from 'vitest';
import {
  HEADSET_PIXELS,
  lobbyVoiceMemberIds,
  tableVoiceMemberIds,
  type PresenceRef,
} from './voice-presence';

const rows: PresenceRef[] = [
  { lobbyId: 'lobby_1', tableId: '', lobbyMemberId: 'member_a' },
  { lobbyId: 'lobby_1', tableId: 'table_1', lobbyMemberId: 'member_b' },
  { lobbyId: 'lobby_2', tableId: '', lobbyMemberId: 'member_c' },
  { lobbyId: 'lobby_1', tableId: 'table_2', lobbyMemberId: 'member_d' },
];

describe('voice presence', () => {
  it('lists only members in this lobby voice channel', () => {
    expect([...lobbyVoiceMemberIds(rows, 'lobby_1')]).toEqual(['member_a']);
    expect([...lobbyVoiceMemberIds(rows, 'lobby_2')]).toEqual(['member_c']);
  });

  it('lists only members in this table voice channel', () => {
    expect([...tableVoiceMemberIds(rows, 'table_1')]).toEqual(['member_b']);
    expect([...tableVoiceMemberIds(rows, 'table_2')]).toEqual(['member_d']);
  });

  it('shows nothing when no table is open or no row exists', () => {
    expect(tableVoiceMemberIds(rows, '').size).toBe(0);
    expect(tableVoiceMemberIds([], 'table_1').size).toBe(0);
    expect(lobbyVoiceMemberIds([], 'lobby_1').size).toBe(0);
  });

  it('keeps every headset row the same width', () => {
    const width = HEADSET_PIXELS[0].length;
    for (const row of HEADSET_PIXELS) {
      expect(row.length).toBe(width);
    }
  });
});
