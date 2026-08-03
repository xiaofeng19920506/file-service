import { useI18n } from '../../i18n';
import { upcomingSundayIso } from '../../lib/bulletin-date';

const DEFAULT_SERVICE_TIME = '11:00';

function normalizeTimeValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return DEFAULT_SERVICE_TIME;
  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return DEFAULT_SERVICE_TIME;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

type BulletinCoverStepProps = {
  serviceDate: string;
  serviceTime: string;
  canEdit: boolean;
  onServiceDateChange: (isoDate: string) => void;
  onServiceTimeChange: (time: string) => void;
  onCoverPreviewFocus?: () => void;
};

export default function BulletinCoverStep({
  serviceDate,
  serviceTime,
  canEdit,
  onServiceDateChange,
  onServiceTimeChange,
  onCoverPreviewFocus,
}: BulletinCoverStepProps) {
  const { t } = useI18n();
  const autoSunday = upcomingSundayIso();
  const dateValue = serviceDate || autoSunday;
  const timeValue = normalizeTimeValue(serviceTime || DEFAULT_SERVICE_TIME);

  return (
    <div className="bulletin-cover-step">
      <div className="bulletin-cover-step-fields">
        <label className="bulletin-field">
          {t('bulletin.pickServiceDate')}
          <input
            type="date"
            value={dateValue}
            disabled={!canEdit}
            onChange={(e) => onServiceDateChange(e.target.value)}
            onFocus={onCoverPreviewFocus}
            onClick={onCoverPreviewFocus}
          />
        </label>
        <label className="bulletin-field">
          {t('bulletin.serviceTime')}
          <input
            type="time"
            value={timeValue}
            disabled={!canEdit}
            step={300}
            onChange={(e) => onServiceTimeChange(normalizeTimeValue(e.target.value))}
            onFocus={onCoverPreviewFocus}
            onClick={onCoverPreviewFocus}
          />
        </label>
      </div>
    </div>
  );
}
