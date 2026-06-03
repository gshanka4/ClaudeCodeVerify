import type { VerificationFinding, VerificationStreamEvent } from "@architectai/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { authHeaders, getVerificationSummary } from "@/lib/api";

export interface VerificationStreamState {
  events: VerificationStreamEvent[];
  findings: VerificationFinding[];
  progress: Extract<VerificationStreamEvent, { type: "verification.progress" }>["payload"] | null;
  complete: Extract<VerificationStreamEvent, { type: "verification.complete" }>["payload"] | null;
  error: string | null;
  connected: boolean;
  reconnecting: boolean;
}

const initial: VerificationStreamState = {
  events: [],
  findings: [],
  progress: null,
  complete: null,
  error: null,
  connected: false,
  reconnecting: false,
};

function applyEvent(
  state: VerificationStreamState,
  event: VerificationStreamEvent,
): VerificationStreamState {
  const events = [...state.events, event];
  if (event.type === "verification.finding") {
    const finding = event.payload.finding;
    const exists = state.findings.some((f) => f.id === finding.id);
    return {
      ...state,
      events,
      findings: exists ? state.findings : [...state.findings, finding],
    };
  }
  if (event.type === "verification.progress") {
    return { ...state, events, progress: event.payload };
  }
  if (event.type === "verification.complete") {
    return {
      ...state,
      events,
      complete: event.payload,
      connected: false,
      reconnecting: false,
    };
  }
  if (event.type === "verification.error") {
    return {
      ...state,
      events,
      error: event.payload.message,
      connected: false,
      reconnecting: false,
    };
  }
  return { ...state, events };
}

function seqStorageKey(architectureId: string, runId: string): string {
  return `verify:lastEventId:${architectureId}:${runId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function useVerificationStream(
  architectureId: string | undefined,
  runId: string | undefined,
): VerificationStreamState {
  const [state, setState] = useState<VerificationStreamState>(initial);
  const lastEventId = useRef(0);
  const terminalRef = useRef(false);
  const seenFindingIds = useRef(new Set<string>());

  const parseChunk = useCallback(
    (text: string) => {
      const parts = text.split("\n\n");
      for (const part of parts) {
        const lines = part.split("\n");
        const idLine = lines.find((l) => l.startsWith("id: "));
        const dataLine = lines.find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        if (idLine) {
          lastEventId.current = Number.parseInt(idLine.slice(4), 10) || lastEventId.current;
          if (architectureId && runId) {
            sessionStorage.setItem(
              seqStorageKey(architectureId, runId),
              String(lastEventId.current),
            );
          }
        }
        try {
          const event = JSON.parse(dataLine.slice(6)) as VerificationStreamEvent;
          if (event.type === "verification.finding") {
            if (seenFindingIds.current.has(event.payload.finding.id)) continue;
            seenFindingIds.current.add(event.payload.finding.id);
          }
          setState((s) => {
            const next = applyEvent(s, event);
            if (
              event.type === "verification.complete" ||
              event.type === "verification.error"
            ) {
              terminalRef.current = true;
            }
            return next;
          });
        } catch {
          /* partial chunk */
        }
      }
    },
    [architectureId, runId],
  );

  useEffect(() => {
    if (!architectureId || !runId) return;
    const ctrl = new AbortController();
    terminalRef.current = false;
    seenFindingIds.current = new Set();

    const stored = sessionStorage.getItem(seqStorageKey(architectureId, runId));
    if (stored) lastEventId.current = Number.parseInt(stored, 10) || 0;

    void (async () => {
      setState({ ...initial });
      let attempts = 0;
      const maxAttempts = 4;

      while (attempts < maxAttempts && !ctrl.signal.aborted && !terminalRef.current) {
        if (attempts > 0) {
          setState((s) => ({ ...s, reconnecting: true, connected: false }));
          await sleep(400 * attempts);
        } else {
          setState((s) => ({ ...s, error: null, reconnecting: false }));
        }

        let buffer = "";
        const headers = await authHeaders();
        const res = await fetch(
          apiUrl(`/api/architectures/${architectureId}/verification/stream/${runId}`),
          {
            headers: {
              ...headers,
              Accept: "text/event-stream",
              ...(lastEventId.current > 0
                ? { "Last-Event-ID": String(lastEventId.current) }
                : {}),
            },
            signal: ctrl.signal,
          },
        );

        if (!res.ok || !res.body) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            try {
              const summary = await getVerificationSummary(architectureId);
              if (summary?.run.status === "complete") {
                setState((s) => ({
                  ...s,
                  complete: {
                    runId: summary.run.id,
                    trustGrade: summary.trustGrade.score,
                    trustGradeBreakdown: summary.trustGrade,
                  },
                  findings: summary.findings,
                  connected: false,
                  reconnecting: false,
                  error: null,
                }));
                terminalRef.current = true;
                break;
              }
              if (summary?.run.status === "failed") {
                setState((s) => ({
                  ...s,
                  error: "Verification failed — retry from workspace",
                  connected: false,
                  reconnecting: false,
                }));
                terminalRef.current = true;
                break;
              }
            } catch {
              /* poll fallback failed */
            }
            setState((s) => ({
              ...s,
              error: "Failed to connect to verification stream — use workspace to retry",
              connected: false,
              reconnecting: false,
            }));
          }
          continue;
        }

        setState((s) => ({ ...s, connected: true, reconnecting: false, error: null }));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (!ctrl.signal.aborted && !terminalRef.current) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lastSep = buffer.lastIndexOf("\n\n");
          if (lastSep >= 0) {
            parseChunk(buffer.slice(0, lastSep + 2));
            buffer = buffer.slice(lastSep + 2);
          }
        }
        if (buffer) parseChunk(buffer);

        if (terminalRef.current) {
          setState((s) => ({ ...s, connected: false, reconnecting: false }));
          break;
        }
        attempts += 1;
      }
    })();

    return () => ctrl.abort();
  }, [architectureId, runId, parseChunk]);

  return state;
}
