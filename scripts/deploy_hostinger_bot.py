"""Roll out the Discord service without replacing its runtime environment."""

import argparse
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.parse import urlencode
from uuid import UUID
import zipfile

from deploy_hostinger import API, DeploymentError, api, request, upload

DOMAIN = "bot.arkaive.studio"
REQUIRED_ENV = {
    "DISCORD_APPLICATION_ID",
    "DISCORD_BOT_TOKEN",
    "DISCORD_PUBLIC_KEY",
    "DISCORD_OAUTH_CLIENT_SECRET",
    "DISCORD_OAUTH_REDIRECT_URI",
    "CARDHOUSE_BOT_SESSION_FILE",
    "CARDROOM_PUBLIC_URL",
    "SPACETIMEDB_DB",
    "SPACETIMEDB_HOST",
}
PACKAGE_FILES = ("index.js", "package.json", "package-lock.json")


def target(token):
    websites = api(f"{API}/hosting/v1/websites?{urlencode({'domain': DOMAIN})}", token)
    if not isinstance(websites, list):
        raise DeploymentError("Hostinger did not return a website list")
    matches = [site for site in websites if site.get("domain") == DOMAIN]
    if len(matches) != 1:
        raise DeploymentError(f"Expected one Hostinger website for {DOMAIN}")
    username = matches[0].get("username")
    if not isinstance(username, str) or not re.fullmatch(r"u[0-9]+", username):
        raise DeploymentError("Unexpected Hostinger account username")
    builds = f"{API}/hosting/v1/accounts/{username}/websites/{DOMAIN}/nodejs/builds"
    try:
        variables = api(f"{builds}/settings/env", token)
    except DeploymentError as error:
        raise DeploymentError(f"Reading Node.js environment for {DOMAIN} failed ({error})") from None
    if not isinstance(variables, list):
        raise DeploymentError("Hostinger did not return a Node.js environment variable list")
    missing = REQUIRED_ENV - {variable["key"] for variable in variables}
    if missing:
        raise DeploymentError(f"Set these variables on {DOMAIN} in hPanel: {', '.join(sorted(missing))}")
    return username, builds


def build_archive(package, archive):
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for name in PACKAGE_FILES:
            file = package / name
            if file.is_symlink() or not file.is_file():
                raise DeploymentError(f"Missing bot package file: {name}")
            output.write(file, name)


def start_build(package, username, builds, token, release):
    # Each run gets its own source archive so a retry cannot replace a running build.
    remote_name = f"cardhouse_bot_{release[:12]}_{time.time_ns()}.zip"
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / remote_name
        build_archive(package, archive)
        credentials = api(
            f"{API}/hosting/v1/files/upload-urls", token,
            {"username": username, "domain": DOMAIN},
        )
        upload(archive, credentials, remote_name)

    options = {"archive_path": remote_name, "message": f"Card House Discord bot {release[:12]}"}
    query = urlencode({"archive_path": remote_name})
    detected = api(f"{builds}/settings/from-archive?{query}", token)
    if detected.get("app_type") != "express" or "build" not in detected.get("available_scripts", []):
        raise DeploymentError("Hostinger did not recognize the archive as an Express app")
    result = api(builds, token, {
        "node_version": 22,
        "app_type": detected["app_type"],
        "root_directory": detected.get("root_directory") or ".",
        "output_directory": ".",
        "build_script": "build",
        "entry_file": "index.js",
        "package_manager": "npm",
        "source_type": "archive",
        "source_options": options,
    })
    try:
        build_id = str(UUID(result["uuid"]))
    except (KeyError, TypeError, ValueError, AttributeError):
        raise DeploymentError("Hostinger did not return a Node.js build ID") from None
    print(f"Started Hostinger bot build {build_id}", flush=True)
    return build_id


def verify(builds, build_id, token, release):
    status_url = f"https://{DOMAIN}/casino/discord/status"
    current = False
    for attempt in range(36):
        result = api(f"{builds}/{build_id}", token)
        if result.get("state") in {"failed", "cancelled", "canceled"}:
            raise DeploymentError(f"Hostinger bot build {build_id} failed. See the build log in hPanel.")
        try:
            raw, _ = request(status_url)
            status = json.loads(raw)
            current = status.get("release") == release
            if current and status.get("available") is True:
                print(f"Verified Discord bot {release[:12]} at {status_url}")
                return
        except (DeploymentError, ValueError):
            pass
        if attempt < 35:
            time.sleep(10)
    if current:
        raise DeploymentError("Bot release is live, but Discord linking or the database connection is unavailable")
    raise DeploymentError(f"Bot did not serve this release after build {build_id}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    args = parser.parse_args()
    token = os.environ.get("HOSTINGER_API_TOKEN")
    release = os.environ.get("GITHUB_SHA", "")
    if not token or not re.fullmatch(r"[a-f0-9]{40}", release):
        raise DeploymentError("HOSTINGER_API_TOKEN and GITHUB_SHA are required")
    username, builds = target(token)
    build_id = start_build(args.package, username, builds, token, release)
    verify(builds, build_id, token, release)


if __name__ == "__main__":
    try:
        main()
    except DeploymentError as error:
        print(f"Discord bot deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(f"Discord bot deployment failed ({type(error).__name__}); details withheld to protect credentials",
              file=sys.stderr)
        sys.exit(1)
