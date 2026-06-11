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

export function CheckIcon() {
  return (
    <svg className="result-icon success" viewBox="0 0 56 56" fill="none" aria-hidden>
      <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2" />
      <path
        d="M18 28l7 7 13-14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg className="result-icon error" viewBox="0 0 56 56" fill="none" aria-hidden>
      <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2" />
      <path d="M28 18v14M28 40h.02" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
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
