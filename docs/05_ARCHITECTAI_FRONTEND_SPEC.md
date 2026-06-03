# ArchitectAI — Frontend Implementation Specification
**Stack:** React 18 + Vite + TypeScript + Tailwind CSS + React Query + Zustand + React Flow
**Version:** 1.0 | **Date:** 2026-05-28

---

## 1. Design Tokens

These are the single source of truth. Define in `src/styles/tokens.ts` and register with Tailwind `theme.extend`.

```ts
export const tokens = {
  color: {
    // Backgrounds
    bgBase:       '#07080d',    // page root
    bgSurface:    '#090a0f',    // primary surface
    bgPanel:      '#11131a',    // panel / card background
    bgElevated:   '#1a1f2e',    // hover state / elevated panel

    // Borders
    borderSubtle:  '#1f2333',   // default border
    borderMuted:   '#2a3050',   // input/card border
    borderActive:  '#4a5578',   // hover border

    // Brand
    violet:        '#8b5cf6',
    violetLight:   '#a78bfa',
    indigo:        '#6366f1',
    indigoDark:    '#4f46e5',

    // Status
    green:         '#10b981',
    greenLight:    '#34d399',
    amber:         '#f59e0b',
    amberLight:    '#fbbf24',
    red:           '#ef4444',

    // Text
    textPrimary:   '#ffffff',
    textSecondary: '#e2e8f0',
    textMuted:     '#a1aab8',
    textDim:       '#8b95a5',
    textGhost:     '#4a5578',
  },

  // VS Code theme (Cursor screens only)
  vscode: {
    bgEditor:     '#1e1e1e',
    bgSidebar:    '#252526',
    bgActivityBar:'#333333',
    bgTabActive:  '#1e1e1e',
    bgTabInactive:'#2d2d2d',
    bgHover:      '#37373d',
    border:       '#191919',
    borderPanel:  '#333333',
    borderActive: '#454545',
    textPrimary:  '#cccccc',
    textWhite:    '#ffffff',
    textMuted:    '#858585',
    blue:         '#007acc',
    red:          '#ef4444',
    green:        '#28c840',
    amber:        '#ffbd2e',
    tokenBlue:    '#569cd6',
    tokenTeal:    '#4ec9b0',
    tokenOrange:  '#ce9178',
    tokenLightBlue:'#9cdcfe',
    tokenYellow:  '#dcdcaa',
  },

  font: {
    sans:  '"Inter", system-ui, sans-serif',
    mono:  '"JetBrains Mono", Consolas, monospace',
  },

  radius: {
    sm:   '6px',
    md:   '8px',
    lg:   '12px',
    xl:   '16px',
    '2xl':'20px',
    full: '9999px',
  },
};
```

---

## 2. Project Structure

```
src/
├── components/
│   ├── ui/                     # Primitive components (Button, Input, Badge, etc.)
│   ├── layout/                 # AppShell, Sidebar, TopBar
│   ├── architecture/           # Canvas, NodeCard, LayerAccordion
│   ├── interrogation/          # QuestionCard, OptionCard, AnsweredRow
│   ├── generation/             # NodeStream, GovernanceChecklist, ScoreBar
│   ├── drift/                  # DriftPanel, DiffPreview, ImpactList
│   └── dashboard/              # ArchCard, StatsBanner, FilterTabs
├── pages/
│   ├── LandingPage.tsx
│   ├── InterrogationPage.tsx
│   ├── GenerationPage.tsx
│   ├── WorkspacePage.tsx
│   └── DashboardPage.tsx
├── hooks/
│   ├── useArchitecture.ts      # React Query hooks (from codegen)
│   ├── useInterrogation.ts
│   ├── useGeneration.ts        # SSE stream hook
│   ├── useDrift.ts
│   └── useKeyboardShortcuts.ts
├── stores/
│   ├── useSessionStore.ts      # Zustand — interrogation session state
│   ├── useWorkspaceStore.ts    # Zustand — workspace / canvas state
│   └── useUIStore.ts           # Zustand — sidebar, panel state
├── lib/
│   ├── api.ts                  # Axios instance with auth interceptors
│   ├── sse.ts                  # SSE connection manager
│   └── shortcuts.ts            # Keyboard shortcut registry
└── styles/
    ├── tokens.ts
    └── globals.css
```

---

## 3. Component Specifications

### 3.1 UI Primitives

