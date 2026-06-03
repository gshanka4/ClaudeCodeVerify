# ArchitectAI — Cursor Context Package Usage Guide

**Package:** `ArchitectAI_Cursor_Context.tar.gz`
**Files:** 6 (this guide + 5 context documents)
**Total:** ~4,000+ lines of spec

---

## What Is This Package?

This package gives Cursor's AI everything it needs to build ArchitectAI as a production-grade app — without you explaining the architecture, data model, or UI in every prompt. Each file is a self-contained reference that Cursor reads as context.

---

## The 5 Files — What Each One Does

| File | What It Covers | When to Reference It |
|------|----------------|----------------------|
| `01_ARCHITECTAI_PRD.md` | 9 UI screens, product vision, user flows, UX rules | Starting any new screen or page |
| `02_ARCHITECTAI_DATA_MODEL.ts` | TypeScript types for every entity in the app | Defining interfaces, API shapes, store types |
| `03_ARCHITECTAI_DATABASE_SCHEMA.sql` | Postgres schema, indexes, RLS policies | Writing migrations, Drizzle schema, DB queries |
| `04_ARCHITECTAI_API_SPEC.yaml` | Full OpenAPI 3.1 spec — all endpoints, schemas | Building Express routes, React Query hooks |
| `05_ARCHITECTAI_FRONTEND_SPEC.md` | Component specs, Zustand stores, animations, routing | Building any React component or page |

---

## Setup: Add These Files as Cursor Docs

### Option A — Project Docs (recommended for a new codebase)

1. Open your project in Cursor
2. Press `⌘ + Shift + J` (or go to **Cursor → Settings → Docs**)
3. Click **"+ Add Doc"**
4. For each of the 5 files, add them as local file docs:
   - Drag files into the project root, or place them in a `docs/` folder
   - Cursor will auto-index `.md` and `.ts` files in your project
5. In any chat prompt, use `@filename` to pull a specific file into context

### Option B — Paste Into Chat (quick start, no setup)

For a single task, open the relevant file and paste its contents into the Cursor chat before your prompt. This works but uses more context window.

### Option C — `.cursorrules` Integration

Create a `.cursorrules` file in your project root pointing to these files:

```
Always reference docs/01_ARCHITECTAI_PRD.md for screen specifications.
Always reference docs/02_ARCHITECTAI_DATA_MODEL.ts for TypeScript types.
Always reference docs/03_ARCHITECTAI_DATABASE_SCHEMA.sql for database schema.
Always reference docs/04_ARCHITECTAI_API_SPEC.yaml for API contracts.
Always reference docs/05_ARCHITECTAI_FRONTEND_SPEC.md for component specs.

Tech stack: React 18 + Vite + TypeScript + Tailwind CSS + React Query + Zustand + Express 5 + PostgreSQL + Drizzle ORM + Clerk Auth.

Design tokens: bg #090a0f, panel #11131a, border #1f2333, violet #8b5cf6, indigo #6366f1, green #10b981, amber #f59e0b. Dark mode only.
```

---

## Recommended Prompting Patterns

### Building a New Screen

```
@01_ARCHITECTAI_PRD.md @05_ARCHITECTAI_FRONTEND_SPEC.md

Build the Workspace Dashboard page (Screen 5 in the PRD).
Use the component specs from File 05 Section 3.6 exactly.
Stack: React 18 + TypeScript + Tailwind CSS.
```

### Building an API Route

```
@04_ARCHITECTAI_API_SPEC.yaml @02_ARCHITECTAI_DATA_MODEL.ts

Implement the POST /api/interrogate/{sessionId}/answer endpoint.
Use Express 5, Zod validation, and Drizzle ORM.
Match the OpenAPI schema exactly — use the AnswerRequest and InterrogationSession types from File 02.
```

### Writing a Database Migration

```
@03_ARCHITECTAI_DATABASE_SCHEMA.sql @02_ARCHITECTAI_DATA_MODEL.ts

Write a Drizzle ORM schema file for the `architectures` and `arch_services` tables.
Match the SQL schema exactly (column names, types, constraints, foreign keys).
Add Zod schemas using drizzle-zod.
```

### Building a Zustand Store

