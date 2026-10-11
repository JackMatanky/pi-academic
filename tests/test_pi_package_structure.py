import json
import os
import re
import subprocess
import tomllib
import unittest

import yaml


def _read(path):
    """Read a UTF-8 project file for structural assertions.

    This component keeps the surrounding module contract explicit and testable.

    Args:
        path: Path supplied by the caller.

    Returns:
        The helper result, or None when the helper performs work for side effects only.
    """
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _parse_frontmatter(path):
    """Parse a Markdown YAML frontmatter block for assertions.

    This component keeps the surrounding module contract explicit and testable.

    Args:
        path: Path supplied by the caller.

    Returns:
        The helper result, or None when the helper performs work for side effects only.
    """
    content = _read(path)
    fm_match = re.match(r"^---\n(.*?)\n---\n(.*)", content, re.DOTALL)
    if not fm_match:
        return None, content
    try:
        fm = yaml.safe_load(fm_match.group(1))
        return fm, fm_match.group(2)
    except yaml.YAMLError:
        return None, content


class TestSkills(unittest.TestCase):
    """Test cases covering Skills.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_skills_frontmatter(self):
        """Assert skills frontmatter.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        skills_dir = "skills"
        self.assertTrue(os.path.isdir(skills_dir))
        names = set()

        for d in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, d, "SKILL.md")
            if not os.path.isfile(skill_path):
                continue

            fm, body = _parse_frontmatter(skill_path)
            self.assertIsNotNone(fm, f"Missing frontmatter in {skill_path}")
            self.assertIn("name", fm)
            self.assertEqual(
                fm["name"],
                d,
                f"Skill name {fm['name']} does not match directory {d}",
            )
            self.assertIn("description", fm)
            self.assertNotIn("user-invocable", fm)
            self.assertNotIn("agents", fm)

            self.assertNotIn(fm["name"], names, f"Duplicate skill name {fm['name']}")
            names.add(fm["name"])

            self.assertGreater(len(body.strip()), 50, f"Body too short in {skill_path}")

        expected_skills = {
            "academic-write",
            "academic-research",
            "academic-edit",
            "academic-review",
            "academic-setup",
            "academic-voice",
            "academic-feedback",
            "academic-health",
            "academic-export",
            "academic-present",
            "academic-help",
        }
        self.assertEqual(names, expected_skills)


class TestAgents(unittest.TestCase):
    """Test cases covering Agents.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_agents_frontmatter(self):
        """Assert agents frontmatter.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        agents_dir = "agents"
        self.assertTrue(os.path.isdir(agents_dir))

        expected_agents = [
            "deep-reader.md",
            "architect.md",
            "section-writer.md",
            "auditor.md",
            "synthesizer.md",
            "proofreader.md",
            "voice-profile-builder.md",
            "voice-facilitator.md",
        ]

        for agent_file in expected_agents:
            agent_path = os.path.join(agents_dir, agent_file)
            self.assertTrue(os.path.isfile(agent_path), f"Missing agent {agent_file}")

            fm, body = _parse_frontmatter(agent_path)
            self.assertIsNotNone(fm, f"Missing frontmatter in {agent_path}")
            self.assertNotIn(
                "model", fm, f"Model key should be dropped in {agent_path}"
            )

            if "tools" in fm:
                tools_str = fm["tools"]
                self.assertIsInstance(
                    tools_str,
                    str,
                    f"tools must be a scalar string in {agent_path}",
                )
                # pi-subagents' frontmatter parser splits tools ONLY on commas
                # (src/agents/frontmatter.ts: parseFrontmatterList -> value.split(",")).
                # A space-separated list with no commas parses as one malformed
                # tool name, silently breaking the agent's entire tool allowlist.
                tools = [t.strip() for t in tools_str.split(",")]
                self.assertGreater(len(tools), 0, f"Empty tools list in {agent_path}")
                for tool in tools:
                    self.assertNotIn(
                        " ",
                        tool,
                        f"tools entry {tool!r} contains a space in {agent_path} — tools: must be comma-separated, not space-separated",
                    )
                    if tool.startswith("mcp:"):
                        # mcp:<server> or mcp:<server>/<tool> — never the Claude Code
                        # mcp__server__tool double-underscore convention.
                        self.assertNotIn(
                            "__",
                            tool,
                            f"invalid mcp tool grant {tool!r} in {agent_path} — use mcp:<server> or mcp:<server>/<tool>",
                        )
                        continue
                    self.assertTrue(
                        tool.islower() or tool == "subagent",
                        f"Invalid tool format {tool} in {agent_path}",
                    )

            if not agent_file.startswith("voice-"):
                self.assertIn(
                    "## Input", body, f"Missing Input section in {agent_path}"
                )
            if not agent_file.startswith("voice-"):
                self.assertIn(
                    "## Output", body, f"Missing Output section in {agent_path}"
                )


