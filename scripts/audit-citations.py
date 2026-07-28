#!/usr/bin/env python3
"""Deterministic citation sanity checks for Academic Writer markdown.

This catches mechanical citation failures before Pandoc/export. Semantic claim
verification still belongs to the auditor agent.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

MARKER_RE = re.compile(r"\[((?:[^\[\]]|\\.)*@(?:[^\[\]]|\\.)*)\]")
CITE_KEY_RE = re.compile(r"@([A-Za-z0-9_:.#$%&+?<>~/\-]+)")
BIB_KEY_RE = re.compile(r"@\w+\s*\{\s*([^,\s]+)\s*,", re.MULTILINE)


def _inside(root: Path, candidate: str) -> Path:
    path = Path(candidate).expanduser()
    resolved = (path if path.is_absolute() else root / path).resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Path must stay inside project root: {candidate}")
    return resolved


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _collect_cite_keys(value: Any) -> set[str]:
    if isinstance(value, list):
        keys: set[str] = set()
        for item in value:
            keys.update(_collect_cite_keys(item))
        return keys
    if isinstance(value, dict):
        keys = set()
        cite_key = value.get("citeKey")
        if isinstance(cite_key, str) and cite_key.strip():
            keys.add(cite_key.strip())
        for item in value.values():
            if isinstance(item, (dict, list)):
                keys.update(_collect_cite_keys(item))
        return keys
    return set()


def _extract_markers(article: str) -> tuple[list[str], list[str], list[str]]:
    markers = [match.group(0) for match in MARKER_RE.finditer(article)]
    keys: list[str] = []
    malformed: list[str] = []
    seen: set[str] = set()
    for marker in markers:
        marker_keys = [match.group(1) for match in CITE_KEY_RE.finditer(marker)]
        if not marker_keys:
            malformed.append(marker)
        for key in marker_keys:
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return markers, keys, malformed


def audit(
    article_path: Path, citation_style: str, project_root: Path
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "ok": True,
        "article": str(article_path.relative_to(project_root)),
        "citationStyle": citation_style,
        "mode": "inline-parenthetical"
        if citation_style == "inline-parenthetical"
        else "citeproc",
        "markers": [],
        "citationKeys": [],
        "missingFromSources": [],
        "missingFromBibliography": [],
        "malformedMarkers": [],
        "warnings": [],
    }

    if not article_path.is_file():
        details["ok"] = False
        details["error"] = f"Article not found: {article_path}"
        return details

    article = article_path.read_text(encoding="utf-8")
    markers, keys, malformed = _extract_markers(article)
    details["markers"] = markers
    details["citationKeys"] = keys
    details["malformedMarkers"] = malformed

    if citation_style == "inline-parenthetical":
        if markers:
            details["ok"] = False
            details["error"] = (
                "inline-parenthetical articles must not contain Pandoc citeproc markers"
            )
        return details

    sources_path = project_root / ".academic-writer" / "sources.json"
    bibliography_path = project_root / ".academic-writer" / "bibliography.bib"

    if not markers:
        details["warnings"].append("No Pandoc citeproc markers found")
    if malformed:
        details["ok"] = False

    source_keys: set[str] = set()
    if sources_path.is_file():
        try:
            source_keys = _collect_cite_keys(_read_json(sources_path))
        except (OSError, json.JSONDecodeError) as exc:
            details["ok"] = False
            details["error"] = f"Could not read sources.json: {exc}"
            return details
    else:
        details["ok"] = False
        details["error"] = ".academic-writer/sources.json not found"
        return details

    bib_keys: set[str] = set()
    if bibliography_path.is_file():
        bib_keys = set(
            BIB_KEY_RE.findall(bibliography_path.read_text(encoding="utf-8"))
        )
    else:
        details["ok"] = False
        details["error"] = ".academic-writer/bibliography.bib not found"
        return details

    missing_sources = [key for key in keys if key not in source_keys]
    missing_bib = [key for key in keys if key not in bib_keys]
    details["missingFromSources"] = missing_sources
    details["missingFromBibliography"] = missing_bib
    if missing_sources or missing_bib:
        details["ok"] = False
    return details


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Academic Writer citations")
    parser.add_argument(
        "article", help="Markdown article path, relative to project root"
    )
    parser.add_argument("--citation-style", required=True)
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    try:
        article = _inside(root, args.article)
        result = audit(article, args.citation_style, root)
    except Exception as exc:  # noqa: BLE001 - CLI boundary, emit machine-readable failure.
        result = {"ok": False, "error": str(exc)}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
