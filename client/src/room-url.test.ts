// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLastRoom, readLastRoom, rememberLobby } from './last-room';
import { roomCodeFromPath, showLobbyUrl } from './join-path';

describe('shareable room URL', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  it('puts a joined room in the address and preserves its saved session', () => {
    rememberLobby('9j6p', 'Arko');
    showLobbyUrl('9j6p');
    expect(window.location.pathname).toBe('/9J6P');
    expect(roomCodeFromPath(window.location.pathname)).toBe('9J6P');
    expect(readLastRoom()?.lobbyCode).toBe('9J6P');
  });
  it('restores the URL of a saved lobby opened from the homepage', () => {
    rememberLobby('RAZH', 'Arko');
    expect(window.location.pathname).toBe('/');
    const saved = readLastRoom()!;
    showLobbyUrl(saved.lobbyCode);
    expect(window.location.pathname).toBe('/RAZH');
    expect(readLastRoom()).toEqual(saved);
  });
  it('clears the room URL when leaving the room', () => {
    rememberLobby('9J6P', 'Arko');
    showLobbyUrl('9J6P');
    clearLastRoom();
    expect(window.location.pathname).toBe('/');
  });
});
