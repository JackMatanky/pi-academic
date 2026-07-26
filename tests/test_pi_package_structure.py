
import json
import os
import re
import unittest
import yaml
import subprocess

def _read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def _parse_frontmatter(path):
    content = _read(path)
    fm_match = re.match(r'^---\n(.*?)\n---\n(.*)', content, re.DOTALL)
    if not fm_match: return None, content
    try:
        fm = yaml.safe_load(fm_match.group(1))
        return fm, fm_match.group(2)
    except yaml.YAMLError:
        return None, content

class TestSkills(unittest.TestCase):
    def test_skills_frontmatter(self):
        skills_dir = "skills"
        self.assertTrue(os.path.isdir(skills_dir))
        names = set()
        
        for d in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, d, "SKILL.md")
            if not os.path.isfile(skill_path): continue
            
            fm, body = _parse_frontmatter(skill_path)
            self.assertIsNotNone(fm, f"Missing frontmatter in {skill_path}")
            self.assertIn("name", fm)
            self.assertEqual(fm["name"], d, f"Skill name {fm['name']} does not match directory {d}")
            self.assertIn("description", fm)
            self.assertNotIn("user-invocable", fm)
            self.assertNotIn("agents", fm)
            
            self.assertNotIn(fm["name"], names, f"Duplicate skill name {fm['name']}")
            names.add(fm["name"])
            
            self.assertGreater(len(body.strip()), 50, f"Body too short in {skill_path}")

class TestAgents(unittest.TestCase):
    def test_agents_frontmatter(self):
        agents_dir = "agents"
        self.assertTrue(os.path.isdir(agents_dir))
        
        expected_agents = [
            "deep-reader.md", "architect.md", "section-writer.md", 
            "auditor.md", "synthesizer.md", "proofreader.md", 
            "voice-miner.md", "voice-interviewer.md", "voice-distiller.md", 
            "voice-calibrator.md"
        ]
        
        for agent_file in expected_agents:
            agent_path = os.path.join(agents_dir, agent_file)
            self.assertTrue(os.path.isfile(agent_path), f"Missing agent {agent_file}")
            
            fm, body = _parse_frontmatter(agent_path)
            self.assertIsNotNone(fm, f"Missing frontmatter in {agent_path}")
            self.assertNotIn("model", fm, f"Model key should be dropped in {agent_path}")
            
            if "tools" in fm:
                tools_str = fm["tools"]
                self.assertIsInstance(tools_str, str, f"tools must be a scalar string in {agent_path}")
                # pi-subagents' frontmatter parser splits tools ONLY on commas
                # (src/agents/frontmatter.ts: parseFrontmatterList -> value.split(",")).
                # A space-separated list with no commas parses as one malformed
                # tool name, silently breaking the agent's entire tool allowlist.
                tools = [t.strip() for t in tools_str.split(',')]
                self.assertGreater(len(tools), 0, f"Empty tools list in {agent_path}")
                for tool in tools:
                    self.assertNotIn(' ', tool, f"tools entry {tool!r} contains a space in {agent_path} — tools: must be comma-separated, not space-separated")
                    if tool.startswith("mcp:"):
                        # mcp:<server> or mcp:<server>/<tool> — never the Claude Code
                        # mcp__server__tool double-underscore convention.
                        self.assertNotIn("__", tool, f"invalid mcp tool grant {tool!r} in {agent_path} — use mcp:<server> or mcp:<server>/<tool>")
                        continue
                    self.assertTrue(tool.islower() or tool == "subagent", f"Invalid tool format {tool} in {agent_path}")
                        
            if not agent_file.startswith("voice-"):
                self.assertIn("## Input", body, f"Missing Input section in {agent_path}")
            if not agent_file.startswith("voice-"):
                self.assertIn("## Output", body, f"Missing Output section in {agent_path}")

