import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: 24, color: '#fca5a5', background: '#0a0a0b',
        fontFamily: 'monospace', minHeight: '100vh',
      }}>
        <h2 style={{ color: '#ef4444' }}>💥 Crash</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <button
          onClick={() => { localStorage.clear(); location.reload(); }}
          style={{
            marginTop: 16, padding: '10px 16px',
            background: '#f5a524', color: '#0a0a0b', border: 'none',
            borderRadius: 4, cursor: 'pointer', fontWeight: 700,
          }}
        >
          localStorage löschen + reload
        </button>
      </div>
    );
  }
}
