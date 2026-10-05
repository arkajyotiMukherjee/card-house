# Module bindings

Generated TypeScript client for the SpacetimeDB module. `scripts/bootstrap.sh` writes this folder with `spacetime generate --lang typescript`. The files say edits will not be saved.

The module source is [../../../server/src/index.ts](../../../server/src/index.ts). Conventions: [../../../repo-conventions.md](../../../repo-conventions.md).

## Changes

Change a table or reducer in `server/src/index.ts`, publish the module, then generate again. `scripts/bootstrap.sh` does both. The client imports `DbConnection` from `index.ts` in this folder.

ESLint and Prettier ignore `module_bindings`. The generator uses its own quotes and layout. Leave that formatting as generated.

## Leave alone

Do not hand-edit, reformat, or commit a partial rewrite of these files. A missing reducer on the client means the module changed and generate has not been run.
