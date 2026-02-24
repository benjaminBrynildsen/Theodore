import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const THEODORE_STORAGE_KEYS = [
  'theodore-app-store',
  'theodore-canon-store',
];

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary caught runtime error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    for (const key of THEODORE_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f7',
          color: '#111827',
          padding: 24,
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
            padding: 24,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Theodore hit a runtime error</h1>
          <p style={{ marginTop: 10, marginBottom: 0, color: '#4b5563', fontSize: 14 }}>
            The app crashed while rendering. Use reset if stale local state is causing the white screen.
          </p>
          <pre
            style={{
              marginTop: 16,
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              lineHeight: 1.5,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 12,
              color: '#111827',
            }}
          >
            {this.state.error.message || 'Unknown runtime error'}
          </pre>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              onClick={this.handleResetAndReload}
              style={{
                border: '1px solid #111827',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                background: '#111827',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Reset Local State & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
