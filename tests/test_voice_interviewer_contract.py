"""Contract test for voice-interviewer agent."""

from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "voice-interviewer.md"
QUESTIONS = ROOT / "skills" / "academic-writer-voice" / "questions-academic.md"


def test_voice_interviewer_exists():
    assert AGENT.is_file()


def test_voice_interviewer_frontmatter():
    text = AGENT.read_text()
    fm_end = text.index("\n---\n", 4)
    fm = yaml.safe_load(text[4:fm_end])
    assert fm["name"] == "voice-interviewer"
    # `model` is intentionally absent — see test_voice_miner_contract.py.
    for k in ("description", "tools"):
        assert k in fm
    assert "model" not in fm


def test_voice_interviewer_references_question_bank():
    text = AGENT.read_text()
    assert "questions-academic.md" in text or "question bank" in text.lower()


def test_voice_interviewer_specifies_session_state():
    text = AGENT.read_text()
    assert ".voice/interview/" in text
    assert "resume" in text.lower()


def test_voice_interviewer_states_per_session_cap():
    text = AGENT.read_text()
    assert "12" in text and "18" in text  # soft floor and hard cap


def test_question_bank_exists():
    assert QUESTIONS.is_file()
