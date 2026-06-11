import { actorLabel, formatAuditTime } from '../lib/audit';
import { useI18n } from '../i18n';

type BlobAuditInfoProps = {
  createdAt: string;
  updatedAt?: string | null;
  uploadedBy?: string | null;
  updatedBy?: string | null;
  compact?: boolean;
};

export default function BlobAuditInfo({
  createdAt,
  updatedAt,
  uploadedBy,
  updatedBy,
  compact = false,
}: BlobAuditInfoProps) {
  const { t, locale } = useI18n();
  const created = formatAuditTime(createdAt, locale);
  const updated = updatedAt ? formatAuditTime(updatedAt, locale) : null;
  const showUpdated = updated && updatedAt !== createdAt;

  if (compact) {
    return (
      <div className="blob-audit blob-audit-compact">
        <span className="meta-tag meta-tag-muted">
          {t('audit.created', { time: created, actor: actorLabel(uploadedBy, t) })}
        </span>
        {showUpdated && (
          <span className="meta-tag meta-tag-muted">
            {t('audit.updated', { time: updated, actor: actorLabel(updatedBy, t) })}
          </span>
        )}
      </div>
    );
  }

  return (
    <dl className="blob-audit">
      <div className="blob-audit-row">
        <dt>{t('audit.createdAt')}</dt>
        <dd>{created}</dd>
      </div>
      <div className="blob-audit-row">
        <dt>{t('audit.uploadedBy')}</dt>
        <dd>{actorLabel(uploadedBy, t)}</dd>
      </div>
      {showUpdated && (
        <>
          <div className="blob-audit-row">
            <dt>{t('audit.updatedAt')}</dt>
            <dd>{updated}</dd>
          </div>
          <div className="blob-audit-row">
            <dt>{t('audit.updatedBy')}</dt>
            <dd>{actorLabel(updatedBy, t)}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
