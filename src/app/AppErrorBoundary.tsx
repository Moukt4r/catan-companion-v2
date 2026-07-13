import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, StatusBanner } from "../ui/components";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Uncaught application error", {
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="surface hero-card">
            <p className="eyebrow">The companion stopped safely</p>
            <h1>Something went wrong</h1>
            <StatusBanner tone="danger" role="alert">
              {this.state.error.message}
            </StatusBanner>
            <p>
              Saved game revisions remain in local storage. Reload to retry from
              the last durable state.
            </p>
            <Button
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload companion
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
