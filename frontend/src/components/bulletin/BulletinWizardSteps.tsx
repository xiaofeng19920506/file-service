import type { ReactNode } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { BIBLE_BOOKS } from '../../lib/bible-books';
import { useI18n } from '../../i18n';
import BulletinScriptureReferenceFields from './BulletinScriptureReferenceFields';

type StepShellProps = {
  titleKey: string;
  introKey: string;
  children: ReactNode;
};

function StepShell({ titleKey, introKey, children }: StepShellProps) {
  const { t } = useI18n();
  return (
    <div className="bulletin-wizard-step">
      <header className="bulletin-step-header">
        <h3>{t(titleKey as never)}</h3>
        <p className="bulletin-step-intro">{t(introKey as never)}</p>
      </header>
      <div className="bulletin-cover-step-fields">{children}</div>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  multiline?: boolean;
};

function TextField({ label, value, disabled, onChange, multiline }: FieldProps) {
  return (
    <label className="bulletin-field">
      {label}
      {multiline ? (
        <textarea rows={4} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  disabled?: boolean;
  placeholder: string;
  options: readonly string[];
  onChange: (value: string) => void;
};

function SelectField({ label, value, disabled, placeholder, options, onChange }: SelectFieldProps) {
  const hasCustomValue = Boolean(value) && !options.includes(value);
  return (
    <label className="bulletin-scripture-picker-field">
      <span className="bulletin-scripture-picker-label">{label}</span>
      <select
        className="bulletin-scripture-picker-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {hasCustomValue ? (
          <option value={value}>{value}</option>
        ) : null}
      </select>
    </label>
  );
}

export type BulletinStepPanelProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  saving?: boolean;
  onPatch: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void;
  /** 公告等仍走专用保存；其它分区自动同步，可不传 */
  onSave?: () => void;
};

export function BulletinScriptureStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.scriptureTitle" introKey="bulletin.steps.scriptureIntro">
      <div className="bulletin-scripture-picker">
        <SelectField
          label={t('bulletin.scriptureBook')}
          value={draft.scriptureBook}
          disabled={!canEdit}
          placeholder={t('bulletin.scriptureBookPlaceholder')}
          options={BIBLE_BOOKS}
          onChange={(v) => {
            if (v !== draft.scriptureBook) onPatch('scriptureReference', '');
            onPatch('scriptureBook', v);
          }}
        />
        <BulletinScriptureReferenceFields
          book={draft.scriptureBook}
          reference={draft.scriptureReference}
          disabled={!canEdit}
          onChange={(v) => onPatch('scriptureReference', v)}
        />
      </div>
      <p className="bulletin-field-hint">{t('bulletin.scriptureHint')}</p>
    </StepShell>
  );
}

export function BulletinOfferingStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  const tithe = draft.offeringTitheAmount ?? '';
  const other = draft.offeringOtherAmount ?? '';
  const totalDisplay =
    draft.offeringTotalAmount?.trim() ||
    (() => {
      const a = Number.parseFloat(String(tithe).replace(/[$,\s]/g, '')) || 0;
      const b = Number.parseFloat(String(other).replace(/[$,\s]/g, '')) || 0;
      if (!String(tithe).replace(/[$,\s]/g, '').trim() && !String(other).replace(/[$,\s]/g, '').trim()) {
        return '';
      }
      return (a + b).toFixed(2);
    })();

  return (
    <StepShell titleKey="bulletin.steps.offeringTitle" introKey="bulletin.steps.offeringIntro">
      <TextField
        label={t('bulletin.lastWeekOffering')}
        value={draft.lastWeekOfferingDate}
        disabled={!canEdit}
        onChange={(v) => onPatch('lastWeekOfferingDate', v)}
      />
      <TextField
        label={t('bulletin.offeringTithe')}
        value={tithe}
        disabled={!canEdit}
        onChange={(v) => onPatch('offeringTitheAmount', v)}
      />
      <TextField
        label={t('bulletin.offeringOther')}
        value={other}
        disabled={!canEdit}
        onChange={(v) => onPatch('offeringOtherAmount', v)}
      />
      <label className="bulletin-field">
        {t('bulletin.offeringTotal')}
        <input type="text" value={totalDisplay} disabled readOnly />
      </label>
      <p className="bulletin-field-hint">{t('bulletin.offeringTotalHint')}</p>
    </StepShell>
  );
}

export function BulletinBirthdayStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.birthdayTitle" introKey="bulletin.steps.birthdayIntro">
      <TextField
        label={t('bulletin.birthdayMonth')}
        value={draft.birthdayMonth}
        disabled={!canEdit}
        onChange={(v) => onPatch('birthdayMonth', v)}
      />
      <TextField
        label={t('bulletin.birthdayNames')}
        value={draft.birthdayNames}
        disabled={!canEdit}
        multiline
        onChange={(v) => onPatch('birthdayNames', v)}
      />
    </StepShell>
  );
}

export function BulletinPreServiceStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  const showChair = Boolean(draft.showPreServiceChairName);
  return (
    <StepShell titleKey="bulletin.steps.preServiceTitle" introKey="bulletin.steps.preServiceIntro">
      <label className="bulletin-field bulletin-field--checkbox">
        <input
          type="checkbox"
          checked={showChair}
          disabled={!canEdit}
          onChange={(e) => onPatch('showPreServiceChairName', e.target.checked)}
        />
        <span>{t('bulletin.showPreServiceChairName')}</span>
      </label>
      {showChair ? (
        <TextField
          label={t('bulletin.preServiceChairNames')}
          value={draft.preServiceChairNames ?? ''}
          disabled={!canEdit}
          onChange={(v) => onPatch('preServiceChairNames', v)}
        />
      ) : null}
      <p className="bulletin-field-hint">{t('bulletin.preServiceChairNamesHint')}</p>
    </StepShell>
  );
}

