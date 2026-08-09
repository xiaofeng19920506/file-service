import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export type ProgressStepperStep = {
  id: string;
  label: string;
  enabled?: boolean;
  /** 可点击导航但无编辑表单（模板固定页） */
  readonly?: boolean;
  /** 分区是否纳入本周 PPT；缺省视为显示 */
  visible?: boolean;
  /** 树形缩进深度 */
  depth?: number;
  /** 仅分组、无独立模板页 */
  groupOnly?: boolean;
  hasChildren?: boolean;
  /** 本区是否有自定义 PPT 覆盖（用于「恢复原版」） */
  hasPptxOverride?: boolean;
  /** 本区是否有可编辑/替换的模板页 */
  hasTemplateSlides?: boolean;
};

type ProgressStepperProps = {
  steps: ProgressStepperStep[];
  currentIndex: number;
  /** 右侧预览可见分区；有值时驱动主高亮（可与 currentIndex 不同） */
  previewIndex?: number | null;
  onStepSelect?: (index: number) => void;
  onEditSlides?: (sectionId: string) => void;
  onReplacePptx?: (sectionId: string, file: File) => void | Promise<void>;
  onResetPptx?: (sectionId: string) => void | Promise<void>;
  onStepVisibilityChange?: (sectionId: string, visible: boolean) => void;
  onAddAnnouncement?: () => void;
  onRemoveAnnouncement?: (sectionId: string) => void;
  canManage?: boolean;
  orientation?: 'horizontal' | 'vertical';
};

