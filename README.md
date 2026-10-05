# Discord Card Games

A browser card room. One Excalibur canvas draws the table. SpacetimeDB holds lobby membership. There is no host: everyone in a room has the same permissions.

## Specs

- [Architecture](docs/architecture.md)
- [Implementation milestones](docs/implementation.md)
- [UI and UX](docs/ui-ux.md)

## Art

Sprites are SoapBoy's [Pixel Poker Pack](https://soapboyy.itch.io/pixelpokerpack), checked in under [`card-assest -pack`](card-assest%20-pack). The license allows the pack in a private team repository and forbids publishing the raw files where people outside the team can download them. Keep this GitHub repository private.

The client copies only the sheets it draws into `client/public/assets/`.

## Scripts

From the repo root, after `./scripts/bootstrap.sh`:

- `pnpm dev` — Vite client on `0.0.0.0:5173`
- `pnpm build` — production client build
- `pnpm lint` — ESLint and Prettier
- `pnpm test` — hearts sheet slice test
- `pnpm typecheck` — TypeScript for the client and the SpacetimeDB module

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
