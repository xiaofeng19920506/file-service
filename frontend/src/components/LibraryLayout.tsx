import type { ReactNode } from 'react';

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page-body page-body-library">
      <main className="main main-library">{children}</main>
    </div>
  );
}
