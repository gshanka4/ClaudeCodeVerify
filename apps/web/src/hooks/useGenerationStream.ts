import type { GenerationStreamEvent } from "@architectai/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { authHeaders, getGenerationJobStatus } from "@/lib/api";

export interface GenerationStreamState {
  events: GenerationStreamEvent[];
  nodes: Extract<GenerationStreamEvent, { type: "node" }>["payload"][];
  governance: Extract<GenerationStreamEvent, { type: "governance" }>["payload"][];
  progress: Extract<GenerationStreamEvent, { type: "progress" }>["payload"] | null;
  complete: Extract<GenerationStreamEvent, { type: "complete" }>["payload"] | null;
  error: string | null;
  connected: boolean;
  reconnecting: boolean;
}

const initial: GenerationStreamState = {
  events: [],
  nodes: [],
  governance: [],
  progress: null,
  complete: null,
  error: null,
  connected: false,
  reconnecting: false,
};

function applyEvent(state: GenerationStreamState, event: GenerationStreamEvent): GenerationStreamState {
  const events = [...state.events, event];
  if (event.type === "node") {
    return { ...state, events, nodes: [...state.nodes, event.payload] };
  }
  if (event.type === "governance") {
    return { ...state, events, governance: [...state.governance, event.payload] };
  }
  if (event.type === "progress") {
    return { ...state, events, progress: event.payload };
  }
  if (event.type === "complete") {
    return { ...state, events, complete: event.payload, connected: false, reconnecting: false };
  }
  if (event.type === "error") {
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

function seqStorageKey(architectureId: string): string {
  return `gen:lastEventId:${architectureId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function useGenerationStream(architectureId: string | undefined): GenerationStreamState {
  const [state, setState] = useState<GenerationStreamState>(initial);
  const lastEventId = useRef(0);
  const terminalRef = useRef(false);

  const parseChunk = useCallback((text: string) => {
    const parts = text.split("\n\n");
    for (const part of parts) {
      const lines = part.split("\n");
      const idLine = lines.find((l) => l.startsWith("id: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      if (idLine) {
        lastEventId.current = Number.parseInt(idLine.slice(4), 10) || lastEventId.current;
        if (architectureId) {
          sessionStorage.setItem(seqStorageKey(architectureId), String(lastEventId.current));
        }
      }
      try {
        const event = JSON.parse(dataLine.slice(6)) as GenerationStreamEvent;
        setState((s) => {
          const next = applyEvent(s, event);
          if (event.type === "complete" || event.type === "error") terminalRef.current = true;
          return next;
        });
      } catch {
        /* partial chunk */
      }
    }
  }, [architectureId]);

  const applyJobStatus = useCallback((status: Awaited<ReturnType<typeof getGenerationJobStatus>>) => {
    if (status.status === "complete") {
      terminalRef.current = true;
      setState((s) => ({
        ...s,
        complete: {
          architectureId: status.architectureId,
          finalConfidenceScore: status.progress?.confidenceScore ?? 86,
          finalGovernanceScore: status.progress?.governanceScore ?? 90,
          totalServices: status.progress?.totalNodes ?? 0,
          totalGovernanceRulesApplied: 3,
          criticalIssueCount: 0,
          workspaceUrl: `/workspace/${status.architectureId}`,
        },
        progress: status.progress ?? s.progress,
        connected: false,
        reconnecting: false,
        error: null,
      }));
      return true;
    }
    if (status.status === "failed" || status.status === "cancelled") {
      terminalRef.current = true;
      setState((s) => ({
        ...s,
        error: status.error ?? "Generation failed",
        connected: false,
        reconnecting: false,
      }));
      return true;
    }
    if (status.progress) {
      setState((s) => ({ ...s, progress: status.progress }));
    }
    lastEventId.current = status.lastEventId;
    return false;
  }, []);

  useEffect(() => {
    if (!architectureId) return;
    const ctrl = new AbortController();
    terminalRef.current = false;

    const stored = sessionStorage.getItem(seqStorageKey(architectureId));
    if (stored) lastEventId.current = Number.parseInt(stored, 10) || 0;

    void (async () => {
      setState({ ...initial });
      try {
        const status = await getGenerationJobStatus(architectureId);
        if (applyJobStatus(status)) return;
        lastEventId.current = Math.max(lastEventId.current, status.lastEventId);
      } catch {
        /* stream will establish */
      }

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
        const res = await fetch(apiUrl(`/api/generate/stream/${architectureId}`), {
          headers: {
            ...headers,
            Accept: "text/event-stream",
            ...(lastEventId.current > 0 ? { "Last-Event-ID": String(lastEventId.current) } : {}),
          },
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            try {
              const status = await getGenerationJobStatus(architectureId);
              if (!applyJobStatus(status)) {
                setState((s) => ({
                  ...s,
                  error: "Failed to connect to generation stream",
                  connected: false,
                  reconnecting: false,
                }));
              }
            } catch {
              setState((s) => ({
                ...s,
                error: "Failed to connect to generation stream",
                connected: false,
                reconnecting: false,
              }));
            }
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

        try {
          const status = await getGenerationJobStatus(architectureId);
          if (applyJobStatus(status)) break;
        } catch {
          /* retry stream */
        }

        attempts += 1;
      }

      if (!terminalRef.current && !ctrl.signal.aborted) {
        setState((s) => ({
          ...s,
          error: s.error ?? "Generation stream ended unexpectedly",
          connected: false,
          reconnecting: false,
        }));
      }
    })();

    return () => ctrl.abort();
  }, [architectureId, parseChunk, applyJobStatus]);

  return state;
}
