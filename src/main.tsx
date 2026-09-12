import React, { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ProjectManager } from './project/ProjectManager';
import { MioMemoryManager } from './security/MemoryManager';
import { executionLedger } from './security/ExecutionLedger';
import { taskRuntime } from './orchestrator/TaskRuntime';

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Mio V2 UI Catch:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#07090e', color: '#00f0ff', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '600px', backgroundColor: '#0d121d', border: '1px solid #ef4444', borderRadius: '12px', padding: '24px', boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}>
            <h2 style={{ color: '#ef4444', margin: '0 0 12px 0', fontSize: '18px' }}>MIO V2 — RECOVERY INTERFACE</h2>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 16px 0' }}>An unexpected render anomaly was intercepted by the system safety boundary.</p>
            <pre style={{ backgroundColor: '#07090e', padding: '12px', borderRadius: '6px', color: '#fca5a5', fontSize: '11px', overflowX: 'auto', maxHeight: '200px' }}>
              {this.state.error?.message || 'Unknown error'}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '8px 16px', backgroundColor: '#00f0ff', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>RELOAD WORKSPACE</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function bootstrapMio(): Promise<void> {
  await Promise.all([
    ProjectManager.initialize(),
    MioMemoryManager.initialize(),
    executionLedger.initialize(),
    taskRuntime.initialize(),
  ]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrapMio();
