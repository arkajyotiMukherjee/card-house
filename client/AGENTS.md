# Client

The browser app. Excalibur draws the table. Vite serves it. SpacetimeDB connection settings are injected at build time.

Style and asset rules: [../repo-conventions.md](../repo-conventions.md). Source files: [src/AGENTS.md](src/AGENTS.md).

## Files

- `package.json` — `dev`, `build`, `typecheck`, `test`. Dependencies are `excalibur` `0.32.0` and `spacetimedb` `2.10.2`.
- `tsconfig.json` — strict TypeScript, `include` is `src` only.
- `vite.config.ts` — `0.0.0.0:5173`, `envDir` the repo root, `__SPACETIMEDB_HOST__`, `__SPACETIMEDB_DB__`, and `__CARDROOM_BOT_URL__`.
- `vitest.config.ts` — Node environment, `src/**/*.test.ts`, setup `src/test-setup.ts`.
- `index.html` — `#app` and one canvas. Page background `#000000`, so the bars around the frame are black. The viewport meta has `viewport-fit=cover`, and `html, body` set `touch-action: manipulation` and `overscroll-behavior: none`. On every browser `main.ts` fits the whole frame inside the visible area and safe insets. `image-rendering: pixelated` on `canvas`.
- `public/assets/` — the sheets, tables, and Press Start 2P font the client loads. Paths are `/assets/...`.

## Changes

Add a runtime image by copying it into `public/assets/` from `card-assest -pack`. Load it with `ex.ImageFiltering.Pixel`. Root `pnpm dev`, `pnpm build`, `pnpm test`, and `pnpm typecheck` already include this package. `pnpm test` also runs the server rules tests.

`SPACETIMEDB_HOST` and `SPACETIMEDB_DB` are read in `vite.config.ts` when Vite starts. Defaults are `ws://127.0.0.1:3000` and `cardroom`. Do not commit an auth token.

## Leave alone

Do not import files from `card-assest -pack` in the client. That folder is source art.

Do not add menus or buttons as HTML. `docs/ui-ux.md` keeps UI on the canvas. `index.html` only hosts it. A text field is the exception: while it can be typed in, `src/html-field.ts` places a real HTML input on that box so a phone or tablet keyboard can type. The canvas label shows the same value, and a gold block caret is drawn on the canvas at the pixel-font insertion point. The input caret stays hidden. Antialiasing stays off. The phone shell (`src/mobile-shell.ts`: rotate panel and fullscreen button) is the other HTML exception. It is a plain-DOM layer next to the canvas and only shows on a coarse pointer without hover.

Do not put game rules in this package. Legality belongs in the SpacetimeDB module.
