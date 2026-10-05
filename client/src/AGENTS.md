# Client source

TypeScript for the Excalibur client. One folder holds the engine, the boot scene, sprite atlases, and the database connection. Tests sit next to the unit they check.

Style, resolution, and pixel filtering: [../../repo-conventions.md](../../repo-conventions.md). Generated bindings: [module_bindings/AGENTS.md](module_bindings/AGENTS.md).

## Files

- `main.ts` — engine at 960×540, fixed display, integer scale, loader, then `connectCardroom`.
- `boot-scene.ts` — boot scene. Draws the green table, two hearts, the card back, one chip, and a status line.
- `sheets.ts` — pixel sizes and grid math (`CARD_SIZE` 64, chip 32×44, table 129×80, logical 960×540).
- `card-atlas.ts` — `{ rank, suit }` to a sprite. Hearts only. Other suits throw.
- `chip-atlas.ts` — color or table value to a face sprite and a stack sprite on `chips-no-outline.png`.
- `table-atlas.ts` — `green`, `purple`, or `red` to a table sprite. Green is the default.
- `connect.ts` — `DbConnection.builder()` and the status string. Host and database come from `__SPACETIMEDB_HOST__` and `__SPACETIMEDB_DB__`.
- `vite-env.d.ts` — those two compile-time globals.
- `test-setup.ts` — Node stubs so Excalibur can load under Vitest.
- `*.test.ts` — Vitest. Pixel checks read `../public/assets/` with `pngjs`. `table-atlas.test.ts` uses `@vitest-environment happy-dom`.

`sheets.ts` is shared geometry. The atlases map names onto that geometry. `boot-scene.ts` still places a few cells itself for the static demo.

## Changes

Keep `ImageFiltering.Pixel` on every `ImageSource`. Change a cell in `sheets.ts` or the atlas map, then update the test that reads the PNG.

The hearts sheet is not a straight Ace-to-King grid. Row 0 column 0 is blank. Row 2 is 10, Jack, a joker, King, Queen. Read the comment in `card-atlas.ts` before moving a rank.

`CardAtlas` takes the hearts image and the card back. `ChipAtlas` takes the chip sheet. `TableAtlas` constructs its own image sources from `/assets/table-*.png`.

New connection behavior goes through `connect.ts`. Import tables and reducers from `module_bindings`, which re-exports the generated module.

Run `pnpm test` and `pnpm --filter client typecheck` from the repo root.

## Leave alone

Do not edit `module_bindings/` by hand.

Do not turn antialiasing on, and do not scale the canvas by a fraction. `integerScale` in `sheets.ts` is the scale `main.ts` applies.

Do not validate a move here. Send an intent later; the module decides.
