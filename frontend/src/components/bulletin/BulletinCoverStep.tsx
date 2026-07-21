import { useI18n } from '../../i18n';
import { nextSundayIso } from '../../lib/bulletin-date';
import type { SlideTextOverride, WeeklyBulletin } from '../../api/bulletins';
import { BulletinSectionControls } from './BulletinWizardSteps';

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
  draft: WeeklyBulletin;
  canEdit: boolean;
  saving?: boolean;
  onServiceDateChange: (isoDate: string) => void;
  onServiceTimeChange: (time: string) => void;
  onSectionVisibilityChange: (sectionId: string, visible: boolean) => void;
  onSlideTextOverridesSaved: (overrides: SlideTextOverride[]) => void;
  onSave?: () => void;
  onCoverPreviewFocus?: () => void;
};

export default function BulletinCoverStep({
  serviceDate,
  serviceTime,
  draft,
  canEdit,
  saving,
  onServiceDateChange,
  onServiceTimeChange,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
  onSave,
  onCoverPreviewFocus,
}: BulletinCoverStepProps) {
  const { t } = useI18n();
  const dateValue = serviceDate || nextSundayIso();
  const timeValue = normalizeTimeValue(serviceTime || DEFAULT_SERVICE_TIME);

  return (
    <div className="bulletin-cover-step">
      <header className="bulletin-step-header">
        <h3>{t('bulletin.steps.coverTitle')}</h3>
        <p className="bulletin-step-intro">{t('bulletin.steps.coverIntro')}</p>
      </header>

      <div className="bulletin-cover-step-fields">
        <BulletinSectionControls
          sectionId="cover"
          draft={draft}
          canEdit={canEdit}
          onSectionVisibilityChange={onSectionVisibilityChange}
          onSlideTextOverridesSaved={onSlideTextOverridesSaved}
        />
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
        {canEdit && onSave && (
          <button
            type="button"
            className="btn-primary"
            disabled={saving || !dateValue}
            onClick={onSave}
          >
            {saving ? t('bulletin.saving') : t('bulletin.saveCover')}
          </button>
        )}
      </div>
    </div>
  );
}
