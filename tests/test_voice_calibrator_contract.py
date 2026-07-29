from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "voice-calibrator.md"


def test_calibrator_exists():
    """Assert calibrator exists.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    assert AGENT.is_file()


def test_calibrator_frontmatter():
    """Assert calibrator frontmatter.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    fm = yaml.safe_load(text.split("---")[1])
    assert fm["name"] == "voice-calibrator"


def test_calibrator_invoked_only_on_3_and_7():
    """Assert calibrator invoked only on 3 and 7.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    assert "session 3" in text.lower() and "session 7" in text.lower()


def test_calibrator_runs_rule_coverage():
    """Assert calibrator runs rule coverage.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    assert "rule coverage" in text.lower() or "rule-coverage" in text.lower()
    assert ".voice/audit.md" in text


def test_calibrator_three_questions():
    """Assert calibrator three questions.

    This component keeps the surrounding module contract explicit and testable.

    Returns:
        None.
    """
    text = AGENT.read_text()
    # Three calibration questions
    assert "sound like you" in text.lower()
    assert "banned" in text.lower()
    assert "wrong" in text.lower() and "missing" in text.lower()
