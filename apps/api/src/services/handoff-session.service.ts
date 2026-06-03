import { randomUUID } from "node:crypto";
import type { HandoffSessionPhase, HandoffSessionStatus } from "@architectai/shared";

interface SessionRecord {
  architectureId: string;
  organizationId: string;
  phase: HandoffSessionPhase;
  updatedAt: number;
}

const sessions = new Map<string, SessionRecord>();

export function createHandoffSession(
  architectureId: string,
  organizationId: string,
): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    architectureId,
    organizationId,
    phase: "pending",
    updatedAt: Date.now(),
  });
  return sessionId;
}

export function markHandoffIdeOpened(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.phase = "ide_opened";
    s.updatedAt = Date.now();
  }
}

export function markHandoffWorkspaceLinked(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    s.phase = "workspace_linked";
    s.updatedAt = Date.now();
  }
}

export function getHandoffSession(
  sessionId: string,
  architectureId: string,
  organizationId: string,
): HandoffSessionStatus | null {
  const s = sessions.get(sessionId);
  if (!s || s.architectureId !== architectureId || s.organizationId !== organizationId) {
    return null;
  }
  return {
    sessionId,
    phase: s.phase,
    architectureId: s.architectureId,
  };
}

/** E2E/dev: advance pending → workspace_linked (simulates extension report). */
export function simulateHandoffLinked(sessionId: string): void {
  markHandoffWorkspaceLinked(sessionId);
}
