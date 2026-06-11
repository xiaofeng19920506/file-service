'use client';

import dynamic from 'next/dynamic';
import { StrictMode } from 'react';

// Disable SSR for the entire app — it relies on browser-only APIs
// (localStorage, window.location.hash, etc.)
const ClientApp = dynamic(
  () =>
    import('../AppShell').then((m) => ({ default: m.AppShell })),
  { ssr: false },
);

export default function Page() {
  return (
    <StrictMode>
      <ClientApp />
    </StrictMode>
  );
}
