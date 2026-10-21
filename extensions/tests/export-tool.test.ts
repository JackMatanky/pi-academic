import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";
import { Type } from "typebox";
import { test, type TestContext } from "vitest";

import { parseWith, type JsonObject } from "../lib/schema.js";
import { ToolFailure } from "../pi-academic/core/tool-kit.js";
import { createToolHarness, get } from "./helpers.js";

type Params = JsonObject;

const realPandoc = spawnSync("which", ["pandoc"], {
  encoding: "utf8",
}).stdout.trim();

const needsPandoc = { skip: !realPandoc };

const { callTool, definitions } = createToolHarness();

type ToolResult = Awaited<ReturnType<typeof callTool>>;

const STUB = `#!/bin/sh
for a in "$@"; do
  if [ "$a" = "--print-default-data-file" ]; then exec "$REAL_PANDOC" "$@"; fi
done
if [ -n "$STUB_PASSTHROUGH" ]; then exec "$REAL_PANDOC" "$@"; fi
printf '%s\\n' "$@" >> "$STUB_LOG"
echo "--" >> "$STUB_LOG"
out=""; prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
if [ -n "$STUB_FAIL_EXT" ] && [ "\${out%"$STUB_FAIL_EXT"}" != "$out" ]; then
  echo "stub failure for $out" >&2
  exit 3
fi
if [ -n "$out" ]; then : > "$out"; fi
`;

interface Harness {
  root: string;
  run(name: string, params: Params): Promise<ToolResult>;
  /**
   * One argv array per recorded (non-passthrough) pandoc invocation.
   */
  invocations(): string[][];
}

/**
 * A project plus a PATH that contains a recording `pandoc` stub and exactly the
 * PDF engines named in `engines`, so engine detection is deterministic.
 */
function harness(
  t: TestContext,
  options: { engines?: string[]; failExt?: string; passthrough?: boolean } = {},
): Harness {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "export-tool-")));
  const bin = join(root, ".bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "pandoc"), STUB);
  chmodSync(join(bin, "pandoc"), 0o755);

  for (const engine of options.engines ?? []) {
    writeFileSync(join(bin, engine), "#!/bin/sh\n");
    chmodSync(join(bin, engine), 0o755);
  }

  const log = join(root, "pandoc.log");
  const saved = { ...process.env };
  Object.assign(process.env, {
    PATH: `${bin}:/usr/bin:/bin`,
    REAL_PANDOC: realPandoc,
    STUB_LOG: log,
    STUB_FAIL_EXT: options.failExt ?? "",
    STUB_PASSTHROUGH: options.passthrough ? "1" : "",
  });
  t.onTestFinished(() => {
    for (const key of [
      "PATH",
      "REAL_PANDOC",
      "STUB_LOG",
      "STUB_FAIL_EXT",
      "STUB_PASSTHROUGH",
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }

    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, "articles"));
  writeFileSync(
    join(root, "articles", "essay.md"),
    "Plain text with no citations.\n",
  );

  return {
    root,
    run: (name, params) => callTool(root, name, params),
    invocations: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .split("--\n")
            .filter(Boolean)
            .map((block) => block.split("\n").filter(Boolean))
        : [],
  };
}

function writePackage(
  root: string,
  name: string,
  design: JsonObject,
  files: Record<string, string> = {},
) {
  const dir = join(root, ".academic-writer", "styles", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "design.json"),
    JSON.stringify({ schemaVersion: 1, name, ...design }),
  );

  for (const [file, content] of Object.entries(files))
    writeFileSync(join(dir, file), content);
}

function setProfileStylePackage(root: string, name: string) {
  mkdirSync(join(root, ".academic-writer"), { recursive: true });
  writeFileSync(
    join(root, ".academic-writer", "profile.md"),
    `---\nfieldOfStudy: "Test"\ncitationStyle: "inline-parenthetical"\ntargetLanguage: "English"\n---\n\n## Output Format Preferences\n\n\`\`\`json\n${JSON.stringify({ stylePackage: name })}\n\`\`\`\n`,
  );
}

const exportParams = (formats: string[], extra: Params = {}) => ({
  article: "articles/essay.md",
  citationStyle: "inline-parenthetical",
  formats,
  ...extra,
});

