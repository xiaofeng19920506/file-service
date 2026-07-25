import { useEffect, useState } from 'react';
import { RibbonPopoverPanel, useRibbonPopover } from './RibbonPopover';

/** 可输入的下拉框（字体、字号） */
export default function RibbonCombo({
  value,
  options,
  onCommit,
  disabled,
  width = 118,
  ariaLabel,
  renderOption,
  numeric = false,
}: {
  value: string;
  options: string[];
  onCommit?: (value: string) => void;
  disabled?: boolean;
  width?: number;
  ariaLabel: string;
  renderOption?: (option: string) => React.ReactNode;
  numeric?: boolean;
}) {
  const { open, setOpen, wrapRef } = useRibbonPopover();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) {
      setDraft(value);
      return;
    }
    if (numeric && !Number.isFinite(Number(trimmed))) {
      setDraft(value);
      return;
    }
    onCommit?.(trimmed);
  };

  return (
    <div className="ppt-rb-combo" ref={wrapRef} style={{ width }}>
      <input
        className="ppt-rb-combo-input"
        value={draft}
        disabled={disabled || !onCommit}
        aria-label={ariaLabel}
        inputMode={numeric ? 'numeric' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className={`ppt-rb-combo-arrow${open ? ' is-open' : ''}`}
        disabled={disabled || !onCommit}
        onClick={() => setOpen((v) => !v)}
        aria-label={`${ariaLabel} 列表`}
        aria-expanded={open}
      >
        <svg viewBox="0 0 8 5" width={8} height={5} aria-hidden>
          <path d="M0 0h8L4 5z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <RibbonPopoverPanel className="ppt-rb-combo-list">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`ppt-rb-menu-item${opt === value ? ' is-active' : ''}`}
              onClick={() => {
                onCommit?.(opt);
                setOpen(false);
              }}
            >
              {renderOption ? renderOption(opt) : opt}
            </button>
          ))}
        </RibbonPopoverPanel>
      )}
    </div>
  );
}
