import { normalize } from "node:path";

export function normalizeRepoPath(filePath: string): string {
  return normalize(filePath).replace(/\\/g, "/");
}

export function isIgnoredPath(
  filePath: string,
  ignored: string[],
): boolean {
  const rel = normalizeRepoPath(filePath);
  for (const pattern of ignored) {
    const p = pattern.replace(/\\/g, "/");
    if (rel === p || rel.startsWith(p) || rel.includes(`/${p}`)) return true;
    if (p.endsWith("/") && rel.startsWith(p)) return true;
  }
  return false;
}

export function isUnderMonitored(
  filePath: string,
  monitored: string[] | undefined,
): boolean {
  if (!monitored?.length) return true;
  const rel = normalizeRepoPath(filePath);
  return monitored.some((m) => {
    const p = m.replace(/\\/g, "/");
    return rel === p || rel.startsWith(p) || rel.startsWith(`${p}/`);
  });
}
