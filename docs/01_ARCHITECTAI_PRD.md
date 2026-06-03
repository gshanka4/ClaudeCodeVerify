# ArchitectAI — Product Requirements Document
**Version:** 1.0 | **Date:** 2026-05-28 | **Status:** Ready for Implementation

---

## 1. Product Vision

ArchitectAI is an enterprise-grade AI architecture governance platform. It converts any engineering artifact (PRDs, Jira epics, Swagger files, plain-English descriptions) into governed, production-ready software architectures — with drift detection, contract enforcement, and real-time AI reasoning built in.

**Core promise:** From requirement to governed architecture in under 30 seconds, with drift detection that follows your engineers into their IDEs.

---

## 2. Target Users

### Persona A — Enterprise Architect
- Owns architecture standards and golden rules across the org
- Currently: handwritten ADRs, Confluence docs no one reads, no automated enforcement
- With ArchitectAI: defines governance rules once, AI enforces them on every new architecture and flags every code deviation in Cursor

### Persona B — Staff / Principal Engineer
- Receives PRDs and must produce architecture proposals before sprint planning
- Currently: 2–3 hours in draw.io + manual spec writing
- With ArchitectAI: 30 seconds to a governed architecture with IaC, contracts, and ADRs auto-generated

### Persona C — Governance / Security Lead
- Needs audit trails, compliance reports, exception tracking
- Currently: quarterly architecture reviews, no real-time visibility
- With ArchitectAI: real-time drift dashboard, exception request workflow, SOC2-ready audit log

### Persona D — Individual Developer (Cursor user)
- Writing code that needs to respect architecture contracts they didn't design
- Currently: discovers violations in PR review
- With ArchitectAI: inline Cursor alerts at the moment of violation, auto-fix suggestions with one click

---

## 3. Core User Flows

### Flow 1: New Architecture (End-to-End)
```
Landing → [Paste requirement] → Interrogation Flow (7 questions) 
→ Architecture Generation (streaming) → Architecture Workspace 
→ Export to Cursor → Drift Detection active
```

### Flow 2: Returning User — Dashboard
```
Login → Workspace Dashboard → Open existing architecture 
→ Architecture Workspace → Review drift alerts
```

### Flow 3: Developer in Cursor
```
Open file in Cursor → ArchitectAI extension active 
→ Normal state (governed, no issues) OR Drift state (violation detected)
→ Review diff → Accept & Apply Fix OR Request Exception
```

### Flow 4: Governance Lead Review
```
Workspace Dashboard → Drift Center → Review exception requests 
→ Approve / Deny → Architecture updated
```

---

## 4. Screen Specifications

---

### Screen 1 — Landing Page

**Route:** `/`
**Auth:** Public

**Purpose:** Convert visitors into trial users. Primary action is generating an architecture directly from the hero.

**Key Components:**

#### Hero Input Box
- `<textarea>` placeholder: "Paste your PRD, Jira epic, or describe your system requirements…"
- Height: 130px, resizable disabled
- On focus: show violet `ring-1 ring-[#6366f1]/40` glow
- Keyboard shortcut: `⌘ ↵` (rendered as styled `<kbd>` chips, NOT plain text — must be visible)
- Submit button: "Generate Architecture" with `BrainCircuit` icon

#### Import Chips (below textarea, left)
Four chips: **Jira**, **PRD**, **Upload spec**, **Swagger**
- Each chip: `border border-[#2a3050] rounded-md px-2.5 py-1 text-[12px] cursor-pointer`
- Hover: `border-[#6366f1]/40 bg-[#6366f1]/5`
- Tooltip on hover explaining the import type
- Click opens: Jira URL input, file picker, or swagger URL field inline

#### Example Suggestion Pills
- 5 pre-built examples (Fintech microservices, Fraud detection, Multi-cloud, etc.)
- Label before pills: "Try an example:"
- Pill hover: show `→` arrow suffix indicating "loads content, not navigation"
- On click: fills textarea, shows "Example loaded — edit freely or click Generate Architecture"

#### Navigation Bar
- Logo: `BrainCircuit` icon + "ArchitectAI" text
- Links: Workspace, Templates, Enterprise, Pricing, Documentation
- Right: "Request Demo" (secondary border button), "Sign In" (text link), "Get Started" (primary indigo button)

**CTAs in priority order:**
1. Generate Architecture (primary — hero)
2. Get Started (nav — sign up)
3. Request Demo (nav — enterprise sales)

**Validation:**
- Textarea must not be empty to submit
- Minimum 20 characters (show inline error if less)
- On submit: navigate to `/interrogate?sessionId=<new>` with input pre-filled

---

### Screen 2 — Interrogation Flow

**Route:** `/interrogate/:sessionId`
**Auth:** Required (or ephemeral session for anonymous)

**Purpose:** AI collects missing context before generating. Each question fills a specific gap (security, scale, compliance, cloud, etc.). 7 questions total.

**Layout:**
- Background: animated architecture node diagram (purely decorative, CSS-only)
- Center: single scrollable card (max-width: 3xl)

**Header:**
- Avatar + "AI Architecture Analyst"
- Subtitle: "Interrogating requirements — N questions remaining"
- `Autosaved` badge (green pill, persistent)
- Right: dual progress bars
  - "Context gathering" (amber bar)
  - "Governance coverage" (red/green bar)

**Answered Questions Row:**
- Shows all previously answered questions above current
- Each row: `[✓ Answered] [Question text] [Answer value]`
- On hover: pencil edit icon appears (`opacity-0 group-hover:opacity-100`)
- Clicking edit: row expands inline back to question UI with current answer pre-selected
- Answered rows border: `border-[#2a3050]`, hover border: `border-[#4a5578]`

