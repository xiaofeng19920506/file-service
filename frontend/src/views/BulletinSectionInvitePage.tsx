import { useEffect, useRef, useState } from 'react';
import {
  fetchBulletinSectionInvite,
  uploadBulletinSectionInvitePptx,
  type BulletinSectionInviteInfo,
} from '../api/bulletins';
import { friendlyError } from '../lib/error-messages';
import { isPptxFileName } from '../lib/bulletin-section-pptx';
import { useI18n } from '../i18n';

type BulletinSectionInvitePageProps = {
  token: string;
};

type Phase = 'loading' | 'ready' | 'done-upload' | 'done-skip' | 'error';

export default function BulletinSectionInvitePage({ token }: BulletinSectionInvitePageProps) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<BulletinSectionInviteInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setError(null);
    void fetchBulletinSectionInvite(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
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
  }, [token, t]);

  const handleUpload = async () => {
    if (!file || uploading) return;
    if (!isPptxFileName(file.name)) {
      setError(friendlyError('invalid_pptx', t));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadBulletinSectionInvitePptx(token, file);
      setPhase('done-upload');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'upload_failed', t));
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="bulletin-section-invite-page">
      <div className="bulletin-section-invite-card">
        <h1>{t('bulletin.pastorInviteLandingTitle')}</h1>

        {phase === 'loading' ? (
          <p className="playlists-muted">{t('bulletin.pastorInviteLandingLoading')}</p>
        ) : null}

        {phase === 'error' ? (
          <p className="form-error">{error ?? t('bulletin.pastorInviteLandingInvalid')}</p>
        ) : null}

        {phase === 'ready' && info ? (
          <>
            <p>
              {t('bulletin.pastorInviteLandingIntroSimple', {
                date: info.serviceDate,
              })}
            </p>
            {info.hasPptxOverride ? (
              <p className="playlists-muted">{t('bulletin.pastorInviteLandingHasOverride')}</p>
            ) : null}

            <label className="share-playlist-field">
              <span>{t('bulletin.pastorInviteLandingChooseFile')}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

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
                  : t('bulletin.pastorInviteLandingUpload')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={uploading}
                onClick={() => setPhase('done-skip')}
              >
                {t('bulletin.pastorInviteLandingSkip')}
              </button>
            </div>
          </>
        ) : null}

        {phase === 'done-upload' ? (
          <>
            <p className="form-success">{t('bulletin.pastorInviteLandingUploaded')}</p>
            <p className="playlists-muted">{t('bulletin.pastorInviteLandingDone')}</p>
          </>
        ) : null}

        {phase === 'done-skip' ? (
          <>
            <p className="form-success">{t('bulletin.pastorInviteLandingSkipped')}</p>
            <p className="playlists-muted">{t('bulletin.pastorInviteLandingDone')}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