#### `<Button>` variants
```tsx
// Variants
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

// Primary: bg-[#6366f1] hover:bg-[#4f46e5] text-white
// Secondary: border border-[#2a3050] text-[#cccccc] hover:border-[#4a5578]
// Ghost: text-[#a1aab8] hover:text-white hover:bg-[#1a1f2e]
// Danger: hover:bg-[#ef4444]/10 hover:border-[#ef4444]/30 text-[#8b95a5] hover:text-white
// 
// Loading state (all variants):
//   - spinner (w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin)
//   - button text replaced with loading label
//   - button disabled + cursor-not-allowed

// Keyboard hint (optional sub-label beneath button):
// <span class="text-[10px] text-[#4a5578] font-mono">⌘↵</span>
```

#### `<KbdHint>` — keyboard shortcut chip
```tsx
// Usage: <KbdHint keys={['⌘', '↵']} label="to generate" />
// Renders: [⌘] [↵] to generate
// Style: 
//   kbd: border border-[#2a3050] bg-[#11131a] text-[#8b95a5] font-mono text-[10px]
//        px-1.5 h-5 rounded inline-flex items-center
//   label: text-[11px] text-[#4a5578] ml-1
// CRITICAL: Never use plain text for keyboard shortcuts.
//           Always render as styled <kbd> elements.
```

#### `<Badge>` variants
```tsx
type BadgeVariant = 'violet' | 'emerald' | 'amber' | 'red' | 'blue' | 'neutral';
// violet:  bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/20
// emerald: bg-[#10b981]/10 text-[#34d399] border border-[#10b981]/20
// amber:   bg-[#f59e0b]/10 text-[#fbbf24] border border-[#f59e0b]/20
// red:     bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20
```

---

### 3.2 Landing Page (`LandingPage.tsx`)

#### Hero Input Box
```tsx
// Input box: dark, bordered, overflow-hidden, flex flex-col
// - textarea: h-[130px], no resize, focus shows violet ring
//   focus class: focus:ring-1 focus:ring-[#6366f1]/40 focus:outline-none
//
// - Bottom toolbar (border-t):
//   LEFT: Import chips (Jira, PRD, Upload spec, Swagger)
//     Each chip:
//       - border border-[#2a3050] rounded-md px-2.5 py-1 text-[12px] cursor-pointer
//       - hover: border-[#6366f1]/40 bg-[#6366f1]/5
//       - has tooltip via title attribute
//       - click: opens inline import UI (not a modal)
//
//   RIGHT: KbdHint + "Generate Architecture" button
//     - KbdHint: ⌘ ↵ · "to generate" — MUST be visible (never #2a3050 on dark bg)
//     - Button: primary variant with BrainCircuit icon

// Validation:
//   - Minimum 20 characters before enabling Generate button
//   - Show inline error: "Please describe your requirements (minimum 20 characters)"
```

#### Suggestion Pills
```tsx
// "Try an example:" label + 5 pills
// Each pill:
//   - border border-[#1f2333] rounded-full px-3 py-1 text-[12px] text-[#8b95a5]
//   - hover: border-[#2a3050] text-white + show "→" suffix (appended to label)
//     hover class: hover:after:content-['_→'] — or use JSX state
//   - click: fills textarea + shows "Example loaded" hint
```

---

### 3.3 Interrogation Page (`InterrogationPage.tsx`)

#### Answered Question Row (`<AnsweredRow>`)
```tsx
// Container: group flex items-center gap-4 px-5 py-3 rounded-xl
//   border border-[#2a3050] bg-[#11131a] hover:border-[#4a5578] transition-colors
//
// Content: [✓ Answered] | [Question] | [Answer] | [Edit icon]
//
// Edit icon (Pencil, size 13):
//   - opacity-0 group-hover:opacity-100 transition-all
//   - p-1.5 rounded-md text-[#2a3050] hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10
//   - title="Edit this answer"
//   - onClick: call onEdit(questionId) → parent expands that question inline
//     (do NOT navigate away; slide open the question UI in-place with animation)
```

#### Option Card (`<OptionCard>`)
```tsx
// Button (full): text-left p-5 rounded-xl border-2 transition-all duration-200
//
// Unselected: border-[#2a3050] bg-[#11131a] hover:bg-[#1a1f2e] hover:border-[#4a5578]
// Selected:   border-[#8b5cf6] border-l-4 bg-[#1a1630]
//
// Top-right corner:
//   - When NOT selected: <KbdHint key={opt.keyboardHint} /> — shows "1" "2" "3" "4"
//   - When selected: "Selected" badge (violet)
//
// Keyboard wiring:
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       if (['1','2','3','4'].includes(e.key)) setSelectedOption(parseInt(e.key));
//       if (e.key === 'Enter' && selectedOption !== null) handleSubmit();
//     };
//     window.addEventListener('keydown', handler);
//     return () => window.removeEventListener('keydown', handler);
//   }, [selectedOption]);
```

