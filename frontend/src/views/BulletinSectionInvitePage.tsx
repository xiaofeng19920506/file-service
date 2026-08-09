import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bulletinSectionInvitePptxDownloadUrl,
  fetchBulletinSectionInvite,
  submitBulletinSectionInviteVerse,
  uploadBulletinSectionInvitePptx,
  type BulletinSectionInviteInfo,
} from '../api/bulletins';
import BulletinSectionInvitePreview from '../components/bulletin/BulletinSectionInvitePreview';
import { friendlyError } from '../lib/error-messages';
import { isPptxFileName } from '../lib/bulletin-section-pptx';
import { useI18n } from '../i18n';

type BulletinSectionInvitePageProps = {
  token: string;
};

type Phase = 'loading' | 'ready' | 'error';

export default function BulletinSectionInvitePage({ token }: BulletinSectionInvitePageProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<BulletinSectionInviteInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [verseDraft, setVerseDraft] = useState('');
  const [previewVerse, setPreviewVerse] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchBulletinSectionInvite(token);
    setInfo(data);
    if (data.sectionId === 'verse_of_week') {
      const verse = data.verseOfWeek ?? '';
      setVerseDraft(verse);
      setPreviewVerse(verse);
    }
    return data;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setError(null);
    setSuccess(null);
    void reload()
      .then(() => {
        if (cancelled) return;
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          friendlyError(
            err instanceof Error ? err.message : 'invalid_invite_token',
            t,
          ),
        );
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reload, t]);

  // 金句输入停顿后再刷新预览，避免每字打 LibreOffice
  useEffect(() => {
    if (info?.sectionId !== 'verse_of_week') return;
    const timer = window.setTimeout(() => setPreviewVerse(verseDraft), 700);
    return () => window.clearTimeout(timer);
  }, [verseDraft, info?.sectionId]);

  const handleUpload = async () => {
    if (!file || uploading) return;
    if (!isPptxFileName(file.name)) {
      setError(friendlyError('invalid_pptx', t));
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadBulletinSectionInvitePptx(token, file);
      await reload();
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setSuccess(t('bulletin.pastorInviteLandingUploadedKeepEditing'));
      setPhase('ready');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'upload_failed', t));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitVerse = async () => {
    if (uploading) return;
    const verse = verseDraft.trim();
    if (!verse) {
      setError(friendlyError('verse_required', t));
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await submitBulletinSectionInviteVerse(token, verse);
      await reload();
      setSuccess(t('bulletin.versePastorInviteLandingSubmittedKeepEditing'));
      setPhase('ready');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'update_failed', t));
    } finally {
      setUploading(false);
    }
  };

  const isVerse = info?.sectionId === 'verse_of_week';
  const downloadUrl = bulletinSectionInvitePptxDownloadUrl(token);
  const pptxCacheKey = useMemo(
    () => `${info?.pptxBlobId ?? ''}:${info?.pptxUploadedAt ?? ''}`,
    [info?.pptxBlobId, info?.pptxUploadedAt],
  );

  return (
    <main className="bulletin-section-invite-page">
      <div className="bulletin-section-invite-card">
        <h1>
          {isVerse
            ? t('bulletin.versePastorInviteLandingTitle')
            : t('bulletin.pastorInviteLandingTitle')}
        </h1>

        {phase === 'loading' ? (
          <p className="playlists-muted">{t('bulletin.pastorInviteLandingLoading')}</p>
        ) : null}

        {phase === 'error' ? (
          <p className="form-error">{error ?? t('bulletin.pastorInviteLandingInvalid')}</p>
        ) : null}

        {phase === 'ready' && info ? (
          isVerse ? (
            <>
              <p>
                {t('bulletin.versePastorInviteLandingIntroSimple', {
                  date: info.serviceDate,
                })}
              </p>
              <p className="playlists-muted">{t('bulletin.pastorInviteLandingRevisitHint')}</p>

              {info.verseOfWeek?.trim() ? (
                <div className="bulletin-section-invite-existing">
                  <p className="bulletin-section-invite-existing-title">
                    {t('bulletin.versePastorInviteLandingCurrent')}
                  </p>
                  <p className="bulletin-verse-current-text">{info.verseOfWeek}</p>
                </div>
              ) : (
                <p className="playlists-muted">{t('bulletin.versePastorInviteLandingEmpty')}</p>
              )}

              <BulletinSectionInvitePreview
                token={token}
                slideCount={info.previewSlideCount ?? 1}
                verseOfWeek={previewVerse}
                cacheKey={previewVerse}
                title={t('bulletin.versePastorInviteLandingPreview')}
              />

              <label className="share-playlist-field">
                <span>{t('bulletin.versePastorInviteLandingBodyLabel')}</span>
                <textarea
                  className="playlists-text-input bulletin-verse-invite-textarea"
                  rows={6}
                  value={verseDraft}
                  disabled={uploading}
                  onChange={(e) => {
                    setVerseDraft(e.target.value);
                    setSuccess(null);
                  }}
                />
              </label>
              {success ? <p className="form-success">{success}</p> : null}
              {error ? <p className="form-error">{error}</p> : null}
              <div className="bulletin-section-invite-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={uploading || !verseDraft.trim()}
                  onClick={() => void handleSubmitVerse()}
                >
                  {uploading
                    ? t('bulletin.versePastorInviteLandingSubmitting')
                    : info.verseOfWeek?.trim()
                      ? t('bulletin.versePastorInviteLandingUpdate')
                      : t('bulletin.versePastorInviteLandingSubmit')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {t('bulletin.pastorInviteLandingIntroSimple', {
                  date: info.serviceDate,
                })}
              </p>
              <p className="playlists-muted">{t('bulletin.pastorInviteLandingRevisitHint')}</p>

              {info.hasPptxOverride ? (
                <div className="bulletin-section-invite-existing">
                  <p className="bulletin-section-invite-existing-title">
                    {t('bulletin.pastorInviteLandingCurrentFile')}
                  </p>
                  <p className="bulletin-section-invite-existing-name" title={info.pptxFileName ?? ''}>
                    {info.pptxFileName || t('bulletin.pastorInviteLandingHasOverride')}
                  </p>
                  {info.pptxUploadedAt ? (
                    <p className="playlists-muted">
                      {t('bulletin.pastorInviteLandingUploadedAt', {
                        time: new Date(info.pptxUploadedAt).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                  <a
                    className="btn-secondary btn-sm"
                    href={downloadUrl}
                    download={info.pptxFileName || undefined}
                  >
                    {t('bulletin.pastorInviteLandingDownload')}
                  </a>
                </div>
              ) : (
                <p className="playlists-muted">{t('bulletin.pastorInviteLandingNoFileYet')}</p>
              )}

              {info.hasPptxOverride && (info.previewSlideCount ?? 0) > 0 ? (
                <BulletinSectionInvitePreview
                  token={token}
                  slideCount={info.previewSlideCount ?? 0}
                  cacheKey={pptxCacheKey}
                />
              ) : null}

              <label className="share-playlist-field">
                <span>
                  {info.hasPptxOverride
                    ? t('bulletin.pastorInviteLandingReplaceFile')
                    : t('bulletin.pastorInviteLandingChooseFile')}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  disabled={uploading}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setSuccess(null);
                  }}
                />
              </label>

              {success ? <p className="form-success">{success}</p> : null}
              {error ? <p className="form-error">{error}</p> : null}

              <div className="bulletin-section-invite-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!file || uploading}
                  onClick={() => void handleUpload()}
                >
                  {uploading
                    ? t('bulletin.pastorInviteLandingUploading')
                    : info.hasPptxOverride
                      ? t('bulletin.pastorInviteLandingReplace')
                      : t('bulletin.pastorInviteLandingUpload')}
                </button>
              </div>
            </>
          )
        ) : null}
      </div>
    </main>
  );
}