export type AnnouncementDraft = {
  key: string;
  category?: string;
  title?: string;
  body: string;
};

type AnnouncementsProps = BulletinStepPanelProps & {
  announcements: AnnouncementDraft[];
  onAnnouncementsChange: (next: AnnouncementDraft[]) => void;
};

export function BulletinAnnouncementsStep({
  draft,
  canEdit,
  saving,
  announcements,
  onAnnouncementsChange,
  onPatch,
  onSave,
}: AnnouncementsProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.announcementsTitle" introKey="bulletin.steps.announcementsIntro">
      {announcements.map((item, index) => (
        <div key={item.key} className="bulletin-announcement-block">
          <div className="bulletin-announcement-block-header">
            <span className="bulletin-announcement-block-label">
              {t('bulletin.announcementItem', { n: index + 1 })}
            </span>
            {canEdit && announcements.length > 1 ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={saving}
                onClick={() => {
                  onAnnouncementsChange(announcements.filter((_, i) => i !== index));
                }}
              >
                {t('bulletin.removeAnnouncement')}
              </button>
            ) : null}
          </div>
          <TextField
            label={t('bulletin.announcementTitle')}
            value={item.title ?? ''}
            disabled={!canEdit}
            onChange={(v) => {
              const next = [...announcements];
              next[index] = { ...item, title: v };
              onAnnouncementsChange(next);
            }}
          />
          <TextField
            label={t('bulletin.announcementBody')}
            value={item.body}
            disabled={!canEdit}
            multiline
            onChange={(v) => {
              const next = [...announcements];
              next[index] = { ...item, body: v };
              onAnnouncementsChange(next);
            }}
          />
        </div>
      ))}
      <TextField
        label={t('bulletin.baptism')}
        value={draft.baptismText}
        disabled={!canEdit}
        onChange={(v) => onPatch('baptismText', v)}
      />
      {canEdit ? (
        <div className="bulletin-announcement-actions">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={saving}
            onClick={() => {
              onAnnouncementsChange([
                ...announcements,
                { key: crypto.randomUUID(), category: 'general', title: '', body: '' },
              ]);
            }}
          >
            {t('bulletin.addAnnouncement')}
          </button>
          {onSave ? (
            <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
              {saving ? t('bulletin.saving') : t('bulletin.save')}
            </button>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}

export function BulletinVerseStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.verseTitle" introKey="bulletin.steps.verseIntro">
      <TextField
        label={t('bulletin.verseOfWeek')}
        value={draft.verseOfWeek}
        disabled={!canEdit}
        multiline
        onChange={(v) => onPatch('verseOfWeek', v)}
      />
    </StepShell>
  );
}

export function BulletinMoreStep({
  draft,
  canEdit,
  onPatch,
  sectionId,
}: BulletinStepPanelProps & { sectionId?: string }) {
  const { t } = useI18n();
  const show = (id: string) => !sectionId || sectionId === id;

  const titleKey =
    sectionId === 'staff_meeting'
      ? 'bulletin.sections.staff_meeting'
      : sectionId === 'future_testimony'
        ? 'bulletin.sections.future_testimony'
        : sectionId === 'service_roster'
          ? 'bulletin.sections.service_roster'
          : sectionId === 'weekly_meetings'
            ? 'bulletin.sections.weekly_meetings'
            : 'bulletin.steps.moreTitle';
  const introKey =
    sectionId === 'staff_meeting' ||
    sectionId === 'future_testimony' ||
    sectionId === 'service_roster' ||
    sectionId === 'weekly_meetings'
      ? 'bulletin.steps.sectionFieldIntro'
      : 'bulletin.steps.moreIntro';

  return (
    <StepShell titleKey={titleKey} introKey={introKey}>
      {show('staff_meeting') ? (
        <TextField
          label={t('bulletin.staffMeeting')}
          value={draft.staffMeetingDate}
          disabled={!canEdit}
          onChange={(v) => onPatch('staffMeetingDate', v)}
        />
      ) : null}
      {show('future_testimony') ? (
        <TextField
          label={t('bulletin.testimonyShare')}
          value={draft.testimonyShareDate}
          disabled={!canEdit}
          onChange={(v) => onPatch('testimonyShareDate', v)}
        />
      ) : null}
      {show('service_roster') ? (
        <TextField
          label={t('bulletin.serviceRoster')}
          value={draft.serviceRosterText}
          disabled={!canEdit}
          multiline
          onChange={(v) => onPatch('serviceRosterText', v)}
        />
      ) : null}
      {show('weekly_meetings') ? (
        <label className="bulletin-field">
          {t('bulletin.meetingVariant')}
          <select
            value={draft.weeklyMeetingVariant ?? ''}
            disabled={!canEdit}
            onChange={(e) =>
              onPatch('weeklyMeetingVariant', e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">{t('bulletin.meetingVariantDefault')}</option>
            <option value="28">{t('bulletin.meetingVariant28')}</option>
            <option value="29">{t('bulletin.meetingVariant29')}</option>
            <option value="30">{t('bulletin.meetingVariant30')}</option>
          </select>
        </label>
      ) : null}
    </StepShell>
  );
}
