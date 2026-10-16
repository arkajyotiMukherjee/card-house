# Discord Card Games

A browser card room. One Excalibur canvas draws the table. SpacetimeDB holds lobby membership. There is no host: everyone in a room has the same permissions.

## Specs

- [Architecture](docs/architecture.md)
- [Implementation milestones](docs/implementation.md)
- [UI and UX](docs/ui-ux.md)
- [Discord bot](docs/discord-bot-architecture.md)

## Art

Sprites are SoapBoy's [Pixel Poker Pack](https://soapboyy.itch.io/pixelpokerpack), checked in under [`card-assest -pack`](card-assest%20-pack). The license allows the pack in a private team repository and forbids publishing the raw files where people outside the team can download them. Keep this GitHub repository private.

The client copies the sheets it draws into `client/public/assets/`: hearts card fronts (`cards-hearts.png`, plus `cards-diamonds.png`, `cards-clubs.png`, and `cards-spades.png`), the dark standard deck variant for the personal card style a player can pick (`cards-hearts-dark.png`, `cards-diamonds-dark.png`, `cards-clubs-dark.png`, `cards-spades-dark.png`), card back 01 and 02 (`card-back-01.png`, `card-back-02.png`), chips without an outline (`chips-no-outline.png`), and the green table (`table-green.png`). The pack has no pixel font. `press-start-2p.ttf` is Press Start 2P by Cody Boisclair, under the SIL Open Font License 1.1, which allows storing it in this private repository. The license note is `press-start-2p-LICENSE.txt` beside the font.

## Scripts

From the repo root, after `./scripts/bootstrap.sh`:

- `pnpm dev` — Vite client on `0.0.0.0:5173`
- `pnpm build` — production client build
- `pnpm lint` — ESLint and Prettier
- `pnpm test` — client tests, server rules tests, and discord-bot tests
- `pnpm typecheck` — TypeScript for the client, the SpacetimeDB module, the Discord bot, and `src/shared`
- `pnpm --filter discord-bot start` — Discord `/interactions` service for `/cardhouse create`, `/cardhouse status`, and `/cardhouse close`

## Local SpacetimeDB

No hosted account is required. `scripts/bootstrap.sh` is safe to run again:

1. Ensures `pnpm` and the `spacetime` CLI are on `/usr/local/bin` (login shells do not load `~/.bashrc`).
2. Installs workspace dependencies.
3. Starts a local SpacetimeDB if that port is not already open, and waits until it answers.
4. Publishes the module in `server/` to the database named by `SPACETIMEDB_DB` (default `cardroom`).
5. Generates TypeScript client bindings into `client/src/module_bindings/`.

The client reads:

- `SPACETIMEDB_HOST` (default `ws://127.0.0.1:3000`)
- `SPACETIMEDB_DB` (default `cardroom`)

Do not commit an auth token. A hosted database can be selected later by setting those variables in the environment.

The Discord service reads the same `SPACETIMEDB_HOST` and `SPACETIMEDB_DB`. It also reads `DISCORD_PUBLIC_KEY` (required to start), `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` (required only to register `/cardhouse create`, `/cardhouse status`, and `/cardhouse close`), optional `DISCORD_GUILD_ID`, `CARDROOM_PUBLIC_URL` (default `http://127.0.0.1:5173`), and `PORT` (default `8787`).
