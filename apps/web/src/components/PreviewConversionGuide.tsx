import { buildPreviewConversionGuide } from '../lib/preview-guide';

type Props = {
  fileName: string;
  compact?: boolean;
};

export default function PreviewConversionGuide({ fileName, compact = false }: Props) {
  const guide = buildPreviewConversionGuide(fileName);

  return (
    <div className={`preview-conversion-guide${compact ? ' compact' : ''}`}>
      <div className="preview-conversion-guide-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
      <h3>{guide.title}</h3>
      <p className="preview-conversion-guide-reason">{guide.reason}</p>
      {!compact && (
        <>
          <p className="preview-conversion-guide-label">你可以：</p>
          <ol className="preview-conversion-guide-steps">
            {guide.steps.map((step) => (
              <li key={step.label}>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {compact && (
        <p className="preview-conversion-guide-compact-hint">
          安装 LibreOffice 后重启服务，或另存为 .pptx 重新上传。
        </p>
      )}
      <p className="preview-conversion-guide-note">{guide.note}</p>
    </div>
  );
}
