import json
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

    def run_tools(self, project_root: Path):
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
                const resource = await call("academic_writer_read_resource", {{ name: "thresholds" }});
                const audit = await call("academic_writer_audit_citations", {{
                  article: "articles/ok.md",
                  citationStyle: "chicago"
                }});
                console.log(JSON.stringify({{
                  names: [...tools.keys()].sort(),
                  status,
                  resource,
                  audit
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
        )
        return json.loads(res.stdout)

    def test_package_tools_run_against_project_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            helper = root / ".academic-helper"
            (helper / "runs").mkdir(parents=True)
            (root / "articles").mkdir()
            (helper / "profile.md").write_text(
                "---\nfieldOfStudy: History\n---\n", encoding="utf-8"
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
            (root / "articles" / "ok.md").write_text(
                "Text [@smith2020, p. 4].",
                encoding="utf-8",
            )

            data = self.run_tools(root)

        self.assertIn("academic_writer_status", data["names"])
        self.assertIn("academic_writer_read_resource", data["names"])
        self.assertIn("academic_writer_audit_citations", data["names"])
        self.assertTrue(data["status"]["details"]["ok"])
        self.assertEqual(data["status"]["details"]["sources"]["count"], 1)
        self.assertEqual(data["status"]["details"]["runs"]["active"][0]["runId"], "r1")
        self.assertIn("auditor.md", data["status"]["details"]["agents"])
        self.assertEqual(data["resource"]["details"]["source"], "project")
        self.assertEqual(
            json.loads(data["resource"]["content"][0]["text"]), {"sentinel": True}
        )
        self.assertTrue(data["audit"]["details"]["ok"])
        self.assertEqual(data["audit"]["details"]["citationKeys"], ["smith2020"])


if __name__ == "__main__":
    unittest.main()
