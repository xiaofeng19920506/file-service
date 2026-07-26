import { useState } from 'react';
import type { BulletinSlidePreviewParams } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { startBulletinSlideShow } from '../../lib/bulletin-slideshow-launcher';

type BulletinSlideShowLauncherProps = {
  patch: BulletinSlidePreviewParams;
  initialSlide?: number;
  /** 当前 deck plan 实际页数；不传则回退模板页数 */
  totalSlides?: number;
  className?: string;
};

export default function BulletinSlideShowLauncher({
  patch,
  initialSlide = 1,
  totalSlides,
  className,
}: BulletinSlideShowLauncherProps) {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onStart = () => {
    setStarting(true);
    setError(null);
    void startBulletinSlideShow({ patch, initialSlide, totalSlides })
      .then((result) => {
        if (!result.ok) setError(t('bulletin.slideShowPopupBlocked'));
      })
      .finally(() => setStarting(false));
  };

  return (
    <div className="bulletin-slideshow-launcher">
      <button
        type="button"
        className={className ?? 'btn-primary bulletin-slideshow-start'}
        disabled={starting}
        onClick={onStart}
      >
        {starting ? t('bulletin.slideShowStarting') : t('bulletin.startSlideShow')}
      </button>
      {error && <p className="form-error bulletin-slideshow-launcher-error">{error}</p>}
    </div>
  );
}
