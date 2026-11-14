#!/usr/bin/env python3
"""Rehearse or apply the staged room schema upgrade without resetting a database.

Default: prepare bridge modules and an operator-only backup. --apply publishes them.
Never uses --delete-data. Use --allow-remote only after a separately authorized rollout.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--server', default='http://127.0.0.1:3000')
parser.add_argument('--database', required=True)
parser.add_argument('--spacetime', default='spacetime')
parser.add_argument('--root-dir')
parser.add_argument('--legacy-ref', default='571a9c01f4bdb90d4840a6ed8448f401e2a05050')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--allow-remote', action='store_true')
parser.add_argument('--resume', action='store_true', help='Resume an interrupted upgrade using the same output directory')
args = parser.parse_args()
if args.apply and not re.fullmatch(r'https?://(localhost|127\.0\.0\.1):\d+', args.server) and not args.allow_remote:
    parser.error('A remote rollout requires explicit --allow-remote')
repo = Path(__file__).resolve().parents[1]
cli = [args.spacetime] + (['--root-dir', args.root_dir] if args.root_dir else [])
args.output.mkdir(parents=True, exist_ok=True)
os.chmod(args.output, 0o700)

def command(values, **kwargs):
    result = subprocess.run(values, cwd=repo, text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout

def sql(query):
    response = json.loads(command(cli + ['sql', args.database, '-s', args.server, '--format', 'json', query]))[0]
    columns = [entry['name']['some'] for entry in response['schema']['elements']]
    return [dict(zip(columns, row)) for row in response['rows']]

backup_file = args.output / 'before.json'
try:
    progress_rows = sql('SELECT * FROM "RoomUpgrade"')
except RuntimeError:
    progress_rows = []
progress = next((row for row in progress_rows if row['id'] == 'room-economy'), None)
if progress and not args.resume:
    raise RuntimeError('Upgrade already started; use --resume and the original --output directory')
if progress and progress['phase'] == 'restored':
    print(json.dumps({'verified': True, 'alreadyRestored': True, 'databaseReset': False}))
    raise SystemExit(0)
legacy = command(['git', 'show', args.legacy_ref + ':server/src/index.ts'])
if progress:
    if not backup_file.exists():
        raise RuntimeError('Resume requires the original before.json backup')
    backup = json.loads(backup_file.read_text())
else:
    # Include private session ownership; the backup directory is operator-only.
    names = re.findall(r"name: '([A-Z][A-Za-z]+)'", legacy)
    backup = {name: sql('SELECT * FROM "' + name + '"') for name in dict.fromkeys(names)}
    backup_file.write_text(json.dumps(backup))
    os.chmod(backup_file, 0o600)
# Database metadata exposes the publisher identity, never its credentials.
import urllib.request
metadata = json.load(urllib.request.urlopen(args.server + '/v1/database/' + args.database))
owner = metadata.get('owner_identity') or metadata.get('ownerIdentity')
if isinstance(owner, dict):
    owner = owner.get('__identity__') or owner.get('data')
if not isinstance(owner, str):
    raise RuntimeError('Cannot identify the database owner for the bridge guard')
owner = owner.removeprefix('0x')
if not re.fullmatch(r'[0-9a-fA-F]{64}', owner):
    raise RuntimeError('Invalid database owner identity')
start = legacy.index('const LobbyStatus =')
end = legacy.index('const spacetimedb = schema(')
definitions = legacy[start:end]
original_tables = legacy[legacy.index('  {\n    Lobby,', end):legacy.index('  },\n  { CASE_CONVERSION_POLICY', end)]
original_tables = original_tables.removeprefix('  {\n')
private_tables = """
const RoomUpgrade = table({ name: 'RoomUpgrade' }, {
  id: t.string().primaryKey(), ownerIdentity: t.string(), phase: t.string(),
});
const TableBackup = table({ name: 'TableBackup' }, {
  id: t.string().primaryKey(), payloadJson: t.string(),
});
"""
schedules = """
export const clean_empty_tables = spacetimedb.reducer({ name: 'clean_empty_tables', onSchedule: TableCleanupSchedule }, { schedule: TableCleanupSchedule.rowType }, () => {});
export const close_idle_lobbies = spacetimedb.reducer({ name: 'close_idle_lobbies', onSchedule: LobbyIdleSweep }, { sweep: LobbyIdleSweep.rowType }, () => {});
export const play_bot_turns = spacetimedb.reducer({ name: 'play_bot_turns', onSchedule: BotTurnSchedule }, { row: BotTurnSchedule.rowType }, () => {});
"""
archive = """
export const archive_legacy_tables = spacetimedb.reducer({ name: 'archive_legacy_tables' }, ctx => {
  if (ctx.sender.toHexString() !== OWNER) throw new SenderError('Only the migration operator may archive tables');
  if (ctx.db.RoomUpgrade.id.find('room-economy')) throw new SenderError('Migration already archived');
  for (const row of ctx.db.GameTable.iter()) {
    const payloadJson = JSON.stringify({ id: row.id, lobbyId: row.lobbyId, gameType: row.gameType,
      name: row.name, status: row.status.tag, minPlayers: row.minPlayers, maxPlayers: row.maxPlayers,
      stateJson: row.stateJson, createdAt: row.createdAt.microsSinceUnixEpoch.toString(),
      lastActivityAt: row.lastActivityAt?.microsSinceUnixEpoch.toString() ?? null,
      discordVoiceChannelId: row.discordVoiceChannelId });
    ctx.db.TableBackup.insert({ id: row.id, payloadJson });
    ctx.db.GameTable.id.delete(row.id);
  }
  for (const row of ctx.db.Tournament.iter()) ctx.db.Tournament.id.delete(row.id);
  ctx.db.RoomUpgrade.insert({ id: 'room-economy', ownerIdentity: OWNER, phase: 'archived' });
});
"""
for phase in ['archive', 'remove']:
    directory = args.output / phase
    (directory / 'src').mkdir(parents=True, exist_ok=True)
    source_definitions = definitions
    tables = original_tables
    if phase == 'remove':
        for variable, next_variable in [('GameTable', 'Tournament'), ('Tournament', 'TableCleanupSchedule')]:
            left = source_definitions.index('const ' + variable + ' = table(')
            right = source_definitions.index('const ' + next_variable + ' = table(', left)
            source_definitions = source_definitions[:left] + source_definitions[right:]
        tables = tables.replace('    GameTable,\n', '').replace('    Tournament,\n', '')
    source = "import { CaseConversionPolicy, schema, SenderError, t, table } from 'spacetimedb/server';\n"
    source += 'const OWNER = ' + json.dumps(owner) + ';\n' + source_definitions + private_tables
    source += 'const spacetimedb = schema({\n' + tables + '    RoomUpgrade, TableBackup,\n}, { CASE_CONVERSION_POLICY: CaseConversionPolicy.None });\nexport default spacetimedb;\n'
    source += schedules + (archive if phase == 'archive' else '')
    (directory / 'src/index.ts').write_text(source)
    (directory / 'package.json').write_text(json.dumps({'type': 'module', 'dependencies': {'spacetimedb': '2.10.2'}}))
    (directory / 'tsconfig.json').write_text(json.dumps({'compilerOptions': {'target': 'ES2022', 'module': 'ESNext', 'moduleResolution': 'bundler', 'skipLibCheck': True}, 'include': ['src']}))
    link = directory / 'node_modules'
    if not link.exists(): link.symlink_to(repo / 'server/node_modules', target_is_directory=True)
print(json.dumps({'prepared': True, 'applied': args.apply, 'tableCounts': {name: len(rows) for name, rows in backup.items()}}))
if not args.apply:
    print('Prepared only. No database state was changed.')
    raise SystemExit(0)

def publish(module, label):
    output = command(cli + ['publish', args.database, '-s', args.server, '-p', str(module), '--delete-data=never', '--yes=break-clients', '--yes=migrate', '--yes=skip-login', '--no-config'])
    (args.output / (label + '.log')).write_text(output)

if not progress:
    publish(args.output / 'archive', 'archive-publish')
    command(cli + ['call', args.database, 'archive_legacy_tables', '-s', args.server, '-y'])
assert len(sql('SELECT * FROM "TableBackup"')) == len(backup['GameTable'])
try:
    sql('SELECT * FROM "RoomWallet"')
    final_module = True
except RuntimeError:
    final_module = False
if not final_module:
    try:
        old_rows = sql('SELECT * FROM "GameTable"')
    except RuntimeError as error:
        if 'GameTable' not in str(error):
            raise
        old_rows = None
    if old_rows is not None:
        assert not old_rows, 'Old table was not fully archived'
        publish(args.output / 'remove', 'remove-publish')
    publish(repo / 'server', 'final-publish')
command(cli + ['call', args.database, 'restore_legacy_tables', '-s', args.server, '-y'])
after = {name: sql('SELECT * FROM "' + name + '"') for name in ['Lobby', 'LobbyMember', 'GameTable', 'GameSeat', 'TableBackup', 'RoomUpgrade']}
assert len(after['TableBackup']) == 0
for name in ['Lobby', 'LobbyMember', 'GameTable', 'GameSeat']:
    assert len(after[name]) == len(backup[name]), name + ' row count changed'
for previous in backup['GameTable']:
    restored = next(row for row in after['GameTable'] if row['id'] == previous['id'])
    assert restored['stateJson'] == previous['stateJson'], 'Game state changed'
    assert restored['economyJson'] == '', 'Legacy chips must not become wallet coins'
assert after['GameSeat'] == backup['GameSeat'], 'Seats changed'
report = {'verified': True, 'rooms': len(after['Lobby']), 'tables': len(after['GameTable']), 'seats': len(after['GameSeat']), 'gameStatesPreserved': True, 'databaseReset': False}
(args.output / 'proof.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
