import { useI18n } from '../i18n';

export type ProgressStepperStep = {
  id: string;
  label: string;
  enabled?: boolean;
};

type ProgressStepperProps = {
  steps: ProgressStepperStep[];
  currentIndex: number;
  /** 右侧预览滚动时对应高亮的步骤（可与 currentIndex 不同） */
  previewIndex?: number | null;
  onStepSelect?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
};

export default function ProgressStepper({
  steps,
  currentIndex,
  previewIndex = null,
  onStepSelect,
  orientation = 'horizontal',
}: ProgressStepperProps) {
  const { t } = useI18n();

  return (
    <nav
      className={`progress-stepper progress-stepper--${orientation}`}
      aria-label={t('bulletin.stepperLabel')}
    >
      <ol className="progress-stepper-list">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isPreviewFocus = previewIndex != null && index === previewIndex && !isCurrent;
          const isComplete = index < currentIndex;
          const isDisabled = step.enabled === false;
          const canSelect = !isDisabled && Boolean(onStepSelect);

          return (
            <li
              key={step.id}
              className={`progress-stepper-item${isCurrent ? ' is-current' : ''}${isPreviewFocus ? ' is-preview-focus' : ''}${isComplete ? ' is-complete' : ''}${isDisabled ? ' is-disabled' : ''}`}
            >
              {canSelect ? (
                <button
                  type="button"
                  className="progress-stepper-btn"
                  onClick={() => onStepSelect?.(index)}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="progress-stepper-index">{index + 1}</span>
                  <span className="progress-stepper-label">{step.label}</span>
                </button>
              ) : (
                <span className="progress-stepper-btn progress-stepper-btn--static">
                  <span className="progress-stepper-index">{index + 1}</span>
                  <span className="progress-stepper-label">{step.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
