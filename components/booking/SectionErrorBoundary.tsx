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
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
