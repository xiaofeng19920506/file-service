import { useI18n } from '../../../../i18n';
import RibbonButton from '../RibbonButton';
import RibbonGroup from '../RibbonGroup';
import type { RibbonIconName } from '../icons';

export type PlaceholderGroup = {
  labelKey: string;
  items: { icon: RibbonIconName; labelKey: string; large?: boolean }[];
};

/** 尚未实现的标签页：保留 Office 的分组结构，命令全部灰显 */
export default function PlaceholderTab({ groups }: { groups: PlaceholderGroup[] }) {
  const { t } = useI18n();
  const todo = t('ppt.ribbon.notImplemented');

  return (
    <>
      {groups.map((g) => (
        <RibbonGroup key={g.labelKey} label={t(g.labelKey)}>
          {g.items.some((i) => i.large) && (
            <>
              {g.items
                .filter((i) => i.large)
                .map((i) => (
                  <RibbonButton
                    key={i.labelKey}
                    icon={i.icon}
                    label={t(i.labelKey)}
                    size="large"
                    notImplemented
                    notImplementedHint={todo}
                  />
                ))}
            </>
          )}
          {g.items.some((i) => !i.large) && (
            <div className="ppt-rb-col">
              {g.items
                .filter((i) => !i.large)
                .map((i) => (
                  <RibbonButton
                    key={i.labelKey}
                    icon={i.icon}
                    label={t(i.labelKey)}
                    notImplemented
                    notImplementedHint={todo}
                  />
                ))}
            </div>
          )}
        </RibbonGroup>
      ))}
    </>
  );
}

export const DESIGN_GROUPS: PlaceholderGroup[] = [
  {
    labelKey: 'ppt.ribbon.groupThemes',
    items: [{ icon: 'theme', labelKey: 'ppt.ribbon.themes', large: true }],
  },
  {
    labelKey: 'ppt.ribbon.groupVariants',
    items: [
      { icon: 'theme', labelKey: 'ppt.ribbon.variants', large: true },
      { icon: 'shapeFill', labelKey: 'ppt.ribbon.colors' },
      { icon: 'changeCase', labelKey: 'ppt.ribbon.fonts' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupCustomize',
    items: [
      { icon: 'layout', labelKey: 'ppt.ribbon.slideSize' },
      { icon: 'picture', labelKey: 'ppt.ribbon.formatBackground' },
    ],
  },
];

export const TRANSITIONS_GROUPS: PlaceholderGroup[] = [
  {
    labelKey: 'ppt.ribbon.groupPreview',
    items: [{ icon: 'play', labelKey: 'ppt.ribbon.preview', large: true }],
  },
  {
    labelKey: 'ppt.ribbon.groupTransitionTo',
    items: [
      { icon: 'transition', labelKey: 'ppt.ribbon.transitionEffects', large: true },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.effectOptions' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupTiming',
    items: [
      { icon: 'audio', labelKey: 'ppt.ribbon.transitionSound' },
      { icon: 'dateTime', labelKey: 'ppt.ribbon.transitionDuration' },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.applyToAll' },
    ],
  },
];

export const ANIMATIONS_GROUPS: PlaceholderGroup[] = [
  {
    labelKey: 'ppt.ribbon.groupPreview',
    items: [{ icon: 'play', labelKey: 'ppt.ribbon.preview', large: true }],
  },
  {
    labelKey: 'ppt.ribbon.groupAnimation',
    items: [
      { icon: 'animation', labelKey: 'ppt.ribbon.animationEffects', large: true },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.effectOptions' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupAdvancedAnimation',
    items: [
      { icon: 'animation', labelKey: 'ppt.ribbon.addAnimation' },
      { icon: 'selectPane', labelKey: 'ppt.ribbon.animationPane' },
      { icon: 'formatPainter', labelKey: 'ppt.ribbon.animationPainter' },
    ],
  },
];

export const SLIDESHOW_GROUPS: PlaceholderGroup[] = [
  {
    labelKey: 'ppt.ribbon.groupStartShow',
    items: [
      { icon: 'play', labelKey: 'ppt.ribbon.fromBeginning', large: true },
      { icon: 'play', labelKey: 'ppt.ribbon.fromCurrent' },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.customShow' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupSetUp',
    items: [
      { icon: 'placeholder', labelKey: 'ppt.ribbon.setUpShow' },
      { icon: 'dateTime', labelKey: 'ppt.ribbon.rehearseTimings' },
      { icon: 'audio', labelKey: 'ppt.ribbon.recordShow' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupMonitors',
    items: [
      { icon: 'placeholder', labelKey: 'ppt.ribbon.monitor' },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.presenterView' },
    ],
  },
];

export const REVIEW_GROUPS: PlaceholderGroup[] = [
  {
    labelKey: 'ppt.ribbon.groupProofing',
    items: [
      { icon: 'spelling', labelKey: 'ppt.ribbon.spelling', large: true },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.thesaurus' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupComments',
    items: [
      { icon: 'comment', labelKey: 'ppt.ribbon.newComment', large: true },
      { icon: 'selectPane', labelKey: 'ppt.ribbon.showComments' },
    ],
  },
  {
    labelKey: 'ppt.ribbon.groupCompare',
    items: [
      { icon: 'placeholder', labelKey: 'ppt.ribbon.compare' },
      { icon: 'placeholder', labelKey: 'ppt.ribbon.endReview' },
    ],
  },
];
