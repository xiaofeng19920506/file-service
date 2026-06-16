import { useState } from 'react';
import type { BulletinSlidePreviewParams } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { startBulletinSlideShow } from '../../lib/bulletin-slideshow-launcher';

type BulletinSlideShowLauncherProps = {
  patch: BulletinSlidePreviewParams;
  initialSlide?: number;
  className?: string;
};

export default function BulletinSlideShowLauncher({
  patch,
  initialSlide = 1,
  className,
}: BulletinSlideShowLauncherProps) {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onStart = () => {
    setStarting(true);
    setError(null);
    void startBulletinSlideShow({ patch, initialSlide })
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
