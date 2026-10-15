/** In-room fields that share one keyboard. Only one can be active. */
export type RoomComposer = 'name' | 'chat';

export interface RoomComposerControl {
  active(): RoomComposer | undefined;
  focus(composer: RoomComposer): void;
  blur(composer: RoomComposer): void;
  clear(): void;
  watch(listener: () => void): () => void;
}

export function createRoomComposer(): RoomComposerControl {
  let active: RoomComposer | undefined;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    active: () => active,
    focus(composer: RoomComposer): void {
      if (active === composer) {
        return;
      }
      active = composer;
      emit();
    },
    blur(composer: RoomComposer): void {
      if (active !== composer) {
        return;
      }
      active = undefined;
      emit();
    },
    clear(): void {
      if (active === undefined) {
        return;
      }
      active = undefined;
      emit();
    },
    watch(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Shared by the lobby name field and the lobby chat composer. */
export const roomComposer = createRoomComposer();
