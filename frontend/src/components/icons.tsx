import type { ReactNode } from 'react';

export function UploadIcon() {
  return (
    <svg className="upload-icon" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M24 8v22M24 8l-8 8M24 8l8 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 34h28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function DragHandleIcon() {
  return (
    <svg className="drag-handle-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5" cy="4" r="1.25" />
      <circle cx="11" cy="4" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="11" cy="12" r="1.25" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg className="pencil-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.1 2.2a1.2 1.2 0 0 1 1.7 1.7l-7.2 7.2-1.8.5.5-1.8 7.2-7.2z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 13h11"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {children}
    </svg>
  );
}

export function LibraryNavIcon() {
  return (
    <NavIcon>
      <path d="M4 6h16M4 10h16M4 14h10" strokeLinecap="round" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </NavIcon>
  );
}

export function PlaylistsNavIcon() {
  return (
    <NavIcon>
      <path d="M9 18V6l12-2v12" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="16" r="3" fill="currentColor" stroke="none" />
    </NavIcon>
  );
}

export function HomeNavIcon() {
  return (
    <NavIcon>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19v-8.5z" strokeLinejoin="round" />
    </NavIcon>
  );
}

export function MergeNavIcon() {
  return (
    <NavIcon>
      <rect x="3" y="4" width="14" height="10" rx="1.5" />
      <rect x="7" y="10" width="14" height="10" rx="1.5" />
    </NavIcon>
  );
}

export function AdminNavIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </NavIcon>
  );
}

export function BulletinNavIcon() {
  return (
    <NavIcon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
    </NavIcon>
  );
}

export function MenuIcon() {
  return (
    <svg className="nav-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg className="nav-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M5 12l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <svg className="nav-back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QueueIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function PlaybackMoreIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function ShuffleIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RepeatIcon({ mode }: { mode: 'off' | 'all' | 'one' }) {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
      {mode === 'one' && (
        <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">
          1
        </text>
      )}
    </svg>
  );
}

export function ListPlayIcon() {
  return (
    <svg className="player-chrome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" stroke="none" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function PlaybackOrderModeIcon({
  mode,
}: {
  mode: 'sequential' | 'loop_all' | 'loop_one' | 'shuffle';
}) {
  if (mode === 'shuffle') return <ShuffleIcon />;
  if (mode === 'loop_one') return <RepeatIcon mode="one" />;
  if (mode === 'loop_all') return <RepeatIcon mode="all" />;
  return <ListPlayIcon />;
}
