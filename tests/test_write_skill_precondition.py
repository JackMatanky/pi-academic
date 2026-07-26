"""Regression tests for the 2026-05-02 mikdashim failure modes."""
from pathlib import Path

WS = Path("skills/academic-writer-write/SKILL.md")

def test_write_skill_has_existing_article_precondition():
    text = WS.read_text(encoding="utf-8")
    assert "articles/" in text
    assert "/skill:academic-writer-edit" in text
    assert "already exists" in text.lower() or "test -f" in text or "[ -f" in text