const EntrySchema = Type.Object({
  format: Type.String(),
  ok: Type.Boolean(),
  error: Type.Optional(Type.String()),
  engine: Type.Optional(Type.String()),
  style: Type.Optional(
    Type.Object({
      package: Type.String(),
      generated: Type.Array(Type.String()),
      native: Type.Record(Type.String(), Type.String()),
      warnings: Type.Array(Type.String()),
    }),
  ),
});

const entries = (result: ToolResult) =>
  parseWith(Type.Array(EntrySchema), result.details.results ?? null, "results");

test("without a style package no style flags are passed and the pdf engine is detected", async (t) => {
  const both = harness(t, { engines: ["xelatex", "tectonic"] });

  const result = await both.run(
    "academic_writer_export_article",
    exportParams(["docx", "odt", "latex", "pdf"]),
  );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.stylePackage, null);
  const calls = both.invocations();
  assert.equal(calls.length, 4);

  for (const call of calls) {
    assert.ok(
      !call.some(
        (arg) =>
          arg.startsWith("--reference-doc") ||
          arg.startsWith("--include-in-header") ||
          arg.startsWith("--template"),
      ),
    );
  }

  assert.ok(
    calls[3]?.includes("--pdf-engine=xelatex"),
    "xelatex is preferred when installed",
  );
  assert.deepEqual(
    calls.map((call) => (call[call.indexOf("-o") + 1] ?? "").split(".").pop()),
    ["docx", "odt", "tex", "pdf"],
  );

  for (const name of ["docx", "odt", "tex", "pdf"]) {
    assert.ok(existsSync(join(both.root, "articles", `essay.${name}`)), name);
  }
});

test("pdf engine precedence: explicit argument, then package engine, then detection", async (t) => {
  const h = harness(t, { engines: ["tectonic"] });
  writePackage(h.root, "with-engine", {
    formats: { pdf: { engine: "xelatex" } },
  });
  writePackage(h.root, "no-engine", {});

  const engineOf = async (extra: Params) => {
    const result = await h.run(
      "academic_writer_export_article",
      exportParams(["pdf"], extra),
    );

    assert.equal(result.details.ok, true, result.content[0]?.text ?? "");

    return entries(result)[0]?.engine;
  };

  assert.equal(
    await engineOf({}),
    "tectonic",
    "detection finds the only installed engine",
  );
  assert.equal(await engineOf({ stylePackage: "no-engine" }), "tectonic");
  assert.equal(
    await engineOf({ stylePackage: "with-engine" }),
    "xelatex",
    "package engine beats detection",
  );
  assert.equal(
    await engineOf({ stylePackage: "with-engine", pdfEngine: "tectonic" }),
    "tectonic",
    "argument beats package",
  );
  const calls = h.invocations();
  assert.ok(calls[2]?.includes("--pdf-engine=xelatex"));
  assert.ok(calls[3]?.includes("--pdf-engine=tectonic"));
  const none = harness(t);

  const result = await none.run(
    "academic_writer_export_article",
    exportParams(["pdf"]),
  );

  assert.equal(entries(result)[0]?.engine, undefined);
  assert.ok(
    !none.invocations()[0]?.some((arg) => arg.startsWith("--pdf-engine")),
    "no engine: Pandoc's default applies",
  );
});

test(
  "the per-call style package overrides the profile and each format gets its own assets",
  needsPandoc,
  async (t) => {
    const h = harness(t);
    writePackage(h.root, "from-profile", {});
    writePackage(h.root, "from-call", {});
    setProfileStylePackage(h.root, "from-profile");

    const profile = await h.run(
      "academic_writer_export_article",
      exportParams(["docx", "odt", "latex", "pdf"]),
    );

    assert.equal(profile.details.stylePackage, "from-profile");
    assert.deepEqual(
      entries(profile).map((e) => e.style?.package),
      Array(4).fill("from-profile"),
    );

    const call = await h.run(
      "academic_writer_export_article",
      exportParams(["docx"], { stylePackage: "from-call" }),
    );

    assert.equal(call.details.stylePackage, "from-call");
    assert.equal(entries(call)[0]?.style?.package, "from-call");

    const [docx, odt, latex, pdf] = h.invocations();
    assert.ok(docx?.some((a) => /^--reference-doc=.*reference\.docx$/.test(a)));
    assert.ok(odt?.some((a) => /^--reference-doc=.*reference\.odt$/.test(a)));
    assert.ok(
      latex?.some((a) => /^--include-in-header=.*header\.tex$/.test(a)),
    );
    assert.ok(pdf?.some((a) => /^--include-in-header=.*header\.tex$/.test(a)));
    assert.ok(!latex?.some((a) => a.startsWith("--reference-doc")));
    assert.deepEqual(entries(profile)[0]?.style?.generated, [
      "referenceDocument",
    ]);
    assert.deepEqual(entries(profile)[2]?.style?.generated, ["preamble"]);
  },
);

