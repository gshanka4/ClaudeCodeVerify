import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-level error boundary. Prevents a single render/effect crash from blanking
 * the entire app (white screen) and gives the user a recoverable surface.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ArchitectAI] Unhandled UI error:", error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-base px-6 text-center"
        data-testid="app-error-boundary"
        role="alert"
      >
        <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="max-w-md text-sm text-text-muted">
          The page hit an unexpected error and couldn&apos;t finish loading. You can reload to try
          again.
        </p>
        <pre className="max-w-md overflow-x-auto rounded-lg border border-border-muted bg-bg-surface px-3 py-2 text-left text-xs text-status-red">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.handleReload}
          className="inline-flex items-center justify-center rounded-lg bg-brand-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-indigoDark"
        >
          Reload page
        </button>
      </div>
    );
  }
}
