#!/usr/bin/env node
import { resolve } from "node:path";
import {
  applyClaudeCodeBundle,
  parseBundleJson,
  readBundleFromPath,
} from "@architectai/runtime-client";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function cmdInit(bundlePath: string | undefined, repoRoot: string): Promise<number> {
  let files;
  if (bundlePath && bundlePath !== "-") {
    files = await readBundleFromPath(resolve(bundlePath));
  } else {
    const raw = await readStdin();
    if (!raw.trim()) {
      process.stderr.write(
        "Usage: architectai init [--bundle path.json]  (or pipe bundle JSON on stdin)\n",
      );
      return 1;
    }
    files = parseBundleJson(raw);
  }

  const result = await applyClaudeCodeBundle({
    repoRoot,
    files,
    mergeClaudeMd: true,
  });

  process.stdout.write(
    `ArchitectAI: wrote ${result.written.length} file(s), merged ${result.merged.length}, skipped ${result.skipped.length}.\n`,
  );
  process.stdout.write("Next: copy .architectai/credentials.example.json → credentials.json\n");
  process.stdout.write("Then: claude mcp add architectai  (or merge .mcp.json)\n");
  return 0;
}

async function cmdApplyBundle(bundlePath: string, repoRoot: string): Promise<number> {
  const files = await readBundleFromPath(resolve(bundlePath));
  const result = await applyClaudeCodeBundle({ repoRoot, files, mergeClaudeMd: true });
  process.stdout.write(`Applied bundle: ${result.written.join(", ")}\n`);
  return 0;
}

export async function runCli(argv: string[]): Promise<number> {
  const cmd = argv[2];
  const repoFlag = argv.indexOf("--repo");
  const repoRoot =
    repoFlag >= 0 && argv[repoFlag + 1] ? resolve(argv[repoFlag + 1]!) : process.cwd();

  if (cmd === "init") {
    const bundleIdx = argv.indexOf("--bundle");
    const bundlePath = bundleIdx >= 0 && argv[bundleIdx + 1] ? argv[bundleIdx + 1] : undefined;
    return cmdInit(bundlePath, repoRoot);
  }

  if (cmd === "apply-bundle") {
    const bundleIdx = argv.indexOf("--bundle");
    if (bundleIdx < 0 || !argv[bundleIdx + 1]) {
      process.stderr.write("Usage: architectai apply-bundle --bundle path.json [--repo .]\n");
      return 1;
    }
    return cmdApplyBundle(argv[bundleIdx + 1]!, repoRoot);
  }

  process.stdout.write(`ArchitectAI CLI

Commands:
  init [--bundle file.json] [--repo path]   Apply Claude Code bundle (stdin if no --bundle)
  apply-bundle --bundle file.json [--repo]  Same as init with explicit bundle path

`);
  return cmd === undefined || cmd === "--help" || cmd === "-h" ? 0 : 1;
}

if (!process.env.VITEST) {
  const code = await runCli(process.argv);
  process.exit(code);
}
