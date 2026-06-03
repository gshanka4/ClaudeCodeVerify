import path from "node:path";

/** Whether a relative file path should trigger drift checks (P7-EC-04). */
export function shouldMonitorFile(
  relativePath: string,
  monitoredPaths: string[],
  ignoredPaths: string[],
): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const ig of ignoredPaths) {
    if (matchesPrefix(normalized, ig)) return false;
  }
  if (monitoredPaths.length === 0) return true;
  return monitoredPaths.some((m) => matchesPrefix(normalized, m));
}

function matchesPrefix(filePath: string, pattern: string): boolean {
  const p = pattern.replace(/\\/g, "/");
  if (p.endsWith("/")) {
    return filePath.startsWith(p) || filePath.startsWith(p.slice(0, -1));
  }
  return filePath === p || filePath.startsWith(`${p}/`);
}

export function architectAiDir(root: string): string {
  return path.join(root, ".architectai");
}
