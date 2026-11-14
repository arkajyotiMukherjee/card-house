# Staged room economy migration

Do not publish this schema directly over the prior production schema. SpacetimeDB cannot automatically remove or reorder populated table columns. Never use `--delete-data` to bypass that refusal.

The migration helper preserves table ids, room ids, seats, private browser-session ownership, and exact `stateJson`. It removes the retired competition metadata while keeping its games as ordinary legacy tables. Old poker chips cannot be cashed into new wallets.

## Prepare

Keep the old commit available locally (default `571a9c01f4bdb90d4840a6ed8448f401e2a05050`). Use the database owner's authenticated CLI session. Ensure the CLI can build the module and that dependencies are installed. Choose a durable, operator-only output directory; it contains a private database backup.

```sh
python scripts/migrate-room-economy.py \
  --server http://127.0.0.1:3000 \
  --database room-economy-migration \
  --output /tmp/economy-upgrade
```

Without `--apply`, this exports a backup and prepares temporary bridge modules, without changing database state. `--spacetime` and `--root-dir` support a non-default CLI installation. Never commit the output directory or credentials.

## Apply only during an authorized rollout

Arrange a brief maintenance window and suspend normal client access. Keep the backup until the post-migration checks are accepted. Run the same command with `--apply`. A remote URL also requires `--allow-remote`; that flag does not replace deployment authorization.

The helper performs these steps, always using `--delete-data=never`:

1. Publish a temporary bridge with the old schema. Normal gameplay reducers are unavailable and scheduled gameplay/cleanup callbacks are paused.
2. Atomically archive all table rows in a private backup table, empty the old table, and remove obsolete competition records. Only the database owner can perform this step.
3. Publish a second bridge that removes the now-empty old tables.
4. Publish the new module and restore table rows under the new schema in one transaction. Restore prior host ordering for legacy tables and bind existing private sessions to their wallets before accepting claims.
5. Resume scheduled play, verify row counts and exact game state, and write `proof.json`. Update/reload the client and bot against the new generated bindings.

New rooms and tables get the economy defaults. Legacy games finish under their old chip rules. No original game-table chips are credited to the new ledger.

## Recovery and verification

If interrupted, preserve the original output directory and run the same command with `--resume --apply`. The helper detects whether tables are archived, removed, or already restored. An already-restored migration is a no-op. Do not delete the private archive or reset the database to recover an interruption. Keep clients in maintenance until restoration succeeds.

Check that room and seat counts match the backup, `stateJson` is identical, the private table archive is empty, and the migration phase is `restored`. Reconnect two existing browser identities, finish an existing game, then create a new paid table and verify its reservation and settlement. Restore replay and unauthorized restore calls must be rejected.

The cloud rehearsal preserved an active poker hand, both seats, and three table records without resetting the local database. Rehearsal evidence is linked from [the evidence index](room-economy-evidence/README.md). Production has not been migrated or deployed.

SpacetimeDB's [automatic migration documentation](https://spacetimedb.com/docs/databases/automatic-migrations/) explains the compatibility restriction; the temporary bridges implement a staged migration rather than erasing data.
