import { useI18n } from '../../i18n';
import { formatBulletinCoverDate } from '../../lib/bulletin-date';

type BulletinCoverStepProps = {
  serviceDate: string;
  serviceTime: string;
  canEdit: boolean;
  saving?: boolean;
  onServiceDateChange: (isoDate: string) => void;
  onServiceTimeChange: (time: string) => void;
  onSave?: () => void;
};

export default function BulletinCoverStep({
  serviceDate,
  serviceTime,
  canEdit,
  saving,
  onServiceDateChange,
  onServiceTimeChange,
  onSave,
}: BulletinCoverStepProps) {
  const { t } = useI18n();
  const coverDateLabel = serviceDate ? formatBulletinCoverDate(serviceDate) : '—';

  return (
    <div className="bulletin-cover-step">
      <header className="bulletin-step-header">
        <h3>{t('bulletin.steps.coverTitle')}</h3>
        <p className="bulletin-step-intro">{t('bulletin.steps.coverIntro')}</p>
      </header>

      <div className="bulletin-cover-step-fields">
        <label className="bulletin-field">
          {t('bulletin.pickServiceDate')}
          <input
            type="date"
            value={serviceDate}
            disabled={!canEdit}
            onChange={(e) => onServiceDateChange(e.target.value)}
          />
        </label>
        <label className="bulletin-field">
          {t('bulletin.serviceTime')}
          <input
            type="text"
            value={serviceTime}
            disabled={!canEdit}
            placeholder="11:00"
            onChange={(e) => onServiceTimeChange(e.target.value)}
          />
        </label>
        <p className="bulletin-cover-date-hint">
          {t('bulletin.coverDatePreview', { date: coverDateLabel, time: serviceTime || '11:00' })}
        </p>
        {canEdit && onSave && (
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !serviceDate}
            onClick={onSave}
          >
            {saving ? t('bulletin.saving') : t('bulletin.saveCover')}
          </button>
        )}
      </div>
    </div>
  );
}
