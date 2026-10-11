"""Regression tests for the 2026-05-02 mikdashim failure modes."""

from pathlib import Path

WS = Path("skills/academic-write/SKILL.md")


def test_write_skill_has_existing_article_precondition():
    """Assert write skill has existing article precondition.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = WS.read_text(encoding="utf-8")
    assert "articles/" in text
    assert "/skill:academic-edit" in text
    assert "already exists" in text.lower() or "test -f" in text or "[ -f" in text