#### Footer Action Row
```tsx
// Layout: flex items-center justify-between (3 columns)
//
// LEFT: Skip button + consequence label
//   <button className="ghost">Skip for now</button>
//   <span className="text-[11px] text-[#f59e0b]">
//     Skip reduces confidence by ~{question.confidenceImpact}% — answerable later
//   </span>
//
// CENTER: Step dots + "N / 7"
//   dots: completed=green, current=violet+ring, pending=dim
//
// RIGHT: Apply & Continue + metadata row
//   Primary button: disabled when no option selected
//   Metadata: ✓ Autosaved · Step N of 7 · <KbdHint keys={['↵']} />
```

---

### 3.4 Generation Page (`GenerationPage.tsx`)

#### SSE Hook (`useGenerationStream`)
```ts
function useGenerationStream(architectureId: string) {
  const [nodes, setNodes] = useState<GenerationNodeEvent[]>([]);
  const [checks, setChecks] = useState<GenerationGovernanceEvent[]>([]);
  const [progress, setProgress] = useState<GenerationProgressEvent | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const es = new EventSource(`/api/generate/stream/${architectureId}`, {
      withCredentials: true,
    });

    es.addEventListener('node', (e) => {
      setNodes(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener('governance', (e) => {
      setChecks(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener('progress', (e) => {
      setProgress(JSON.parse(e.data));
    });
    es.addEventListener('complete', () => {
      setIsComplete(true);
      es.close();
    });
    es.onerror = () => es.close();

    return () => es.close();
  }, [architectureId]);

  return { nodes, checks, progress, isComplete };
}
```

#### Cancel Button
```tsx
// Only shown when !isComplete
// Variant: danger-ghost
// onClick: show confirm dialog before calling POST /api/generate/{id}/cancel
// Dialog: "Cancel will lose progress. Return to interrogation?"
//   [Keep waiting] (primary) | [Cancel generation] (danger)
```

#### Time Estimate
```tsx
// Shown below progress bar, right side
// Formula: estimatedSecondsRemaining from SSE progress event
// Display: "~{N}s remaining" when N > 5, "Almost done" when N <= 5
// Hide when isComplete
```

#### "Return to add context" tip
```tsx
// Rendered as: <button className="underline decoration-dotted underline-offset-2 hover:text-white transition-colors">
//   Return to add context
// </button>
// onClick: navigate to /interrogate/:sessionId (preserve session)
```

---

### 3.5 Architecture Workspace (`WorkspacePage.tsx`)

The workspace is a full-screen editor composed of four zones: header bar, left icon toolbar, SVG canvas, and right panel.

#### Header Bar
```tsx
// h-[48px], bg-[#090a0f], border-b border-[#1f2333]
// LEFT:  BrainCircuit logo + architecture name text
// CENTER (absolute): urgency triage — when governance issues exist:
//   - amber AlertTriangle icon
//   - "N issues · Confidence {X}% · {label}" text
//   - "Export Architecture" button (Download icon, secondary variant)
//     IMPORTANT: export also appears here in the center triage area
//     because it is contextually relevant to resolving governance issues.
//     This is NOT duplication — it is contextual placement.
// RIGHT: Focus Mode toggle (Maximize2 icon) + Settings
```

#### Left Icon Toolbar (NOT a sidebar)
```tsx
// w-[48px], bg-[#090a0f], border-r border-[#1f2333]
// Icon-only vertical strip — NO labels, NO layer accordion
//
// Icons (top group, gap-1):
//   MousePointer2 (select)
//   ZoomIn
//   ZoomOut
//   Move (pan)
//   Maximize2 (fit view)
//
// Icons (bottom group, mt-auto):
//   Layers (layer toggle)
//   Grid (grid toggle)
//   Download (export shortcut)
//
// Each icon: w-9 h-9 rounded-lg flex items-center justify-center
//   default: text-[#4a5578] hover:text-white hover:bg-[#11131a]
//   active:  bg-[#1a1f2e] text-[#8b5cf6]
```

#### SVG Canvas
```tsx
// flex-1, bg-[#090a0f], overflow-hidden
// Contains React Flow or custom SVG renderer
//
// Nodes: rounded-xl, bg-[#11131a], border border-[#1f2333]
//   Each node:
//   - top: layer badge (color-coded) + service name + status dot
//   - body: confidence arc (SVG circle, stroke colored by threshold)
//   - footer: cloud badge + comm protocol badge (REST/gRPC/Kafka)
//   - click: selects node → right panel switches to "Node Detail" mode
//
// Node status dot colors (derive from governance issues + confidence):
//   green  (confidence ≥ 85, 0 critical issues)
//   yellow (confidence 60-84 OR medium issues)
//   red    (confidence < 60 OR critical issues present)
//   grey   (pending / no data)
//
// Edges: stroke colored by status — green (healthy), red (violation), dashed-amber (warning)
//   Red edges: dashed, animated, show blast-radius from violated node
//
// Focus Mode (when active):
//   - Selected node expands to center, others dim to opacity-30
//   - Canvas bg dims: bg-[#090a0f]/80
//   - Triggered by: Maximize2 icon in header or double-click on node
```