test(
  "a failing format is reported and the other formats still export",
  needsPandoc,
  async (t) => {
    const h = harness(t);
    writePackage(h.root, "odt-broken", {
      formats: { odt: { referenceDocument: "missing.odt" } },
    });

    const invalid = await h.run(
      "academic_writer_export_article",
      exportParams(["docx", "odt", "latex"], { stylePackage: "odt-broken" }),
    );

    assert.equal(invalid.details.ok, false);
    const [docx, odt, latex] = entries(invalid);
    assert.equal(docx?.ok, true);
    assert.equal(odt?.ok, false);
    assert.match(odt?.error ?? "", /formats\.odt\.referenceDocument/);
    assert.equal(latex?.ok, true);
    assert.equal(h.invocations().length, 2, "odt never reached Pandoc");

    const failing = harness(t, { failExt: ".odt" });

    const result = await failing.run(
      "academic_writer_export_article",
      exportParams(["docx", "odt", "latex"]),
    );

    assert.deepEqual(
      entries(result).map((e) => e.ok),
      [true, false, true],
    );
    assert.match(
      entries(result)[1]?.error ?? "",
      /stub failure for .*export\.odt/,
    );
    assert.match(result.content[0]?.text ?? "", /odt: failed/);
  },
);

test(
  "a failing pdf or docx leaves the other formats and their flags untouched",
  needsPandoc,
  async (t) => {
    const pdf = harness(t, { failExt: ".pdf" });

    const result = await pdf.run(
      "academic_writer_export_article",
      exportParams(["pdf", "docx", "odt"]),
    );

    // Partial-failure shape: the run fails, the audit passed, and every
    // format reports its own outcome.
    assert.equal(result.details.ok, false);
    assert.equal(get(result.details, "audit", "status"), "passed");
    assert.equal(result.details.stylePackage, null);
    assert.deepEqual(
      entries(result).map((entry) => [entry.format, entry.ok]),
      [
        ["pdf", false],
        ["docx", true],
        ["odt", true],
      ],
    );
    assert.match(
      entries(result)[0]?.error ?? "",
      /stub failure for .*export\.pdf/,
    );
    assert.match(result.content[0]?.text ?? "", /pdf: failed/);
    assert.ok(existsSync(join(pdf.root, "articles", "essay.docx")));
    assert.ok(existsSync(join(pdf.root, "articles", "essay.odt")));
    assert.ok(!existsSync(join(pdf.root, "articles", "essay.pdf")));

    // No engine is installed, so no call may carry another format's engine
    // flag, and each call writes only its own output.
    const calls = pdf.invocations();
    assert.deepEqual(
      calls.map((call) =>
        (call[call.indexOf("-o") + 1] ?? "").split(".").pop(),
      ),
      ["pdf", "docx", "odt"],
    );
    assert.ok(
      calls.every((call) =>
        call.every((arg) => !arg.startsWith("--pdf-engine")),
      ),
    );

    const docx = harness(t, { failExt: ".docx", engines: ["xelatex"] });

    const swapped = await docx.run(
      "academic_writer_export_article",
      exportParams(["docx", "pdf"]),
    );

    assert.equal(swapped.details.ok, false);
    assert.deepEqual(
      entries(swapped).map((entry) => entry.ok),
      [false, true],
    );

    const [docxCall, pdfCall] = docx.invocations();
    assert.ok(!docxCall?.some((arg) => arg.startsWith("--pdf-engine")));
    assert.ok(pdfCall?.includes("--pdf-engine=xelatex"));
  },
);

