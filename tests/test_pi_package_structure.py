import json
import os
import re
import subprocess
import tomllib
import unittest

import yaml


def _read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _parse_frontmatter(path):
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
    def test_skills_frontmatter(self):
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


class TestAgents(unittest.TestCase):
    def test_agents_frontmatter(self):
        agents_dir = "agents"
        self.assertTrue(os.path.isdir(agents_dir))

        expected_agents = [
            "deep-reader.md",
            "architect.md",
            "section-writer.md",
            "auditor.md",
            "synthesizer.md",
            "proofreader.md",
            "voice-miner.md",
            "voice-interviewer.md",
            "voice-distiller.md",
            "voice-calibrator.md",
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

    def test_agents_permission_frontmatter(self):
        agents_dir = "agents"
        for agent_file in os.listdir(agents_dir):
            if not agent_file.endswith(".md"):
                continue
            agent_path = os.path.join(agents_dir, agent_file)
            fm, _ = _parse_frontmatter(agent_path)
            self.assertIn(
                "permission",
                fm,
                f"Agent {agent_file} should declare a permission block for optional pi-permission-system integration",
            )
            perm = fm["permission"]
            self.assertIsInstance(
                perm, dict, f"permission block in {agent_file} must be a dict"
            )
            self.assertIn(
                "*",
                perm,
                f"permission block in {agent_file} must declare wildcard default ('*')",
            )


class TestPackageManifest(unittest.TestCase):
    def test_package_json(self):
        path = "package.json"
        self.assertTrue(os.path.isfile(path))
        with open(path, "r") as f:
            data = json.load(f)

        self.assertIn("name", data)
        self.assertIn("version", data)
        self.assertIn("pi-package", data.get("keywords", []))

        # pi-subagents/pi-mcp-adapter/pi-web-access register their own
        # extensions/tools; Pi does not auto-load a dependency's manifest
        # just because it appears in `dependencies`, so they must stay
        # peerDependencies the researcher installs independently (README
        # Quick Start), never bundled runtime dependencies.
        peer_deps = data.get("peerDependencies", {})
        self.assertIn("pi-subagents", peer_deps)
        self.assertIn("pi-mcp-adapter", peer_deps)
        self.assertIn("pi-web-access", peer_deps)
        for pkg in ("pi-subagents", "pi-mcp-adapter", "pi-web-access"):
            self.assertNotIn(pkg, data.get("dependencies", {}))
            self.assertNotIn(pkg, data.get("bundledDependencies", []))

        pi_manifest = data.get("pi", {})
        self.assertIn("./extensions", pi_manifest.get("extensions", []))
        self.assertIn("./skills", pi_manifest.get("skills", []))
        image = pi_manifest.get("image")
        self.assertIsInstance(image, str)
        self.assertTrue(image.startswith("./assets/"))
        self.assertTrue(os.path.isfile(image[2:]))
        self.assertTrue(image.endswith((".svg", ".png", ".jpg", ".jpeg", ".webp")))

        self.assertIn("pi-subagents", data)
        self.assertIn("agents", data["pi-subagents"])
        self.assertIn("./agents", data["pi-subagents"]["agents"])
        self.assertTrue(os.path.isdir("agents"))


class TestDevTooling(unittest.TestCase):
    def test_mise_tasks_cover_format_lint_and_hk(self):
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
        content = _read("hk.pkl")
        self.assertIn("github.com/jdx/hk", content)
        self.assertIn('["pre-commit"]', content)
        self.assertIn('["pre-push"]', content)
        self.assertIn("mise run fmt", content)
        self.assertIn("mise run lint", content)
        self.assertIn("mise run ci", content)


class TestJSON(unittest.TestCase):
    def test_json_validity(self):
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


class TestExtensions(unittest.TestCase):
    def test_extensions_valid(self):
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
        resolver = _read("scripts/resolve-csl.py")
        self.assertIn("ZOTERO_STYLE_BASE", resolver)
        self.assertIn("POPULAR_STYLES", resolver)
        self.assertFalse(
            os.path.exists("scripts/lib/csl"),
            "CSL files should be downloaded into .academic-writer/csl/, not bundled in the package",
        )

    def test_no_academic_writer_root_env_contract(self):
        """Package assets must be exposed through tools, not global bash env injection."""
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
        tools = _read(tools_path)
        for name in [
            "academic_writer_read_resource",
            "academic_writer_resolve_csl",
            "academic_writer_generate_docx",
            "academic_writer_list_agents",
            "academic_writer_fix_typography",
            "academic_writer_status",
            "academic_writer_audit_citations",
            "academic_writer_migrate_profile",
        ]:
            self.assertIn(name, tools)

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
        """academic_writer_read_resource(name: thresholds) must prefer the
        project's .academic-writer/thresholds.json (created by init/setup)
        over the packaged default — otherwise editing the per-project copy
        silently does nothing."""
        resources_source = _read("extensions/pi-academic-writer/resources.ts")
        tools_source = _read("extensions/pi-academic-writer/index.ts")
        self.assertIn("projectOverride", resources_source)
        self.assertIn('".academic-writer"', resources_source)
        self.assertIn('"thresholds.json"', resources_source)
        self.assertIn(
            "resolveResourcePath(name, ctx.cwd, params.language)",
            tools_source,
            "academic_writer_read_resource must pass ctx.cwd so thresholds can resolve the project override",
        )

        voice_miner = _read("agents/voice-miner.md")
        self.assertIn("academic_writer_read_resource", voice_miner)
        self.assertNotIn(
            "src/thresholds.json",
            voice_miner,
            "voice-miner must not reference the non-existent src/thresholds.json path",
        )

    def test_packaged_prompt_resources_exist(self):
        resources_source = _read("extensions/pi-academic-writer/resources.ts")
        for resource, path in {
            "voice_profile_load": "skills/academic-writer-write/references/voice-profile-load.md",
            "run_state_contract": "skills/academic-writer-write/references/run-state-contract.md",
            "citation_export_contract": "skills/academic-writer-write/references/citation-export-contract.md",
            "citation_review_gate": "skills/academic-writer-review/references/citation-review-gate.md",
        }.items():
            self.assertIn(resource, resources_source)
            self.assertTrue(
                os.path.isfile(path), f"missing resource file for {resource}"
            )

    def test_citation_audit_is_wired_into_output_paths(self):
        tools_source = _read("extensions/pi-academic-writer/index.ts")
        self.assertIn('scripts", "audit-citations.py', tools_source)
        for skill in [
            "skills/academic-writer-write/SKILL.md",
            "skills/academic-writer-edit/SKILL.md",
            "skills/academic-writer-export/SKILL.md",
            "skills/academic-writer-review/SKILL.md",
        ]:
            content = _read(skill)
            self.assertIn("academic_writer_audit_citations", content, skill)
            self.assertIn("run_state_contract", content, skill)

    def test_profile_migration_is_tool_backed(self):
        tools = _read("extensions/pi-academic-writer/index.ts")
        profile = _read("extensions/lib/profile.ts")
        schema = _read("skills/academic-writer-init/references/profile-schema.md")
        init = _read("skills/academic-writer-init/SKILL.md")
        setup = _read("skills/academic-writer-setup/SKILL.md")
        self.assertIn("migrateJsonProfile", profile)
        self.assertIn("academic_writer_migrate_profile", tools)
        self.assertIn("academic_writer_migrate_profile", init)
        self.assertIn("academic_writer_migrate_profile", setup)
        self.assertNotIn("python3 << 'PYTHON'", schema)
        self.assertNotIn("python3 << 'PYTHON'", setup)

    def test_no_academic_helper_references(self):
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
    def test_no_bundled_mcp_json(self):
        # MCP credentials/config live in the researcher's standard MCP config
        # layers, not in the published package repository. The package may
        # scaffold a user project .mcp.json during init/setup, but it must not
        # ship one from this repo.
        self.assertFalse(
            os.path.isfile(".mcp.json"),
            ".mcp.json should be user/project config, not a package source file",
        )

    def test_lifecycle_does_not_mount_mcp_adapter(self):
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
        docs = "\n".join(
            _read(path)
            for path in [
                "AGENTS.md",
                "README.md",
                "skills/academic-writer-init/references/integration-setup.md",
                "skills/academic-writer-setup/SKILL.md",
                "skills/academic-writer-update-tools/SKILL.md",
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
        self.assertFalse(
            os.path.isdir("mcp"),
            "mcp/ should not exist — model choice is a pi setting, not a bundled MCP server (see AGENTS.md)",
        )

    def test_no_engine_choice_plumbing(self):
        # geminiFallback/geminiMode/compare-models were session-state fields
        # for brokering which of two hardcoded models drafted prose. Pi's own
        # per-agent model selection replaces this entirely — no skill/agent
        # should reintroduce a runtime engine-choice branch.
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
    def test_slash_commands(self):
        readme = _read("README.md") if os.path.isfile("README.md") else ""
        agents_md = _read("AGENTS.md") if os.path.isfile("AGENTS.md") else ""

        skills_dir = "skills"
        for d in os.listdir(skills_dir):
            if not d.startswith("academic-writer-"):
                continue

            cmd = f"/skill:{d}"
            # Some skills might not be documented if they were user-invocable: false, but the plan says TestReadmeAndAgentsMd: same cross-reference intent with expected form updated to /skill:academic-writer-<name>
            # we will just check if they appear if they were user invocable. In our migrated skills, update-tools was the only one.
            if d == "academic-writer-update-tools":
                continue

            self.assertTrue(
                cmd in readme or cmd in agents_md,
                f"Command {cmd} missing in README.md/AGENTS.md",
            )

    def test_pdf_export_uses_health_and_wrapper_tools(self):
        export_skill = _read("skills/academic-writer-export/SKILL.md")
        health_skill = _read("skills/academic-writer-health/SKILL.md")
        readme = _read("README.md")

        self.assertIn("academic_writer_health", export_skill)
        self.assertIn("PDF_ENGINE=tectonic", export_skill)
        self.assertIn("academic_writer_export_article", export_skill)
        self.assertIn("academic_writer_health", health_skill)
        self.assertIn("brew install tectonic", readme)


class TestCrossReferences(unittest.TestCase):
    def test_cross_references(self):
        sw_path = "agents/section-writer.md"
        w_path = "skills/academic-writer-write/SKILL.md"
        if os.path.isfile(sw_path) and os.path.isfile(w_path):
            sw_body = _read(sw_path)
            w_body = _read(w_path)
            self.assertIn("Phase 1", w_body)  # Or check stages

        help_path = "skills/academic-writer-help/SKILL.md"
        if os.path.isfile(help_path):
            help_body = _read(help_path)
            skills_dir = "skills"
            for d in os.listdir(skills_dir):
                if (
                    not d.startswith("academic-writer-")
                    or d == "academic-writer-update-tools"
                ):
                    continue
                self.assertIn(d, help_body, f"Help skill missing reference to {d}")


class TestNoCandlekeepReferences(unittest.TestCase):
    def test_no_candlekeep(self):
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
    def test_no_old_slash_command_form(self):
        # `/academic-writer:<name>` was the Claude Code plugin slash-command
        # form; pi skills register as `/skill:academic-writer-<name>`. A
        # stray old-form reference is a dead command the model will emit
        # verbatim to the researcher.
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


if __name__ == "__main__":
    unittest.main()
