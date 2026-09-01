/**
 * ErrorBoundary.jsx — React Error Boundary for SWSTP Workstation.
 *
 * Catches JavaScript errors anywhere in their child component tree,
 * logs those errors, and displays a fallback console UI instead of
 * crashing and unmounting the entire application tree.
 *
 * Uses existing design tokens exclusively from index.css.
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--text-mono)',
          minHeight: '200px',
          height: '100%',
        }}>
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--status-error)',
            padding: '20px',
            maxWidth: '560px',
            width: '100%',
            borderRadius: '2px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--status-error)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginBottom: '12px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '8px',
            }}>
              <span>⛔</span> {this.props.name ? `${this.props.name.toUpperCase()} COMPONENT ERROR` : 'PANEL RENDER ERROR'}
            </div>

            <div style={{
              fontSize: '9.5px',
              color: 'var(--text-secondary)',
              marginBottom: '12px',
              lineHeight: '1.5',
            }}>
              A component error occurred while rendering this view. Other screens and telemetry ingest remain unaffected.
            </div>

            <pre style={{
              background: 'var(--bg-base)',
              padding: '10px',
              border: '1px solid var(--border)',
              fontSize: '8.5px',
              color: 'var(--status-warn)',
              overflowX: 'auto',
              maxHeight: '120px',
              marginBottom: '14px',
              whiteSpace: 'pre-wrap',
            }}>
              {this.state.error?.toString() || 'Unknown Error'}
            </pre>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={this.handleReset}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--text-mono)',
                  fontSize: '9px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                ⟳ RETRY COMPONENT
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
