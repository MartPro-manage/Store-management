import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Safely register PWA Service Worker with automatic updates in production
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('Mart Pro PWA: New content available, auto-updating...');
      },
      onOfflineReady() {
        console.log('Mart Pro PWA: App ready to work offline');
      },
      onRegisterError(error) {
        console.warn('Mart Pro PWA registration error:', error);
      },
    });
  } catch (err) {
    console.warn('Mart Pro PWA registration skipped in sandbox:', err);
  }
}

// Ensure day/light mode default by clearing any legacy dark mode settings
try {
  localStorage.removeItem('martpro_theme');
  document.documentElement.classList.remove('dark');
  document.body.classList.remove('dark');
} catch {
  // ignore
}

// Handle global unhandled promise rejections (e.g. IndexedDB leveldb FILE_ERROR_NO_SPACE)
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (event.reason.message?.includes('indexeddb') ||
     event.reason.message?.includes('FILE_ERROR_NO_SPACE') ||
     event.reason.message?.includes('QuotaExceededError') ||
     event.reason.name === 'QuotaExceededError')
  ) {
    console.warn('Caught local storage / IndexedDB quota error:', event.reason);
    event.preventDefault(); // Prevent app crash on storage quota error
  }
});

// Prevent non-fatal DOM / chart layout errors from crashing the app
window.addEventListener('error', (event) => {
  if (
    event.message &&
    (event.message.includes('clientWidth') ||
     event.message.includes('clientHeight') ||
     event.message.includes('getBoundingClientRect'))
  ) {
    console.warn('Caught non-fatal layout / chart dimension error:', event.message);
    event.preventDefault(); // Prevent crash
  }
});

// Global hook for beforeinstallprompt event
declare global {
  interface Window {
    deferredPrompt?: any;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  window.deferredPrompt = e;
  window.dispatchEvent(new CustomEvent('pwa-install-ready'));
});

// Error Boundary Component to prevent blank screens on unexpected errors
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: Readonly<ErrorBoundaryState>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Mart Pro Error Boundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn(e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-md w-full bg-slate-800/90 border border-slate-700 p-8 rounded-3xl shadow-2xl space-y-5">
            <div className="w-16 h-16 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black">
              ⚡
            </div>
            <h1 className="text-2xl font-black text-white">Mart Pro Recovery</h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              An unexpected display issue occurred ({this.state.error?.message || 'Interface loading deferred'}). Click below to refresh and load the software interface cleanly.
            </p>
            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-all text-sm cursor-pointer"
              >
                Reload Mart Pro Interface
              </button>
              <button
                onClick={this.handleReset}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-xl transition-all text-xs cursor-pointer"
              >
                Reset Session & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
