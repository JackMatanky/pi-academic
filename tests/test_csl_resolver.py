import functools
import http.server
import socketserver
import subprocess
import threading
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


def write_csl(path: Path, title: str = "Custom Journal"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text">\n'
        f"  <info><title>{title}</title><id>{path.stem}</id></info>\n"
        "</style>\n",
        encoding="utf-8",
    )


def test_resolves_popular_alias_from_project_cache(tmp_path):
    cached = tmp_path / ".academic-writer" / "csl" / "apa.csl"
    write_csl(cached, "APA")

    for alias in ["apa", "APA 7th edition", "American Psychological Association"]:
        result = run_resolver(alias, cwd=tmp_path)
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == str(cached.resolve())


def test_resolves_project_custom_csl(tmp_path):
    custom = tmp_path / ".academic-writer" / "csl" / "custom-journal.csl"
    write_csl(custom)

    result = run_resolver("custom-journal.csl", cwd=tmp_path)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(custom.resolve())


def test_downloads_direct_csl_url_to_project_cache(tmp_path):
    source_dir = tmp_path / "served"
    source = source_dir / "journal.csl"
    write_csl(source, "Served Journal")

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=source_dir,
    )
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/journal.csl"
        result = run_resolver(url, cwd=tmp_path)
    finally:
        server.shutdown()
        server.server_close()

    cached = tmp_path / ".academic-writer" / "csl" / "journal.csl"
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(cached.resolve())
    assert cached.read_text(encoding="utf-8") == source.read_text(encoding="utf-8")


def test_unknown_style_without_download_fails_cleanly(tmp_path):
    result = run_resolver("definitely-not-a-real-style-id-xyz", cwd=tmp_path)
    assert result.returncode != 0
    assert "Unknown CSL style" in result.stderr
