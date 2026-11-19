#!/usr/bin/env python3
"""Basic regression checks for the static NEO_CLOCK Firmware Builder page."""

from __future__ import annotations

import re
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

    def test_module_javascript_syntax(self) -> None:
        self.assertTrue(self.parser.module_scripts, "No JavaScript module found")
        source = "\\n".join(self.parser.module_scripts)
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
