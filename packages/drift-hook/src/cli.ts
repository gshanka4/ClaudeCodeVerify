#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  defaultIgnoredPaths,
  formatDriftStderr,
  isIgnoredPath,
  isUnderMonitored,
  loadCredentials,
  postDriftCheck,
} from "@architectai/runtime-client";

export interface DriftHookOptions {
  file?: string;
  repoRoot?: string;
  soft?: boolean;
  fetchFn?: typeof fetch;
}

function parseArgs(argv: string[]): DriftHookOptions {
  const opts: DriftHookOptions = { repoRoot: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--file" && next !== undefined) {
      opts.file = next;
      i++;
    } else if (a === "--repo" && next !== undefined) {
      opts.repoRoot = resolve(next);
      i++;
    } else if (a === "--soft") {
      opts.soft = true;
    }
  }
  return opts;
}

export async function runDriftHook(opts: DriftHookOptions): Promise<number> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const fileArg = opts.file?.trim();
  if (!fileArg) {
    process.stderr.write("[ArchitectAI] drift-hook: missing --file\n");
    return opts.soft ? 0 : 0;
  }

  const absPath = resolve(repoRoot, fileArg);
  let relPath = fileArg.replace(/\\/g, "/");
  try {
    const { relative } = await import("node:path");
    relPath = relative(repoRoot, absPath).replace(/\\/g, "/");
  } catch {
    /* keep fileArg */
  }

  const creds = await loadCredentials(repoRoot);
  if (!creds) {
    process.stderr.write(
      "[ArchitectAI] drift-hook: no credentials (.architectai/credentials.json or env)\n",
    );
    return 0;
  }

  const ignored = creds.ignoredPaths ?? defaultIgnoredPaths();
  if (isIgnoredPath(relPath, ignored)) {
    return 0;
  }
  if (!isUnderMonitored(relPath, creds.monitoredPaths)) {
    return 0;
  }

  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    process.stderr.write(`[ArchitectAI] drift-hook: cannot read file: ${relPath}\n`);
    return opts.soft ? 0 : 1;
  }

  if (creds.architectureId && creds.architectureId.length < 36) {
    process.stderr.write("[ArchitectAI] drift-hook: invalid architectureId in credentials\n");
    return opts.soft ? 0 : 1;
  }

  try {
    const result = await postDriftCheck(
      creds,
      { architectureId: creds.architectureId, filePath: relPath, fileContent: content },
      opts.fetchFn,
    );
    if (result.hasDrift && result.drifts.length > 0) {
      process.stderr.write(`${formatDriftStderr(result.drifts)}\n`);
      return opts.soft ? 0 : 1;
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ArchitectAI] drift-hook: ${msg}\n`);
    return opts.soft ? 0 : 1;
  }
}

if (!process.env.VITEST) {
  const code = await runDriftHook(parseArgs(process.argv));
  process.exit(code);
}
