# Card House game sound

The Walnut Club pack contains 27 cues and 34 takes. Its physical sounds use recorded cards, chips, footsteps, and other objects. The pitched interface and result cues use [jsfxr](https://sfxr.me/) with added harmonics. Keep the original source, author, license, and edit description in the [sound credits](../client/public/assets/sfx/CREDITS.md) when you replace a recording.

## Where playback lives

| Change | File |
| --- | --- |
| Edit audio slices or add a cue name | [`sfx-cues.ts`](../client/src/sfx-cues.ts) and [`walnut-club.wav`](../client/public/assets/sfx/walnut-club.wav) |
| Change playback, repeat limits, or the mix | [`game-audio.ts`](../client/src/game-audio.ts) |
| Change volume controls | [`audio-settings.ts`](../client/src/audio-settings.ts) |
| Change music or the jukebox track list | [`game-music.ts`](../client/src/game-music.ts) |
| Change walking, reception, or jukebox cues | [`casino-floor.ts`](../client/src/casino-floor.ts) |
| Change live table actions or results | [`game-scene-view.ts`](../client/src/game-scene-view.ts) and [`table-sfx.ts`](../client/src/table-sfx.ts) |

`gameAudio.play(cue)` plays one slice of the packed WAV through the effects gain. The browser decodes the pack once and starts the audio context after a player gesture. Music uses its own gain. The Music and SFX sliders default to 35% and 70%, with both values saved in `localStorage` under `cardhouseAudio`. The player can set either slider to zero to mute that channel.

## Replace or add a clip

Run these commands from the repository root with the same Node version used for the game. Start with a new directory so the original editable exports are available for comparison.

```sh
node --experimental-strip-types scripts/walnut-sfx.mjs unpack /tmp/cardhouse-sfx-clips
```

1. Open a clip in an audio editor. Pick the take by listening for the action and comparing it with nearby cues. A deal should have a clear landing, a slide should have audible motion, a flip should have a crisp turn, and a stack of chips should have multiple contacts.
2. Edit the source out of band and export a 44.1 kHz mono, signed 16-bit PCM WAV. Trim leading dead air, keep the useful attack and tail, and use short edge fades. Listen on small speakers at the default Music and SFX volumes. Leave headroom for overlapping card and chip sounds.
3. Replace the file in the clip directory. Use `cue.wav` for a single clip or `cue_01.wav`, `cue_02.wav`, and so on for related takes. Keep existing cue names when replacing audio. For a new cue, add a new lowercase snake-case name and hook it up after the cue index is regenerated.
4. Write the replacement pair to a fresh directory, then copy both files into the game in the same commit.

```sh
node --experimental-strip-types scripts/walnut-sfx.mjs pack /tmp/cardhouse-sfx-clips /tmp/cardhouse-sfx-build
cp /tmp/cardhouse-sfx-build/walnut-club.wav client/public/assets/sfx/walnut-club.wav
cp /tmp/cardhouse-sfx-build/sfx-cues.ts client/src/sfx-cues.ts
```

The cue index uses a zero-based sample-frame start and a frame count. A new clip length can shift every later start. The packer reads the exported WAVs, concatenates their PCM data, and regenerates both files together. Replacing a recording in isolation uses the same playback hooks. The runtime cycles alternate takes and gives them slight pitch and level variation.

## Change when a cue plays

- Put local interface feedback in the accepted button, key, or touch handler. Use the most specific cue for the action. Keep hover quiet and use the repeat limits in `game-audio.ts` when an interaction can fire quickly.
- Put public table cues on confirmed `GameEvent` rows or meaningful `GameTable` state changes. Use scene animation timing for groups of cards. Keep playback scoped to the player's current table and skip initial subscription snapshots.
- Derive paid outcomes from the live `GameSettlement` row, with one result per settlement ID. Call `gameAudio.result()` for a win, loss, or neutral result. This path gives the result priority over chip, rank, turn, and countdown cues. Spectators hear the public chip payout.
- Follow the local avatar's movement and floor surface for footsteps. Trigger the reception bell on arrival and the vinyl cue when the selected track starts playing.

## Verify

Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Use desktop and touch controls to check the edited cue after a gesture and verify both sliders and mute persistence. For an event change, use two local clients at the same table and check playback during an action, a reload, and a result. If you edit a result or countdown, finish a paid Bluff game and check for one result cue per player, one tick each at 3, 2, and 1, and a return to the lobby. Listen to a labeled audition before shipping a new sound pack.