class TestDevTooling(unittest.TestCase):
    """Test cases covering DevTooling.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_mise_tasks_cover_format_lint_and_hk(self):
        """Assert mise tasks cover format lint and hk.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        with open("mise.toml", "rb") as f:
            data = tomllib.load(f)

        tools = data.get("tools", {})
        self.assertIn("hk", tools)
        self.assertIn("taplo", tools)

        tasks = data.get("tasks", {})
        for task in ["fmt", "fmt-check", "lint", "ci", "install-hooks"]:
            self.assertIn(task, tasks)

        lint_run = "\n".join(tasks["lint"]["run"])
        self.assertIn("ruff check", lint_run)
        self.assertIn("npm run typecheck", lint_run)
        self.assertIn("fmt-check", lint_run)
        self.assertEqual(tasks["install-hooks"]["run"], "hk install")
        self.assertIn("lint", tasks["ci"]["depends"])
        self.assertIn("test", tasks["ci"]["depends"])

    def test_hk_runs_before_commit_and_push(self):
        """Assert hk runs before commit and push.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        content = _read("hk.pkl")
        self.assertIn("github.com/jdx/hk", content)
        self.assertIn('["pre-commit"]', content)
        self.assertIn('["pre-push"]', content)
        self.assertIn("mise run fmt", content)
        self.assertIn("mise run lint", content)
        self.assertIn("mise run ci", content)


class TestJSON(unittest.TestCase):
    """Test cases covering JSON.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_json_validity(self):
        """Assert json validity.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        for root, dirs, files in os.walk("."):
            if "node_modules" in root:
                continue
            for file in files:
                if file.endswith(".json"):
                    path = os.path.join(root, file)
                    with open(path, "r") as f:
                        try:
                            json.load(f)
                        except json.JSONDecodeError as e:
                            self.fail(f"Invalid JSON in {path}: {e}")


def _tool_sources():
    """Concatenate the extension entry point and every tool module."""
    base = "extensions/pi-academic-writer"
    paths = [f"{base}/index.ts"] + sorted(
        os.path.join(f"{base}/tools", name)
        for name in os.listdir(f"{base}/tools")
        if name.endswith(".ts")
    )
    return "\n".join(_read(path) for path in paths)


class TestExtensions(unittest.TestCase):
    """Test cases covering Extensions.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_extensions_valid(self):
        """Assert extensions valid.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        ext_dir = "extensions"
        self.assertTrue(os.path.isdir(ext_dir))

        res = subprocess.run(
            ["npx", "tsc", "--noEmit"],
            cwd=ext_dir,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            lines = res.stdout.split(chr(10))
            errors = [
                line
                for line in lines
                if "error TS" in line and "node_modules" not in line
            ]
            if errors:
                self.fail(
                    f"TypeScript compilation failed in extensions: {chr(10).join(errors)}"
                )

        with open(os.path.join(ext_dir, "tsconfig.json"), "r", encoding="utf-8") as f:
            tsconfig = json.load(f)
        self.assertTrue(
            tsconfig.get("compilerOptions", {}).get("strict"),
            "extensions/tsconfig.json must keep strict TypeScript enabled",
        )
        for d in os.listdir(ext_dir):
            idx_path = os.path.join(ext_dir, d, "index.ts")
            if os.path.isfile(idx_path):
                content = _read(idx_path)
                self.assertIn(
                    "export default function",
                    content,
                    f"Missing export default function in {idx_path}",
                )

    def test_csl_styles_are_downloaded_not_bundled(self):
        """Assert csl styles are downloaded not bundled.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        bundled = [
            os.path.join(root, name)
            for root, dirs, names in os.walk(".")
            if not any(
                part in {"node_modules", ".venv", ".git", ".aw-ts-test"}
                for part in root.split(os.sep)
            )
            for name in names
            if name.endswith(".csl")
        ]
        self.assertEqual(
            bundled,
            [],
            "CSL files should be downloaded into .academic-writer/csl/, not bundled in the package",
        )

    def test_no_academic_writer_root_env_contract(self):
        """Package assets must be exposed through tools, not global bash env injection.

        Returns:
            None.
        """
        root_env = "ACADEMIC_WRITER" + "_ROOT"
        env_inject = "env" + "-inject"
        self.assertFalse(
            os.path.exists(f"extensions/{env_inject}/index.ts"),
            f"{env_inject} must not reintroduce global {root_env} mutation",
        )

        tools_path = "extensions/pi-academic-writer/index.ts"
        self.assertTrue(
            os.path.isfile(tools_path), "pi-academic-writer extension missing"
        )
        tools = _tool_sources()
        for name in [
            "academic_writer_read_resource",
            "academic_writer_resolve_csl",
            "academic_writer_generate_docx",
            "academic_writer_list_agents",
            "academic_writer_fix_typography",
            "academic_writer_status",
            "academic_writer_lint_prose",
            "academic_writer_migrate_profile",
            "academic_writer_diagnose_outline",
            "academic_writer_reverse_outline",
        ]:
            self.assertIn(name, tools)
        self.assertIn("academic_writer_diagnose_outline", _read("agents/architect.md"))
        for path in ["skills/academic-write/SKILL.md", "skills/academic-edit/SKILL.md"]:
            self.assertIn("academic_writer_diagnose_outline", _read(path))
        self.assertIn("academic_writer_reverse_outline", _read("agents/synthesizer.md"))
        self.assertIn(
            "academic_writer_reverse_outline", _read("skills/academic-review/SKILL.md")
        )

        forbidden = [root_env, f"extensions/{env_inject}"]
        for d in [
            "AGENTS.md",
            "README.md",
            "skills",
            "agents",
            "extensions",
            "tests",
        ]:
            if not os.path.exists(d):
                continue
            paths = (
                [d]
                if os.path.isfile(d)
                else [
                    os.path.join(root, file)
                    for root, _, files in os.walk(d)
                    for file in files
                    if file.endswith((".md", ".ts", ".py"))
                ]
            )
            for path in paths:
                content = _read(path)
                for marker in forbidden:
                    self.assertNotIn(marker, content, path)

    def test_thresholds_resource_honors_project_override(self):
        """academic_writer_read_resource(name: thresholds) must prefer the.

        Details:
            project's .academic-writer/thresholds.json (created by init/setup)
            over the packaged default — otherwise editing the per-project copy
            silently does nothing.

        Returns:
            None.
        """
        resources_source = _read("extensions/pi-academic-writer/resources.ts")
        self.assertIn("projectOverride", resources_source)
        self.assertIn('".academic-writer"', resources_source)
        self.assertIn('"thresholds.json"', resources_source)

        voice_miner = _read("agents/voice-profile-builder.md")
        self.assertIn("academic_writer_read_resource", voice_miner)
        self.assertNotIn(
            "src/thresholds.json",
            voice_miner,
            "voice-profile-builder must not reference the non-existent src/thresholds.json path",
        )

    def test_packaged_prompt_resources_exist(self):
        """Assert packaged prompt resources exist.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        resources_source = _read("extensions/pi-academic-writer/resources.ts")
        for resource, path in {
            "voice_profile_load": "skills/academic-write/references/voice-profile-load.md",
            "run_state_contract": "skills/academic-write/references/run-state-contract.md",
            "citation_export_contract": "skills/academic-write/references/citation-export-contract.md",
            "citation_review_gate": "skills/academic-review/references/citation-review-gate.md",
        }.items():
            self.assertIn(resource, resources_source)
            self.assertTrue(
                os.path.isfile(path), f"missing resource file for {resource}"
            )

    def test_citation_audit_is_wired_into_output_paths(self):
        """Assert citation audit is wired into output paths.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        self.assertTrue(
            os.path.isfile("extensions/pi-academic-writer/citation-audit.ts"),
            "citation audit must ship as TypeScript",
        )
        for skill in [
            "skills/academic-write/SKILL.md",
            "skills/academic-edit/SKILL.md",
            "skills/academic-export/SKILL.md",
            "skills/academic-review/SKILL.md",
        ]:
            content = _read(skill)
            self.assertIn("academic_writer_audit_citations", content, skill)
            self.assertIn("run_state_contract", content, skill)

    def test_profile_migration_is_tool_backed(self):
        """Assert profile migration is tool backed.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        tools = _tool_sources()
        profile = _read("extensions/lib/profile.ts")
        schema = _read("skills/academic-setup/references/profile-schema.md")
        init = _read("skills/academic-setup/SKILL.md")
        setup = _read("skills/academic-setup/SKILL.md")
        self.assertIn("migrateJsonProfile", profile)
        self.assertIn("academic_writer_migrate_profile", tools)
        self.assertIn("academic_writer_migrate_profile", init)
        self.assertIn("academic_writer_migrate_profile", setup)
        self.assertNotIn("python3 << 'PYTHON'", schema)
        self.assertNotIn("python3 << 'PYTHON'", setup)

    def test_no_academic_helper_references(self):
        """Assert no academic helper references.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        for root, _, files in os.walk("."):
            if any(
                part in {".git", "node_modules", ".venv"}
                or part.startswith(".aw-runtime")
                for part in root.split(os.sep)
            ):
                continue
            for file in files:
                path = os.path.join(root, file)
                if (
                    file == ".prettierignore"
                    or file == ".gitignore"
                    or file.endswith(
                        (".md", ".ts", ".py", ".json", ".yml", ".yaml", ".toml")
                    )
                ):
                    self.assertNotIn("academic" + "-helper", _read(path), path)
                    self.assertIsNone(
                        re.search("leg" + "acy", _read(path), re.IGNORECASE), path
                    )