#### Right Panel — Dual Mode
```tsx
// w-[320px] (or w-[360px] on wide screens), border-l border-[#1f2333]
// Mode determined by selectedNodeId in useWorkspaceStore:
//   selectedNodeId === null  → "AI Reasoning" mode
//   selectedNodeId !== null  → "Node Detail" mode
//
// ── AI REASONING MODE (default, no selection) ──────────────────
// Header: BrainCircuit icon + "AI Reasoning" label
//
// Urgency triage section (when issues exist):
//   - Header: AlertTriangle + "Urgency Triage" + severity count badge
//   - Issue rows: each has [severity badge] [message] [Wrench icon size={16}]
//     Wrench: cursor-pointer, title="Apply auto-fix for this issue"
//     onClick: renders inline DiffPreview below the row
//     DiffPreview has [Accept Fix] + [Cancel] buttons
//   - "Export Architecture" button (contextual — near the issue list)
//
// AI input (bottom):
//   - textarea/input: "Ask about this architecture…" placeholder
//   - ⌘L focuses from anywhere on the page
//   - Submit: "Ask →" button (NEVER bare ArrowRight icon alone)
//     <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#6366f1] text-white text-sm">
//       Ask <ArrowRight size={14} />
//     </button>
//
// ── NODE DETAIL MODE (service selected) ────────────────────────
// Header: back ChevronLeft + service name + status badge
//
// Sections:
//   - Confidence score (large, colored by threshold)
//   - Layer + cloud + protocol info
//   - Governance issues list (same wrench affordance as AI Reasoning mode)
//   - Connections: lists inbound and outbound edges with protocol labels
//   - Architecture note (freeform text from architect)
```

#### Bottom Status Bar
```tsx
// h-[32px], bg-[#090a0f], border-t border-[#1f2333]
// LEFT:  N services · N connections
// CENTER: confidence badge (colored) + "Governance {score}%"
// RIGHT:  "Last generated {timestamp}" · auto-save indicator
```

#### Layer Accordion (in Layers panel — triggered by Layers icon in toolbar)
```tsx
// Slides in as an overlay panel on the left edge of the canvas
// Each layer row: cursor-pointer, flex items-center justify-between
// MUST have ChevronDown / ChevronRight icon to signal expandability
// Collapsed height: 40px, expanded: auto
// Animation: max-height transition (CSS, not JS-measured)
//
// Governance issue row in expanded layer:
//   [severity badge] [message] [wrench icon — size={16}]
//   wrench: cursor-pointer, title="Apply auto-fix for this issue"
//   onClick: show DiffPreview panel inline below the row
//   DiffPreview has: [Accept Fix] [Cancel] buttons — NOT just an icon
```

#### Export Architecture
```tsx
// Two valid locations (both intentional):
// 1. Header bar center (urgency triage area) — contextual CTA when issues exist
// 2. Toolbar bottom (Download icon) — always accessible shortcut
//
// onClick (either): opens export format picker
//   Options: Terraform, Pulumi, OpenAPI, ADR Markdown, Cursor Config
//   Downloads via POST /api/architectures/{id}/export?format={format}
```

---

### 3.6 Dashboard (`DashboardPage.tsx`)

The dashboard is a full-screen layout: `Navbar` (top) + `Sidebar` (left) + scrollable `main` content.

#### `<Navbar>`
```tsx
// h-[52px], bg-[#090a0f], border-b border-[#1f2333]
// LEFT:  BrainCircuit + "ArchitectAI" + org switcher dropdown
// CENTER (flex-1 max-w-md): search input
//   - placeholder: "Search projects, services, repos..."
//   - ⌘K kbd chip on right end: className="text-[10px] font-mono text-[#2a3050] border border-[#2a3050]"
//   - ⌘K shortcut focuses input from anywhere
// RIGHT: Bell (+ indigo dot) + Settings + team avatar stack (3 initials + "+4" overflow) + user avatar + "New Architecture" primary button (Plus icon)
```

