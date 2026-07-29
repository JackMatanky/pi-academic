"""Regression tests for the 2026-05-02 mikdashim failure modes."""

from pathlib import Path

DR = Path("agents/deep-reader.md")


def test_deep_reader_has_chapter_enumeration_trigger():
    """Assert deep reader has chapter enumeration trigger.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = DR.read_text(encoding="utf-8")
    assert (
        "לאורך הספרים" in text
        or "across all books" in text
        or "across both books" in text
    )
    assert "chapter_coverage" in text


def test_deep_reader_chapter_coverage_schema():
    """Assert deep reader chapter coverage schema.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = DR.read_text(encoding="utf-8")
    assert "covered" in text
    assert "skipped-irrelevant" in text
