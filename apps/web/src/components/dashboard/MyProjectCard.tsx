import type { ArchitectureSummary } from "@/lib/api";
import { ArchitectureCard } from "@/components/dashboard/ArchitectureCard";

/** @deprecated Use ArchitectureCard — kept for existing imports. */
export function MyProjectCard({ arch }: { arch: ArchitectureSummary }): JSX.Element {
  return <ArchitectureCard arch={arch} />;
}

export type { ProjectCardStatus } from "@/components/dashboard/ArchitectureCard";