#### `<Sidebar>`
```tsx
// w-[188px], border-r border-[#1f2333], flex flex-col
// Nav items (each w-full px-3 py-2 rounded-lg text-[13px]):
//   active: bg-[#1a1c2e] text-white font-medium (icon: text-[#818cf8])
//   default: text-[#8b95a5] hover:bg-[#11131a] hover:text-[#d4d9e4]
//
// Items: Workspace · Governance · Drift Center (red badge "3") · AI Insights · Templates · Team · Integrations · Settings
//
// Footer (border-t): user avatar (7 char initials, gradient) + name + role + ChevronDown
```

#### Urgency Banner
```tsx
// Rendered ABOVE the "My Projects" section header (not above the sidebar)
// border border-[#ef4444]/20 bg-[#ef4444]/5 rounded-xl px-3 py-2 flex items-center gap-2
// AlertTriangle size={13} text-[#ef4444]
// "1 project requires immediate attention — sorted by urgency" (red) + "(muted sub-text)"
// Only rendered when any project has status === 'drift' or critical governance issues
```

#### `<MyProjectCard>`
```tsx
// arch-theme-node rounded-xl overflow-hidden flex flex-col
// hover: border-[#2a3050] shadow-[0_4px_16px_rgba(0,0,0,0.3)]
//
// Structure (top to bottom):
// 1. Color top bar: h-[2px], backgroundColor = status color
// 2. Body (p-4 flex flex-col gap-3):
//    a. Name row: font-semibold text-white text-[14px] + status pill (rounded-full):
//       building   → "In Build"          (color #6366f1, bg rgba(99,102,241,0.12))
//       production → "Production"        (color #10b981, bg rgba(16,185,129,0.12))
//       drift      → "Drift Detected"    (color #ef4444, bg rgba(239,68,68,0.12))
//       review     → "Governance Review" (color #f59e0b, bg rgba(245,158,11,0.12))
//    b. Scores:
//       <MiniBar value={confidence} color={ConfColor(confidence)} />
//       <MiniBar value={governance} color={govColor} />
//       // MiniBar: flex items-center gap-2 / h-[3px] bg-[#1f2333] fill bar + value text
//    c. Drift notice (draftCount > 0):
//       bg-[#ef4444]/8 border border-[#ef4444]/18 rounded-lg px-2.5 py-1.5
//       AlertTriangle size={11} + "N drift incident(s) require review"
//    d. Meta row (border-t border-[#1f2333]):
//       Cloud size={10} + cloudProvider · archType · Clock size={10} + lastModified
// 3. Hover action row (border-t border-[#1f2333] flex divide-x divide-[#1f2333]):
//    opacity-0 → opacity-100 on card hover (transition-opacity duration-150)
//    - "Open"   (ArrowUpRight size={11}, text-[#818cf8]) — flex-1 py-2
//    - "Cursor" (Code2 size={11})                        — flex-1 py-2
//    - "⋮"      (MoreHorizontal size={13})               — px-3 (no label)
//
// NOTE: No team avatars, no "Last synced" with RefreshCcw — those are NOT in this card.
```

#### `<TopArchCard>`
```tsx
// arch-theme-node rounded-xl p-4 flex flex-col gap-3 cursor-pointer
// hover: border-[#2a3050] shadow-[0_4px_16px_rgba(0,0,0,0.3)]
//
// Structure:
// 1. Header row:
//    - Left: name (font-semibold text-[13px] text-white) + author · team (text-[11px] text-[#8b95a5])
//    - Right: confidence badge (TrendingUp size={9} + "{N}%" in bold green,
//        bg-[#10b981]/10 border border-[#10b981]/20 px-2 py-1 rounded-lg)
// 2. Description: text-[12px] text-[#8b95a5] leading-relaxed line-clamp-2
// 3. Footer row (border-t border-[#1f2333] flex items-center gap-2 flex-wrap):
//    - archType tag (px-2 py-0.5 rounded bg-[#1f2333] text-[#8b95a5] text-[10px])
//    - "N services" tag (same style)
//    - Clock size={9} + "Updated Nd ago"
//    - ml-auto: Star size={10} text-[#f59e0b] + star count
//    - Hover only: "View" + ChevronRight size={10} in indigo
```

#### Section Layout
```tsx
// Two sections inside <main className="flex-1 overflow-y-auto bg-[#090a0f]">
// Wrapped in max-w-5xl mx-auto px-6 py-8

// Section 1: My Projects
//   <urgency banner>
//   <section header> "My Projects" + "New project" button (outlined indigo)
//   <grid grid-cols-3 gap-4> MyProjectCard × 3
//   (empty state when 0: dashed border card + BrainCircuit icon)

// Divider between sections:
//   flex items-center gap-3 mb-8
//   hr lines on each side + BookOpen icon + "Explore top architectures" label

// Section 2: Top Architectures
//   Header: "Top Architectures" + Domain dropdown + Team dropdown (filter live)
//   <grid grid-cols-3 gap-4> TopArchCard × (filtered)
```

