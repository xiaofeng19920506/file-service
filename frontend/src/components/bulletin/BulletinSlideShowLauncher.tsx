import { useMemo, useState } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { upcomingSundayIso } from '../../lib/bulletin-date';
import {
  previewPatchFull,
  sectionPptxOverridesKey,
} from '../../lib/bulletin-preview-patch';
import {
  bulletinDynamicTextOverrides,
  bulletinDynamicTextOverridesKey,
  mergeSlideTextOverrides,
} from '../../lib/bulletin-pptx-patches';
import { startBulletinSlideShow } from '../../lib/bulletin-slideshow-launcher';

type BulletinSlideShowLauncherProps = {
  bulletin: WeeklyBulletin;
  initialSlide?: number;
  /** 当前 deck plan 实际页数；不传则回退模板页数 */
  totalSlides?: number;
  className?: string;
  disabled?: boolean;
  /** 投影会话已打开（主页可跟随翻页同步左侧分区） */
  onSessionStarted?: (sessionId: string) => void;
};

export default function BulletinSlideShowLauncher({
  bulletin,
  initialSlide = 1,
  totalSlides,
  className,
  disabled = false,
  onSessionStarted,
}: BulletinSlideShowLauncherProps) {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dynamicOverridesKey = bulletinDynamicTextOverridesKey(bulletin);
  const patch = useMemo(
    () =>
      previewPatchFull({
        serviceDate: bulletin.serviceDate || upcomingSundayIso(),
        serviceTime: bulletin.serviceTime || '11:00',
        scriptureBook: bulletin.scriptureBook,
        scriptureReference: bulletin.scriptureReference,
        showPreServiceChairName: bulletin.showPreServiceChairName,
        preServiceChairNames: bulletin.preServiceChairNames,
        birthdayMonth: bulletin.birthdayMonth,
        birthdayNames: bulletin.birthdayNames,
        verseOfWeek: bulletin.verseOfWeek,
        announcements: (bulletin.announcements ?? []).map((a) => ({
          id: a.id,
          title: a.title ?? '',
          body: a.body,
        })),
        hiddenSections: bulletin.hiddenSections,
        skipTestimonyWeek: bulletin.skipTestimonyWeek,
        skipDepartmentReports: bulletin.skipDepartmentReports,
        weeklyMeetingVariant: bulletin.weeklyMeetingVariant,
        slideTextOverrides: mergeSlideTextOverrides(
          bulletinDynamicTextOverrides(bulletin),
          bulletin.slideTextOverrides,
        ),
        bulletinId: bulletin.id,
        sectionPptxKey: sectionPptxOverridesKey(bulletin.sectionPptxOverrides),
      }),
    [
      bulletin.id,
      bulletin.serviceDate,
      bulletin.serviceTime,
      bulletin.scriptureBook,
      bulletin.scriptureReference,
      bulletin.showPreServiceChairName,
      bulletin.preServiceChairNames,
      bulletin.birthdayMonth,
      bulletin.birthdayNames,
      bulletin.verseOfWeek,
      bulletin.hiddenSections,
      bulletin.skipTestimonyWeek,
      bulletin.skipDepartmentReports,
      bulletin.weeklyMeetingVariant,
      bulletin.slideTextOverrides,
      bulletin.sectionPptxOverrides,
      bulletin.announcements,
      dynamicOverridesKey,
    ],
  );

  const onStart = () => {
    setStarting(true);
    setError(null);
    void startBulletinSlideShow({ patch, initialSlide, totalSlides })
      .then((result) => {
        if (!result.ok) {
          setError(t('bulletin.slideShowPopupBlocked'));
          return;
        }
        onSessionStarted?.(result.sessionId);
      })
      .finally(() => setStarting(false));
  };

  return (
    <div className="bulletin-slideshow-launcher">
      <button
        type="button"
        className={className ?? 'btn-primary bulletin-slideshow-start'}
        disabled={disabled || starting}
        onClick={onStart}
      >
        {starting ? t('bulletin.slideShowStarting') : t('bulletin.startSlideShow')}
      </button>
      {error && <p className="form-error bulletin-slideshow-launcher-error">{error}</p>}
    </div>
  );
}
