from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "voice-distiller.md"


def test_distiller_exists():
    """Assert distiller exists.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    assert AGENT.is_file()


def test_distiller_frontmatter():
    """Assert distiller frontmatter.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    fm = yaml.safe_load(text.split("---")[1])
    assert fm["name"] == "voice-distiller"


def test_distiller_writes_author_voice():
    """Assert distiller writes author voice.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    assert "AUTHOR_VOICE.md" in text
    assert ".voice/interview" in text
    assert "fingerprint.md" in text


def test_distiller_states_section_structure():
    """Assert distiller states section structure.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    for s in (
        "Core voice",
        "Terminology",
        "Academic-specific",
        "Non-fiction-book-specific",
    ):
        assert s in text


def test_distiller_states_token_budget():
    """Assert distiller states token budget.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    assert "2,000" in text or "2000" in text
    assert "5,000" in text or "5000" in text