test("aborting mid-export fails the tool and stops the remaining formats", async (t) => {
  const h = harness(t);
  const controller = new AbortController();
  const tool = definitions.get("academic_writer_export_article");
  assert.ok(tool, "the export tool is registered");

  let failure: ToolFailure | undefined;

  try {
    await tool.execute(
      "t",
      exportParams(["docx", "odt", "latex"]),
      controller.signal,
      (update) => {
        // Abort as soon as the first format reports progress, so the signal
        // arrives while the operation still has formats to run.
        if (
          update.content.some(
            (part) => part.type === "text" && part.text.includes("docx"),
          )
        ) {
          controller.abort();
        }
      },
      // SAFETY: the harness builds a minimal context with only the cwd the
      // tool reads.
      { cwd: h.root } as ExtensionContext,
    );
  } catch (cause) {
    if (!(cause instanceof ToolFailure)) throw cause;

    failure = cause;
  }

  assert.ok(failure, "the aborted export reports a failure");
  assert.equal(failure.details.ok, false);
  assert.match(failure.text, /odt: failed/);
  assert.ok(controller.signal.aborted);

  // The first format completed before the abort; later formats wrote nothing.
  assert.ok(existsSync(join(h.root, "articles", "essay.docx")));
  assert.ok(!existsSync(join(h.root, "articles", "essay.odt")));
  assert.ok(!existsSync(join(h.root, "articles", "essay.tex")));

  const aborted = parseWith(
    Type.Array(EntrySchema),
    // SAFETY: fail() details are JsonObject; the schema decodes the results
    // array shape.
    (failure.details as JsonObject).results ?? null,
    "results",
  );

  assert.deepEqual(
    aborted.map((entry) => [entry.format, entry.ok]),
    [
      ["docx", true],
      ["odt", false],
      ["latex", false],
    ],
  );
});

test("a failed citation audit stops the export before Pandoc runs", async (t) => {
  const h = harness(t);
  writeFileSync(
    join(h.root, "articles", "essay.md"),
    "Literal mode with a pandoc marker [@key].\n",
  );

  const result = await h.run(
    "academic_writer_export_article",
    exportParams(["docx"]),
  );

  assert.equal(result.details.ok, false);
  assert.equal(get(result.details, "audit", "status"), "failed");
  assert.match(result.content[0]?.text ?? "", /citation audit failed/);
  assert.equal(h.invocations().length, 0);

  const missing = await h.run(
    "academic_writer_export_article",
    exportParams(["docx"], { article: "articles/missing.md" }),
  );

  assert.equal(get(missing.details, "audit", "status"), "error");
  assert.equal(h.invocations().length, 0);
});

test(
  "no scratch directory survives success, failure, or an invalid package",
  needsPandoc,
  async (t) => {
    const h = harness(t, { failExt: ".odt" });
    writePackage(h.root, "ok", {});
    writePackage(h.root, "bad", { page: { size: "A3" } });
    await h.run(
      "academic_writer_export_article",
      exportParams(["docx", "odt"], { stylePackage: "ok" }),
    );
    await h.run(
      "academic_writer_export_article",
      exportParams(["docx"], { stylePackage: "bad" }),
    );
    const runs = join(h.root, ".academic-writer", "runs");
    assert.deepEqual(existsSync(runs) ? readdirSync(runs) : [], []);
  },
);

test("unsupported formats are rejected up front", async (t) => {
  const h = harness(t);

  const result = await h.run(
    "academic_writer_export_article",
    exportParams(["html", "epub"]),
  );

  assert.equal(result.details.ok, false);
  assert.deepEqual(result.details.supported, ["docx", "odt", "latex", "pdf"]);
  assert.equal(h.invocations().length, 0);
});