#### `<NewArchModal>`
```tsx
// Fixed overlay, max-w-[440px], bg-[#11131a] border border-[#1f2333] rounded-2xl
// Header: BrainCircuit icon bg + "New Architecture" title + "AI-generated, governed from day one" sub + X close
// Body:
//   - textarea h-24: "Describe your system in plain English — or upload a PRD, Jira epic, or tech spec below."
//     autoFocus, focus:border-[#6366f1]/40
//   - 2×2 import grid: Upload PRD · Import Jira · Tech Spec · Import Repo
//     each: bg-[#090a0f] border border-[#1f2333] rounded-lg px-3 py-2, icon in indigo
//   - Template pills: "Or start from a template" label (uppercase tracking)
//     pills: px-2.5 py-1 rounded-full border border-[#1f2333]
//     Fintech Platform · AI SaaS · Event-Driven System · E-commerce Backend · Fraud Detection
// Footer:
//   LEFT:  "⌘ + Enter to generate" (text-[#2a3050] text-[11px])
//   RIGHT: Generate button (BrainCircuit icon + "Generate", bg-[#6366f1] rounded-xl)
```

#### Search & Keyboard Shortcuts
```tsx
// ⌘K: focuses search input (center of navbar)
// ⌘N: opens New Architecture modal
// Implementation in DashboardPage:
//   useEffect(() => {
//     const handler = (e: KeyboardEvent) => {
//       if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
//         e.preventDefault();
//         searchRef.current?.focus();
//       }
//       if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
//         e.preventDefault();
//         setShowModal(true);
//       }
//     };
//     window.addEventListener('keydown', handler);
//     return () => window.removeEventListener('keydown', handler);
//   }, []);
```

---

### 3.7 Cursor Workspace Setup (`CursorSetupPanel.tsx`)
*(VS Code extension — React webview)*

#### Action Buttons
```tsx
// Primary: "Initialize Workspace"
//   Loading state: spinner + "Initializing…", button disabled
//   onSuccess: write architectai.config.json, transition to NormalPanel
//
// Secondary: "Not now" — MUST be a real button, not a plain text link
//   <button className="border border-[#2a3050] px-4 py-2 rounded text-[#858585] 
//                       hover:text-[#cccccc] hover:border-[#454545] transition-colors text-[12px]">
//     Not now
//   </button>
//
// Footer: <span className="text-[9px] text-[#555555]">⎋ Esc to dismiss</span>
//   Wire: useEffect(() => { ... document.addEventListener('keydown', handler) ... })
//     where handler closes the panel on Escape
```

---

### 3.8 Cursor Drift Panel (`DriftPanel.tsx`)
*(VS Code extension — React webview)*

#### Toast Notification
```tsx
// "Dismiss" action:
//   <div className="flex flex-col">
//     <button className="px-3 py-1 text-[#858585] text-[11px] hover:text-[#cccccc] transition-colors">
//       Dismiss
//     </button>
//     <span className="text-[9px] text-[#555555] px-3 leading-none">won't remind again</span>
//   </div>
```

#### Primary Action: Accept & Apply Fix
```tsx
// Button label: "Accept & Apply Fix" (NOT "Apply Auto-Fix")
// Rationale: "Accept" acknowledges the diff already shown; user is not surprised
//
// onClick flow:
//   1. Show inline progress: "Applying {linesChanged}-line fix to {filePath}…"
//      - spinner animation inside button
//   2. Call POST /api/drift/{driftId}/apply-fix
//   3. On success: show green banner "✓ Fixed — drift score restored"
//      - Panel transitions back to Normal State after 2s
//   4. On error: show red inline error "Fix failed: {message}" + "Retry" button
```

#### "Ignore drift" + "Request Exception" Buttons
```tsx
// Ignore drift:
//   - bordered button: border border-[#333] text-[#858585] hover:text-[#cccccc] hover:border-[#454545]
//   - sub-label: "marks as known, stays in log"
//   - onClick: confirmation dialog "Mark as known? Drift remains in log but won't block CI."
//     [Confirm] | [Cancel]
//
// Request Exception:
//   - bordered button: border border-[#454545] text-[#cccccc] (SAME weight as Ignore drift)
//   - NEVER amber/warning color — it is an action, not a warning state
//   - sub-label: "routes to governance lead"
//   - onClick: opens ExceptionRequestForm (inline, below the buttons)

// ExceptionRequestForm:
//   - reason: textarea (required, minLength 20)
//   - businessJustification: select dropdown
//   - targetResolutionDate: date input
//   - [Submit Exception Request] primary | [Cancel] ghost
```