type MenuState = {
  sectionId: string;
  x: number;
  y: number;
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

function clampMenuPosition(x: number, y: number, menu: HTMLElement) {
  const pad = 8;
  const { width, height } = menu.getBoundingClientRect();
  const maxX = window.innerWidth - width - pad;
  const maxY = window.innerHeight - height - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

function isAnnouncementItemId(sectionId: string): boolean {
  return sectionId.startsWith('announcement:');
}

export default function ProgressStepper({
  steps,
  currentIndex,
  previewIndex = null,
  onStepSelect,
  onEditSlides,
  onReplacePptx,
  onResetPptx,
  onStepVisibilityChange,
  onAddAnnouncement,
  onRemoveAnnouncement,
  canManage = false,
  orientation = 'horizontal',
}: ProgressStepperProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const focusIndex = previewIndex ?? currentIndex;

  useEffect(() => {
    const list = listRef.current;
    if (!list || focusIndex < 0) return;
    const item = list.querySelector(
      `[data-step-index="${focusIndex}"]`,
    ) as HTMLElement | null;
    if (item) scrollItemIntoScroller(item);
  }, [focusIndex]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const clamped = clampMenuPosition(menu.x, menu.y, menuRef.current);
    if (clamped.x !== menu.x || clamped.y !== menu.y) {
      setMenu({ ...menu, ...clamped });
    }
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const openMenu = (sectionId: string, clientX: number, clientY: number) => {
    if (!canManage) return;
    const step = steps.find((s) => s.id === sectionId);
    if (!step) return;
    // 普通 groupOnly 无菜单；公告分组允许「添加公告」
    if (step.groupOnly && sectionId !== 'announcements_group') return;
    setMenu({ sectionId, x: clientX, y: clientY });
  };

  const activeStep = menu ? steps.find((s) => s.id === menu.sectionId) : null;
  const isAnnouncementsGroup = menu?.sectionId === 'announcements_group';
  const isAnnouncementItem = Boolean(menu && isAnnouncementItemId(menu.sectionId));
  const canSlides = Boolean(activeStep?.hasTemplateSlides) && !isAnnouncementsGroup;
  const canVisibility =
    Boolean(onStepVisibilityChange) &&
    !isAnnouncementsGroup &&
    (canSlides || isAnnouncementItem);
  const isHidden = activeStep?.visible === false;
  const hasOverride = Boolean(activeStep?.hasPptxOverride);

  const runAction = async (fn: () => void | Promise<void>) => {
    if (menuBusy) return;
    setMenuBusy(true);
    try {
      await fn();
      setMenu(null);
    } finally {
      setMenuBusy(false);
    }
  };

  return (
    <nav
      className={`progress-stepper progress-stepper--${orientation}`}
      aria-label={t('bulletin.stepperLabel')}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          const sectionId = replaceTargetRef.current;
          replaceTargetRef.current = null;
          if (fileInputRef.current) fileInputRef.current.value = '';
          if (!file || !sectionId || !onReplacePptx) return;
          void runAction(() => onReplacePptx(sectionId, file));
        }}
      />
      <ol ref={listRef} className="progress-stepper-list">
        {steps.map((step, index) => {
          const depth = step.depth ?? 0;
          const isFocused = index === focusIndex;
          const isEditing =
            index === currentIndex && previewIndex != null && previewIndex !== currentIndex;
          const isComplete = index < focusIndex;
          const isDisabled = step.enabled === false;
          const isReadonly = Boolean(step.readonly);
          const isGroup = Boolean(step.groupOnly);
          const canSelect = !isDisabled && Boolean(onStepSelect);
          const isSectionHidden = step.visible === false;
          const showMenuTrigger =
            canManage && (!isGroup || step.id === 'announcements_group');
          const topLevelNumber =
            depth === 0
              ? steps.slice(0, index + 1).filter((s) => (s.depth ?? 0) === 0).length
              : null;

          return (
            <li
              key={step.id}
              data-step-index={index}
              data-depth={depth}
              className={`progress-stepper-item${isFocused ? ' is-current' : ''}${isEditing ? ' is-editing' : ''}${isComplete ? ' is-complete' : ''}${isDisabled ? ' is-disabled' : ''}${isReadonly ? ' is-readonly' : ''}${isSectionHidden ? ' is-section-hidden' : ''}${isGroup ? ' is-group' : ''}${step.hasChildren ? ' has-children' : ''}${depth > 0 ? ' is-nested' : ''}`}
              style={depth > 0 ? { paddingLeft: `${depth * 0.85}rem` } : undefined}
              onContextMenu={(e) => {
                if (!showMenuTrigger || isDisabled) return;
                e.preventDefault();
                openMenu(step.id, e.clientX, e.clientY);
              }}
              title={showMenuTrigger ? t('bulletin.sectionContextMenuHint') : undefined}
            >
              {canSelect ? (
                <button
                  type="button"
                  className="progress-stepper-btn"
                  onClick={() => onStepSelect?.(index)}
                  aria-current={isFocused ? 'step' : undefined}
                >
                  <span className="progress-stepper-index">{topLevelNumber ?? '·'}</span>
                  <span className="progress-stepper-label">{step.label}</span>
                </button>
              ) : (
                <span className="progress-stepper-btn progress-stepper-btn--static">
                  <span className="progress-stepper-index">{topLevelNumber ?? '·'}</span>
                  <span className="progress-stepper-label">{step.label}</span>
                </span>
              )}
              {showMenuTrigger ? (
                <button
                  type="button"
                  className="progress-stepper-menu-btn"
                  title={t('bulletin.sectionContextMenu')}
                  aria-label={t('bulletin.sectionContextMenu')}
                  disabled={isDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    openMenu(step.id, rect.right, rect.top);
                  }}
                >
                  ⋯
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {menu && activeStep
        ? createPortal(
            <div
              ref={menuRef}
              className="progress-stepper-context-menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              aria-label={t('bulletin.sectionContextMenu')}
            >
              <p className="progress-stepper-context-menu-title">{activeStep.label}</p>
              {isAnnouncementsGroup && onAddAnnouncement ? (
                <button
                  type="button"
                  role="menuitem"
                  className="progress-stepper-context-menu-item"
                  disabled={menuBusy}
                  onClick={() => void runAction(() => onAddAnnouncement())}
                >
                  {t('bulletin.addAnnouncement')}
                </button>
              ) : null}
              {canSlides && onEditSlides ? (
                <button
                  type="button"
                  role="menuitem"
                  className="progress-stepper-context-menu-item"
                  disabled={menuBusy}
                  onClick={() =>
                    void runAction(() => {
                      onEditSlides(menu.sectionId);
                    })
                  }
                >
                  {t('bulletin.editSlides')}
                </button>
              ) : null}
              {canSlides && onReplacePptx ? (
                <button
                  type="button"
                  role="menuitem"
                  className="progress-stepper-context-menu-item"
                  disabled={menuBusy}
                  onClick={() => {
                    replaceTargetRef.current = menu.sectionId;
                    setMenu(null);
                    fileInputRef.current?.click();
                  }}
                >
                  {menu.sectionId === 'message'
                    ? t('bulletin.editSlidesAppendUpload')
                    : t('bulletin.editSlidesReplaceUpload')}
                </button>
              ) : null}
              {canSlides && hasOverride && onResetPptx ? (
                <button
                  type="button"
                  role="menuitem"
                  className="progress-stepper-context-menu-item"
                  disabled={menuBusy}
                  onClick={() =>
                    void runAction(() => onResetPptx(menu.sectionId))
                  }
                >
                  {t('bulletin.editSlidesReset')}
                </button>
              ) : null}
              {canVisibility ? (
                <>
                  <div className="progress-stepper-context-menu-sep" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="progress-stepper-context-menu-item"
                    disabled={menuBusy}
                    onClick={() =>
                      void runAction(() => {
                        onStepVisibilityChange?.(menu.sectionId, isHidden);
                      })
                    }
                  >
                    {isHidden
                      ? t('bulletin.sectionShow')
                      : t('bulletin.sectionHide')}
                  </button>
                </>
              ) : null}
              {isAnnouncementItem && onRemoveAnnouncement ? (
                <>
                  <div className="progress-stepper-context-menu-sep" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="progress-stepper-context-menu-item"
                    disabled={menuBusy}
                    onClick={() =>
                      void runAction(() => onRemoveAnnouncement(menu.sectionId))
                    }
                  >
                    {t('bulletin.removeAnnouncement')}
                  </button>
                </>
              ) : null}
              {!isAnnouncementsGroup &&
              !canSlides &&
              !isAnnouncementItem ? (
                <p className="progress-stepper-context-menu-empty">
                  {t('bulletin.sectionContextMenuEmpty')}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </nav>
  );
}
