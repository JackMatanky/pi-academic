from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / "skills" / "academic-writer-voice" / "SKILL.md"

def test_skill_exists():
    assert SKILL.is_file()

def test_skill_frontmatter_complete():
    text = SKILL.read_text()
    fm = yaml.safe_load(text.split("---")[1])
    assert fm["name"] == "academic-writer-voice"
    # `user-invocable` has no pi equivalent — every skill is both model- and
    # `/skill:name`-invocable, so the field is dropped entirely rather than
    # translated. `allowedTools` (camelCase) was renamed `allowed-tools`.
    assert "user-invocable" not in fm
    for k in ("description", "allowed-tools"):
        assert k in fm

def test_skill_lists_subactions():
    text = SKILL.read_text()
    # `sync` was dropped with the Candlekeep voice-sync removal — no sub-action
    # should push/pull through an external store anymore.
    for sub in ("init", "continue", "recompress", "audit", "quick"):
        assert f":voice {sub}" in text or f"`{sub}`" in text
    assert ":voice sync" not in text

def test_skill_invokes_correct_agents():
    text = SKILL.read_text()
    assert "voice-interviewer" in text
    assert "voice-distiller" in text
    assert "voice-calibrator" in text
    # Calibrator only on sessions 3 and 7
    assert "session 3" in text.lower() and "session 7" in text.lower()