class TestMcpWiring(unittest.TestCase):
    """Test cases covering McpWiring.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_no_bundled_mcp_json(self):
        # MCP credentials/config live in the researcher's standard MCP config
        # layers, not in the published package repository. The package may
        # scaffold a user project .mcp.json during init/setup, but it must not
        # ship one from this repo.
        """Assert no bundled mcp json.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        self.assertFalse(
            os.path.isfile(".mcp.json"),
            ".mcp.json should be user/project config, not a package source file",
        )

    def test_lifecycle_does_not_mount_mcp_adapter(self):
        """Assert lifecycle does not mount mcp adapter.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        lifecycle_path = "extensions/lifecycle/index.ts"
        self.assertTrue(os.path.isfile(lifecycle_path))
        content = _read(lifecycle_path)
        self.assertNotIn(
            "pi-mcp-adapter",
            content,
            "lifecycle must not mount pi-mcp-adapter; Pi loads the package dependency directly",
        )
        self.assertNotIn(
            "mcpExtension(",
            content,
            "lifecycle must not register MCP tools/flags that conflict with pi-mcp-adapter",
        )
        self.assertNotIn(
            "createMcpAdapter({",
            content,
            "programmatic config is isolated and would ignore .mcp.json/global MCP config",
        )

    def test_docs_require_direct_mcp_tools(self):
        """Assert docs require direct mcp tools.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        docs = "\n".join(
            _read(path)
            for path in [
                "AGENTS.md",
                "README.md",
                "skills/academic-setup/references/integration-setup.md",
                "skills/academic-setup/SKILL.md",
                "skills/academic-setup/SKILL.md",
            ]
        )
        self.assertIn("toolPrefix", docs)
        self.assertIn("directTools", docs)
        self.assertIn("zotero_get_recent", docs)
        self.assertIn("notebook_list", docs)
        self.assertIn("notebooklm-mcp", docs)
        self.assertIn(".mcp.json", docs)
        self.assertIn("tools.zotero.collection", docs)
        self.assertIn("tools.notebooklm.notebook", docs)

    def test_no_bundled_mcp_server_dir(self):
        # A bundled second-model-provider MCP server (the original design's
        # `mcp/gemini-server/`) is architecturally redundant on pi: any agent
        # can be pinned to any provider via subagents.agentOverrides.<name>.model
        # without a package-maintained server, build step, or API-key-through-env
        # plumbing. If `mcp/` reappears, something regressed this decision.
        """Assert no bundled mcp server dir.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        self.assertFalse(
            os.path.isdir("mcp"),
            "mcp/ should not exist — model choice is a pi setting, not a bundled MCP server (see AGENTS.md)",
        )

    def test_no_engine_choice_plumbing(self):
        # geminiFallback/geminiMode/compare-models were session-state fields
        # for brokering which of two hardcoded models drafted prose. Pi's own
        # per-agent model selection replaces this entirely — no skill/agent
        # should reintroduce a runtime engine-choice branch.
        """Assert no engine choice plumbing.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        pattern = re.compile(
            r"geminiFallback|geminiMode|compare-models|gemini_write_section|gemini_synthesize|gemini_edit|gemini_calibrate_sample|gemini_raw",
            re.IGNORECASE,
        )
        for d in ["skills", "agents", "extensions"]:
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                for file in files:
                    if file.endswith(".md") or file.endswith(".ts"):
                        path = os.path.join(root, file)
                        matches = pattern.findall(_read(path))
                        self.assertEqual(
                            matches,
                            [],
                            f"Found engine-choice/bundled-Gemini-tool reference in {path}: {matches}",
                        )


