import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("scripts/audit-citations.py").resolve()


class TestCitationAudit(unittest.TestCase):
    def run_audit(self, root: Path, article: str, style: str):
        res = subprocess.run(
            [
                "python3",
                str(SCRIPT),
                article,
                "--citation-style",
                style,
                "--project-root",
                str(root),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(res.stdout)

    def test_citeproc_requires_sources_and_bibliography_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".academic-helper").mkdir()
            (root / "articles").mkdir()
            (root / "articles" / "ok.md").write_text(
                "Text [@smith2020, p. 4].", encoding="utf-8"
            )
            (root / ".academic-helper" / "sources.json").write_text(
                json.dumps([{"citeKey": "smith2020"}]),
                encoding="utf-8",
            )
            (root / ".academic-helper" / "bibliography.bib").write_text(
                "@book{smith2020,\n  title={Book}\n}\n",
                encoding="utf-8",
            )

            data = self.run_audit(root, "articles/ok.md", "chicago")

            self.assertTrue(data["ok"])
            self.assertEqual(data["citationKeys"], ["smith2020"])

    def test_citeproc_reports_missing_bib_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".academic-helper").mkdir()
            (root / "article.md").write_text("Text [@missing2020].", encoding="utf-8")
            (root / ".academic-helper" / "sources.json").write_text(
                json.dumps([{"citeKey": "missing2020"}]),
                encoding="utf-8",
            )
            (root / ".academic-helper" / "bibliography.bib").write_text(
                "", encoding="utf-8"
            )

            data = self.run_audit(root, "article.md", "apa")

            self.assertFalse(data["ok"])
            self.assertEqual(data["missingFromBibliography"], ["missing2020"])

    def test_citeproc_reports_malformed_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".academic-helper").mkdir()
            (root / "article.md").write_text("Text [@].", encoding="utf-8")
            (root / ".academic-helper" / "sources.json").write_text(
                "[]", encoding="utf-8"
            )
            (root / ".academic-helper" / "bibliography.bib").write_text(
                "", encoding="utf-8"
            )

            data = self.run_audit(root, "article.md", "mla")

            self.assertFalse(data["ok"])
            self.assertEqual(data["malformedMarkers"], ["[@]"])

    def test_inline_mode_rejects_pandoc_markers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "article.md").write_text("Text [@smith2020].", encoding="utf-8")

            data = self.run_audit(root, "article.md", "inline-parenthetical")

            self.assertFalse(data["ok"])
            self.assertIn("inline-parenthetical", data["error"])


if __name__ == "__main__":
    unittest.main()
