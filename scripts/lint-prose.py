#!/usr/bin/env python3
"""Report advisory English prose-pattern matches in a Markdown file.

Findings are prompts for contextual editorial review, never style violations.
The linter does not modify its input and always exits successfully when a file
is read, whether or not it reports findings.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import NamedTuple, NotRequired, TypedDict, cast


class Rule(NamedTuple):
    rule_id: str
    description: str
    pattern: re.Pattern[str]


class Finding(TypedDict):
    """One contextual finding from the advisory rule set."""

    id: str
    line: int
    excerpt: str
    message: str
    matchedText: NotRequired[str]
    relatedLines: NotRequired[list[int]]


RULES = (
    Rule(
        "chatbot-residue",
        "Possible conversational residue; keep it if the genre or context calls for it.",
        re.compile(
            r"\b(?:I hope this helps|Let me know if you'd like|Would you like me to|"
            r"Great question|Certainly|Of course)\b",
            re.IGNORECASE,
        ),
    ),
    Rule(
        "staged-opener",
        "Possible run-up before the point; check whether it adds meaning or voice.",
        re.compile(
            r"^\s*(?:let['’]?s\s+(?:dive in|explore|break this down)|"
            r"here['’]s what you need to know|without further ado|"
            r"honestly\??|real talk)\s*[.!,:—–-]?",
            re.IGNORECASE,
        ),
    ),
    Rule(
        "inflated-significance",
        "Possible inflated significance; retain when the source supports the claim.",
        re.compile(
            r"\b(?:stands as a testament|marking a pivotal moment|plays a key role|"
            r"underscores its importance|evolving landscape)\b",
            re.IGNORECASE,
        ),
    ),
    Rule(
        "meta-announcement",
        "Possible announcement or transition that may be replaceable with the point itself.",
        re.compile(
            r"\b(?:it is worth noting that|it is important to note that|"
            r"what is striking (?:here|is)|in light of the foregoing|taken together)\b",
            re.IGNORECASE,
        ),
    ),
)

FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
INLINE_CODE_RE = re.compile(r"(`+).*?\1")
LINK_RE = re.compile(r"!?\[([^\]]+)\]\([^)]*\)")
CITATION_RE = re.compile(r"\[@[^\]]*\]")
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
WORD_RE = re.compile(r"[\w’'-]+", re.UNICODE)


def _visible_lines(text: str) -> list[tuple[int, str]]:
    """Return visible prose lines with original 1-based line numbers."""
    lines = text.splitlines()
    visible: list[tuple[int, str]] = []
    in_frontmatter = bool(lines and lines[0].strip() == "---")
    fence_char: str | None = None
    fence_length = 0

    for line_number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if in_frontmatter:
            if line_number > 1 and stripped in {"---", "..."}:
                in_frontmatter = False
            continue

        fence_match = FENCE_RE.match(line)
        if fence_char is not None:
            if (
                fence_match
                and fence_match.group(1)[0] == fence_char
                and len(fence_match.group(1)) >= fence_length
            ):
                fence_char = None
                fence_length = 0
            continue
        if fence_match:
            fence = fence_match.group(1)
            fence_char, fence_length = fence[0], len(fence)
            continue

        if re.match(r"^\s{0,3}>", line):
            continue
        if re.match(r"^\s{0,3}#{1,6}\s", line):
            continue

        prose = INLINE_CODE_RE.sub("", line)
        prose = LINK_RE.sub(r"\1", prose)
        prose = CITATION_RE.sub("", prose)
        prose = URL_RE.sub("", prose)
        if prose.strip():
            visible.append((line_number, prose))
    return visible


def _excerpt(text: str) -> str:
    excerpt = " ".join(text.split())
    return excerpt if len(excerpt) <= 180 else excerpt[:177] + "..."


def _paragraph_openings(lines: list[tuple[int, str]]) -> list[Finding]:
    """Report exact repeated four-word paragraph openings as advisory matches."""
    groups: dict[str, list[tuple[int, str]]] = defaultdict(list)
    current: list[tuple[int, str]] = []

    def flush() -> None:
        if not current:
            return
        paragraph = " ".join(line for _, line in current)
        words = WORD_RE.findall(paragraph.lower())
        if len(words) >= 4:
            groups[" ".join(words[:4])].append((current[0][0], paragraph))
        current.clear()

    previous_line = 0
    for line_number, line in lines:
        if previous_line and line_number > previous_line + 1:
            flush()
        current.append((line_number, line))
        previous_line = line_number
    flush()

    findings: list[Finding] = []
    for occurrences in groups.values():
        if len(occurrences) < 2:
            continue
        occurrence_lines = [line for line, _ in occurrences]
        for line_number, paragraph in occurrences:
            related = [line for line in occurrence_lines if line != line_number]
            findings.append(
                {
                    "id": "repeated-paragraph-opening",
                    "line": line_number,
                    "relatedLines": related,
                    "excerpt": _excerpt(paragraph),
                    "message": "Several paragraphs share the same first four words; check whether the repetition is intentional.",
                }
            )
    return findings


def lint_text(text: str, file_name: str = "<input>") -> dict[str, object]:
    """Return stable, read-only advisory findings for Markdown prose."""
    visible = _visible_lines(text)
    findings: list[Finding] = []
    for line_number, line in visible:
        for rule in RULES:
            match = rule.pattern.search(line)
            if match:
                findings.append(
                    {
                        "id": rule.rule_id,
                        "line": line_number,
                        "excerpt": _excerpt(line),
                        "matchedText": match.group(0).strip(),
                        "message": rule.description,
                    }
                )
    findings.extend(_paragraph_openings(visible))
    findings.sort(key=lambda finding: (finding["line"], finding["id"]))
    return {
        "file": file_name,
        "language": "english",
        "status": "advisory",
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "markdown",
        help="English Markdown file to inspect, or - to read from standard input",
    )
    args = parser.parse_args()
    markdown = cast(str, args.markdown)
    if markdown == "-":
        text = sys.stdin.read()
        file_name = "<stdin>"
    else:
        path = Path(markdown)
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            print(f"lint-prose: {error}", file=sys.stderr)
            return 2
        file_name = str(path)

    print(json.dumps(lint_text(text, file_name), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
