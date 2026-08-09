import { useEffect, useState } from 'react';
import { bulletinSectionInvitePreviewUrl } from '../../api/bulletins';
import { useI18n } from '../../i18n';
import { slideAspectRatioStyle } from '../../lib/bulletin-slide-aspect';

type BulletinSectionInvitePreviewProps = {
  token: string;
  slideCount: number;
  /** 金句即时预览正文；PPT 预览可省略 */
  verseOfWeek?: string;
  /** 强制刷新（如上传后的 pptxBlobId） */
  cacheKey?: string;
  title?: string;
};

function InviteSlideThumb({
  token,
  slide,
  verseOfWeek,
  cacheKey,
  label,
}: {
  token: string;
  slide: number;
  verseOfWeek?: string;
  cacheKey?: string;
  label: string;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const aspectStyle = slideAspectRatioStyle();

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setFailed(false);
    setSrc(null);

    const url = bulletinSectionInvitePreviewUrl(token, slide, { verseOfWeek, cacheKey });
    void fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`preview_${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, slide, verseOfWeek, cacheKey]);

  return (
    <figure className="bulletin-section-invite-preview-slide" style={aspectStyle}>
      {src ? (
        <img src={src} alt={label} className="bulletin-section-invite-preview-img" />
      ) : failed ? (
        <div className="bulletin-section-invite-preview-fallback">
          {t('bulletin.pastorInviteLandingPreviewUnavailable')}
        </div>
      ) : (
        <div className="bulletin-section-invite-preview-fallback">
          <span className="preview-spinner" />
        </div>
      )}
      <figcaption className="bulletin-section-invite-preview-caption">{label}</figcaption>
    </figure>
  );
}

export default function BulletinSectionInvitePreview({
  token,
  slideCount,
  verseOfWeek,
  cacheKey,
  title,
}: BulletinSectionInvitePreviewProps) {
  const { t } = useI18n();
  if (slideCount < 1) return null;

  const slides = Array.from({ length: slideCount }, (_, i) => i + 1);

  return (
    <section className="bulletin-section-invite-preview" aria-label={title ?? t('bulletin.pastorInviteLandingPreview')}>
      <p className="bulletin-section-invite-existing-title">
        {title ?? t('bulletin.pastorInviteLandingPreview')}
      </p>
      <div className="bulletin-section-invite-preview-grid">
        {slides.map((slide) => (
          <InviteSlideThumb
            key={`${cacheKey ?? ''}-${slide}-${verseOfWeek ?? ''}`}
            token={token}
            slide={slide}
            verseOfWeek={verseOfWeek}
            cacheKey={cacheKey}
            label={t('bulletin.pastorInviteLandingPreviewSlide', { n: slide })}
          />
        ))}
      </div>
    </section>
  );
}