```
@05_ARCHITECTAI_FRONTEND_SPEC.md @02_ARCHITECTAI_DATA_MODEL.ts

Implement the useWorkspaceStore from File 05 Section 4.
IMPORTANT: The right panel mode is determined by selectedServiceId (null = AI Reasoning, non-null = Node Detail).
There are NO tabs ('chat' | 'details' | 'contracts'). There is NO sidebarOpen.
```

### Building the Cursor Extension

```
@01_ARCHITECTAI_PRD.md @05_ARCHITECTAI_FRONTEND_SPEC.md @04_ARCHITECTAI_API_SPEC.yaml

Build the VS Code extension file watcher (File 05 Section 7).
The watcher must call POST /api/drift/check on every file save.
It must respond in < 200ms — this is a hard latency requirement.
Reference Screen 8 (Cursor Drift State) in the PRD for the drift panel UI.
```

---

## Critical Rules to Always Include in Prompts

These are non-obvious constraints that Cursor will get wrong without explicit reminders:

1. **Dark mode only.** Base background is `#090a0f`. Never use white or light backgrounds.

2. **Keyboard shortcuts must use `<kbd>` elements** — never plain text. Wrong: `"Press ⌘K"`. Right: `<kbd>⌘</kbd><kbd>K</kbd>`.

3. **The workspace right panel has NO tabs.** Mode is determined by `selectedServiceId`. Never add `'chat' | 'details' | 'contracts'` tabs.

4. **The workspace left side is a 48px icon toolbar** — not a collapsible sidebar, not a layer accordion. The layer accordion is an overlay panel triggered by the Layers icon.

5. **Drift score must always show "deducts from governance grade"** sub-text. The raw `+23` number means nothing without this.

6. **"Accept & Apply Fix" not "Apply Auto-Fix"** — the correct label signals the user is accepting a diff already shown.

7. **"Ignore drift" and "Request Exception" must be equal visual weight** — both bordered buttons, never make "Request Exception" amber.

8. **The dashboard has two distinct card types:** `<MyProjectCard>` (My Projects section) and `<TopArchCard>` (Top Architectures section). Do not conflate them.

9. **Cancel generation must always be available** — users must never be trapped in non-cancellable loading.

10. **Drift check endpoint must respond in < 200ms** — it fires on every file save inside Cursor.

---

## Build Order (Recommended)

Follow this order to minimize blockers:

```
Phase 1 — Foundation
  1. Database schema (File 03 → Drizzle ORM)
  2. API server skeleton (File 04 → Express routes, Zod validation)
  3. Clerk auth setup

Phase 2 — Core Flow
  4. Landing Page (Screen 1)
  5. Interrogation Page (Screen 3)
  6. Generation Page (Screen 2 → SSE stream)
  7. Architecture Workspace (Screen 4 — most complex)

Phase 3 — Governance Layer
  8. Workspace Dashboard (Screen 5)
  9. Governance Dashboard (referenced in sidebar)
  10. Export to IDE Wizard (Screen 9)

Phase 4 — Cursor Extension
  11. VS Code extension scaffold
  12. Cursor Setup Panel (Screen 6)
  13. Cursor Normal State (Screen 7)
  14. Cursor Drift Panel (Screen 8)
```

---

## Mockup Reference

The original UI mockups are React/Tailwind components in the `artifacts/mockup-sandbox` project. Use them as pixel-perfect visual references when building each screen. The spec files describe the same designs in structured, Cursor-readable format.

---

## File Sizes at a Glance

| File | Lines | Purpose |
|------|-------|---------|
| `00_CURSOR_USAGE_GUIDE.md` | ~200 | This guide |
| `01_ARCHITECTAI_PRD.md` | ~870 | Product spec — 9 screens |
| `02_ARCHITECTAI_DATA_MODEL.ts` | ~400 | TypeScript types |
| `03_ARCHITECTAI_DATABASE_SCHEMA.sql` | ~500 | Postgres schema |
| `04_ARCHITECTAI_API_SPEC.yaml` | ~900 | OpenAPI 3.1 spec |
| `05_ARCHITECTAI_FRONTEND_SPEC.md` | ~830 | Frontend component specs |

---

*Generated from the ArchitectAI mockup suite — May 2026*
