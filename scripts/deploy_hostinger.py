"""Deploy only client/dist via Hostinger's API and TUS upload protocol.

Credentials stay in memory. Never print response bodies, URLs, or exceptions:
upload responses and HTTP errors may contain credentials.
"""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

API = "https://developers.hostinger.com/api"
DOMAIN = "cardhouse.arkaive.studio"
USERNAME = "u101590536"
SITE = f"{API}/hosting/v1/accounts/{USERNAME}/websites/{DOMAIN}"


class DeploymentError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never forward upload credentials or API tokens to a redirect destination.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, method="GET", headers=None, data=None, expected=(200,)):
    try:
        # Hostinger's edge rejects Python-urllib with Cloudflare error 1010.
        req = urllib.request.Request(
            url, data=data,
            headers={"User-Agent": "cardhouse-deploy/1.0", **(headers or {})},
            method=method,
        )
        with urllib.request.build_opener(NoRedirect).open(req, timeout=120) as response:
            if response.status not in expected:
                raise DeploymentError("Unexpected HTTP status")
            return response.read(), response.headers
    except urllib.error.HTTPError as error:
        raise DeploymentError(f"HTTP {error.code}; response withheld") from None
    except (OSError, ValueError):
        raise DeploymentError("Network request failed; details withheld") from None


def api(path, token, payload=None):
    raw, _ = request(
        path,
        method="GET" if payload is None else "POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=None if payload is None else json.dumps(payload).encode(),
        expected=(200, 201, 202, 204),
    )
    result = json.loads(raw) if raw else {}
    return result.get("data", result)


def upload(archive, credentials, remote_name):
    base = urllib.parse.urlsplit(credentials["url"])
    if base.scheme != "https" or not base.hostname or base.username or base.password:
        raise DeploymentError("Invalid HTTPS upload endpoint")
    url = credentials["url"].rstrip("/") + "/" + remote_name + "?override=true"
    headers = {
        "X-Auth": credentials["auth_key"],
        "X-Auth-Rest": credentials["rest_auth_key"],
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
    }
    size = archive.stat().st_size
    request(url, "POST", {**headers, "Upload-Length": str(size)}, b"", (201,))
    _, response_headers = request(
        url, "PATCH", {**headers, "Content-Type": "application/offset+octet-stream"},
        archive.read_bytes(), (204,),
    )
    if response_headers.get("Upload-Offset") != str(size):
        raise DeploymentError("Incomplete archive upload; refusing to deploy")


def verify(dist):
    # Compare the actual entry HTML and its hashed JS to this release, not a placeholder.
    expected = (dist / "index.html").read_bytes()
    for attempt in range(12):
        try:
            actual, _ = request(f"https://{DOMAIN}/?release={os.environ.get('GITHUB_SHA', 'manual')}")
            if actual == expected:
                for asset in (dist / "assets").glob("*.js"):
                    body, _ = request(f"https://{DOMAIN}/assets/{asset.name}")
                    if body != asset.read_bytes():
                        raise DeploymentError("Published JavaScript differs from build")
                print(f"Verified https://{DOMAIN}/")
                return
        except DeploymentError:
            pass
        if attempt < 11:
            time.sleep(10)
    raise DeploymentError("Live site did not match this release within two minutes")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("HOSTINGER_API_TOKEN")
    if not token:
        raise DeploymentError("Missing HOSTINGER_API_TOKEN")
    credentials = api(f"{API}/hosting/v1/files/upload-urls", token,
                      {"username": USERNAME, "domain": DOMAIN})
    if args.check:
        print("Hostinger upload credentials verified")
        return
    dist = Path("client/dist")
    if not (dist / "index.html").is_file():
        raise DeploymentError("Build client/dist before deploying")
    remote_name = f"cardhouse_{os.environ.get('GITHUB_RUN_ID', int(time.time()))}_{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}.zip"
    with tempfile.TemporaryDirectory() as directory:
        archive = Path(directory) / remote_name
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for file in sorted(dist.rglob("*")):
                if file.is_symlink():
                    raise DeploymentError("Refusing to package symlink")
                if file.is_file():
                    output.write(file, file.relative_to(dist))
        upload(archive, credentials, remote_name)
        api(f"{SITE}/deploy", token, {"archive_path": remote_name})
    verify(dist)


if __name__ == "__main__":
    try:
        main()
    except DeploymentError as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("Deployment failed; exception details withheld to protect credentials", file=sys.stderr)
        sys.exit(1)
