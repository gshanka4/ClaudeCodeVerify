import { logger } from "@/lib/logger";

export type VerificationMetricName =
  | "verification.run_started"
  | "verification.run_complete"
  | "verification.run_failed"
  | "verification.gate_blocked"
  | "verification.override_recorded"
  | "verification.export_blocked"
  | "verification.poll_fallback";

const counters = new Map<string, number>();

function metricKey(name: VerificationMetricName, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${name}|${parts.join(",")}`;
}

/** Lightweight counters for ship observability (V6x-OBS-01). */
export function recordVerificationMetric(
  name: VerificationMetricName,
  labels?: Record<string, string>,
): void {
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + 1);
  logger.info({ verificationMetric: name, ...labels }, "verification_metric");
}

export function getVerificationMetricsSnapshot(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetVerificationMetricsForTests(): void {
  counters.clear();
}
