"""Structural tests for the voice subsystem."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_author_voice_at_root_exists():
    """Assert author voice at root exists.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    assert (ROOT / "AUTHOR_VOICE.md").is_file()


def test_voice_dir_exists():
    """Assert voice dir exists.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    assert (ROOT / ".voice").is_dir()
    assert (ROOT / ".voice" / ".gitkeep").is_file()


def test_voice_artifacts_gitignored():
    """Assert voice artifacts gitignored.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    gi = (ROOT / ".gitignore").read_text()
    assert ".voice/*" in gi
    assert "!.voice/.gitkeep" in gi
