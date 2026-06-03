# ArchitectAI — Diagrams (Validation View)

**Version:** 1.0
**Date:** 2026-05-29
**Companion:** `new_PRD.md` · `new_architecture.md` · `IMPLEMENTATION_PLAN.md`

> Simple Mermaid views to validate the application before building. These mirror the
> closed-loop model in `new_PRD.md §3`, the topology in `new_architecture.md §5`, and the
> Decision Provenance Engine. GitHub/most Markdown viewers render Mermaid inline.

---

## 1. The Core Product Loop (user experience)

*Create & lock in Web → export/hand-off to IDE → govern & detect drift → return to Dashboard.*

```mermaid
flowchart LR
    A([Sign in<br/>auth upfront]) --> B[Landing<br/>S1]
    B --> C[Interrogation<br/>S2 · ≤7 Qs]
    C --> D[Generation<br/>S3 · SSE stream]
    D -->|captures Decision Lineage| E[Workspace<br/>S4]
    E -->|click node| T[[Decision Trace<br/>primary panel]]
    E --> L{Lock<br/>version snapshot}
    L --> X[Export Wizard<br/>S9 · builds .architectai/]
    X -->|deep-link + scoped token| I

    subgraph IDE [Cursor / VS Code Extension]
        direction TB
        S6[Setup<br/>S6] --> S7[Normal / Governed<br/>S7]
        S7 -->|on save| CHK{drift check<br/>< 200ms}
        CHK -->|violation| S8[Drift State<br/>S8]
        S8 -->|Accept & Apply Fix| S7
    end

    X --> I[(pull config)]
    I --> S6
    IDE -->|switch back to web| DASH[Dashboard<br/>S5 · return hub]
    DASH -->|new / reopen| E
    E -.edit after lock.-> V[version++ → architecture.updated] -.-> IDE
```

---

## 2. System Topology (how it's built)

*Deterministic drift hot path off the LLM path; LLM enrichment async via WebSocket.*

```mermaid
flowchart TB
    subgraph Clients
        WEB[Web SPA<br/>React 18]
        EXT[Cursor/VS Code<br/>Extension]
    end

    subgraph Platform [API Platform · Node/Express 5]
        API[REST + SSE<br/>Clerk JWT]
        WS[WebSocket<br/>scoped-token auth]
        ENG[Deterministic<br/>Drift Engine<br/>no LLM · <200ms]
        GW[LLM Gateway<br/>provider-agnostic]
        EXP[Export Builder<br/>+ token minter]
        PROV[Decision Provenance<br/>Engine]
    end

    subgraph Workers [BullMQ Workers]
        GEN[Generation]
        ENR[Drift enrichment]
        NOTIF[Notify / Audit]
    end

    subgraph Data
        PG[(PostgreSQL 16<br/>RLS · pgvector · trgm)]
        REDIS[(Redis<br/>cache · pub/sub · fan-out)]
        OBJ[(Object storage<br/>export blobs)]
    end

    EXT_AI[LLM providers<br/>Anthropic / OpenAI]
    CLERK[Clerk auth]

    WEB -->|HTTPS / SSE| API
    EXT -->|HTTPS + WSS| API
    EXT --> WS
    API --> ENG
    API --> GW
    API --> EXP
    API --> PROV
    API --> GEN & ENR & NOTIF
    GW --> EXT_AI
    API --> CLERK
    GEN & ENR & NOTIF --> PG
    API --> PG
    API <-->|pub/sub| REDIS
    GEN -->|stream| REDIS
    REDIS --> WS
    EXP --> OBJ
    PROV --> PG
```

---

## 3. Decision Lineage — Flagship Causal Chain (per component)

*Every `source.ref` is referentially checked server-side before display (anti-hallucination guard).*

```mermaid
flowchart LR
    R[Requirement<br/>interrogation / PRD span] -->|derives| C[Inferred Constraint<br/>e.g. P95 latency]
    C -->|selects| P[Selected Pattern<br/>= component]
    P -->|rejects| ALT[Rejected Alternatives<br/>+ reason]
    RULE[Governance Rule<br/>e.g. MQ-04] -->|governs| P
    P -->|produces| K[Resulting Contracts]
    P -->|impacts| DOWN[Downstream<br/>Implications]
    P -->|assumes| AS[Assumptions]

    classDef src fill:#1e293b,stroke:#38bdf8,color:#e2e8f0;
    classDef dec fill:#0f766e,stroke:#2dd4bf,color:#ecfeff;
    class R,RULE src;
    class P dec;
```

---

## 4. Web↔IDE Bridge — Sequence (deep-link hand-off)

```mermaid
sequenceDiagram
    participant U as User (Web)
    participant API as API Platform
    participant OS as OS / IDE
    participant EXT as Extension

    U->>API: POST /architectures/{id}/export (status=ready)
    API-->>U: build .architectai/* → store
    U->>API: POST /cursor/workspaces (local path)
    API-->>U: mint scoped token + CursorConfig
    U->>OS: deep-link cursor://architectai/connect?token&arch
    OS->>EXT: URI handler fires
    EXT->>API: GET /cursor/workspaces/{id}/config (scoped token)
    API-->>EXT: CursorConfig → write .architectai/*
    Note over EXT: Setup (S6) → Normal/Governed (S7)
    EXT->>API: POST /api/drift/check (on save, <200ms)
    API-->>EXT: deterministic result
    API--)EXT: WS drift.detected (async enrichment)
    Note over U,EXT: web edit → version++ → WS architecture.updated → re-pull
```

---

*Source of truth for behavior remains `docs/01–05` + the spec deltas in `new_architecture.md §10.1`.*
