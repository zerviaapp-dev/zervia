'use client';

import { Toaster } from 'sonner';

/** Client wrapper so the server-component locale layout can mount sonner's toaster. */
export function ToasterClient() {
  return <Toaster richColors position="top-center" />;
}
