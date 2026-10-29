import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '640px', margin: '3rem auto', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px', color: '#991B1B' }}>
          <h2 style={{ marginTop: 0 }}>Ceylon Rail UI Runtime Error</h2>
          <p style={{ fontSize: '14px' }}>{String(this.state.error?.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 16px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