test(
  "generate_docx applies the profile package, and a per-call package overrides it",
  needsPandoc,
  async (t) => {
    const h = harness(t, { passthrough: true });
    writePackage(h.root, "serif", {
      components: { heading1: { fontFamily: "Georgia" } },
    });
    writePackage(h.root, "sans", {
      components: { heading1: { fontFamily: "Helvetica" } },
    });
    setProfileStylePackage(h.root, "serif");
    writeFileSync(
      join(h.root, "a.json"),
      JSON.stringify({
        title: "T",
        format: { isRtl: false },
        sections: [
          {
            title: "H",
            paragraphs: [
              { text: "Body.", footnotes: [{ after: "Body", text: "N" }] },
            ],
          },
        ],
      }),
    );

    const heading = (docx: string) =>
      strFromU8(
        unzipSync(new Uint8Array(readFileSync(join(h.root, docx))))[
          "word/styles.xml"
        ] ?? new Uint8Array(),
      ).match(/w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0] ?? "";

    const profile = await h.run("academic_writer_generate_docx", {
      input: "a.json",
      output: "p.docx",
    });

    assert.equal(profile.details.ok, true, profile.content[0]?.text ?? "");
    assert.equal(profile.details.footnotes, 1);
    assert.match(heading("p.docx"), /Georgia/);
    await h.run("academic_writer_generate_docx", {
      input: "a.json",
      output: "c.docx",
      stylePackage: "sans",
    });
    assert.match(heading("c.docx"), /Helvetica/);

    const bad = await h.run("academic_writer_generate_docx", {
      input: "a.json",
      output: "x.docx",
      stylePackage: "absent",
    });

    assert.equal(bad.details.ok, false);
    assert.match(
      bad.content[0]?.text ?? "",
      /DOCX generation failed: .*absent/,
    );
    assert.equal(existsSync(join(h.root, "x.docx")), false);
  },
);

test(
  "style_package tool lists, installs the starter, and validates",
  needsPandoc,
  async (t) => {
    const h = harness(t, { passthrough: true });

    const call = (params: Params) =>
      h.run("academic_writer_style_package", params);

    assert.deepEqual((await call({ action: "list" })).details.packages, []);
    const installed = await call({ action: "install-starter" });
    assert.equal(installed.details.ok, true);
    assert.deepEqual((await call({ action: "list" })).details.packages, [
      "academic-default",
    ]);
    const again = await call({ action: "install-starter" });
    assert.equal(again.details.ok, false);
    assert.match(again.content[0]?.text ?? "", /already exists/);
    const valid = await call({ action: "validate", name: "academic-default" });
    assert.equal(valid.details.ok, true);
    assert.equal((await call({ action: "validate" })).details.ok, false);
    writePackage(h.root, "broken", { components: { body: { color: "red" } } });
    const broken = await call({ action: "validate", name: "broken" });
    assert.equal(broken.details.ok, false);
    assert.match(broken.content[0]?.text ?? "", /components\.body\.color/);
  },
);

test("fix_typography replaces em dashes and leaves ordinary hyphens alone", async (t) => {
  const h = harness(t);

  const result = await h.run("academic_writer_fix_typography", {
    text: 'well-known \u2014 "ציטוט"',
  });

  assert.equal(result.content[0]?.text, "well-known - \u05f4ציטוט\u05f4");
});

test(
  "an unmodified starter exports every format without warnings",
  needsPandoc,
  async (t) => {
    const h = harness(t, { passthrough: true });
    await h.run("academic_writer_style_package", { action: "install-starter" });
    setProfileStylePackage(h.root, "academic-default");

    const result = await h.run(
      "academic_writer_export_article",
      exportParams(["docx", "odt", "latex"]),
    );

    assert.equal(result.details.ok, true, result.content[0]?.text ?? "");
    assert.deepEqual(
      entries(result).map((e) => e.style?.warnings),
      [[], [], []],
    );
    assert.doesNotMatch(result.content[0]?.text ?? "", /warning/);
  },
);

const hasEngine = ["xelatex", "tectonic"].some(
  (engine) => spawnSync("which", [engine]).status === 0,
);