class TestPackageManifest(unittest.TestCase):
    def test_package_json(self):
        path = "package.json"
        self.assertTrue(os.path.isfile(path))
        with open(path, "r") as f:
            data = json.load(f)
            
        self.assertIn("name", data)
        self.assertIn("version", data)
        self.assertIn("pi-package", data.get("keywords", []))
        
        deps = data.get("dependencies", {})
        self.assertIn("pi-subagents", deps)
        self.assertIn("pi-mcp-adapter", deps)
        self.assertIn("pi-web-access", deps)
        
        self.assertIn("pi-subagents", data)
        self.assertIn("agents", data["pi-subagents"])
        self.assertIn("./agents", data["pi-subagents"]["agents"])
        self.assertTrue(os.path.isdir("agents"))

class TestJSON(unittest.TestCase):
    def test_json_validity(self):
        for root, dirs, files in os.walk("."):
            if "node_modules" in root: continue
            for file in files:
                if file.endswith(".json"):
                    path = os.path.join(root, file)
                    with open(path, "r") as f:
                        try:
                            json.load(f)
                        except json.JSONDecodeError as e:
                            self.fail(f"Invalid JSON in {path}: {e}")

class TestExtensions(unittest.TestCase):
    def test_extensions_valid(self):
        ext_dir = "extensions"
        self.assertTrue(os.path.isdir(ext_dir))
        
        res = subprocess.run(["npx", "tsc", "--noEmit"], cwd=ext_dir, capture_output=True, text=True)
        if res.returncode != 0:
            lines = res.stdout.split(chr(10))
            errors = [line for line in lines if "error TS" in line and "node_modules" not in line]
            if errors:
                self.fail(f"TypeScript compilation failed in extensions: {chr(10).join(errors)}")
        
        for d in os.listdir(ext_dir):
            idx_path = os.path.join(ext_dir, d, "index.ts")
            if os.path.isfile(idx_path):
                content = _read(idx_path)
                self.assertIn("export default function", content, f"Missing export default function in {idx_path}")

class TestMcpWiring(unittest.TestCase):
    def test_no_dead_mcp_json(self):
        # Both MCP servers (zotero, gemini-api) are registered programmatically
        # in extensions/lifecycle/mcp.ts because a programmatic `config` is an
        # isolated snapshot never merged with file-based config (per
        # pi-mcp-adapter's own README). A root .mcp.json would be silently
        # unread — its presence would mislead a maintainer into thinking it
        # does something.
        self.assertFalse(os.path.isfile(".mcp.json"), ".mcp.json is never read by the programmatic adapter in extensions/lifecycle/mcp.ts — remove it or wire it up")

    def test_mcp_servers_expose_direct_tools_by_bare_name(self):
        mcp_path = "extensions/lifecycle/mcp.ts"
        self.assertTrue(os.path.isfile(mcp_path))
        content = _read(mcp_path)
        self.assertIn('toolPrefix: "none"', content, "toolPrefix must be \"none\" or every direct tool gets double-prefixed (e.g. zotero_zotero_get_recent) since MCP tool names already start with the server name")
        self.assertIn("zotero", content)
        self.assertIn("gemini-api", content)
        # Every server block needs directTools: true, else tools are only
        # reachable through the generic `mcp` proxy tool, not by bare name
        # the way every skill/agent in this package calls them. Split on the
        # `directTools: true,` line itself (nested `env: {...}` braces make a
        # brace-balanced per-block regex needlessly fragile here).
        self.assertGreaterEqual(content.count("directTools: true"), 2, f"expected directTools: true on both servers in {mcp_path}")

class TestReadmeAndAgentsMd(unittest.TestCase):
    def test_slash_commands(self):
        readme = _read("README.md") if os.path.isfile("README.md") else ""
        agents_md = _read("AGENTS.md") if os.path.isfile("AGENTS.md") else ""
        
        skills_dir = "skills"
        for d in os.listdir(skills_dir):
            if not d.startswith("academic-writer-"): continue
            
            cmd = f"/skill:{d}"
            # Some skills might not be documented if they were user-invocable: false, but the plan says TestReadmeAndAgentsMd: same cross-reference intent with expected form updated to /skill:academic-writer-<name>
            # we will just check if they appear if they were user invocable. In our migrated skills, update-tools was the only one.
            if d == "academic-writer-update-tools": continue
            
            self.assertTrue(cmd in readme or cmd in agents_md, f"Command {cmd} missing in README.md/AGENTS.md")