#### Drift Score Explanation
```tsx
// Drift score +N:
//   <div className="flex flex-col gap-0.5">
//     <div className="flex items-center gap-2">
//       <ShieldAlert size={12} className="text-[#ef4444]" />
//       <span className="text-[#cccccc] text-[12px]">Drift score +{N}</span>
//     </div>
//     <span className="text-[10px] text-[#555555] ml-[22px]">
//       deducts from governance grade
//     </span>
//   </div>
```

---

## 4. State Management

### Zustand Stores

#### `useSessionStore` — Interrogation session
```ts
interface SessionStore {
  sessionId: string | null;
  questions: InterrogationQuestion[];
  currentIndex: number;
  answers: Record<string, { optionId?: string; freeform?: string }>;
  contextProgress: number;
  governanceProgress: number;
  
  setSession: (id: string) => void;
  setAnswer: (questionId: string, answer: { optionId?: string; freeform?: string }) => void;
  advance: (nextQuestion: InterrogationQuestion) => void;
  reset: () => void;
}
```

#### `useWorkspaceStore` — Architecture canvas
```ts
interface WorkspaceStore {
  architectureId: string | null;

  // Canvas selection — determines right panel mode:
  //   selectedServiceId === null  → AI Reasoning panel (default)
  //   selectedServiceId !== null  → Node Detail panel for that service
  selectedServiceId: string | null;

  // Focus mode: dims all non-selected nodes, selected node expands to center
  focusMode: boolean;

  // AI panel visibility (can be collapsed even in AI Reasoning mode)
  aiPanelOpen: boolean;

  // Active layer filter (null = show all layers)
  expandedLayer: string | null;

  selectService: (id: string | null) => void;   // null = deselect → AI Reasoning mode
  toggleFocusMode: () => void;
  setAiPanelOpen: (open: boolean) => void;
  setExpandedLayer: (layer: string | null) => void;
}

// IMPORTANT: There is no activePanel: 'chat' | 'details' | 'contracts' tab switcher.
// The right panel mode is entirely determined by selectedServiceId.
// There is no sidebarOpen — the left element is a 48px fixed icon toolbar, not a collapsible sidebar.
```

### React Query Keys
```ts
// Architecture list: ['architectures', { status?, search?, page? }]
// Architecture detail: ['architecture', architectureId]
// Drift events: ['drift', architectureId, { status?, severity? }]
// Interrogation session: ['interrogation', sessionId]
// Governance rulesets: ['rulesets', organizationId]
```

---

## 5. Animation Specs

All animations use CSS keyframes defined in `globals.css`. Do NOT use JS-driven animation.

```css
/* Node appear (generation stream, interrogation rows) */
@keyframes node-appear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-node-appear { animation: node-appear 0.3s ease-out forwards; }

/* Panel slide in (drift toast) */
@keyframes panel-slide-in {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
}
.animate-panel-slide-in { animation: panel-slide-in 0.25s ease-out forwards; }

/* Drift pulse (red dot on ArchitectAI icon in editor) */
@keyframes drift-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.5); opacity: 0.6; }
}
.animate-drift-pulse { animation: drift-pulse 2s ease-in-out infinite; }

/* Status bar pulse (critical drift indicator) */
@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
.animate-status-pulse { animation: status-pulse 1.5s ease-in-out infinite; }

/* Confidence ring fill (architecture nodes) */
@keyframes confidence-fill {
  to { stroke-dashoffset: var(--target-offset); }
}
```

---

## 6. Routing

```tsx
// React Router v6
const router = createBrowserRouter([
  { path: '/',                    element: <LandingPage /> },
  { path: '/interrogate/:sessionId', element: <AuthGuard><InterrogationPage /></AuthGuard> },
  { path: '/generate/:architectureId', element: <AuthGuard><GenerationPage /></AuthGuard> },
  { path: '/workspace/:architectureId', element: <AuthGuard><WorkspacePage /></AuthGuard> },
  { path: '/dashboard',           element: <AuthGuard><DashboardPage /></AuthGuard> },
  { path: '/governance',          element: <AuthGuard roleRequired="architect"><GovernancePage /></AuthGuard> },
  { path: '/audit',               element: <AuthGuard roleRequired="governance_lead"><AuditPage /></AuthGuard> },
]);

// AuthGuard: checks Clerk auth, redirects to / if not authed
// roleRequired: checks user.role, shows 403 page if insufficient
```

---

## 7. Cursor VS Code Extension Architecture

