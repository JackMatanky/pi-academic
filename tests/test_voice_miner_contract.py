"""Contract test for voice-miner agent definition."""

from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "agents" / "voice-miner.md"


def test_voice_miner_agent_exists():
    assert AGENT.is_file()


def test_voice_miner_frontmatter_complete():
    text = AGENT.read_text()
    assert text.startswith("---\n")
    fm_end = text.index("\n---\n", 4)
    fm = yaml.safe_load(text[4:fm_end])
    # `model` is intentionally absent from pi-subagents frontmatter — omitting it
    # makes the agent inherit the current Pi default model instead of pinning a
    # Claude-only alias.
    for k in ("name", "description", "tools"):
        assert k in fm, f"missing frontmatter key: {k}"
    assert "model" not in fm, (
        "model should be omitted so the agent inherits the Pi default"
    )
    assert fm["name"] == "voice-miner"


def test_voice_miner_specifies_io_contract():
    text = AGENT.read_text()
    assert "past-articles/" in text or "corpus" in text.lower()
    assert ".voice/fingerprint.md" in text
    assert "## Inputs" in text or "**Inputs**" in text
    assert "## Outputs" in text or "**Outputs**" in text
