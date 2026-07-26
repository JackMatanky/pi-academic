import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "resolve-csl.py"


def run_resolver(*args, cwd=None):
    return subprocess.run(
        ["python3", str(SCRIPT), *args],
        cwd=cwd or ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def test_resolves_bundled_aliases():
    for alias, filename in {
        "apa": "apa.csl",
        "mla": "modern-language-association.csl",
        "chicago": "chicago-notes-bibliography.csl",
    }.items():
        result = run_resolver(alias)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip().endswith(f"scripts/lib/csl/{filename}")


def test_resolves_project_custom_csl(tmp_path):
    csl_dir = tmp_path / ".academic-helper" / "csl"
    csl_dir.mkdir(parents=True)
    custom = csl_dir / "custom-journal.csl"
    custom.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text">\n'
        '  <info><title>Custom Journal</title><id>custom-journal</id></info>\n'
        '</style>\n',
        encoding="utf-8",
    )

    result = run_resolver("custom-journal.csl", cwd=tmp_path)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(custom.resolve())


def test_unknown_style_without_download_fails_cleanly(tmp_path):
    result = run_resolver("definitely-not-a-real-style-id-xyz", cwd=tmp_path)
    assert result.returncode != 0
    assert "Unknown CSL style" in result.stderr
