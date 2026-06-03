/** UX-C: lock CTA copy before repo export (Claude Code bundle). */
export function formatLockCtaLabel(version: number): string {
  return `Finalize v${version} for repo export`;
}