**Current Question Area:**
- Category badge (e.g., "Missing Context — Security & Auth")
- Question text: `text-xl font-bold`
- Optional structured warning box (amber, when low-confidence context detected)
  - Lists specific services/paths affected

**Answer Option Cards (2×2 grid):**
- Each card: `border-2 rounded-xl p-5`, click to select
- Unselected: `border-[#2a3050] bg-[#11131a]`
- Hover: `border-[#4a5578] bg-[#1a1f2e]`
- Selected: `border-[#8b5cf6] border-l-4 bg-[#1a1630]` + "Selected" badge
- Top-right of each card: `<kbd>` with number `1`–`4` (keyboard shortcut hint)
  - Disappears when "Selected" badge shows
- Optional badge: "AI Recommended" (violet), "Common Choice" (green), "Enterprise Grade" (amber)
- Keyboard: pressing `1`–`4` selects that option; `Enter` submits if option selected

**Freeform Textarea:**
- Below option grid: "Or describe your specific requirement…"
- If text typed here AND an option selected: option takes precedence unless textarea has meaningful content (>5 words)
- Show micro-copy: "Type here to override the selected option"

**Coming Next (Locked Preview):**
- 2 upcoming question previews dimmed at 60% opacity
- Icon: `Lock` 
- Label: "(Locked)"
- No interaction — purely orientation

**Footer Action Row:**
```
[Skip for now]                    [• • ● • • • •]    [Apply & Continue →]
[Skip reduces confidence ~15%]    [3 / 7]             [✓ Autosaved · Step 3 of 7 · ↵]
```
- "Apply & Continue": disabled (`bg-[#2a3050] cursor-not-allowed`) when no option selected
- "Skip for now": always enabled, but shows consequence label beneath it
- Step dots: completed = green, current = violet (larger, ring), pending = dim

**Business Logic:**
- Session auto-saves after each answer (no explicit save button)
- Questions are dynamically chosen based on input context and previous answers
- Minimum 3 questions required before generation allowed
- Maximum 7 questions (can skip remaining after 3)

---

### Screen 3 — Architecture Generation

**Route:** `/generate/:sessionId`
**Auth:** Required

**Purpose:** Live streaming display of architecture being built. User sees each service node appear with confidence scores as the AI works.

**Header (52px):**
- Left: ArchitectAI logo
- Center: Clock icon + "Generating your architecture…" / "Generation complete"
- Right: "Cancel generation" button (appears during generation only)
  - Icon: `X`, text: "Cancel generation"
  - Hover: red-tinted (`hover:bg-[#ef4444]/10 hover:border-[#ef4444]/30`)
  - On click: confirm dialog "Cancel will lose progress. Return to interrogation?" [Cancel generation] [Keep waiting]

**Left Panel — Node Stream:**
- Progress header:
  - Title: "Building {Architecture Name}" / "Architecture Ready"
  - Subtitle: "{N} of {total} services generated — applying governance rules"
  - Confidence score (large, colored: green ≥85%, amber ≥70%, red <70%)
  - Progress bar (violet gradient while running, green when complete)
  - Below bar: "Interrogation complete" label left, `~{N}s remaining` center-right, `{%}` far right
- Service node list (streams in):
  - Each row: icon + name + layer tag + confidence bar + `%` value + `✓` when done
  - Active row: indigo glow border, "Generating…" animated badge
  - Pending CTA row: "Open Architecture Workspace — Available when complete — {N}% remaining"
  - Complete CTA: green bordered card with "Open Architecture Workspace →" primary button

**Right Panel — Governance Engine (320px):**
- Header: Shield icon + "Governance Engine" + "Rules being applied in real time"
- Checklist streaming in: each rule shows spinner → `✓` when applied
- Bottom: Live Scores section
  - Confidence, Governance, AI Trust bars
- Tip card (violet):
  - "Scores improve as you answer more questions."
  - "Return to add context" — rendered as `underline decoration-dotted` button link

**Streaming Implementation:**
- Use WebSocket or SSE from `/api/generate/stream/:sessionId`
- Each chunk: `{ type: "node" | "governance" | "complete", payload: {...} }`
- Node chunk: adds row to list
- Governance chunk: adds check to right panel
- Complete chunk: transitions CTA from pending to active

---

### Screen 4 — Architecture Workspace

**Route:** `/workspace/:architectureId`
**Auth:** Required

**Purpose:** The primary engineering command center. After generation completes, this is where architects and engineers inspect, edit, and govern a specific architecture. The canvas shows every service node with real-time health status; the AI Reasoning panel gives layer-by-layer explanations and prioritized fixes; clicking any node loads a deep-detail panel with auto-fix actions. This screen communicates trust, control, and architectural intelligence.

