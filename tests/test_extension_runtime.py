import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


class TestExtensionRuntime(unittest.TestCase):
    """Test cases covering ExtensionRuntime.

    This class groups related assertions or helpers for the surrounding module.
    """

    @classmethod
    def setUpClass(cls):
        """setUpClass.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
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
        """tearDownClass.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        shutil.rmtree(cls.build_root, ignore_errors=True)

    def run_tools(self, project_root: Path, env=None):
        """run tools.

        This component keeps the surrounding module contract explicit and testable.

        Args:
            project_root: Project root supplied by the caller.
            env: Env supplied by the caller.

        Returns:
            The helper result, or None when the helper performs work for side effects only.
        """
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
        """call tool.

        This component keeps the surrounding module contract explicit and testable.

        Args:
            project_root: Project root supplied by the caller.
            name: Name supplied by the caller.
            params: Params supplied by the caller.
            env: Env supplied by the caller.

        Returns:
            The helper result, or None when the helper performs work for side effects only.
        """
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

    def test_prose_lint_tool_returns_advisory_results_and_skips_hebrew(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            english = self.call_tool(
                root,
                "academic_writer_lint_prose",
                {
                    "text": "Let's dive in. The archive records payments.",
                    "language": "English",
                },
            )
            hebrew = self.call_tool(
                root,
                "academic_writer_lint_prose",
                {"text": "טקסט בעברית.", "language": "Hebrew"},
            )

        details = english["details"]
        self.assertTrue(details["ok"])
        self.assertEqual(details["status"], "advisory")
        self.assertEqual(details["findings"][0]["id"], "staged-opener")
        self.assertEqual(details["findings"][0]["line"], 1)
        self.assertTrue(hebrew["details"]["skipped"])
        self.assertIn("English only", hebrew["details"]["reason"])

    def test_package_tools_run_against_project_state(self):
        """Assert package tools run against project state.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
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
        self.assertIn("academic_writer_lint_prose", data["names"])
        self.assertIn("academic_writer_ingest_sources", data["names"])
        self.assertIn("academic_writer_snapshot_citations", data["names"])
        self.assertIn("academic_writer_assemble_docx_json", data["names"])
        self.assertIn("academic_writer_migrate_profile", data["names"])
        for name in (
            "academic_writer_write_research_notes",
            "academic_writer_review_research_notes",
            "academic_writer_write_outline",
            "academic_writer_render_outline",
            "academic_writer_snapshot_notes",
            "academic_writer_query_research",
            "academic_writer_migrate_article_outline",
        ):
            self.assertIn(name, data["names"])
        self.assertNotIn("academic_writer_write_evidence_ownership", data["names"])
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
        """Assert export passes citeproc options to pandoc.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
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
        """Assert docx extraction prefers pandoc citations.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
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
        """Assert migrates json profile.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
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

    def test_research_notes_outline_and_frozen_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = root / ".academic-writer"
            state.mkdir()
            (root / "articles").mkdir()
            fingerprint = "sha256:fixture"
            source_id = "local:" + fingerprint
            (state / "sources.json").write_text(
                json.dumps(
                    [
                        {
                            "sourceId": source_id,
                            "sourceType": "local-file",
                            "sourceFingerprint": fingerprint,
                        }
                    ]
                ),
                encoding="utf-8",
            )
            written = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {
                    "notesJson": json.dumps(
                        [
                            {
                                "kind": "quotation",
                                "coreStatement": "Evidence",
                                "sourceRef": source_id,
                                "anchor": {
                                    "locator": {"display": "PDF p. 3"},
                                    "pdfPageIndex": 2,
                                    "textQuote": {"exact": "Exact words"},
                                    "sourceFingerprint": fingerprint,
                                },
                                "tags": ["argument"],
                            }
                        ]
                    )
                },
            )
            self.assertTrue(written["details"]["ok"])
            note = written["details"]["value"][0]
            self.assertEqual(note["review"]["state"], "unchecked")
            reviewed = self.call_tool(
                root,
                "academic_writer_review_research_notes",
                {"noteIds": [note["id"]], "state": "verified"},
            )
            self.assertTrue(reviewed["details"]["ok"])
            outline = {
                "schemaVersion": 1,
                "article": {
                    "slug": "essay",
                    "title": "Essay",
                    "targetLanguage": "English",
                    "citationStyle": "apa",
                },
                "researchQuestion": "Question?",
                "thesis": {"text": "Claim", "status": "approved"},
                "status": "approved",
                "items": [
                    {
                        "id": "section-1",
                        "kind": "section",
                        "title": "Argument",
                        "purpose": "Establish the claim",
                        "thesisContribution": "Supports thesis",
                        "items": [
                            {
                                "id": "point-1",
                                "kind": "point",
                                "role": "argument",
                                "claim": "Claim",
                                "reasoning": "Reasoning",
                                "noteUses": [
                                    {
                                        "noteId": note["id"],
                                        "function": "supports",
                                        "handling": "analyze",
                                        "coverage": "primary",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
            saved_outline = self.call_tool(
                root,
                "academic_writer_write_outline",
                {"outlineJson": json.dumps(outline)},
            )
            self.assertTrue(saved_outline["details"]["ok"])
            reference_only = json.loads(json.dumps(outline))
            reference_only["items"][0]["items"][0]["noteUses"][0]["coverage"] = (
                "reference"
            )
            rejected_reference = self.call_tool(
                root,
                "academic_writer_write_outline",
                {"outlineJson": json.dumps(reference_only)},
            )
            self.assertFalse(rejected_reference["details"]["ok"])
            self.assertIn(
                "requires primary use", rejected_reference["details"]["error"]
            )

            duplicate_primary = json.loads(json.dumps(outline))
            duplicate_primary["items"][0]["items"].append(
                {
                    "id": "point-duplicate",
                    "kind": "point",
                    "role": "argument",
                    "claim": "Repeated claim",
                    "reasoning": "Repeated evidence must not be primary twice",
                    "noteUses": json.loads(
                        json.dumps(
                            duplicate_primary["items"][0]["items"][0]["noteUses"]
                        )
                    ),
                }
            )
            rejected_duplicate = self.call_tool(
                root,
                "academic_writer_write_outline",
                {"outlineJson": json.dumps(duplicate_primary)},
            )
            self.assertFalse(rejected_duplicate["details"]["ok"])
            self.assertIn("Duplicate primary", rejected_duplicate["details"]["error"])
            self.assertTrue(
                self.call_tool(
                    root,
                    "academic_writer_render_outline",
                    {"article": "articles/essay.md"},
                )["details"]["ok"]
            )
            self.assertTrue(
                self.call_tool(
                    root,
                    "academic_writer_snapshot_notes",
                    {"article": "articles/essay.md"},
                )["details"]["ok"]
            )
            frozen_notes = (root / "articles" / "essay.notes.json").read_bytes()
            unchanged = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {"notesJson": json.dumps([note])},
            )
            self.assertEqual(
                unchanged["details"]["value"][0]["review"]["state"], "verified"
            )
            changed = {**note, "coreStatement": "Changed in project library"}
            update = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {"notesJson": json.dumps([changed])},
            )
            self.assertEqual(
                update["details"]["value"][0]["review"]["state"], "unchecked"
            )
            bundle = self.call_tool(
                root,
                "academic_writer_query_research",
                {
                    "operation": "section_bundle",
                    "article": "articles/essay.md",
                    "sectionId": "section-1",
                },
            )
            self.assertTrue(bundle["details"]["ok"])
            self.assertEqual(
                bundle["details"]["value"]["notes"][0]["coreStatement"], "Evidence"
            )
            failed_snapshot = self.call_tool(
                root,
                "academic_writer_snapshot_notes",
                {"article": "articles/essay.md"},
            )
            self.assertFalse(failed_snapshot["details"]["ok"])
            self.assertEqual(
                (root / "articles" / "essay.notes.json").read_bytes(),
                frozen_notes,
            )

    def test_ingest_uses_content_identity_and_marks_changed_notes_stale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_dir = root / ".academic-writer" / "sources"
            source_dir.mkdir(parents=True)
            source = source_dir / "local.txt"
            source.write_text("First version", encoding="utf-8")
            first = self.call_tool(
                root, "academic_writer_ingest_sources", {"paths": [str(source)]}
            )["details"]
            record = first["sources"][0]
            self.assertEqual(record["sourceId"], "local:" + record["sourceFingerprint"])
            self.assertRegex(record["sourceFingerprint"], r"^sha256:[0-9a-f]{64}$")
            note = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {
                    "notesJson": json.dumps(
                        [
                            {
                                "kind": "paraphrase",
                                "coreStatement": "Researcher paraphrase",
                                "researcherNote": "I rewrote the source idea",
                                "sourceRef": record["sourceId"],
                            }
                        ]
                    )
                },
            )["details"]["value"][0]
            self.call_tool(
                root, "academic_writer_ingest_sources", {"paths": [str(source)]}
            )
            unchanged = json.loads(
                (root / ".academic-writer" / "sources.json").read_text(encoding="utf-8")
            )[0]
            self.assertEqual(unchanged["sourceId"], record["sourceId"])
            source.write_text("Second, changed version", encoding="utf-8")
            changed = self.call_tool(
                root, "academic_writer_ingest_sources", {"paths": [str(source)]}
            )["details"]["sources"][0]
            self.assertNotEqual(changed["sourceId"], record["sourceId"])
            saved = json.loads(
                (root / ".academic-writer" / "research-notes.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(saved["notes"][0]["id"], note["id"])
            self.assertEqual(saved["notes"][0]["review"]["state"], "stale")

    def test_pdf_ingest_preserves_zero_based_page_boundaries(self):
        def make_pdf():
            first = b"BT /F1 12 Tf 25 250 Td (FIRST PAGE MARKER) Tj ET"
            second = b"BT /F1 12 Tf 25 250 Td (SECOND PAGE MARKER) Tj ET"
            objects = [
                b"<< /Type /Catalog /Pages 2 0 R >>",
                b"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
                b"<< /Length "
                + str(len(first)).encode()
                + b" >>\nstream\n"
                + first
                + b"\nendstream",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
                b"<< /Length "
                + str(len(second)).encode()
                + b" >>\nstream\n"
                + second
                + b"\nendstream",
                b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            ]
            data = bytearray(b"%PDF-1.4\n")
            offsets = [0]
            for number, body in enumerate(objects, 1):
                offsets.append(len(data))
                data.extend(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
            xref = len(data)
            data.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
            for offset in offsets[1:]:
                data.extend(f"{offset:010d} 00000 n \n".encode())
            data.extend(
                f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
            )
            return bytes(data)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "two-pages.pdf"
            source.write_bytes(make_pdf())
            result = self.call_tool(
                root, "academic_writer_ingest_sources", {"paths": [str(source)]}
            )
            record = result["details"]["sources"][0]
            repeated = self.call_tool(
                root, "academic_writer_ingest_sources", {"paths": [str(source)]}
            )["details"]["sources"][0]
            self.assertEqual(repeated["sourceId"], record["sourceId"])
            self.assertEqual(repeated["sourceFingerprint"], record["sourceFingerprint"])
            self.assertEqual(
                [page["pdfPageIndex"] for page in repeated["pages"]], [0, 1]
            )
            self.assertEqual([page["pdfPageIndex"] for page in record["pages"]], [0, 1])
            self.assertIn("FIRST PAGE MARKER", record["pages"][0]["text"])
            self.assertIn("SECOND PAGE MARKER", record["pages"][1]["text"])

    def test_local_source_version_and_non_citable_outline_guards(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = root / ".academic-writer"
            state.mkdir()
            fingerprint = "sha256:current"
            source_id = "local:" + fingerprint
            (state / "sources.json").write_text(
                json.dumps(
                    [
                        {
                            "sourceId": source_id,
                            "sourceType": "local-file",
                            "sourceFingerprint": fingerprint,
                        }
                    ]
                ),
                encoding="utf-8",
            )
            missing_fingerprint = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {
                    "notesJson": json.dumps(
                        [
                            {
                                "id": "unbound-paraphrase",
                                "kind": "paraphrase",
                                "coreStatement": "Paraphrased claim",
                                "sourceRef": source_id,
                                "researcherNote": "Researcher-authored paraphrase",
                            }
                        ]
                    )
                },
            )
            self.assertEqual(
                missing_fingerprint["details"]["value"][0]["review"]["state"],
                "stale",
            )
            verified = self.call_tool(
                root,
                "academic_writer_review_research_notes",
                {"noteIds": ["unbound-paraphrase"], "state": "verified"},
            )
            self.assertEqual(
                verified["details"]["value"][0]["review"]["state"], "stale"
            )

            analysis = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {
                    "notesJson": json.dumps(
                        [
                            {
                                "id": "analysis-only",
                                "kind": "analysis",
                                "coreStatement": "Researcher interpretation",
                            }
                        ]
                    )
                },
            )
            self.assertTrue(analysis["details"]["ok"])
            self.call_tool(
                root,
                "academic_writer_review_research_notes",
                {"noteIds": ["analysis-only"], "state": "verified"},
            )
            outline = {
                "schemaVersion": 1,
                "article": {
                    "slug": "analysis-test",
                    "title": "Analysis Test",
                    "targetLanguage": "English",
                    "citationStyle": "apa",
                },
                "researchQuestion": "Question?",
                "thesis": {"text": "Thesis", "status": "approved"},
                "status": "approved",
                "items": [
                    {
                        "id": "section",
                        "kind": "section",
                        "title": "Argument",
                        "purpose": "Purpose",
                        "thesisContribution": "Contribution",
                        "items": [
                            {
                                "id": "point",
                                "kind": "point",
                                "role": "argument",
                                "claim": "Claim",
                                "reasoning": "Reasoning",
                                "noteUses": [
                                    {
                                        "noteId": "analysis-only",
                                        "function": "supports",
                                        "handling": "analyze",
                                        "coverage": "primary",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
            rejected = self.call_tool(
                root,
                "academic_writer_write_outline",
                {"outlineJson": json.dumps(outline)},
            )
            self.assertFalse(rejected["details"]["ok"])
            self.assertIn("Non-citable note kind", rejected["details"]["error"])
            self.assertFalse(
                (root / "articles" / "analysis-test.outline.json").exists()
            )

    def test_source_cache_rejects_unconfirmed_zotero_identity_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = root / ".academic-writer"
            state.mkdir()
            source_file = state / "sources.json"
            bibliography_file = state / "bibliography.bib"
            source_file.write_text("original sources\n", encoding="utf-8")
            bibliography_file.write_text("original bibliography\n", encoding="utf-8")
            params = {
                "sourcesJson": json.dumps(
                    [
                        {
                            "sourceType": "zotero",
                            "sourceId": "zotero:wrong:key",
                            "libraryId": "library",
                            "itemKey": "key",
                        }
                    ]
                ),
                "bibliography": "@book{new, title={New}}",
            }
            with self.assertRaises(subprocess.CalledProcessError):
                self.call_tool(root, "academic_writer_write_sources_cache", params)
            self.assertEqual(
                source_file.read_text(encoding="utf-8"), "original sources\n"
            )
            self.assertEqual(
                bibliography_file.read_text(encoding="utf-8"), "original bibliography\n"
            )
            valid_params = {
                "sourcesJson": json.dumps(
                    [
                        {
                            "sourceType": "zotero",
                            "sourceId": None,
                            "libraryId": "library",
                            "itemKey": "key",
                        }
                    ]
                ),
                "bibliography": "@book{new, title={New}}",
            }
            self.call_tool(root, "academic_writer_write_sources_cache", valid_params)
            self.assertEqual(
                json.loads(source_file.read_text(encoding="utf-8"))[0]["sourceId"],
                "zotero:library:key",
            )
            self.assertEqual(
                bibliography_file.read_text(encoding="utf-8"),
                valid_params["bibliography"],
            )

    def test_approved_snapshots_preserve_both_citation_modes(self):
        for style, citation in (
            ("inline-parenthetical", "(Augustine, Confessions XI, 14)"),
            ("apa", "[@augConfessions, p. 14]"),
        ):
            with self.subTest(style=style), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                state = root / ".academic-writer"
                articles = root / "articles"
                state.mkdir()
                articles.mkdir()
                source_id = "zotero:fixture:ABC12345"
                sources = [
                    {
                        "sourceId": source_id,
                        "sourceType": "zotero",
                        "libraryId": "fixture",
                        "itemKey": "ABC12345",
                        "citeKey": "augConfessions",
                        "sourceFingerprint": None,
                    }
                ]
                bibliography = "@book{augConfessions, title={Confessions}}\n"
                (state / "sources.json").write_text(
                    json.dumps(sources), encoding="utf-8"
                )
                (state / "bibliography.bib").write_text(bibliography, encoding="utf-8")
                article = articles / "essay.md"
                article_text = (
                    f"# Essay\n\nThe claim remains interpretive {citation}.\n"
                )
                article.write_text(article_text, encoding="utf-8")
                note = self.call_tool(
                    root,
                    "academic_writer_write_research_notes",
                    {
                        "notesJson": json.dumps(
                            [
                                {
                                    "id": "evidence",
                                    "kind": "quotation",
                                    "coreStatement": "Evidence claim",
                                    "sourceRef": source_id,
                                    "anchor": {
                                        "locator": {"display": "Confessions XI, 14"},
                                        "textQuote": {"exact": "Exact source words"},
                                    },
                                }
                            ]
                        )
                    },
                )
                self.assertTrue(note["details"]["ok"])
                self.call_tool(
                    root,
                    "academic_writer_review_research_notes",
                    {"noteIds": ["evidence"], "state": "verified"},
                )
                outline = {
                    "schemaVersion": 1,
                    "article": {
                        "slug": "essay",
                        "title": "Essay",
                        "targetLanguage": "English",
                        "citationStyle": style,
                    },
                    "researchQuestion": "Question?",
                    "thesis": {"text": "Thesis", "status": "approved"},
                    "status": "approved",
                    "items": [
                        {
                            "id": "section",
                            "kind": "section",
                            "title": "Argument",
                            "purpose": "Purpose",
                            "thesisContribution": "Contribution",
                            "items": [
                                {
                                    "id": "point",
                                    "kind": "point",
                                    "role": "argument",
                                    "claim": "Claim",
                                    "reasoning": "Reasoning",
                                    "noteUses": [
                                        {
                                            "noteId": "evidence",
                                            "function": "supports",
                                            "handling": "analyze",
                                            "coverage": "primary",
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
                saved = self.call_tool(
                    root,
                    "academic_writer_write_outline",
                    {"outlineJson": json.dumps(outline)},
                )
                self.assertTrue(saved["details"]["ok"])
                rendered = self.call_tool(
                    root,
                    "academic_writer_render_outline",
                    {"article": "articles/essay.md"},
                )
                self.assertTrue(rendered["details"]["ok"])
                citations = self.call_tool(
                    root,
                    "academic_writer_snapshot_citations",
                    {"article": "articles/essay.md"},
                )
                self.assertTrue(citations["details"]["ok"])
                notes = self.call_tool(
                    root,
                    "academic_writer_snapshot_notes",
                    {"article": "articles/essay.md"},
                )
                self.assertTrue(notes["details"]["ok"])
                audit = self.call_tool(
                    root,
                    "academic_writer_audit_citations",
                    {"article": "articles/essay.md", "citationStyle": style},
                )
                self.assertTrue(audit["details"]["ok"])
                bundle = self.call_tool(
                    root,
                    "academic_writer_query_research",
                    {
                        "operation": "section_bundle",
                        "article": "articles/essay.md",
                        "sectionId": "section",
                    },
                )
                self.assertTrue(bundle["details"]["ok"])
                self.assertEqual(
                    bundle["details"]["value"]["notes"][0]["id"], "evidence"
                )
                self.assertEqual(article.read_text(encoding="utf-8"), article_text)
                self.assertEqual(
                    json.loads(
                        (articles / "essay.sources.json").read_text(encoding="utf-8")
                    ),
                    sources,
                )
                self.assertEqual(
                    (articles / "essay.bibliography.bib").read_text(encoding="utf-8"),
                    bibliography,
                )
                self.assertEqual(
                    json.loads(
                        (articles / "essay.notes.json").read_text(encoding="utf-8")
                    )["notes"][0]["id"],
                    "evidence",
                )

    def test_query_operations_caps_and_recursive_render_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = root / ".academic-writer"
            state.mkdir()
            (state / "sources.json").write_text(
                json.dumps(
                    [{"sourceId": "zotero:library:item", "sourceType": "zotero"}]
                ),
                encoding="utf-8",
            )
            notes = [
                {
                    "id": "source-note",
                    "kind": "paraphrase",
                    "coreStatement": "Source-linked finding",
                    "researcherNote": "Researcher paraphrase",
                    "sourceRef": "zotero:library:item",
                    "tags": ["common"],
                },
                *[
                    {
                        "id": f"idea-{index}",
                        "kind": "idea",
                        "coreStatement": f"Idea {index}",
                        "tags": ["common"],
                    }
                    for index in range(105)
                ],
            ]
            saved = self.call_tool(
                root,
                "academic_writer_write_research_notes",
                {"notesJson": json.dumps(notes)},
            )
            self.assertTrue(saved["details"]["ok"])
            self.assertFalse(
                self.call_tool(
                    root,
                    "academic_writer_write_research_notes",
                    {
                        "notesJson": json.dumps(
                            [
                                {
                                    "id": "invalid-date",
                                    "kind": "idea",
                                    "coreStatement": "Invalid timestamp",
                                    "createdAt": "March 4, 2024",
                                }
                            ]
                        )
                    },
                )["details"]["ok"]
            )
            for params, expected in (
                ({"operation": "note_by_id", "noteId": "source-note"}, "source-note"),
                (
                    {"operation": "notes_by_source", "sourceId": "zotero:library:item"},
                    ["source-note"],
                ),
            ):
                result = self.call_tool(root, "academic_writer_query_research", params)
                self.assertTrue(result["details"]["ok"])
                value = result["details"]["value"]
                self.assertEqual(
                    value["id"]
                    if isinstance(value, dict)
                    else [n["id"] for n in value],
                    expected,
                )
            default_list = self.call_tool(
                root,
                "academic_writer_query_research",
                {"operation": "notes_by_tag", "tag": "common"},
            )
            capped = self.call_tool(
                root,
                "academic_writer_query_research",
                {"operation": "notes_by_tag", "tag": "common", "limit": 101},
            )
            self.assertEqual(len(default_list["details"]["value"]), 20)
            self.assertEqual(len(capped["details"]["value"]), 100)
            self.assertFalse(
                self.call_tool(
                    root,
                    "academic_writer_query_research",
                    {
                        "operation": "note_by_id",
                        "noteId": "source-note",
                        "tag": "common",
                    },
                )["details"]["ok"]
            )
            self.assertFalse(
                self.call_tool(
                    root,
                    "academic_writer_query_research",
                    {"operation": "notes_by_source"},
                )["details"]["ok"]
            )

            tree = {
                "schemaVersion": 1,
                "article": {
                    "slug": "tree",
                    "title": "Tree",
                    "targetLanguage": "English",
                    "citationStyle": "apa",
                },
                "researchQuestion": "Question?",
                "thesis": {"text": "Thesis", "status": "proposed"},
                "status": "draft",
                "items": [
                    {
                        "id": "outer",
                        "kind": "section",
                        "title": "Outer",
                        "purpose": "P",
                        "thesisContribution": "C",
                        "items": [
                            {
                                "id": "inner",
                                "kind": "section",
                                "title": "Inner",
                                "purpose": "P",
                                "thesisContribution": "C",
                                "items": [
                                    {
                                        "id": "deep",
                                        "kind": "section",
                                        "title": "Deep",
                                        "purpose": "P",
                                        "thesisContribution": "C",
                                        "items": [],
                                    }
                                ],
                            },
                            {
                                "id": "inner-two",
                                "kind": "section",
                                "title": "Inner Two",
                                "purpose": "P",
                                "thesisContribution": "C",
                                "items": [],
                            },
                        ],
                    },
                    {
                        "id": "outer-two",
                        "kind": "section",
                        "title": "Outer Two",
                        "purpose": "P",
                        "thesisContribution": "C",
                        "items": [],
                    },
                ],
            }
            self.assertTrue(
                self.call_tool(
                    root,
                    "academic_writer_write_outline",
                    {"outlineJson": json.dumps(tree)},
                )["details"]["ok"]
            )
            rendered = self.call_tool(
                root, "academic_writer_render_outline", {"article": "articles/tree.md"}
            )
            self.assertTrue(rendered["details"]["ok"])
            headings = [
                line
                for line in (root / "articles" / "tree.outline.md")
                .read_text(encoding="utf-8")
                .splitlines()
                if line.startswith("#")
            ]
            self.assertEqual(
                headings,
                [
                    "# Tree",
                    "## 1. Outer",
                    "### 1. Inner",
                    "#### 1. Deep",
                    "### 2. Inner Two",
                    "## 2. Outer Two",
                ],
            )
            summary = self.call_tool(
                root,
                "academic_writer_query_research",
                {"operation": "outline_summary", "article": "articles/tree.md"},
            )
            self.assertTrue(summary["details"]["ok"])
            self.assertEqual(
                [section["id"] for section in summary["details"]["value"]["sections"]],
                ["outer", "inner", "deep", "inner-two", "outer-two"],
            )

    def test_e2e_fixture_outline_uses_frozen_notes(self):
        root = Path("tests/e2e/fixture-project").resolve()
        summary = self.call_tool(
            root,
            "academic_writer_query_research",
            {"operation": "outline_summary", "article": "articles/augustine-time.md"},
        )
        self.assertTrue(summary["details"]["ok"])
        self.assertEqual(summary["details"]["value"]["status"], "approved")
        bundle = self.call_tool(
            root,
            "academic_writer_query_research",
            {
                "operation": "section_bundle",
                "article": "articles/augustine-time.md",
                "sectionId": "augustine",
            },
        )
        self.assertTrue(bundle["details"]["ok"])
        values = bundle["details"]["value"]
        self.assertEqual(values["directPoints"][0]["id"], "soul-times")
        self.assertEqual(values["notes"][0]["id"], "note-aug-soul")
        self.assertEqual(values["notes"][0]["review"]["state"], "verified")
        self.assertEqual(
            values["notes"][0]["sourceRef"], "zotero:fixture-library:CFN11AAA"
        )

    def test_outline_migration_preserves_markdown_and_conflicts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            articles = root / "articles"
            articles.mkdir()
            markdown = "Intro paragraph\n\n# Main\n\n  First body paragraph.  \n\n## Nested\n\nSecond body paragraph.\n"
            article = articles / "old-article.md"
            article.write_text(markdown, encoding="utf-8")
            migrated = self.call_tool(
                root,
                "academic_writer_migrate_article_outline",
                {"article": "articles/old-article.md"},
            )
            self.assertTrue(migrated["details"]["ok"])
            outline = migrated["details"]["value"]
            self.assertEqual(outline["status"], "draft")
            self.assertEqual(article.read_text(encoding="utf-8"), markdown)
            self.assertEqual(outline["items"][0]["draftText"], "Intro paragraph")
            self.assertEqual(
                outline["items"][1]["items"][0]["draftText"],
                "  First body paragraph.  ",
            )
            self.assertEqual(
                outline["items"][1]["items"][1]["items"][0]["draftText"],
                "Second body paragraph.",
            )
            forged = json.loads(json.dumps(outline))
            forged["article"]["slug"] = "forged"
            self.assertFalse(
                self.call_tool(
                    root,
                    "academic_writer_write_outline",
                    {"outlineJson": json.dumps(forged)},
                )["details"]["ok"]
            )
            self.assertTrue(
                self.call_tool(
                    root,
                    "academic_writer_write_outline",
                    {"outlineJson": json.dumps(outline)},
                )["details"]["ok"]
            )
            self.assertTrue(
                self.call_tool(
                    root,
                    "academic_writer_render_outline",
                    {"article": "articles/old-article.md"},
                )["details"]["ok"]
            )
            conflict = self.call_tool(
                root,
                "academic_writer_migrate_article_outline",
                {"article": "articles/old-article.md"},
            )
            self.assertFalse(conflict["details"]["ok"])

    def test_health_includes_rumdl_field(self):
        """Assert health tool returns rumdl detection field.

        This component keeps the surrounding module contract explicit and testable.

        Returns:
            None.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profile_dir = root / ".academic-writer"
            profile_dir.mkdir()
            (root / "articles").mkdir()
            (root / "articles" / "ok.md").write_text(
                "Text [@smith2020].", encoding="utf-8"
            )
            (profile_dir / "profile.json").write_text(
                json.dumps(
                    {
                        "fieldOfStudy": "Literature",
                        "citationStyle": "apa",
                        "abstractLanguages": ["English"],
                        "tools": {},
                    }
                ),
                encoding="utf-8",
            )
            data = self.run_tools(root)

        health = data["health"]["details"]
        self.assertIn("rumdl", health)
        self.assertIsInstance(health["rumdl"], bool)


if __name__ == "__main__":
    unittest.main()
