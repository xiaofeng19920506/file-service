import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

export type ProgressStepperStep = {
  id: string;
  label: string;
  enabled?: boolean;
  /** 可点击导航但无编辑表单（模板固定页） */
  readonly?: boolean;
  /** 是否显示该分区（纳入 PPT）；缺省不渲染勾选 */
  visible?: boolean;
};

type ProgressStepperProps = {
  steps: ProgressStepperStep[];
  currentIndex: number;
  /** 右侧预览可见分区；有值时驱动主高亮（可与 currentIndex 不同） */
  previewIndex?: number | null;
  onStepSelect?: (index: number) => void;
  onStepVisibilityChange?: (sectionId: string, visible: boolean) => void;
  /** 每个分区旁的「修改幻灯片」 */
  onEditSlides?: (sectionId: string) => void;
  canEditVisibility?: boolean;
  canEditSlides?: boolean;
  orientation?: 'horizontal' | 'vertical';
};

function scrollItemIntoScroller(item: HTMLElement) {
  const scroller = item.closest('.bulletin-workspace-editor') as HTMLElement | null;
  if (!scroller) return;
  const itemRect = item.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (itemRect.top < scrollerRect.top + 4) {
    scroller.scrollTop -= scrollerRect.top - itemRect.top + 8;
  } else if (itemRect.bottom > scrollerRect.bottom - 4) {
    scroller.scrollTop += itemRect.bottom - scrollerRect.bottom + 8;
  }
}

export default function ProgressStepper({
  steps,
  currentIndex,
  previewIndex = null,
  onStepSelect,
  onStepVisibilityChange,
  onEditSlides,
  canEditVisibility = false,
  canEditSlides = false,
  orientation = 'horizontal',
}: ProgressStepperProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const focusIndex = previewIndex ?? currentIndex;

  useEffect(() => {
    const list = listRef.current;
    if (!list || focusIndex < 0) return;
    const item = list.children[focusIndex] as HTMLElement | undefined;
    if (item) scrollItemIntoScroller(item);
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
          const isComplete = index < focusIndex;
          const isDisabled = step.enabled === false;
          const isReadonly = Boolean(step.readonly);
          const canSelect = !isDisabled && Boolean(onStepSelect);
          const showVisibility = typeof step.visible === 'boolean';
          const isHidden = showVisibility && step.visible === false;
          const showEditSlides = Boolean(onEditSlides) && canEditSlides;

          return (
            <li
              key={step.id}
              className={`progress-stepper-item${isFocused ? ' is-current' : ''}${isEditing ? ' is-editing' : ''}${isComplete ? ' is-complete' : ''}${isDisabled ? ' is-disabled' : ''}${isReadonly ? ' is-readonly' : ''}${isHidden ? ' is-section-hidden' : ''}`}
            >
              {showVisibility && (
                <label
                  className="progress-stepper-visibility"
                  title={t('bulletin.sectionVisible')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={step.visible !== false}
                    disabled={!canEditVisibility || !onStepVisibilityChange}
                    onChange={(e) => onStepVisibilityChange?.(step.id, e.target.checked)}
                  />
                  <span className="visually-hidden">{t('bulletin.sectionVisible')}</span>
                </label>
              )}
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
              {showEditSlides ? (
                <button
                  type="button"
                  className="progress-stepper-edit-slides"
                  title={t('bulletin.editSlides')}
                  disabled={isDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditSlides?.(step.id);
                  }}
                >
                  {t('bulletin.editSlidesShort')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
