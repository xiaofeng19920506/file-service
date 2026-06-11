type Segment = {
  id: string;
  label: string;
  badge?: number;
};

type MobileSegmentedControlProps = {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
};

export default function MobileSegmentedControl({
  segments,
  value,
  onChange,
  ariaLabel,
  className = '',
}: MobileSegmentedControlProps) {
  return (
    <div
      className={`mobile-segments${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {segments.map((segment) => {
        const active = value === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`mobile-segment${active ? ' active' : ''}`}
            onClick={() => onChange(segment.id)}
          >
            <span className="mobile-segment-label">{segment.label}</span>
            {segment.badge != null && segment.badge > 0 && (
              <span className="mobile-segment-badge" aria-hidden>
                {segment.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
