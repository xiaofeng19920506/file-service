'use client';

import dynamic from 'next/dynamic';
import { StrictMode } from 'react';

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