test(
  "a styled PDF with footnotes, tables, lists, quotes, and captions actually builds",
  { skip: !(realPandoc && hasEngine), timeout: 180_000 },
  async (t) => {
    const h = harness(t, { passthrough: true });

    // The harness narrows PATH; keep the real engine reachable.
    const real = spawnSync(
      "sh",
      ["-c", "command -v xelatex || command -v tectonic"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
        },
      },
    ).stdout.trim();

    const engineDir = join(h.root, ".engine");
    mkdirSync(engineDir);
    writeFileSync(
      join(engineDir, real.split("/").pop() ?? "tectonic"),
      `#!/bin/sh\nexec "${real}" "$@"\n`,
    );
    chmodSync(join(engineDir, real.split("/").pop() ?? "tectonic"), 0o755);
    process.env.PATH = `${engineDir}:${process.env.PATH}`;
    await h.run("academic_writer_style_package", { action: "install-starter" });
    setProfileStylePackage(h.root, "academic-default");
    writeFileSync(
      join(h.root, "articles", "essay.md"),
      [
        "---",
        "title: Styled",
        "subtitle: Sub",
        "abstract: An abstract.",
        "---",
        "",
        "# Head",
        "",
        "Text with a note.[^1] And a [link](http://example.org) and `code`.",
        "",
        "| A | B |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "Table: A caption",
        "",
        "> A quote.",
        "",
        "1. one",
        "2. two",
        "",
        "- dot",
        "",
        "[^1]: The note.",
        "",
      ].join("\n"),
    );

    const result = await h.run(
      "academic_writer_export_article",
      exportParams(["pdf"]),
    );

    assert.equal(result.details.ok, true, result.content[0]?.text ?? "");
    const pdf = readFileSync(join(h.root, "articles", "essay.pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  },
);

test("exporting without a style package creates no styles directory", async (t) => {
  const h = harness(t);
  rmSync(join(h.root, ".academic-writer"), { recursive: true, force: true });
  await h.run("academic_writer_export_article", exportParams(["docx"]));
  assert.ok(!existsSync(join(h.root, ".academic-writer", "styles")));
});

test("every path-taking tool rejects paths outside the project", async (t) => {
  const h = harness(t);
  const outside = join(h.root, "..", `outside-${process.pid}`);
  t.onTestFinished(() => rmSync(outside, { recursive: true, force: true }));

  const attempts: Array<[string, Params]> = [
    [
      "academic_writer_generate_docx",
      { input: "articles/essay.md", output: join(outside, "a.docx") },
    ],
    ["academic_writer_extract_document", { path: join(outside, "a.md") }],
    ["academic_writer_snapshot_citations", { article: `../${outside}/a.md` }],
    ["academic_writer_migrate_article_outline", { article: "../x.md" }],
    [
      "academic_writer_export_article",
      { ...exportParams(["docx"]), article: "../essay.md" },
    ],
  ];

  for (const [name, params] of attempts) {
    const result = await h.run(name, params);
    assert.equal(result.isError, true, name);
  }

  assert.equal(existsSync(outside), false);
});

test("a failed export keeps the previous output and remote references are refused", async (t) => {
  const h = harness(t, { failExt: ".odt" });
  const previous = join(h.root, "articles", "essay.odt");
  writeFileSync(previous, "previous export");

  const failed = await h.run(
    "academic_writer_export_article",
    exportParams(["docx", "odt"]),
  );

  assert.equal(failed.isError, true);
  assert.equal(readFileSync(previous, "utf8"), "previous export");
  assert.ok(
    existsSync(join(h.root, "articles", "essay.docx")),
    "the succeeding format still wrote its output",
  );

  const remote = await h.run(
    "academic_writer_export_article",
    exportParams(["docx"], { csl: "https://example.test/style.csl" }),
  );

  assert.equal(remote.isError, true);
  assert.match(remote.content[0]?.text ?? "", /local file/);
  assert.equal(h.invocations().length, 2, "only the first export ran Pandoc");
});

test("articles outside the project and unsupported formats never reach Pandoc", async (t) => {
  const h = harness(t);

  const outside = await h.run("academic_writer_export_article", {
    article: "../essay.md",
    citationStyle: "inline-parenthetical",
    formats: ["docx"],
  });

  assert.equal(outside.isError, true);

  const mixed = await h.run(
    "academic_writer_export_article",
    exportParams(["docx", "html"]),
  );

  assert.equal(mixed.isError, true);
  assert.match(mixed.content[0]?.text ?? "", /unsupported format\(s\): html/);
  assert.equal(h.invocations().length, 0);
});