**Overall Layout:**
```
┌─ Header (48px) ──────────────────────────────────────────────────────────────┐
│ Logo · Breadcrumb          Focus Mode · Zoom · ⌘Z · Share · Export           │
├─ Left Toolbar ─┬─ Center Canvas (flex-1) ──────────────┬─ Right Panel (340px)┤
│ 48px icon strip│ SVG connections + absolute nodes       │ AI Reasoning OR     │
│                │ Grid background · Focus Mode banner    │ Node Detail         │
│                │ Layer legend (bottom-left)             │                     │
├────────────────┴────────────────────────────────────────┴─────────────────────┤
│ Bottom Status Bar (28px): Health · Drift · Governance · AI Trust | Component count │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

#### Header (48px, `border-b border-[#1f2333]`)

**Left group:**
- `Sparkles` icon (violet `#8b5cf6`, `size={16}`) + "ArchitectAI" (white, font-semibold)
- 1px vertical divider
- Breadcrumb: parent workspace name (e.g. "Fintech Core") in muted `#8b95a5`, hover → white, `cursor-pointer` → `ChevronRight` → current architecture name (white, `font-medium`)

**Right group (flex, gap-3):**
1. **Focus Mode button** — `Target` icon + "Focus Mode" text, `text-sm`, rounded-md
   - Default: `text-[#8b95a5] hover:text-white hover:bg-[#11131a]`
   - Active: `bg-[#8b5cf6]/20 border border-[#8b5cf6]/50 text-[#8b5cf6] font-bold`
   - Toggles Focus Mode on canvas (hides grey/unimpacted nodes and their connections)
2. **Zoom controls** — `bg-[#11131a] border border-[#1f2333] rounded-md p-1` pill containing: `ZoomOut` button | zoom level `"100%"` (mono, 12px) | `ZoomIn` button
3. **Undo hint** — `"⌘Z undo"` (10px, muted, `font-mono`, decorative — no functionality required in V1)
4. **Share button** — `Share2` icon + "Share", `bg-[#11131a] border border-[#1f2333] hover:bg-[#1f2333]`, `text-[#8b95a5]`
5. **Export Architecture button** — `Download` icon + "Export Architecture", `bg-[#6366f1] hover:bg-[#4f46e5]`, white text, `font-semibold`, indigo glow `shadow-[0_0_12px_rgba(99,102,241,0.25)]`

---

#### Left Toolbar (48px wide, vertical icon strip, `border-r border-[#1f2333]`)

A narrow vertical toolbar containing icon-only buttons, grouped by function. No labels — icons are self-explanatory in context.

**Group 1 — Pointer tools:**
- `MousePointer2` — Select tool (default active state: `bg-[#1f2333] text-white rounded-md`)
- `Move` — Pan/drag canvas

*(Separator: thin horizontal rule)*

**Group 2 — Node stamps (drag-to-add):**
- `Server` — Add a Service node
- `Database` — Add a Database node
- `Zap` — Add a Cache node
- `Layers` — Add a Queue/Messaging node
- `Shield` — Add a Security node

*(Separator)*

**Group 3 — View controls:**
- `Target` — Focus Mode toggle (mirrors header button; violet `text-[#8b5cf6] bg-[#8b5cf6]/10` when active)

**Group 4 — Panel controls:**
- `Sparkles` — Toggle AI Reasoning panel (violet when panel is open)
- `MessageSquare` — Comments / annotation mode

**Bottom (auto margin pushes to bottom):**
- `Settings` — Workspace settings

---

#### Center Canvas

The canvas is the core of the screen. It renders a live architecture diagram with positioned nodes connected by bezier curves. The background is a subtle CSS dot-grid (`arch-theme-grid`), reinforcing the "technical blueprint" aesthetic.

**Connection lines (SVG layer, `pointer-events-none`, `z-index: 1`):**
- Each connection is a cubic bezier `<path>` from the right-center of the source node to the left-center of the target node
- Control points: horizontal S-curve (`cp1X = startX + Δx/2, cp1Y = startY; cp2X = same, cp2Y = endY`)
- Color rules (evaluated on worst status of either endpoint):
  - Source or target is **red**: stroke `#ef4444`, `strokeDasharray="4,4"`, `opacity=0.4`
  - Source or target is **yellow**: stroke `#f59e0b`, `opacity=0.3`
  - Both **green or grey**: stroke `#1f2333`, `opacity=0.8`
- `strokeWidth="1.5"`, `fill="none"`
- In Focus Mode: connections involving grey nodes are hidden entirely

**Service nodes (`w-[140px] h-[72px]`, `rounded-lg`, `absolute`, `z-index: 10`):**

Each node is a fixed-size card positioned absolutely on the canvas. Click to select; click again or click empty canvas to deselect.

Structure:
```
┌─[3px status bar]──────────────────────────┐
│  [layer icon] [LAYER NAME]     [confidence#]│
│  Service Title (bold, truncate)             │
│  [status indicator]                         │
└─────────────────────────────────────────────┘
```

- **Left edge**: `absolute left-0 top-2 bottom-2 w-[3px] rounded-r` bar, colored by status
- **Row 1**: `size={10}` layer icon (muted) + layer name (`text-[9px] uppercase tracking-wider text-[#8b95a5]`) — left aligned; confidence number (`text-[10px] font-mono`, status-colored) — right aligned
- **Row 2**: Service title (`text-xs font-semibold text-white truncate`)
- **Row 3** — status indicator line:
  - Green: `CheckCircle2 size={10}` + "Locked" in `text-[#10b981]`
  - Yellow: `AlertTriangle size={10}` + "N issues" in `text-[#f59e0b]`
  - Red: `AlertTriangle size={10}` + "N issues" in `text-[#ef4444]`
  - Grey: "—" in `text-[#2a3050]`

**Node background and border by status:**
| Status | Border | Background | Opacity |
|--------|--------|------------|---------|
| Green | `border-[#10b981]/50` | `bg-[#0d0f1a]` | full |
| Yellow | `border-[#f59e0b]/50` | `bg-[#0d0f1a]` | full |
| Red | `border-[#ef4444]/60` | `bg-[#ef4444]/5` | full |
| Grey | `border-[#1f2333]` | `bg-[#0d0f1a]` | `opacity-60` |

**Selected node:**
- `ring-2 ring-[#6366f1] ring-offset-1 ring-offset-[#090a0f]`
- `shadow-[0_0_15px_rgba(99,102,241,0.2)]`
- Loads Node Detail panel on the right

**Architecture (16 nodes, example layout):**

| ID | Title | Layer | Status | Confidence | Issues |
|----|-------|-------|--------|------------|--------|
| cdn | CDN / Edge | cdn | grey | 98 | 0 |
| lb | Load Balancer | gateway | green | 96 | 0 |
| apigw | API Gateway | gateway | green | 94 | 0 |
| auth | Auth Service | service | green | 91 | 0 |
| payment | Payment Service | service | **red** | 34 | 3 |
| user | User Service | service | yellow | 68 | 2 |
| fraud | Fraud Detector | ml | yellow | 62 | 2 |
| notif | Notification Svc | service | grey | 88 | 0 |
| redis | Redis Cache | cache | green | 93 | 0 |
| eventbus | Event Bus (Kafka) | queue | green | 89 | 0 |
| txdb | Transaction DB | database | green | 97 | 0 |
| userdb | User DB | database | green | 95 | 0 |
| auditdb | Audit Log DB | database | grey | 91 | 0 |
| mlpipeline | ML Pipeline | ml | yellow | 58 | 2 |
| featurestore | Feature Store | database | grey | 85 | 0 |
| waf | WAF / DDoS Shield | security | green | 99 | 0 |

**Focus Mode banner (shown when active, `z-index: 20`, centered top of canvas):**
- `bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b]`
- `Target size={12}` + "Focus Mode — showing N impacted components"
- Grey nodes and their connections are hidden; only red/yellow/green nodes remain

**Bottom-left layer legend (always visible):**
- `bg-[#0d0f1a]/80 backdrop-blur px-3 py-2 rounded border border-[#1f2333]`
- 4 rows: colored dot + label
  - Green dot — "Locked"
  - Yellow dot — "Needs layers"
  - Red dot — "Critical issues"
  - Grey circle (border only) — "Unimpacted"

---

#### Right Panel (340px, `border-l border-[#1f2333]`)

The right panel has **two distinct modes** that switch based on node selection state. There are NO tabs. The panel slides in and out — it is hidden when no node is selected and the AI panel has been manually closed.

---

**Mode 1 — AI Reasoning Panel** (default state; no node selected)

Activated when: page loads, or user clicks the `Sparkles` toolbar icon, or clicks "← Back" from a node.

*Panel header:*
- `Sparkles size={16}` (violet) + "AI Reasoning" (white, `font-semibold`)
- `X size={16}` close button (right) — closes the panel entirely

*Urgency triage section* (`bg-[#0d0f1a]`, `border-b border-[#1f2333]`, `p-3`):
- Label: `AlertTriangle size={10}` (red) + "RESOLVE IN ORDER OF PRIORITY" (10px, uppercase, tracking-wider)
- Prioritized issue cards (clickable → selects that node + opens Node Detail):
  - **Red card**: `bg-[#ef4444]/6 border border-[#ef4444]/20`, red dot + title in red + subtitle in muted + `ArrowRight size={11}` (red, right)
    - e.g. "Payment Service — 3 critical issues" / "Direct DB import violates contract"
  - **Yellow cards**: `bg-[#f59e0b]/6 border border-[#f59e0b]/20`, amber styling
    - e.g. "Fraud Detector — model stale 52h" / "Exceeds 48h governance threshold"
    - e.g. "Event Bus — missing dead-letter queue" / "Reliability gap flagged yellow"
  - Hover: background intensity increases (`hover:bg-[#ef4444]/10`, etc.)
- **"Export Architecture" button** — full-width, `bg-[#6366f1] hover:bg-[#4f46e5]`, white, `font-semibold`, `Download size={12}`, indigo glow — placed at the bottom of the triage section

*Layer accordion* (below triage, scrollable, `space-y-1`):

Each layer is a collapsible row. 8 layers: CDN, Security, Gateway, Service, Cache, Database, Queue (Messaging), ML.

- Row: `cursor-pointer py-2 px-3 hover:bg-[#11131a] flex items-center justify-between rounded`
  - Left: layer `icon size={12}` (muted) + layer title (13px, white, `font-medium`)
  - Right: status dot (`w-1.5 h-1.5 rounded-full` — colored by worst node status in that layer) + `ChevronDown size={14}` (rotates 180° when expanded)
- Expanded content (`px-3 pb-3 pt-1`):
  - Italic AI reasoning text (`text-[#8b95a5] text-[12px] leading-relaxed`) — layer-specific contextual explanation written as if the AI is describing its reasoning
  - Optional issue cards (only for layers with problems):
    - Red card: `bg-[#ef4444]/8 border border-[#ef4444]/20 text-[#ef4444] text-[11px] p-2 rounded`
    - Amber card: `bg-[#f59e0b]/8 border border-[#f59e0b]/20 text-[#f59e0b] text-[11px] p-2 rounded`
  - Example AI reasoning per layer:
    - **Service**: "I identified a critical boundary violation in Payment Service: it directly imports from user-db, bypassing the service contract. This affects 3 downstream systems. Auth Service is fully compliant. User Service is missing a cache layer — Redis with 5-minute TTL would reduce DB pressure ~60%."
    - **ML**: "Fraud Detector model was last retrained 52 hours ago — exceeding the 48h staleness threshold. Feature Store is missing a scheduled ingestion job. ML Pipeline retraining is not scheduled."
    - **Database**: "Transaction DB enforces ACID compliance per governance rule DB-01. No cross-database joins detected — service boundary contract is intact."
    - *(Other layers: similar contextual, specific language — NOT generic filler)*

*Bottom chat input* (`border-t border-[#1f2333]`, `p-3`):
- `input` field: `placeholder="Ask the architecture..."`, `bg-[#11131a] border border-[#1f2333] rounded-md py-2 pl-3 pr-8`
- `ArrowRight size={14}` submit icon button (absolutely positioned inside input, right side), `text-[#8b95a5] hover:text-[#6366f1]`

---

**Mode 2 — Node Detail Panel** (when a node is clicked on canvas)

Replaces the AI Reasoning panel. Closes by clicking canvas background, pressing "← Back", or clicking X.

*Panel header:*
- Layer icon (`size={14}`, colored by node status) + node title (white, `font-semibold`, `truncate max-w-[200px]`)
- Right: "← Back" text link (`text-xs text-[#8b95a5] hover:text-white`) + `X size={16}` button

*Status banner* (full-width colored card, `text-xs text-center`, `rounded`, `mb-3`):
- Green: `bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981]` — "✓ All Good — Component Locked"
- Yellow: `bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b]` — "◎ Needs Attention — Extra layers required"
- Red: `bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444]` — "✗ Critical Issues — Resolve before deploy"
- Grey: `bg-[#1f2333]/50 border border-[#2a3050] text-[#8b95a5]` — "— Unimpacted Component"

*Confidence bar:*
- Label "Confidence: N%" right-aligned in `text-[#8b95a5]`
- `h-2 w-full bg-[#1f2333] rounded-full` track, filled `div` with status color at `width: N%`

*Issues section* (only rendered when `node.issues.length > 0`):
- "ISSUES" heading (10px, uppercase, `text-[#8b95a5] font-semibold`)
- Each issue row: `flex items-start gap-2`
  - `w-[3px] h-[3px] rounded-full mt-1.5` colored dot (red or amber)
  - Issue text (`text-[12px] text-[#e2e8f0] flex-1 leading-snug`)
  - `Wrench size={12}` button (`text-[#6366f1] hover:text-[#8b5cf6]`, `title="Auto-fix"`) — triggers auto-fix suggestion inline

*Metadata grid* (2 columns, `text-xs`):
- Layer | Status | Connections (N outbound) | Confidence
- Left column: `text-[#8b95a5]` labels; right column: `text-white` values

*"Implement a change" section* (`p-3`, `flex-1`):
- Heading: "IMPLEMENT A CHANGE" (10px, uppercase, `font-semibold`, muted)
- Context-aware quick-action chips (`bg-[#1f2333] hover:bg-[#2a3050] text-[#e2e8f0] text-[10px] px-2 py-1 rounded-full`):
  - **Red node**: "Add circuit breaker" · "Fix boundary violation" · "Add DLQ"
  - **Yellow node**: "Add cache layer" · "Schedule retraining" · "Configure rate limit"
  - **Green node**: "Add monitoring" · "Generate docs"
  - **Grey node**: "Add to architecture" · "View dependencies"
- `textarea` placeholder: `"Describe the change to implement..."`, `bg-[#11131a] border border-[#1f2333] rounded-lg p-2.5 resize-none focus:border-[#6366f1]`
- **"Apply Change via AI →" button** — `w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg py-2 text-sm font-medium`, `ArrowRight size={14}` — full-width primary action at the bottom

---

#### Bottom Status Bar (28px, `border-t border-[#1f2333] bg-[#11131a]`)

A persistent footer showing live governance scores across the architecture. Two groups:

**Left — Health metrics** (flex, gap-4):
- `AlertCircle size={12}` + "Health: 74%" — amber `text-[#f59e0b]`
- 1px separator
- `AlertTriangle size={12}` + "Drift: 5 critical" — red `text-[#ef4444]`
- 1px separator
- `Shield size={12}` + "Governance: 89%" — green `text-[#10b981]`
- 1px separator
- `Sparkles size={12}` + "AI Trust: 87%" — violet `text-[#8b5cf6]`

**Right — Component summary:**
- "16 components" (muted)
- "3 layers pending" (amber)
- `AlertCircle size={12}` + "Not ready for deployment" (red) — shown when critical issues exist

---

#### Key Behaviors

1. **Focus Mode** is a global toggle (header button or toolbar `Target` icon — both control same state). When active: grey nodes and their connections disappear, amber banner shows impacted count, toolbar button glows violet.

2. **Node selection** replaces the right panel content entirely — no tabs, no animation delay. Clicking canvas background deselects and returns to AI Reasoning mode.

3. **Urgency triage cards are clickable navigation**: clicking any issue card in the AI Reasoning panel selects the corresponding node and switches to Node Detail mode immediately.

4. **Right panel is closeable**: the `X` on the AI Reasoning header hides the panel. Reopened via `Sparkles` toolbar button or by clicking any node. Panel state persists within the session.

5. **Export Architecture button appears in two places**: header (primary, always visible) and the triage panel in AI Reasoning mode (secondary, visible when no node is selected). These are the ONLY two locations — never duplicated elsewhere.

6. **Wrench auto-fix** (`size={12}`) on each issue row. On click: trigger inline diff preview showing proposed code change. Confirm with "Accept Fix" to apply. Wrench icon is indigo, hover → violet. Do NOT render it larger than `size={12}` in the node detail panel.

7. **AI reasoning text is specific and technical** — it describes the actual issue, the affected downstream systems, and the recommended fix with specifics (e.g. cache TTL values, threshold names, rule IDs like "DB-01"). It is NOT generic placeholder text.

8. **Connection line colors communicate blast radius**: red dashed lines visually trace which other services are affected by a red node's violations, giving architects instant impact awareness without clicking anything.

---

### Screen 5 — Workspace Dashboard

**Route:** `/dashboard`
**Auth:** Required

**Purpose:** Overview of all architectures across the organization. Primary entry point for returning users.

**Top Navbar (`h-[52px]`, `bg-[#090a0f]`, `border-b border-[#1f2333]`):**
- Left: BrainCircuit logo + "ArchitectAI" text + org switcher dropdown ("Acme Fintech" with gradient square icon)
- Center: search input — placeholder "Search projects, services, repos..." — `⌘K` kbd chip on the right end of the input
  - `⌘K` shortcut focuses search from anywhere
- Right: Bell icon (indigo dot badge) + Settings icon + team avatar stack (3 initials + "+4" overflow) + user avatar ("SA") + **"New Architecture" primary button** (Plus icon)

**Left Sidebar (`w-[188px]`, `border-r border-[#1f2333]`):**
Navigation items (each `px-3 py-2 rounded-lg`):
- Workspace (active: `bg-[#1a1c2e] text-white font-medium`)
- Governance
- Drift Center — red badge `"3"` (`bg-[#ef4444]/12 border border-[#ef4444]/25`)
- AI Insights
- Templates
- Team
- Integrations
- Settings

Footer: user avatar + "Alex Morrow" / "Platform Team" + ChevronDown

**Main Content (scrollable, `max-w-5xl mx-auto px-6 py-8`):**

---

**Section 1 — My Projects:**

Urgency banner (above section header):
- `border border-[#ef4444]/20 bg-[#ef4444]/5 rounded-xl px-3 py-2`
- "1 project requires immediate attention — sorted by urgency"
- AlertTriangle icon in red

Section header: "My Projects" (h2) + "Your active architectures · sorted by urgency" (sub) + "New project" button (right, outlined indigo)

**My Project Cards (3-column grid):**
Each card (`arch-theme-node rounded-xl overflow-hidden`):
- 2px color top bar (status color)
- Name (`font-semibold text-[14px] text-white`) + Status pill (rounded-full, colored by status):
  - `building` → "In Build" (indigo)
  - `production` → "Production" (green)
  - `drift` → "Drift Detected" (red)
  - `review` → "Governance Review" (amber)
- Confidence bar: `MiniBar` component (`h-[3px]` progress bar + value, colored by threshold: green ≥85, amber ≥60, red below)
- Governance bar: same `MiniBar` component
- Drift notice (when `draftCount > 0`): `bg-[#ef4444]/8 border border-[#ef4444]/18 rounded-lg` — "N drift incident(s) require review"
- Meta row (border-t): Cloud icon + cloud provider · archType · Clock + "lastModified"
- **Hover action row** (`opacity-0 → opacity-100`, `border-t border-[#1f2333] flex divide-x divide-[#1f2333]`):
  - "Open" (ArrowUpRight icon, indigo text)
  - "Cursor" (Code2 icon)
  - "⋮" (MoreHorizontal icon)

**Empty state** (when no projects): dashed border card + BrainCircuit icon + "No projects yet" + "Create your first AI-governed architecture."

---

**Section 2 — Top Architectures (Community/Org):**

Divider with `BookOpen` icon and "Explore top architectures" label.

Filter row (right-aligned): "Domain" dropdown + "Team" dropdown — filter top architecture cards live.

**Top Architecture Cards (3-column grid):**
Each card (`arch-theme-node rounded-xl p-4`):
- Header: name (`font-semibold text-[13px]`) + `author · team` (sub-text) + confidence badge (`TrendingUp` icon, green, `bg-[#10b981]/10 border border-[#10b981]/20`)
- Description: 2-line clamp (`line-clamp-2 text-[12px] text-[#8b95a5]`)
- Footer row (border-t): archType tag + "N services" tag + Clock + updated date + Star + star count
- Hover: "View →" link appears in footer (indigo, ChevronRight icon)

---

**New Architecture Modal (`max-w-[440px]`, centered, `bg-[#11131a]`):**
- Header: BrainCircuit icon + "New Architecture" + "AI-generated, governed from day one" sub + X close button
- Textarea (`h-24`): "Describe your system in plain English — or upload a PRD, Jira epic, or tech spec below."
- 2×2 import grid: Upload PRD | Import Jira | Tech Spec | Import Repo (each: `bg-[#090a0f] border border-[#1f2333]`, icon colored indigo)
- Template pills section: "Or start from a template" label + pills for: Fintech Platform, AI SaaS, Event-Driven System, E-commerce Backend, Fraud Detection
- Footer: `⌘ + Enter to generate` hint (left) + Generate button with BrainCircuit icon (right, `bg-[#6366f1]`)

---

### Screen 6 — Cursor Workspace Setup

**Route:** VS Code Extension side panel (first launch)
**Context:** User has installed the ArchitectAI Cursor extension and opened a project

**Purpose:** Connect the local codebase to an ArchitectAI architecture for drift monitoring.

**Modal Layout:**
- ArchitectAI logo + "Connect to ArchitectAI"
- Subtitle: "Link this workspace to a governed architecture for real-time drift detection"

**Connection Options (radio group):**
1. **Select from your architectures** (default)
   - Dropdown: lists user's architectures
   - On select: shows architecture summary card (confidence, services count)
2. **Connect Existing Workspace** (alternative)
   - Reveals: file path input `[____________] Browse`
   - Accepts: path to `architectai.config.json`

**Actions:**
- Primary: "Initialize Workspace" button
  - Loading state: spinner + "Initializing…" text, button disabled
  - On success: transition to Normal State
- Secondary: "Not now" — styled as `border border-[#2a3050] px-4 py-2 rounded` button (NOT plain text link)
- Footer micro-copy: `⎋ Esc to dismiss`

**Post-initialization:**
- Write `architectai.config.json` to project root:
  ```json
  {
    "architectureId": "...",
    "organizationId": "...",
    "governanceRules": [...],
    "monitoredPaths": ["src/", "lib/"]
  }
  ```

---

### Screen 7 — Cursor Normal State (Governed)

**Route:** VS Code Extension side panel (active, no violations)
**Context:** Workspace initialized, code within architecture contracts

**VS Code Editor (left side):**
- Activity bar (48px, `bg-[#333333]`): Files (active/white), Search, GitBranch, Puzzle, Settings
- File explorer sidebar (`w-[220px]`): project tree with `.architectai` folder highlighted in **violet/purple** (`text-[#8b5cf6]`), currently expanded showing `manifest.json` (active, `bg-[#37373d]`), `rules.json`, `contracts.json`
- Active editor tab: `manifest.json` with violet top-border (`border-t border-[#8b5cf6]`)
- Editor content: `.architectai/manifest.json` JSON file with full syntax highlighting — architecture config, services, antiPatterns, contracts, rules
- Minimap (right edge): faint line preview
- Floating ArchitectAI icon (bottom-right): shield icon with **green dot** (governed), callout bubble: "ArchitectAI runs silently in the background. Zero change to your workflow."

**Chat Panel (right sidebar, `w-[300px]`):**

*Panel header:*
- "Chat" label (uppercase, tracking-wide)
- Right side: "Governed" badge (`bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 text-[#8b5cf6]`, Shield icon) + model badge ("claude-4", `bg-[#3c3c3c] border border-[#454545]`)

*Monitoring active bar (sub-header, `bg-[#1e1e2e]`):*
- "MONITORING ACTIVE" label (violet, uppercase, tracking-wider)
- Anti-pattern check list — each row: `[AP-ID — pattern-name] [✓ Clear]`
  - AP-001 — direct-db-import → ✓ Clear (green)
  - AP-002 — shared-mutable-state → ✓ Clear (green)
  - AP-003 — sync-external-call → ✓ Clear (green)
- "Clear" status means no violations detected for that pattern

*Chat messages area:*
- AI bubble: "Architecture context loaded: **Payment Gateway V2**. All 47 governance rules active. Ask me anything about this architecture."
- Suggested questions (2, with ChevronRight icon right):
  - "Why did we choose REST over gRPC here?"
  - "What does AP-001 check for exactly?"

*Chat input (bottom, `border-t border-[#333]`):*
- Input bar: "Ask about this architecture..." placeholder + inline keyboard hint: `⌘` kbd + `L` kbd chips
- `⌘L` focuses input from anywhere in the panel

**Status Bar:**
- Blue VS Code status bar; no drift indicator (governed state)

---

### Screen 8 — Cursor Drift State

**Route:** VS Code Extension side panel (drift detected)
**Context:** File edit violated an architecture contract

**Trigger:**
- File save event → extension sends diff to `/api/drift/check`
- Response includes violation details → panel switches to Drift mode

**VS Code Editor:**
- Red error gutter markers on violating lines
- Wavy underlines on violating symbols
- Tab title turns red (file in violation)

**Toast Notification (bottom-right of editor):**
- Title: "Architecture Drift Detected" (AlertTriangle icon + red border)
- Body: "CRITICAL — {file path}"
- Actions:
  - "Review" button (blue) → focuses drift panel
  - "Dismiss" → below it: "won't remind again" micro-label
    - Dismiss permanently suppresses this specific drift for this session

**Drift Panel (right sidebar, replaces chat):**

*Multi-drift navigation:*
- "◀ [severity dots] N of M drifts ▶"
- Each dot: colored by severity, hover shows tooltip

*Severity banner:*
- `CRITICAL | HIGH | MEDIUM` with color coding

*What happened?* (prose explanation)

*Agreed vs. Current (visual diff):*
- Green left-bordered box: agreed contract
- Red left-bordered box: current violation
- Labels: "Enforced — N hops, auth layer intact" / "Boundary bypassed — no auth layer"

*Impact:*
- List of consequences (security risk, contract violation, score penalty)
- "Drift score +{N}" — sub-label: "deducts from governance grade"

*Auto-fix preview (code diff):*
- `- removed line` in red bg
- `+ added line` in green bg
- Below: "N lines changed · drift score -{N} · boundary restored"

*Actions (bottom of panel):*
1. **"Accept & Apply Fix"** — primary blue button
   - On click: show "Applying {N}-line fix to {file}…" spinner
   - On success: "✓ Fixed — drift score restored" green banner
   - Panel returns to Normal State
2. **"View Contract"** — secondary outlined button
   - Opens the contract that was violated
3. **"Ignore drift"** — bordered text button
   - Sub-label: "marks as known, stays in log"
   - On click: confirmation "Mark as known? Drift will remain in log but won't block CI."
4. **"Request Exception"** — equal-weight bordered button (white, NOT amber — amber reads as warning)
   - Sub-label: "routes to governance lead"
   - On click: opens exception request form

**Exception Request Form:**
- Reason textarea (required)
- Business justification dropdown
- Target resolution date picker
- Submits to governance lead via `/api/exceptions/request`

---

### Screen 9 — Export to IDE Wizard

**Route:** Web app modal / full-page flow (triggered from Architecture Workspace "Export" button)
**Auth:** Required

**Purpose:** 4-step guided wizard that converts the saved architecture into machine-readable rules, contracts, and guardrails then activates them inside Cursor/VS Code.

**Layout:** 3-column (left step track · center main content · right context sidebar)

---

**Left Panel — Step Track (`w-72`, `bg-[#11131a]/80 backdrop-blur-xl border-r border-[#1f2333]`):**

Header: BrainCircuit icon + "ArchitectAI" + "Export Wizard" (uppercase label)

4-step vertical track (each with circle icon + label, connected by vertical line):
1. **Choose Repository** (✓ complete, green `CheckCircle2`) — shows selected repo "fintech-platform / payment-gateway"
2. **Install Plugin** (✓ complete, green `CheckCircle2`) — shows "Cursor IDE v0.43.6"
3. **Convert Architecture** (● active, violet pulsing ring) — "Processing..."
4. **Activate Guardrails** (○ pending, dim `Circle`) — "Waiting..."

Summary box (bottom of panel): Architecture name · Services count · Rules generated (violet) · Contracts (green)

---

**Center Panel — Main Content (scrollable):**

Breadcrumb: "Step 3 of 4 › Convert Architecture"

Headline: "Translating Architecture into Intelligence"
Sub: "Generating machine-readable rules your AI coding assistant will enforce in real time."

**Terminal animation** (`bg-[#0b0c10] border border-[#1f2333] rounded-xl`, monospace font, `min-h-[320px]`):
- Lines appear sequentially (staggered `setInterval`), slide-in animation
- `[✓]` green — parsing, extracting, analyzing phases
- `[→]` violet — generating governance rules, writing contracts, compiling guardrails
- Final: `[●]` green — "Activating in Cursor IDE..." with blinking cursor
- Example lines:
  ```
  [✓] Parsing architecture graph... 12 services detected
  [✓] Extracting service boundaries... 8 API contracts found
  [→] Generating governance rules...
      → auth-service: must use mTLS for all outbound calls
      → payment-api: cannot import user-db directly (boundary violation)
  [→] Writing architecture contracts...
      → PaymentAPI.contract.yaml ✓
  [→] Compiling AI coding guardrails...
      → .architectai/rules.json (47 rules)
      → .architectai/boundaries.json (8 contracts)
  [●] Activating in Cursor IDE...
  ```

**3 artifact cards** (grid-cols-3): Rules Engine (47 rules) · API Contracts (8 contracts) · AI Guardrails (6 anti-pattern blocks) — each with green left accent bar + active badge

**IDE inline preview** (mock code editor): shows `payment-service/src/database.ts` with a violating import highlighted, ArchitectAI inline error block showing:
- "payment-service cannot directly import from user-db"
- "Suggestion: Use the UserService API endpoint instead"
- Inline actions: "⚡ Auto-fix available" · "Apply Fix" button · "View Contract" · "Dismiss"

---

**Right Panel — Architecture Intelligence sidebar (`w-80`, `bg-[#11131a] border-l border-[#1f2333]`):**

Sections (each collapsible with ChevronRight rotated):
1. **Governance Rules** — list of 4 rules (blocked boundary, mTLS requirement, allowed kafka, read-only access)
2. **IDE Integration** — checklist: Real-time violation detection · Inline fix suggestions · Architecture contract links · Drift reporting to ArchitectAI
3. **Supported IDEs** — Cursor · VS Code · JetBrains · Neovim — note: "More IDEs via Language Server Protocol"

**Share with Team** (below sections):
- 3 team member avatars
- "3 team members will receive updated architecture contracts"
- "Notify Team" button (violet outlined)

---

**Generated Files (written to repo root):**
```
.architectai/
├── manifest.json          # architecture metadata + enforcement config
├── rules.json             # 47 governance rules
├── boundaries.json        # 8 service boundary contracts
└── forbidden-patterns.json  # 6 blocked anti-patterns
```

---

## 5. Cross-Cutting Requirements

### Authentication & Authorization
- Clerk-based authentication (SSO, SAML, Google, GitHub)
- Role-based access:
  - `owner` — full access, billing
  - `architect` — create/edit architectures, define governance rules
  - `developer` — view architectures, Cursor integration
  - `governance_lead` — approve exceptions, view audit log
- All API routes protected by JWT middleware
- Organization-level data isolation

### Real-Time Features
- Architecture generation: Server-Sent Events (SSE) stream
- Drift detection: WebSocket push from extension → server → panel
- Dashboard: polling every 30s for drift count updates

### Governance Engine
- Rules defined in YAML by architects
- Evaluated against:
  - Generated architectures (at generation time)
  - Code diffs (via Cursor extension file watcher)
  - PR diffs (via GitHub Actions integration)
- Rule types:
  - `boundary` — service A must not directly access service B's DB
  - `auth` — all service-to-service calls must use specified auth method
  - `pattern` — prohibited code patterns (e.g., direct DB access from API layer)
  - `naming` — service naming conventions
  - `contract` — API response shape must match OpenAPI spec

### Audit Log
- Every architecture decision, drift detection, exception request, and auto-fix logged
- Immutable append-only log per organization
- Exportable as JSON/CSV for SOC2 evidence

### Non-Functional Requirements
- Generation: P95 < 30s end-to-end
- Drift check: P95 < 200ms (must not block Cursor saves)
- API: 99.9% uptime SLA
- Data: US-East-1 primary, EU-West-1 for EU organizations (GDPR)
- SOC2 Type II certified

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Time from signup to first architecture | < 5 minutes |
| Architecture generation time | < 30 seconds |
| Drift detection latency (save to alert) | < 500ms |
| Daily active usage (returning) | > 3 sessions/week |
| Exception request approval rate | Track (baseline) |
| Drift auto-fix acceptance rate | > 60% |
| NPS | > 50 (enterprise) |
