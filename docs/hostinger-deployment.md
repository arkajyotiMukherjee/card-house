# Deploy Card House to Hostinger

This repository is a pnpm workspace. The browser client is a Vite app in `client/`; the SpacetimeDB module and Discord bot are separate services. The existing Hostinger website for the client is `cardhouse.arkaive.studio` and serves static files.

## Production settings

Vite embeds these values in the client at build time. The current live client uses these production settings; set them in the shell that runs the build:

```sh
export SPACETIMEDB_HOST='wss://maincloud.spacetimedb.com'
export SPACETIMEDB_DB='cardhouse'
export CARDROOM_BOT_URL='https://bot.arkaive.studio'
```

Do not use the development defaults (`ws://127.0.0.1:3000`, `cardroom`, or `http://127.0.0.1:8787`) for a production build. The host and database are public client settings, not credentials. Never put a SpacetimeDB auth token or Discord secret in the client build.

## Build and upload

Start from the intended branch and install the locked workspace dependencies:

```sh
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
```

The build writes the static site to `client/dist/`. Make an archive with the built files at its root (not a containing `dist` folder):

```sh
cd client/dist
zip -r ../../cardhouse_YYYYMMDD_HHMMSS.zip .
cd ../..
```

Upload the archive to the `public_html` storage for `cardhouse.arkaive.studio` with Hostinger's TUS upload URL. Deploy it with the Hostinger **Deploy static site archive** operation, using the uploaded archive path. This replaces the site's current contents. Keep the uploaded archive outside the built site files.

## Verify

After deployment, check that `https://cardhouse.arkaive.studio/` returns HTTP 200 and serves the Card House page. Open the app and confirm it connects to the production SpacetimeDB host. The site loads without the Discord bot, but Discord name lookups need `CARDROOM_BOT_URL` to point to the deployed bot.

The Pixel Poker Pack source art under `card-assest -pack/` is licensed for use in this private repository and must not be published as a downloadable source folder. The client build contains only the sheets copied into `client/public/assets/` for runtime use.

## Automatic deployment from main

`.github/workflows/deploy.yml` runs on every push to `main`, including pull request merges. It can also run manually from the Actions tab on `main`. It installs the locked dependencies, runs type checks and tests, publishes `server/` to Maincloud, and deploys and verifies `client/dist/`. The last steps build a standalone Node.js package for the Discord bot, deploy it to `bot.arkaive.studio`, and verify that Discord linking reports ready on the new commit.

The production job uses these encrypted repository Actions secrets:

| Secret | Purpose |
| --- | --- |
| `HOSTINGER_API_TOKEN` | Deploy the client archive for `cardhouse.arkaive.studio` and the Node.js archive for `bot.arkaive.studio`. |
| `SPACETIMEDB_TOKEN` | Publish the existing `cardhouse` database using its owner's SpacetimeDB login token. |

The Hostinger token `cardhouse-github-actions` was created on 2026-11-15 with a one-year expiry. Replace the encrypted secret before it expires or if the token is revoked. Create replacement tokens in Hostinger's API settings; never paste them into repository files, workflow YAML, issue comments, or logs. Use GitHub Settings → Secrets and variables → Actions, or pipe the token to `gh secret set HOSTINGER_API_TOKEN` through standard input. The SpacetimeDB token must belong to an identity permitted to publish `cardhouse`.

Only the publish and deploy steps receive their required secrets. Upload credentials stay in process memory and API errors are sanitized. The temporary SpacetimeDB config is created with owner-only permissions and deleted when publishing exits. Third-party Actions are pinned to commit SHAs, and the SpacetimeDB CLI is pinned to 2.12.0 with its release SHA-256 checksum.

### Discord bot settings in hPanel

Use the existing Node.js application at `bot.arkaive.studio`. The workflow reads environment variable names from hPanel before requesting a build and preserves the existing values. The application needs `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_OAUTH_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`, `CARDROOM_PUBLIC_URL`, `SPACETIMEDB_HOST`, `SPACETIMEDB_DB`, and `CARDHOUSE_BOT_SESSION_FILE`. Point the session file at the bot's existing credential on persistent storage outside the application deployment directory. See [walkable casino](walkable-casino.md) for the redirect URI and database operator role. A bot error after client verification leaves the published client and database live.

Maincloud is published with `--delete-data=never`. The workflow handles the planned [retirement of the old counters](room-economy.md#retiring-the-hands-and-wins-counters) when the old table still has rows. Other incompatible schema changes fail the release and require a separately planned migration. A successful database publish followed by a failed client upload can leave the previous client live against the newer module, so keep reducer/schema changes compatible with the previous client where possible. Failed runs stop with an error and require a separate rollback when necessary.

Production deploys run one at a time without cancelling an active publish. GitHub keeps only one pending run, so rapid merges may coalesce into the latest release. Successful runs verify the live entry HTML and JavaScript match the build. To retry a transient failure, rerun the failed workflow or dispatch it on `main`. To roll back application code, revert the change on `main`; the resulting workflow must still pass the database compatibility check.

The API deployment script follows Hostinger's [upload URL API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingFilesApi.md) and [static archive deployment API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingWebsitesApi.md). It is the non-interactive equivalent of the manual upload above.
