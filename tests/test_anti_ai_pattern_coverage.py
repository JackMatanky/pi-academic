"""Regression tests for the 2026-05-02 mikdashim failure modes."""

from pathlib import Path

REF = Path("skills/academic-write/references/anti-ai-patterns-hebrew.md")


def test_section_A_blocks_mibchinat_paragraph_opener():
    """Assert section A blocks mibchinat paragraph opener.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = REF.read_text(encoding="utf-8")
    assert "מבחינת" in text
    assert "Per-paragraph cap: 0 as opener" in text


def test_section_A_enforces_opening_formula():
    """Assert section A enforces opening formula.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = REF.read_text(encoding="utf-8")
    assert "opening_formula" in text
    assert "במאמר זה" in text
    assert "Per-article cap: 0 violations" in text


def test_section_F_exists_with_meta_summary_patterns():
    """Assert section F exists with meta summary patterns.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = REF.read_text(encoding="utf-8")
    assert "### F. Editorial Meta-Summary" in text
    for pat in [
        "מסכמ",
        "ומכאן עולה",
        "הראוי לבחינה מדוקדקת",
        "ניתן ללמוד כי",
    ]:
        assert pat in text, f"missing F pattern: {pat}"


def test_section_G_hard_rule_present():
    """Assert section G hard rule present.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = REF.read_text(encoding="utf-8")
    assert "### G. Unsourced Factual Assertions" in text
    assert "Per-article cap: 0" in text
    assert "[NEEDS REVIEW: source for" in text


def test_section_H_blocks_quantitative_padding():
    """Assert section H blocks quantitative padding.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = REF.read_text(encoding="utf-8")
    assert "### H. Topic Drift & Padding" in text
    assert "מאה עשרים ושמונה משוררים" in text or "Quantitative trivia" in text