class TestCrossReferences(unittest.TestCase):
    def test_cross_references(self):
        sw_path = "agents/section-writer.md"
        w_path = "skills/academic-writer-write/SKILL.md"
        if os.path.isfile(sw_path) and os.path.isfile(w_path):
            sw_body = _read(sw_path)
            w_body = _read(w_path)
            self.assertIn("Phase 1", w_body) # Or check stages
            
        help_path = "skills/academic-writer-help/SKILL.md"
        if os.path.isfile(help_path):
            help_body = _read(help_path)
            skills_dir = "skills"
            for d in os.listdir(skills_dir):
                if d == "academic-writer-update-tools": continue
                self.assertIn(d, help_body, f"Help skill missing reference to {d}")

class TestNoCandlekeepReferences(unittest.TestCase):
    def test_no_candlekeep(self):
        pattern = re.compile(r'candlekeep|ck items|ck auth|ck books|command -v ck\b|voice-sync', re.IGNORECASE)
        # The one-time profile-schema migration (init/SKILL.md) legitimately names
        # the legacy `candlekeep` JSON key it migrates away from — but ONLY that
        # exact, known-good sentence is exempt, and only up to its own known
        # occurrence count. A blanket "candlekeep somewhere in the file -> ignore
        # every candlekeep match in the file" exemption previously masked real
        # leftover ` command -v ck` / `voice-sync push` / `.candlekeep-id` bugs.
        migration_sentence = re.compile(
            r"contains a `candlekeep` key but no `zotero` key.*?old candlekeep\.enabled",
            re.IGNORECASE,
        )
        dirs_to_check = ["skills", "agents", "extensions"]

        for d in dirs_to_check:
            if not os.path.isdir(d): continue
            for root, _, files in os.walk(d):
                for file in files:
                    if file.endswith(".md") or file.endswith(".ts"):
                        path = os.path.join(root, file)
                        content = _read(path)
                        matches = pattern.findall(content)
                        exempt = len(migration_sentence.findall(content)) * 3  # 3 "candlekeep" per known-good sentence
                        remaining = len(matches) - exempt
                        self.assertLessEqual(remaining, 0, f"Found Candlekeep reference in {path}: {matches}")

class TestNoStaleClaudeCodeArtifacts(unittest.TestCase):
    def test_no_old_slash_command_form(self):
        # `/academic-writer:<name>` was the Claude Code plugin slash-command
        # form; pi skills register as `/skill:academic-writer-<name>`. A
        # stray old-form reference is a dead command the model will emit
        # verbatim to the researcher.
        pattern = re.compile(r"/academic-writer:[a-zA-Z0-9_-]+")
        for d in ["skills", "agents"]:
            if not os.path.isdir(d): continue
            for root, _, files in os.walk(d):
                for file in files:
                    if not file.endswith(".md"): continue
                    path = os.path.join(root, file)
                    matches = pattern.findall(_read(path))
                    self.assertEqual(matches, [], f"Found stale /academic-writer: slash command in {path}: {matches}")

    def test_no_claude_code_runtime_mentions(self):
        # Claude-Code-specific runtime instructions (e.g. "restart Claude
        # Code") are wrong under pi and mislead the researcher.
        for d in ["skills", "agents"]:
            if not os.path.isdir(d): continue
            for root, _, files in os.walk(d):
                for file in files:
                    if not file.endswith(".md"): continue
                    path = os.path.join(root, file)
                    self.assertNotIn("Claude Code", _read(path), f"Found stale 'Claude Code' runtime reference in {path}")

if __name__ == '__main__':
    unittest.main()
