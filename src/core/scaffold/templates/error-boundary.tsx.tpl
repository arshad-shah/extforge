import React from 'react';

interface Props {
  scope: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info });
    console.error(`[${this.props.scope}] React error:`, error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null, info: null });

  reload = (): void => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.reload) chrome.runtime.reload();
    else location.reload();
  };

  render(): React.ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="min-h-screen p-6 bg-gray-950 text-gray-100 font-sans text-sm">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-semibold text-red-400 mb-2">{this.props.scope} crashed</h1>
          <p className="text-gray-400 mb-4">An unexpected error occurred while rendering.</p>
          <div className="flex gap-2 mb-4">
            <button onClick={this.reset} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white">
              Try again
            </button>
            <button onClick={this.reload} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white">
              Reload extension
            </button>
          </div>
          <details open className="bg-gray-900 border border-gray-800 rounded p-3">
            <summary className="cursor-pointer text-gray-400">Error details</summary>
            <pre className="mt-2 p-2 bg-gray-950 border border-gray-800 rounded text-xs whitespace-pre-wrap break-words">
              {error.name}: {error.message}
            </pre>
            {error.stack && (
              <pre className="mt-2 p-2 bg-gray-950 border border-gray-800 rounded text-xs whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            )}
            {info?.componentStack && (
              <pre className="mt-2 p-2 bg-gray-950 border border-gray-800 rounded text-xs whitespace-pre-wrap break-words text-gray-400">
                {info.componentStack}
              </pre>
            )}
          </details>
        </div>
      </div>
    );
  }
}
