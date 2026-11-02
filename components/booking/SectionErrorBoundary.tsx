'use client';

import { Component, type ReactNode } from 'react';

/**
 * Error boundary for booking detail sections.
 * If a client component crashes (e.g., during hydration),
 * show a fallback instead of crashing the entire page.
 */
export class SectionErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Log for debugging, but don't crash the page
    console.error('[SectionErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      // Visible fallback (not blank): a blank page gets misreported as
      // "crashing" with no diagnosable trace. This makes failures obvious.
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            This section failed to load. Please refresh the page — if the
            problem persists, contact support.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
