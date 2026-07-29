import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


class TestExtensionRuntime(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build_root = Path(
            tempfile.mkdtemp(prefix=".aw-runtime-", dir=".")
        ).resolve()
        subprocess.run(
            [
                "npx",
                "tsc",
                "--outDir",
                str(cls.build_root / "extensions"),
                "--noEmit",
                "false",
                "--allowImportingTsExtensions",
                "false",
            ],
            cwd="extensions",
            check=True,
            capture_output=True,
            text=True,
        )
        for directory in ["agents", "scripts", "skills"]:
            shutil.copytree(directory, cls.build_root / directory)
        shutil.copy2("thresholds.json", cls.build_root / "thresholds.json")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.build_root, ignore_errors=True)

    def run_tools(self, project_root: Path, env=None):
        script = self.build_root / "runtime-smoke.mjs"
        extension_url = (
            self.build_root / "extensions" / "pi-academic-writer" / "index.js"
        ).as_uri()
        script.write_text(
            textwrap.dedent(
                f"""
                const mod = await import({json.dumps(extension_url)});
                const tools = new Map();
                mod.default({{
                  registerTool(tool) {{ tools.set(tool.name, tool); }}
                }});
                const ctx = {{ cwd: process.argv[2] }};
                const signal = new AbortController().signal;
                const call = (name, params = {{}}) => tools.get(name).execute("test", params, signal, undefined, ctx);
                const status = await call("academic_writer_status");
                const migration = await call("academic_writer_migrate_profile");
                const health = await call("academic_writer_health");
                const profile = await call("academic_writer_get_profile");
                const updated = await call("academic_writer_update_profile", {{
                  fieldsJson: JSON.stringify({{ citationStyle: "mla" }})
                }});
                const paths = await call("academic_writer_article_paths", {{ subject: "Smoke Test: חיבור" }});
                const files = await call("academic_writer_list_project_files", {{ kind: "articles" }});
                const extracted = await call("academic_writer_extract_document", {{ path: "articles/ok.md" }});
                const resource = await call("academic_writer_read_resource", {{ name: "thresholds" }});
                const audit = await call("academic_writer_audit_citations", {{
                  article: "articles/ok.md",
                  citationStyle: "chicago"
                }});
                const snapshot = await call("academic_writer_snapshot_citations", {{
                  article: "articles/ok.md"
                }});
                const assembled = await call("academic_writer_assemble_docx_json", {{
                  input: "articles/ok.md",
                  output: ".academic-writer/runs/ok.docx.json",
                  targetLanguage: "English"
                }});
                const ingested = await call("academic_writer_ingest_sources", {{
                  paths: [".academic-writer/sources/local.md"]
                }});
                console.log(JSON.stringify({{
                  names: [...tools.keys()].sort(),
                  status,
                  migration,
                  health,
                  profile,
                  updated,
                  paths,
                  files,
                  extracted,
                  resource,
                  audit,
                  snapshot,
                  assembled,
                  ingested
                }}));
                """
            ),
            encoding="utf-8",
        )
        res = subprocess.run(
            ["node", str(script), str(project_root)],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        return json.loads(res.stdout)

    def call_tool(self, project_root: Path, name: str, params: dict, env=None):
        script = self.build_root / f"runtime-{name}.mjs"
        extension_url = (
            self.build_root / "extensions" / "pi-academic-writer" / "index.js"
        ).as_uri()
        script.write_text(
            textwrap.dedent(
                f"""
                const mod = await import({json.dumps(extension_url)});
                const tools = new Map();
                mod.default({{
                  registerTool(tool) {{ tools.set(tool.name, tool); }}
                }});
                const ctx = {{ cwd: process.argv[2] }};
                const signal = new AbortController().signal;
                const result = await tools.get({json.dumps(name)}).execute(
                  "test",
                  {json.dumps(params)},
                  signal,
                  undefined,
                  ctx
                );
                console.log(JSON.stringify(result));
                """
            ),
            encoding="utf-8",
        )
        res = subprocess.run(
            ["node", str(script), str(project_root)],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        return json.loads(res.stdout)

    def test_package_tools_run_against_project_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            helper = root / ".academic-writer"
            (helper / "runs").mkdir(parents=True)
            (root / "articles").mkdir()
            (helper / "profile.md").write_text(
                textwrap.dedent(
                    """
                    ---
                    fieldOfStudy: History
                    ---

                    ## Tools

                    ```json
                    {
                      "zotero": {
                        "enabled": true,
                        "mode": "mcp-config",
                        "collection": { "key": "COLL1234", "name": "Dissertation" }
                      },
                      "notebooklm": {
                        "enabled": true,
                        "mode": "mcp-config",
                        "notebook": { "id": "nb-1", "name": "Chapter Notebook" }
                      }
                    }
                    ```
                    """
                ),
                encoding="utf-8",
            )
            (helper / "thresholds.json").write_text(
                '{"sentinel": true}\n', encoding="utf-8"
            )
            (helper / "sources.json").write_text(
                json.dumps([{"citeKey": "smith2020"}]),
                encoding="utf-8",
            )
            (helper / "bibliography.bib").write_text(
                "@book{smith2020, title={Book}}\n",
                encoding="utf-8",
            )
            (helper / "runs" / "r1.json").write_text(
                json.dumps({"runId": "r1", "status": "running", "title": "Smoke"}),
                encoding="utf-8",
            )
            (helper / "sources").mkdir()
            (helper / "sources" / "local.md").write_text(
                "# Local Source 2024\n\nSource text.", encoding="utf-8"
            )
            (root / "articles" / "ok.md").write_text(
                "Text [@smith2020, p. 4].",
                encoding="utf-8",
            )

            data = self.run_tools(root)

        self.assertIn("academic_writer_status", data["names"])
        self.assertIn("academic_writer_read_resource", data["names"])
        self.assertIn("academic_writer_audit_citations", data["names"])
        self.assertIn("academic_writer_ingest_sources", data["names"])
        self.assertIn("academic_writer_snapshot_citations", data["names"])
        self.assertIn("academic_writer_assemble_docx_json", data["names"])
        self.assertIn("academic_writer_migrate_profile", data["names"])
        self.assertTrue(data["status"]["details"]["ok"])
        self.assertEqual(data["status"]["details"]["sources"]["count"], 1)
        self.assertEqual(data["status"]["details"]["sourceDocuments"]["count"], 1)
        self.assertEqual(data["status"]["details"]["articles"]["count"], 1)
        self.assertEqual(data["status"]["details"]["runs"]["active"][0]["runId"], "r1")
        self.assertIn("auditor.md", data["status"]["details"]["agents"])
        self.assertEqual(
            data["status"]["details"]["tools"]["zotero"]["collection"]["key"],
            "COLL1234",
        )
        self.assertIn(
            "Zotero scope: Dissertation", data["status"]["content"][0]["text"]
        )
        self.assertIn(
            "NotebookLM scope: Chapter Notebook", data["status"]["content"][0]["text"]
        )
        self.assertFalse(data["migration"]["details"]["migrated"])
        self.assertEqual(
            data["migration"]["details"]["reason"], "profile already exists"
        )
        self.assertTrue(data["health"]["details"]["commands"].keys())
        self.assertEqual(
            data["profile"]["details"]["profile"]["fieldOfStudy"], "History"
        )
        self.assertEqual(data["updated"]["details"]["profile"]["citationStyle"], "mla")
        self.assertEqual(
            data["paths"]["details"]["markdown"], "articles/smoke-test-חיבור.md"
        )
        self.assertEqual(
            data["paths"]["details"]["sources"],
            "articles/smoke-test-חיבור.sources.json",
        )
        self.assertEqual(data["files"]["details"]["files"][0]["path"], "articles/ok.md")
        self.assertEqual(
            data["extracted"]["content"][0]["text"], "Text [@smith2020, p. 4]."
        )
        self.assertEqual(data["resource"]["details"]["source"], "project")
        self.assertEqual(
            json.loads(data["resource"]["content"][0]["text"]), {"sentinel": True}
        )
        self.assertEqual(
            data["ingested"]["details"]["sources"][0]["sourceType"], "local-file"
        )
        self.assertTrue(data["audit"]["details"]["ok"])
        self.assertEqual(data["audit"]["details"]["citationKeys"], ["smith2020"])
        self.assertTrue(data["snapshot"]["details"]["ok"])
        self.assertEqual(
            data["snapshot"]["details"]["sources"], "articles/ok.sources.json"
        )
        self.assertTrue(data["assembled"]["details"]["ok"])
        self.assertEqual(data["assembled"]["details"]["sections"], 1)
        self.assertEqual(data["ingested"]["details"]["count"], 1)

    def test_export_passes_citeproc_options_to_pandoc(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            helper = root / ".academic-writer"
            helper.mkdir()
            (root / "articles").mkdir()
            (root / "articles" / "ok.md").write_text(
                "Text [@smith2020].", encoding="utf-8"
            )
            (helper / "sources.json").write_text(
                json.dumps([{"citeKey": "smith2020"}]), encoding="utf-8"
            )
            (helper / "bibliography.bib").write_text(
                "@book{smith2020, title={Book}}\n", encoding="utf-8"
            )
            (root / "articles" / "ok.sources.json").write_text(
                json.dumps([{"citeKey": "smith2020"}]), encoding="utf-8"
            )
            (root / "articles" / "ok.bibliography.bib").write_text(
                "@book{smith2020, title={Local Book}}\n", encoding="utf-8"
            )
            log = root / "pandoc.args"
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pandoc = bin_dir / "pandoc"
            pandoc.write_text(
                '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$PANDOC_LOG"\nexit 0\n',
                encoding="utf-8",
            )
            pandoc.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
                "PANDOC_LOG": str(log),
            }

            data = self.call_tool(
                root,
                "academic_writer_export_article",
                {
                    "article": "articles/ok.md",
                    "citationStyle": "chicago",
                    "formats": ["html"],
                    "csl": "style.csl",
                },
                env,
            )

            args = log.read_text(encoding="utf-8").splitlines()
            self.assertTrue(data["details"]["ok"])
            self.assertIn("--citeproc", args)
            self.assertIn("--fail-if-warnings", args)
            self.assertIn("--bibliography=articles/ok.bibliography.bib", args)
            self.assertEqual(
                data["details"]["bibliography"], "articles/ok.bibliography.bib"
            )
            self.assertIn("--csl=style.csl", args)

    def test_docx_extraction_prefers_pandoc_citations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "doc.docx").write_bytes(b"fake docx; pandoc stub handles it")
            log = root / "pandoc.args"
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pandoc = bin_dir / "pandoc"
            pandoc.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$PANDOC_LOG\"\necho 'Text [@smith2020].'\n",
                encoding="utf-8",
            )
            pandoc.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
                "PANDOC_LOG": str(log),
            }

            data = self.call_tool(
                root,
                "academic_writer_extract_document",
                {"path": "doc.docx"},
                env,
            )

            args = log.read_text(encoding="utf-8").splitlines()
            self.assertEqual(data["content"][0]["text"], "Text [@smith2020].")
            self.assertEqual(args[:4], ["-f", "docx+citations", "-t", "markdown"])

    def test_migrates_json_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profile_dir = root / ".academic-writer"
            profile_dir.mkdir()
            (profile_dir / "profile.json").write_text(
                json.dumps(
                    {
                        "fieldOfStudy": "Literature",
                        "citationStyle": "apa",
                        "abstractLanguages": ["English", "Hebrew"],
                        "tools": {"zotero": {"enabled": True, "mode": "local"}},
                    }
                ),
                encoding="utf-8",
            )
            data = self.run_tools(root)

        self.assertTrue(data["migration"]["details"]["ok"])
        self.assertTrue(data["migration"]["details"]["migrated"])
        self.assertEqual(
            data["profile"]["details"]["profile"]["fieldOfStudy"], "Literature"
        )
        self.assertEqual(data["profile"]["details"]["profile"]["citationStyle"], "apa")


if __name__ == "__main__":
    unittest.main()