The Cursor integration is a separate VS Code extension package (`packages/cursor-extension/`).

```
cursor-extension/
├── src/
│   ├── extension.ts            # activation point (registerCommands, startWatcher)
│   ├── watchers/
│   │   └── fileWatcher.ts      # onDidSaveTextDocument → POST /api/drift/check
│   ├── panels/
│   │   ├── SetupPanel.ts       # WebviewPanel: first launch
│   │   ├── NormalPanel.ts      # WebviewPanel: governed state
│   │   └── DriftPanel.ts       # WebviewPanel: drift detected
│   ├── decorators/
│   │   └── driftDecorator.ts   # red gutter markers + wavy underlines
│   ├── statusBar/
│   │   └── driftStatus.ts      # "⚠ N Critical Drift" status bar item
│   └── config/
│       └── workspaceConfig.ts  # read/write architectai.config.json
└── package.json                # VS Code extension manifest
```

### File Watcher (critical — must be < 200ms)
```ts
// fileWatcher.ts
vscode.workspace.onDidSaveTextDocument(async (doc) => {
  const config = readWorkspaceConfig();
  if (!config || !isMonitored(doc.uri.fsPath, config)) return;

  const response = await driftClient.check({
    architectureId: config.architectureId,
    filePath: vscode.workspace.asRelativePath(doc.uri),
    fileContent: doc.getText(),
  });

  if (response.hasDrift) {
    applyDriftDecorations(doc, response.drifts);
    showDriftPanel(response.drifts[0]);
    updateStatusBar(response.drifts);
  } else {
    clearDecorations(doc);
    showNormalPanel();
  }
});
```

### Status Bar Item
```ts
// Shows: "⚠ N Critical Drift" when open critical drifts exist
// Color: #ef4444 (red) for critical/high, #f59e0b (amber) for medium
// Tooltip: "Click to open Architecture Drift panel"
// command: 'architectai.openDriftPanel'
```

---

## 8. Key Implementation Rules (Critical — Do Not Deviate)

1. **Keyboard shortcuts must use `<kbd>` elements** with visible styling. Never use plain text for shortcuts (`text-[#2a3050]` is invisible on dark backgrounds).

2. **Answered interrogation rows must have an edit affordance** (hover-reveal pencil icon). Users must be able to revise any answer without losing subsequent answers unless the edit changes the question tree.

3. **"Apply Auto-Fix" must be renamed "Accept & Apply Fix"** to signal that the user is accepting the diff already shown — not triggering an unknown operation.

4. **"Ignore" and "Request Exception" must be visually equal weight** — both bordered buttons with explanatory sub-labels. Never style "Request Exception" in amber as it reads as a warning, not an action.

5. **"Not now" in Cursor setup must be a bordered button**, not a plain text link. Bare text links have insufficient affordance in a dense panel.

6. **Drift score must always show "deducts from governance grade"** sub-text. The raw number (+23) is meaningless without context.

7. **Export Architecture must appear in exactly one place** (header bar). Duplication in sidebar creates decision paralysis.

8. **Cancel generation must always be available** during generation. Users must never be trapped in a non-cancellable loading state.

9. **"Dismiss" on drift toast must show "won't remind again"** sub-label. Permanence of the action must be communicated before it is taken.

10. **Anti-pattern "Clear" badges must show undo toast** for 3 seconds. Irreversible destructive micro-actions require an undo window.

11. **Layer accordion items must have chevron icons**. Without `ChevronDown`/`ChevronRight`, they look like static labels rather than interactive accordions.

12. **Governance issue wrench icon must be `size={16}`**, not `size={10}`. A 10px icon is not a valid click target on desktop.

---

## 8.1 v3.0 Verification UX Rules (spec delta D10 — Do Not Deviate)

*Additive to rules 1–12 above. Source: `new_PRD_updated.md` §5.*

14. **Deterministic and probabilistic verdicts are visually distinct.** Deterministic findings render as a hard **✅ / ❌** ("proven"); probabilistic findings render as **~confidence** with an explicit *"signal, not proof"* label. They must never look the same.

15. **A probabilistic finding never blocks Lock and is never shown as fact.** Only deterministic conflicts gate; only deterministic checks earn an unqualified ✓.

16. **Ungrounded provenance is flagged, never rendered as fact** (carries forward v2.0's referential-integrity guard).

17. **Override requires a typed reason** and is irreversible without a new edit; it writes an immutable audit event.

18. **Trust Grade always shows its breakdown** (verification deductions vs open-drift deductions) on hover/expand — never a bare number.

19. **Conflicts use ❌ (red), not amber.** Amber is reserved for "unverified/uncertain," consistent with the existing no-amber-for-actions rule.
