import { MANUAL_PPTX_UPLOAD_TIP } from '../lib/preview-guide';

type Props = {
  onDismiss?: () => void;
  compact?: boolean;
};

export default function ManualPptxUploadTip({ onDismiss, compact = false }: Props) {
  return (
    <div className={`manual-pptx-tip${compact ? ' compact' : ''}`}>
      <div className="manual-pptx-tip-head">
        <p className="manual-pptx-tip-title">{MANUAL_PPTX_UPLOAD_TIP.title}</p>
        {onDismiss && (
          <button type="button" className="manual-pptx-tip-dismiss" onClick={onDismiss} aria-label="关闭">
            ×
          </button>
        )}
      </div>
      <p className="manual-pptx-tip-summary">{MANUAL_PPTX_UPLOAD_TIP.summary}</p>
      {!compact && (
        <ol className="manual-pptx-tip-steps">
          {MANUAL_PPTX_UPLOAD_TIP.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
