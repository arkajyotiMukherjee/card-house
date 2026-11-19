#!/usr/bin/env python3
"""Publish Card House and retire the old counters when required."""

import argparse
import re
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:3000")
    parser.add_argument("--database", required=True)
    parser.add_argument("--spacetime", default="spacetime")
    parser.add_argument("--root-dir")
    parser.add_argument("--config-path")
    parser.add_argument("--allow-remote", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"http://(localhost|127\.0\.0\.1):[0-9]+", args.server) and not args.allow_remote:
        parser.error("Use --allow-remote for an authorized rollout")

    repo = Path(__file__).resolve().parents[1]
    cli = [args.spacetime]
    if args.root_dir:
        cli.extend(["--root-dir", args.root_dir])
    if args.config_path:
        cli.extend(["--config-path", args.config_path])
    target = ["--server", args.server, args.database]

    def publish(module, *, allow_counter_migration=False):
        result = subprocess.run(
            [
                *cli, "publish", *target, "--module-path", str(module),
                "--delete-data=never", "--yes=remote,migrate,break-clients,skip-login",
                "--no-config",
            ],
            cwd=repo,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        log = re.sub(r"([?&]token=)[^&\s)]+", r"\1[redacted]", result.stdout)
        print(log, end="", flush=True)
        if result.returncode == 0:
            return True
        output = re.sub(r"\x1b\[[0-9;]*m", "", result.stdout)
        if (
            allow_counter_migration
            and "Cannot remove table `ClientStats`: table contains data" in output
        ):
            return False
        result.check_returncode()

    if publish(repo / "server", allow_counter_migration=True):
        return

    print("Retiring the obsolete ClientStats counters.", flush=True)
    with tempfile.TemporaryDirectory(prefix="cardhouse-stats-") as directory:
        root = Path(directory)
        bridge = root / "server"
        shutil.copytree(repo / "server", bridge, ignore=shutil.ignore_patterns("node_modules", "dist", ".env*"))
        (bridge / "node_modules").symlink_to(repo / "server/node_modules", target_is_directory=True)
        (root / "src").symlink_to(repo / "src", target_is_directory=True)
        path = bridge / "src/index.ts"
        source = path.read_text()
        definition = "const RoomWallet = table("
        schema_entry = "    ArchivedWinnings,"
        if source.count(definition) != 1 or source.count(schema_entry) != 1:
            raise RuntimeError("The final schema changed. Review the bridge before running this migration.")
        # The bridge keeps the retired schema with no remaining writers.
        source = source.replace(definition, """const ClientStats = table(
  { name: 'ClientStats', public: true },
  {
    clientId: t.string().primaryKey(),
    handsPlayed: t.u32(),
    gamesWon: t.u32(),
  },
);

""" + definition)
        path.write_text(source.replace(schema_entry, schema_entry + "\n    ClientStats,"))
        publish(bridge)
        subprocess.run(
            [*cli, "sql", *target, 'DELETE FROM "ClientStats"', "-y"],
            cwd=repo,
            check=True,
        )
    publish(repo / "server")


if __name__ == "__main__":
    main()