class TestReadmeAndAgentsMd(unittest.TestCase):
    """Test cases covering ReadmeAndAgentsMd.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_slash_commands(self):
        readme = _read("README.md") if os.path.isfile("README.md") else ""
        agents_md = _read("AGENTS.md") if os.path.isfile("AGENTS.md") else ""
        for skill_name in os.listdir("skills"):
            skill_path = os.path.join("skills", skill_name, "SKILL.md")
            if not os.path.isfile(skill_path):
                continue
            command = f"/skill:{skill_name}"
            self.assertTrue(
                command in readme or command in agents_md,
                f"Command {command} missing in README.md/AGENTS.md",
            )

    def test_pdf_export_uses_health_and_wrapper_tools(self):
        """Assert pdf export uses health and wrapper tools.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        export_skill = _read("skills/academic-export/SKILL.md")
        health_skill = _read("skills/academic-health/SKILL.md")
        readme = _read("README.md")

        self.assertIn("academic_writer_health", export_skill)
        self.assertIn("academic_writer_export_article", export_skill)
        self.assertIn("academic_writer_health", health_skill)
        self.assertIn("brew install tectonic", readme)


class TestCrossReferences(unittest.TestCase):
    """Test cases covering CrossReferences.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_cross_references(self):
        help_path = "skills/academic-help/SKILL.md"
        self.assertTrue(os.path.isfile(help_path))
        help_body = _read(help_path)
        for skill_name in os.listdir("skills"):
            if not os.path.isfile(os.path.join("skills", skill_name, "SKILL.md")):
                continue
            self.assertIn(
                skill_name, help_body, f"Help skill missing reference to {skill_name}"
            )


class TestNoCandlekeepReferences(unittest.TestCase):
    """Test cases covering NoCandlekeepReferences.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_no_candlekeep(self):
        """Assert no candlekeep.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        pattern = re.compile(
            r"candlekeep|ck items|ck auth|ck books|command -v ck\b|voice-sync",
            re.IGNORECASE,
        )
        # The one-time profile-schema migration (init/SKILL.md) legitimately names
        # the old `candlekeep` JSON key it migrates away from — but ONLY that
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
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                for file in files:
                    if file.endswith(".md") or file.endswith(".ts"):
                        path = os.path.join(root, file)
                        content = _read(path)
                        matches = pattern.findall(content)
                        exempt = (
                            len(migration_sentence.findall(content)) * 3
                        )  # 3 "candlekeep" per known-good sentence
                        remaining = len(matches) - exempt
                        self.assertLessEqual(
                            remaining,
                            0,
                            f"Found Candlekeep reference in {path}: {matches}",
                        )


class TestNoStaleClaudeCodeArtifacts(unittest.TestCase):
    """Test cases covering NoStaleClaudeCodeArtifacts.

    This class groups related assertions or helpers for the surrounding module.
    """

    def test_no_old_slash_command_form(self):
        # `/academic-writer:<name>` was the Claude Code plugin command form;
        # pi skills register as `/skill:<name>`. A stale command is a dead
        # route the model might emit verbatim to the researcher.
        """Assert no old slash command form.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        pattern = re.compile(r"/academic-writer:[a-zA-Z0-9_-]+")
        for d in ["skills", "agents"]:
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                for file in files:
                    if not file.endswith(".md"):
                        continue
                    path = os.path.join(root, file)
                    matches = pattern.findall(_read(path))
                    self.assertEqual(
                        matches,
                        [],
                        f"Found stale /academic-writer: slash command in {path}: {matches}",
                    )

    def test_no_claude_code_runtime_mentions(self):
        # Claude-Code-specific runtime instructions (e.g. "restart Claude
        # Code") are wrong under pi and mislead the researcher.
        """Assert no claude code runtime mentions.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        for d in ["skills", "agents"]:
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                for file in files:
                    if not file.endswith(".md"):
                        continue
                    path = os.path.join(root, file)
                    self.assertNotIn(
                        "Claude Code",
                        _read(path),
                        f"Found stale 'Claude Code' runtime reference in {path}",
                    )


class TestZoteroMcpCompatibility(unittest.TestCase):
    """Test cases covering ZoteroMcpCompatibility.

    This class groups related assertions or helpers for the surrounding module.
    """

    # zotero-mcp (54yyyu) merged `zotero_add_by_doi`/`zotero_add_from_file` and
    # the other `zotero_add_by_*` variants into `zotero_add_item` in 0.9.0 and
    # ships no back-compat aliases; the documented `pip install
    # zotero-mcp-server` resolves to >=0.9, so any file still naming the old
    # tools tells the researcher to call tools that do not exist.
    def test_no_removed_zotero_add_tool_names(self):
        """Assert no removed zotero add tool names.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        pattern = re.compile(
            r"zotero_add_by_doi|zotero_add_from_file|zotero_add_by_url|"
            r"zotero_add_by_isbn|zotero_add_by_bibtex|zotero_add_by_csl_json",
        )
        paths = ["README.md", "AGENTS.md"]
        for d in ["skills", "agents", "docs"]:
            if not os.path.isdir(d):
                continue
            for root, _, files in os.walk(d):
                paths.extend(os.path.join(root, f) for f in files if f.endswith(".md"))
        for path in paths:
            matches = pattern.findall(_read(path))
            self.assertEqual(
                matches,
                [],
                f"Found zotero-mcp tool removed upstream in 0.9.0 in {path}: {matches}",
            )

    # The research skill offered `zotero_semantic_search` while a note in the
    # same skill said semantic vector search "is not active", and hedged that
    # the search tool might not accept a collection filter. Upstream
    # `zotero_search_items` takes `collection_key` directly, and the optional
    # semantic tool needs the `[semantic]` extra plus a populated index --
    # neither was mentioned, so the recommendation dead-ends on a base install.
    def test_research_skill_zotero_search_guidance(self):
        """Assert research skill zotero search guidance is current.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        content = _read("skills/academic-research/SKILL.md")
        self.assertNotIn(
            "cannot accept a collection filter",
            content,
            "zotero_search_items accepts collection_key natively — drop the hedge",
        )
        self.assertIn(
            "collection_key=COLLECTION_KEY",
            content,
            "collection scope must be passed as collection_key",
        )
        self.assertIn(
            "zotero-mcp-server[semantic]",
            content,
            "zotero_semantic_search needs the optional [semantic] extra documented",
        )
        self.assertIn(
            "zotero_get_search_database_status",
            content,
            "semantic search readiness must be checked before it is recommended",
        )
        self.assertNotIn(
            "Vectorless RAG",
            content,
            "'not active' note contradicts the same skill offering zotero_semantic_search",
        )

    # `mcp:zotero` grants the whole server, and upstream's mutation tools
    # (`zotero_add_item`, `zotero_update_item`, ...) are core -- no
    # `ZOTERO_MCP_TOOLSETS` value removes them -- so an agent that must stay
    # read-only has to be granted single tools with `mcp:zotero/<tool>`.
    def test_agents_md_whole_server_grant_includes_write_tools(self):
        """Assert agents md documents whole server grant write tools.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        content = _read("AGENTS.md")
        self.assertIn(
            "mcp:zotero/",
            content,
            "AGENTS.md must document the per-tool read-only grant form",
        )
        self.assertIn(
            "write tools",
            content,
            "AGENTS.md must warn that mcp:zotero exposes upstream write tools",
        )


if __name__ == "__main__":
    unittest.main()
