#!/usr/bin/env python3
"""Resolve a CSL style reference to a local .csl file path.

Supports:
- common human-friendly aliases (apa, mla, chicago 18 author-date, etc.)
- project/user paths to existing .csl files
- cached .academic-writer/csl/*.csl files
- Zotero / Citation Style Language style ids, downloaded to .academic-writer/csl/
- direct https://www.zotero.org/styles/... or raw .csl URLs

The script prints the resolved absolute path on success and exits non-zero with a
clear error on failure. It has no third-party dependencies.
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

POPULAR_STYLES = {
    "apa": "apa",
    "apa-7": "apa",
    "apa-7th": "apa",
    "apa-7th-edition": "apa",
    "american-psychological-association": "apa",
    "mla": "modern-language-association",
    "modern-language-association": "modern-language-association",
    "chicago": "chicago-notes-bibliography",
    "chicago-18": "chicago-notes-bibliography",
    "chicago-notes": "chicago-notes-bibliography",
    "chicago-notes-bibliography": "chicago-notes-bibliography",
    "chicago-note-bibliography": "chicago-notes-bibliography",
    "chicago-fullnote-bibliography": "chicago-fullnote-bibliography",
    "chicago-18-notes-bibliography": "chicago-notes-bibliography",
    "chicago-18-notes-and-bibliography": "chicago-notes-bibliography",
    "chicago-author-date": "chicago-author-date",
    "chicago-18-author-date": "chicago-author-date",
    "turabian": "turabian-fullnote-bibliography",
    "turabian-notes": "turabian-fullnote-bibliography",
    "harvard": "harvard-cite-them-right",
    "harvard-cite-them-right": "harvard-cite-them-right",
    "ieee": "ieee",
    "nature": "nature",
    "vancouver": "vancouver",
    "ama": "american-medical-association",
    "american-medical-association": "american-medical-association",
    "apsa": "american-political-science-association",
    "american-political-science-association": "american-political-science-association",
    "asa": "american-sociological-association",
    "american-sociological-association": "american-sociological-association",
    "mhra": "modern-humanities-research-association",
    "modern-humanities-research-association": "modern-humanities-research-association",
    "elsevier-harvard": "elsevier-harvard",
    "cell": "cell",
    "science": "science",
}

ZOTERO_STYLE_BASE = "https://www.zotero.org/styles"
RAW_CSL_BASE = "https://raw.githubusercontent.com/citation-style-language/styles/master"


def _looks_like_csl(path: Path) -> bool:
    try:
        head = path.read_text(encoding="utf-8", errors="ignore")[:2048].lower()
    except OSError:
        return False
    return "<style" in head and (
        "citationstyles.org" in head or "purl.org/net/xbiblio/csl" in head
    )


def _validate_csl(path: Path) -> Path:
    if not path.is_file():
        raise SystemExit(f"CSL file not found: {path}")
    if path.suffix.lower() != ".csl":
        raise SystemExit(f"CSL path must end in .csl: {path}")
    if not _looks_like_csl(path):
        raise SystemExit(f"File does not look like a CSL style: {path}")
    return path.resolve()


def _alias_key(style: str) -> str:
    value = style.strip().lower()
    if value.endswith(".csl"):
        value = value[:-4]
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def _style_id(style: str) -> str:
    raw = style.strip()
    if raw.endswith(".csl"):
        raw = raw[:-4]
    return POPULAR_STYLES.get(_alias_key(raw), raw)


def _safe_cache_name(style_id: str) -> str:
    name = _style_id(style_id).strip().removesuffix(".csl")
    if "/" in name or ".." in name or not name:
        raise SystemExit(f"Invalid CSL style id: {style_id}")
    return name


def _download_url(url: str, target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urlopen(url, timeout=15) as response:
            data = response.read()
    except HTTPError as exc:
        raise SystemExit(f"CSL URL not found: {url} ({exc.code})") from exc
    except URLError as exc:
        raise SystemExit(f"Could not download CSL URL {url}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise SystemExit(f"Timed out downloading CSL URL: {url}") from exc

    target.write_bytes(data)
    return _validate_csl(target)


def _download_style(style_id: str, cache_dir: Path) -> Path:
    safe_id = _safe_cache_name(style_id)
    target = cache_dir / f"{safe_id}.csl"
    if target.exists():
        return _validate_csl(target)

    errors: list[str] = []
    for url in (f"{ZOTERO_STYLE_BASE}/{safe_id}", f"{RAW_CSL_BASE}/{safe_id}.csl"):
        try:
            return _download_url(url, target)
        except SystemExit as exc:
            errors.append(str(exc))

    raise SystemExit(
        f"CSL style id not found via Zotero or citation-style-language/styles: {safe_id}. "
        + " | ".join(errors)
    )


def _url_cache_target(url: str, cache_dir: Path) -> Path:
    path = urlparse(url).path.rstrip("/")
    name = Path(path).name or "style"
    if name == "styles" or not name:
        name = "style"
    if not name.endswith(".csl"):
        name = f"{name}.csl"
    return cache_dir / name


def resolve_style(
    style: str, package_root: Path, project_root: Path, download: bool
) -> Path:
    del package_root  # kept for backward-compatible CLI calls
    raw = style.strip()
    if not raw:
        raise SystemExit("CSL style is empty")

    cache_dir = project_root / ".academic-writer" / "csl"
    if raw.startswith(("https://", "http://")):
        target = _url_cache_target(raw, cache_dir)
        return _validate_csl(target) if target.exists() else _download_url(raw, target)

    if raw.endswith(".csl") or os.sep in raw:
        candidates: list[Path] = []
        p = Path(os.path.expanduser(raw))
        if p.is_absolute():
            candidates.append(p)
        else:
            candidates.extend([project_root / p, cache_dir / p.name])
        for candidate in candidates:
            if candidate.exists():
                return _validate_csl(candidate)
        if raw.endswith(".csl") and download:
            return _download_style(raw[:-4], cache_dir)
        raise SystemExit(
            f"CSL file not found. Tried: {', '.join(str(c) for c in candidates)}"
        )

    style_id = _style_id(raw)
    cached = cache_dir / f"{_safe_cache_name(style_id)}.csl"
    if cached.exists():
        return _validate_csl(cached)

    if download:
        return _download_style(style_id, cache_dir)

    raise SystemExit(
        f"Unknown CSL style '{raw}'. Use a common alias, a Zotero/CSL style id, a .csl path/URL, or rerun with --download."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve custom/downloaded CSL styles for Academic Writer"
    )
    parser.add_argument(
        "style",
        help="Common alias (apa/mla/chicago), .csl path/URL, Zotero style id, or CSL repository id",
    )
    parser.add_argument(
        "--package-root",
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--project-root", default=os.getcwd())
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download missing style ids from Zotero/CSL into .academic-writer/csl/",
    )
    args = parser.parse_args()

    path = resolve_style(
        args.style,
        Path(args.package_root).resolve(),
        Path(args.project_root).resolve(),
        args.download,
    )
    print(path)


if __name__ == "__main__":
    main()
