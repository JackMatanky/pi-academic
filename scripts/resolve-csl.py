#!/usr/bin/env python3
"""Resolve a CSL style reference to a local .csl file path.

Supports:
- bundled aliases: apa, mla, chicago
- bundled filenames under scripts/lib/csl/
- project/user paths to existing .csl files
- Citation Style Language repository ids, downloaded/cached to .academic-helper/csl/

The script prints the resolved absolute path on success and exits non-zero with a
clear error on failure. It has no third-party dependencies.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ALIASES = {
    "apa": "apa.csl",
    "mla": "modern-language-association.csl",
    "modern-language-association": "modern-language-association.csl",
    "chicago": "chicago-notes-bibliography.csl",
    "chicago-notes": "chicago-notes-bibliography.csl",
    "chicago-notes-bibliography": "chicago-notes-bibliography.csl",
}

RAW_CSL_BASE = (
    "https://raw.githubusercontent.com/citation-style-language/styles/master"
)


def _looks_like_csl(path: Path) -> bool:
    try:
        head = path.read_text(encoding="utf-8", errors="ignore")[:2048].lower()
    except OSError:
        return False
    return (
        "<style" in head
        and "citationstyles.org" in head
        or "purl.org/net/xbiblio/csl" in head
    )


def _validate_csl(path: Path) -> Path:
    if not path.is_file():
        raise SystemExit(f"CSL file not found: {path}")
    if path.suffix.lower() != ".csl":
        raise SystemExit(f"CSL path must end in .csl: {path}")
    if not _looks_like_csl(path):
        raise SystemExit(f"File does not look like a CSL style: {path}")
    return path.resolve()


def _download_style(style_id: str, cache_dir: Path) -> Path:
    safe_id = style_id[:-4] if style_id.endswith(".csl") else style_id
    if "/" in safe_id or ".." in safe_id or not safe_id:
        raise SystemExit(f"Invalid CSL style id: {style_id}")

    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / f"{safe_id}.csl"
    if target.exists():
        return _validate_csl(target)

    url = f"{RAW_CSL_BASE}/{safe_id}.csl"
    try:
        with urlopen(url, timeout=15) as response:
            data = response.read()
    except HTTPError as exc:
        raise SystemExit(
            f"CSL style id not found in citation-style-language/styles: {safe_id} ({exc.code})"
        ) from exc
    except URLError as exc:
        raise SystemExit(
            f"Could not download CSL style {safe_id}: {exc.reason}"
        ) from exc
    except TimeoutError as exc:
        raise SystemExit(f"Timed out downloading CSL style: {safe_id}") from exc

    target.write_bytes(data)
    return _validate_csl(target)


def resolve_style(
    style: str, package_root: Path, project_root: Path, download: bool
) -> Path:
    raw = style.strip()
    if not raw:
        raise SystemExit("CSL style is empty")

    bundled_dir = package_root / "scripts" / "lib" / "csl"
    cache_dir = project_root / ".academic-helper" / "csl"

    alias = ALIASES.get(raw.lower())
    if alias:
        return _validate_csl(bundled_dir / alias)

    if raw.endswith(".csl"):
        candidates: list[Path] = []
        p = Path(os.path.expanduser(raw))
        if p.is_absolute():
            candidates.append(p)
        else:
            candidates.extend([
                project_root / p,
                cache_dir / p.name,
                bundled_dir / p.name,
            ])
        for candidate in candidates:
            if candidate.exists():
                return _validate_csl(candidate)
        if download:
            return _download_style(raw[:-4], cache_dir)
        raise SystemExit(
            f"CSL file not found. Tried: {', '.join(str(c) for c in candidates)}"
        )

    # Treat any non-path, non-alias string as a Citation Style Language style id.
    cached = cache_dir / f"{raw}.csl"
    if cached.exists():
        return _validate_csl(cached)

    bundled = bundled_dir / f"{raw}.csl"
    if bundled.exists():
        return _validate_csl(bundled)

    if download:
        return _download_style(raw, cache_dir)

    raise SystemExit(
        f"Unknown CSL style '{raw}'. Use a bundled alias, a .csl path, or rerun with --download to fetch from citation-style-language/styles."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve bundled/custom/downloaded CSL styles for Academic Writer"
    )
    parser.add_argument(
        "style",
        help="Alias (apa/mla/chicago), .csl path, bundled filename, or CSL repository id",
    )
    parser.add_argument(
        "--package-root",
        default=os.environ.get(
            "ACADEMIC_WRITER_ROOT", Path(__file__).resolve().parents[1]
        ),
    )
    parser.add_argument("--project-root", default=os.getcwd())
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download missing style ids from citation-style-language/styles into .academic-helper/csl/",
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
