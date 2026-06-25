import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State;
  public props: Props;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside Burmese Recap Studio:", error, errorInfo);
  }

  private handleReset = () => {
    localStorage.clear(); // Clear potentially corrupted state
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#070B13] text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans relative">
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative max-w-md w-full bg-[#0F1626]/80 border border-red-500/20 rounded-2xl p-8 backdrop-blur-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold mb-2 tracking-tight text-slate-200">System Pipeline Fault</h1>
            <p className="text-sm text-slate-400 mb-6">
              A fatal rendering handshake or client exception occurred. The state has been isolated to prevent device freeze.
            </p>
            <div className="bg-[#050810] border border-slate-800 rounded-xl p-4 mb-6 text-left overflow-auto max-h-40 font-mono text-xs text-red-300">
              {this.state.error?.toString() || "Unknown rendering exception"}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full bg-red-500 hover:bg-red-600 transition-colors py-3 px-4 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-500/10"
            >
              <RefreshCw className="w-4 h-4" />
              Reset State & Reboot Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
