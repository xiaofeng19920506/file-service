import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

export type ProgressStepperStep = {
  id: string;
  label: string;
  enabled?: boolean;
  /** 可点击导航但无编辑表单（模板固定页） */
  readonly?: boolean;
};

type ProgressStepperProps = {
  steps: ProgressStepperStep[];
  currentIndex: number;
  /** 右侧预览可见分区；有值时驱动主高亮（可与 currentIndex 不同） */
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
  const listRef = useRef<HTMLOListElement>(null);
  const focusIndex = previewIndex ?? currentIndex;

  useEffect(() => {
    const list = listRef.current;
    if (!list || focusIndex < 0) return;
    const item = list.children[focusIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [focusIndex]);

  return (
    <nav
      className={`progress-stepper progress-stepper--${orientation}`}
      aria-label={t('bulletin.stepperLabel')}
    >
      <ol ref={listRef} className="progress-stepper-list">
        {steps.map((step, index) => {
          const isFocused = index === focusIndex;
          const isEditing =
            index === currentIndex && previewIndex != null && previewIndex !== currentIndex;
          const isComplete = index < currentIndex;
          const isDisabled = step.enabled === false;
          const isReadonly = Boolean(step.readonly);
          const canSelect = !isDisabled && Boolean(onStepSelect);

          return (
            <li
              key={step.id}
              className={`progress-stepper-item${isFocused ? ' is-current' : ''}${isEditing ? ' is-editing' : ''}${isComplete ? ' is-complete' : ''}${isDisabled ? ' is-disabled' : ''}${isReadonly ? ' is-readonly' : ''}`}
            >
              {canSelect ? (
                <button
                  type="button"
                  className="progress-stepper-btn"
                  onClick={() => onStepSelect?.(index)}
                  aria-current={isFocused ? 'step' : undefined}
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
