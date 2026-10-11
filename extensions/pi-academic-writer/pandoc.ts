import { spawn } from "node:child_process";

export interface PandocOptions {
  cwd?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Piped to Pandoc's standard input. */
  input?: string | undefined;
}

/** Run Pandoc and resolve with its raw standard output. */
export function runPandoc(
  args: readonly string[],
  options: PandocOptions = {},
): Promise<Buffer> {
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();

  const child = spawn("pandoc", args, {
    cwd: options.cwd,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(Buffer.concat(out));
    else {
      const detail = Buffer.concat(err).toString("utf8").trim();
      reject(new Error(`pandoc exited with code ${code}: ${detail}`));
    }
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(options.input ?? "");

  return promise;
}

/** Pandoc's built-in reference document for DOCX or ODT. */
export function defaultReference(
  kind: "docx" | "odt",
  options: PandocOptions = {},
): Promise<Buffer> {
  return runPandoc(["--print-default-data-file", `reference.${kind}`], options);
}
