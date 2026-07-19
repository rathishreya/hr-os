import { Component } from 'react'

// Catches render errors anywhere below it so a single component throwing can't blank the whole
// app (React unmounts the entire tree on an uncaught render error → white screen). Shows a
// recoverable message WITH the error text, so a crash is diagnosable instead of silent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surfaced in the browser console for debugging; the UI shows a friendly version.
    console.error('[HR-OS] render crash:', error, info && info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const msg = String((this.state.error && this.state.error.message) || this.state.error || 'Unknown error')
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-lg font-bold text-rose-600">!</div>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong on this screen</h1>
          <p className="mt-1 text-sm text-slate-500">Your data is safe. Reload to continue — and if this keeps happening, send us the message below.</p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-50 p-2 text-left text-[11px] leading-relaxed text-slate-500">{msg}</pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
