"""Exercise the TUS safety checks without touching the live website."""

import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

import deploy_hostinger as deploy


class UploadTests(unittest.TestCase):
    def test_api_can_read_unwrapped_hostinger_lists(self):
        with patch.object(deploy, "request", return_value=(b'[{"key":"DISCORD_PUBLIC_KEY"}]', {})):
            self.assertEqual(deploy.api("https://api.example.test", "token"), [{"key": "DISCORD_PUBLIC_KEY"}])

    def test_identifies_application_instead_of_blocked_python_client(self):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.status = 200
        response.__enter__.return_value.read.return_value = b"ok"
        with patch("urllib.request.OpenerDirector.open", return_value=response) as open_request:
            deploy.request("https://api.example.test")
        self.assertEqual(open_request.call_args.args[0].get_header("User-agent"), "cardhouse-deploy/1.0")

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.archive = Path(self.directory.name) / "site.zip"
        self.archive.write_bytes(b"zip-content")
        self.credentials = {
            "url": "https://upload.example.test/files",
            "auth_key": "private-upload-key",
            "rest_auth_key": "private-rest-key",
        }

    def test_tus_upload_requires_complete_offset(self):
        with patch.object(deploy, "request", side_effect=[(b"", {}), (b"", {"Upload-Offset": "11"})]) as request:
            deploy.upload(self.archive, self.credentials, "release.zip")
        create, write = request.call_args_list
        self.assertEqual(create.args[1], "POST")
        self.assertEqual(create.args[2]["Upload-Length"], "11")
        self.assertEqual(write.args[1], "PATCH")
        self.assertEqual(write.args[3], b"zip-content")
        self.assertNotIn("Authorization", write.args[2])

    def test_partial_upload_cannot_deploy(self):
        with patch.object(deploy, "request", side_effect=[(b"", {}), (b"", {"Upload-Offset": "3"})]):
            with self.assertRaisesRegex(deploy.DeploymentError, "Incomplete"):
                deploy.upload(self.archive, self.credentials, "release.zip")

    def test_rejects_plaintext_upload_endpoint(self):
        self.credentials["url"] = "http://upload.example.test/files"
        with patch.object(deploy, "request") as request:
            with self.assertRaises(deploy.DeploymentError):
                deploy.upload(self.archive, self.credentials, "release.zip")
            request.assert_not_called()

    def test_api_error_does_not_expose_response_or_url(self):
        error = urllib.error.HTTPError("https://secret-url", 401, "private-token", {}, io.BytesIO(b"private-body"))
        with patch("urllib.request.OpenerDirector.open", side_effect=error):
            with self.assertRaises(deploy.DeploymentError) as result:
                deploy.request("https://api.example.test")
        self.assertEqual(str(result.exception), "HTTP 401; response withheld")

    def test_redirects_never_forward_credentials(self):
        self.assertIsNone(deploy.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.test"))


if __name__ == "__main__":
    unittest.main()
