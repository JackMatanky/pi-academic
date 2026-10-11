"""Behavior-level tests for the advisory Markdown prose linter."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path("scripts/lint-prose.py").resolve()


class TestProseLint(unittest.TestCase):
    def run_lint(self, root: Path, article: str) -> subprocess.CompletedProcess[str]:
        path = root / "article.md"
        path.write_text(article, encoding="utf-8")
        return subprocess.run(
            ["python3", str(SCRIPT), str(path)],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_reports_advisory_patterns_and_repeated_openings_without_editing(self):
        article = (
            "Let's dive in. This is the first claim.\n\n"
            "The author argues through careful analysis.\n\n"
            "The author argues through close reading.\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = self.run_lint(root, article)
            data = json.loads(result.stdout)

            self.assertEqual(result.returncode, 0)
            self.assertEqual(data["status"], "advisory")
            self.assertEqual(
                [(finding["id"], finding["line"]) for finding in data["findings"]],
                [
                    ("staged-opener", 1),
                    ("repeated-paragraph-opening", 3),
                    ("repeated-paragraph-opening", 5),
                ],
            )
            self.assertEqual(data["findings"][1]["relatedLines"], [5])
            self.assertEqual((root / "article.md").read_text(encoding="utf-8"), article)

    def test_ignores_frontmatter_code_quotes_inline_code_citations_and_urls(self):
        article = """---
title: Great question
summary: Let's dive in.
---

A plain sentence describes the source material.\n
> I hope this helps. Let's dive in.

`Let's dive in` and [a link](https://example.test/Let's-dive-in) stay excluded.

```text
I hope this helps. Let's dive in.
```

A supported claim [@smith2020] remains in the paragraph.
"""
        with tempfile.TemporaryDirectory() as tmp:
            result = self.run_lint(Path(tmp), article)
            data = json.loads(result.stdout)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(data["findings"], [])

    def test_reports_selected_lexical_patterns_with_stable_ids(self):
        article = (
            "The institute stands as a testament to its founders.\n"
            "It is worth noting that the archive was catalogued in 1924.\n"
            "Great question. I hope this helps.\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            result = self.run_lint(Path(tmp), article)
            data = json.loads(result.stdout)

        self.assertEqual(result.returncode, 0)
        self.assertEqual(
            [(finding["id"], finding["line"]) for finding in data["findings"]],
            [
                ("inflated-significance", 1),
                ("meta-announcement", 2),
                ("chatbot-residue", 3),
            ],
        )

    def test_clean_article_has_no_findings_and_still_exits_successfully(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.run_lint(
                Path(tmp), "The archive records the payments in 1924.\n"
            )

        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["findings"], [])


if __name__ == "__main__":
    unittest.main()
