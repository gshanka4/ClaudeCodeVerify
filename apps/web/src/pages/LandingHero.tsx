import { INTERROGATION } from "@architectai/config";
import { BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { KbdHint } from "@/components/ui/KbdHint";
import { PRODUCT_TAGLINE } from "@/lib/product-copy";

const EXAMPLES = [
  "Payment gateway with 10k RPS, PCI-DSS, and multi-region AWS",
  "Real-time analytics platform ingesting 1M events/min",
  "B2B SaaS multi-tenant API with SOC2 and EU data residency",
  "Healthcare FHIR API with HIPAA audit logging",
  "E-commerce checkout redesign with fraud detection",
];

interface LandingHeroProps {
  prompt: string;
  setPrompt: (v: string) => void;
  error: string | null;
  valid: boolean;
  loading: boolean;
  progressSheet?: React.ReactNode;
  onGenerate: () => void;
  onImportPaste?: (text: string) => void;
  resumeSection?: React.ReactNode;
  headerExtra: React.ReactNode;
}

export function LandingHero({
  prompt,
  setPrompt,
  error,
  valid,
  loading,
  progressSheet,
  onGenerate,
  onImportPaste,
  resumeSection,
  headerExtra,
}: LandingHeroProps): JSX.Element {
  const trimmed = prompt.trim();

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <header className="border-b border-border-subtle px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <BrainCircuit className="text-brand-violet" size={22} />
            Architect<span className="text-brand-violet">AI</span>
          </span>
          {headerExtra}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 animate-fade-in">
        <h1 className="text-center text-4xl font-semibold tracking-tight">
          Independent verification,
          <br />
          <span className="text-brand-violetLight">governed architecture</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-text-muted">{PRODUCT_TAGLINE}</p>

        {resumeSection ? <div className="mt-8">{resumeSection}</div> : null}

        <div className="mt-10 overflow-hidden rounded-xl border border-border-muted bg-bg-panel focus-within:ring-1 focus-within:ring-brand-indigo/40">
          <textarea
            data-testid="landing-prompt"
            className="h-[130px] w-full resize-none bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-ghost focus:outline-none"
            placeholder="Describe your architecture — PRD excerpt, Jira epic, or plain language…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text && onImportPaste) onImportPaste(text);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {(["Jira", "PRD", "Upload spec", "Swagger"] as const).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  title={`Import from ${chip}`}
                  className="rounded-md border border-border-muted px-2.5 py-1 text-[12px] text-text-muted hover:border-brand-indigo/40 hover:bg-brand-indigo/5"
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <KbdHint keys={["⌘", "↵"]} label="to generate" />
              <Button data-testid="landing-generate-cta" onClick={onGenerate} loading={loading}>
                <BrainCircuit size={16} />
                Generate Architecture
              </Button>
            </div>
          </div>
        </div>
        {progressSheet}
        {error ? <p className="mt-2 text-sm text-status-red">{error}</p> : null}
        {!valid && trimmed.length > 0 ? (
          <p className="mt-2 text-sm text-status-amber">
            Please describe your requirements (minimum {INTERROGATION.minPromptChars} characters)
          </p>
        ) : null}

        <div className="mt-8">
          <p className="text-[12px] text-text-ghost">Try an example:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="rounded-full border border-border-subtle px-3 py-1 text-[12px] text-text-dim hover:border-border-muted hover:text-text-primary"
                onClick={() => setPrompt(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
