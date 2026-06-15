import { useI18n } from '../i18n';

export type ProgressStepperStep = {
  id: string;
  label: string;
  enabled?: boolean;
};

type ProgressStepperProps = {
  steps: ProgressStepperStep[];
  currentIndex: number;
  onStepSelect?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
};

export default function ProgressStepper({
  steps,
  currentIndex,
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
          const isComplete = index < currentIndex;
          const isDisabled = step.enabled === false;
          const canSelect = !isDisabled && onStepSelect && index <= currentIndex;

          return (
            <li
              key={step.id}
              className={`progress-stepper-item${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}${isDisabled ? ' is-disabled' : ''}`}
            >
              {canSelect ? (
                <button
                  type="button"
                  className="progress-stepper-btn"
                  onClick={() => onStepSelect(index)}
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
