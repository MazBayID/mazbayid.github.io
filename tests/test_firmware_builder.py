#!/usr/bin/env python3
"""Basic regression checks for the static NEO_CLOCK Firmware Builder page."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path


PAGE = Path("firmware-builder/index.html")


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.variant_values: list[str] = []
        self.module_scripts: list[str] = []
        self._in_module = False

    def handle_starttag(self, tag: str, attrs) -> None:
        values = dict(attrs)
        if "id" in values:
            self.ids.append(values["id"])
        if tag == "input" and values.get("name") == "variant":
            self.variant_values.append(values.get("value", ""))
        if tag == "script" and values.get("type") == "module":
            self._in_module = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_module:
            self._in_module = False

    def handle_data(self, data: str) -> None:
        if self._in_module:
            self.module_scripts.append(data)


class FirmwareBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = PAGE.read_text(encoding="utf-8")
        cls.parser = PageParser()
        cls.parser.feed(cls.html)

    def test_required_controls_exist(self) -> None:
        required = {
            "buildBtn", "statusBox", "downloadMerged", "downloadAdvanced",
            "connectBtn", "flashBtn", "flashLog", "gpioGrid",
        }
        self.assertTrue(required.issubset(set(self.parser.ids)))

    def test_ids_are_unique(self) -> None:
        duplicates = sorted({item for item in self.parser.ids if self.parser.ids.count(item) > 1})
        self.assertEqual(duplicates, [], f"Duplicate HTML IDs: {duplicates}")

    def test_all_firmware_profiles_are_available(self) -> None:
        self.assertEqual(
            set(self.parser.variant_values),
            {"via_wifi", "via_chronos", "mochi_chronos"},
        )

    def test_kofi_modal_has_a_working_open_handler(self) -> None:
        for page in (Path("index.html"), PAGE):
            html = page.read_text(encoding="utf-8")
            self.assertIn('id="kofi-modal"', html, str(page))
            self.assertIn('id="kofiframe"', html, str(page))
            self.assertIn("function toggleKofi(open=kofiModal.hidden)", html, str(page))
            self.assertIn("kofiModal.hidden=!open", html, str(page))

    def test_frontend_does_not_contain_server_credentials(self) -> None:
        forbidden = ("SUPABASE_SERVICE_ROLE_KEY", "GITHUB_TOKEN", "BUILDER_CALLBACK_SECRET")
        for marker in forbidden:
            self.assertNotIn(marker, self.html)

    def test_flash_safety_checks_are_present(self) -> None:
        for marker in (
            "esp32-c3", "4*1024*1024", "SHA-256", "eraseAll:true",
            "address:0x0000", "confirm(",
        ):
            self.assertIn(marker, self.html)

    def test_rate_limit_uses_only_cf_client_ip(self) -> None:
        source = Path("firmware-builder/supabase/functions/firmware-build/index.ts").read_text(encoding="utf-8")
        fingerprint = source.split("async function fingerprintHash", 1)[1].split("function newStatusToken", 1)[0]
        self.assertIn('req.headers.get("cf-connecting-ip")', fingerprint)
        self.assertNotIn("x-forwarded-for", fingerprint)
        self.assertNotIn("x-real-ip", fingerprint)
        self.assertIn("rate_limit_identity_unavailable", source)
        self.assertIn("function isValidClientIp", source)
        self.assertIn("if (Object.values(config).includes(2))", source)
        self.assertIn('new URL("http://[" + value + "]/', source)

    def test_client_ip_validator_accepts_and_rejects_expected_values(self) -> None:
        source = Path("firmware-builder/supabase/functions/firmware-build/index.ts").read_text(encoding="utf-8")
        start = source.index("function isValidClientIp")
        end = source.index("async function fingerprintHash", start)
        validator = source[start:end].replace("function isValidClientIp(value: string)", "function isValidClientIp(value)")
        script = validator + """
if (!isValidClientIp("203.0.113.5")) process.exit(1);
if (!isValidClientIp("2001:db8::1")) process.exit(2);
if (isValidClientIp("256.1.1.1")) process.exit(3);
if (isValidClientIp("not-an-ip")) process.exit(4);
if (isValidClientIp("2001:::1")) process.exit(5);
"""
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8") as test_script:
            test_script.write(script)
            test_script.flush()
            result = subprocess.run(["node", test_script.name], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_callback_rejects_terminal_state_replays(self) -> None:
        source = Path("firmware-builder/supabase/functions/firmware-build-callback/index.ts").read_text(encoding="utf-8")
        self.assertIn('build.status !== "queued" && build.status !== "building"', source)
        self.assertIn('.in("status", ["queued", "building"])', source)
        self.assertIn('.eq("github_run_id", runId)', source)
        self.assertIn('invalid_workflow_identity', source)

    def test_callback_uses_single_processing_claim(self) -> None:
        callback = Path("firmware-builder/supabase/functions/firmware-build-callback/index.ts").read_text(encoding="utf-8")
        migration = Path("firmware-builder/supabase/migrations/20261120004733_callback_processing_lease.sql").read_text(encoding="utf-8")
        self.assertIn('"claim_firmware_build_callback"', callback)
        self.assertIn("callback_claimed_at: null", callback)
        self.assertIn("callback_already_processing", callback)
        self.assertIn("set callback_claimed_at = now(), github_run_id = p_run_id", migration)
        self.assertIn("callback_claimed_at is null", migration)

    def test_callback_validates_artifact_provenance_and_sizes(self) -> None:
        callback = Path("firmware-builder/supabase/functions/firmware-build-callback/index.ts").read_text(encoding="utf-8")
        for marker in (
            "EXPECTED_REPOSITORY_ID", "EXPECTED_WORKFLOW_IDS",
            "workflowRun.head_sha !== sourceSha", "runMeta.workflow_id",
            "runMeta.run_attempt", "EXPECTED_WORKFLOW_PATHS",
            "EXPECTED_ARTIFACT_PREFIXES", "artifact_archive_size_mismatch",
            "MAX_ARTIFACT_ARCHIVE_BYTES",
            "MAX_EXPANDED_ARTIFACT_BYTES", "MAX_ADVANCED_ZIP_BYTES",
            "MAX_BUILD_INFO_BYTES", "artifact_file_set_invalid",
            "readResponseBounded", "readBodyBounded", "unzipBounded",
            "UnzipInflate", "UnzipPassThrough",
        ):
            self.assertIn(marker, callback)

    def test_module_javascript_syntax(self) -> None:
        self.assertTrue(self.parser.module_scripts, "No JavaScript module found")
        source = "\n".join(self.parser.module_scripts)
        with tempfile.NamedTemporaryFile("w", suffix=".mjs", encoding="utf-8") as script:
            script.write(source)
            script.flush()
            result = subprocess.run(
                ["node", "--check", script.name],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
