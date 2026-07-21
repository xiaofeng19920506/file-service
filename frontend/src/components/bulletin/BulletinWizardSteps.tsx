import type { ReactNode } from 'react';
import type { SlideTextOverride, WeeklyBulletin } from '../../api/bulletins';
import { BIBLE_BOOKS } from '../../lib/bible-books';
import { useI18n } from '../../i18n';
import BulletinEditSlidesControl from './BulletinEditSlidesControl';
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
        <h3>{t(titleKey as 'bulletin.steps.coverTitle')}</h3>
        <p className="bulletin-step-intro">{t(introKey as 'bulletin.steps.coverIntro')}</p>
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

type SaveProps = {
  saving?: boolean;
  canEdit: boolean;
  onSave: () => void;
};

function SaveButton({ saving, canEdit, onSave }: SaveProps) {
  const { t } = useI18n();
  if (!canEdit) return null;
  return (
    <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
      {saving ? t('bulletin.saving') : t('bulletin.save')}
    </button>
  );
}

export type BulletinStepPanelProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  saving?: boolean;
  onPatch: <K extends keyof WeeklyBulletin>(key: K, value: WeeklyBulletin[K]) => void;
  onSave: () => void;
  sectionId: string;
  onSectionVisibilityChange: (sectionId: string, visible: boolean) => void;
  onSlideTextOverridesSaved: (overrides: SlideTextOverride[]) => void;
};

export function SectionVisibleCheckbox({
  sectionId,
  draft,
  canEdit,
  onSectionVisibilityChange,
}: {
  sectionId: string;
  draft: WeeklyBulletin;
  canEdit: boolean;
  onSectionVisibilityChange: (sectionId: string, visible: boolean) => void;
}) {
  const { t } = useI18n();
  const hidden = new Set(draft.hiddenSections ?? []);
  if (draft.skipTestimonyWeek) hidden.add('testimony_week');
  if (draft.skipDepartmentReports) hidden.add('department_reports');
  const visible = !hidden.has(sectionId);

  return (
    <label className="bulletin-field bulletin-field--checkbox">
      <input
        type="checkbox"
        checked={visible}
        disabled={!canEdit}
        onChange={(e) => onSectionVisibilityChange(sectionId, e.target.checked)}
      />
      <span>{t('bulletin.sectionVisible')}</span>
    </label>
  );
}

export function BulletinSectionControls({
  sectionId,
  draft,
  canEdit,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: {
  sectionId: string;
  draft: WeeklyBulletin;
  canEdit: boolean;
  onSectionVisibilityChange: (sectionId: string, visible: boolean) => void;
  onSlideTextOverridesSaved: (overrides: SlideTextOverride[]) => void;
}) {
  return (
    <div className="bulletin-section-controls">
      <SectionVisibleCheckbox
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
      />
      <BulletinEditSlidesControl
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSaved={onSlideTextOverridesSaved}
      />
    </div>
  );
}

export function BulletinReadonlySectionStep({
  sectionId,
  draft,
  canEdit,
  saving,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
  onSave,
}: {
  sectionId: string;
  draft: WeeklyBulletin;
  canEdit: boolean;
  saving?: boolean;
  onSectionVisibilityChange: (sectionId: string, visible: boolean) => void;
  onSlideTextOverridesSaved: (overrides: SlideTextOverride[]) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="bulletin-wizard-step">
      <header className="bulletin-step-header">
        <h3>{t('bulletin.sectionReadonlyTitle')}</h3>
        <p className="bulletin-step-intro">{t('bulletin.sectionReadonlyHint')}</p>
      </header>
      <div className="bulletin-cover-step-fields">
        <BulletinSectionControls
          sectionId={sectionId}
          draft={draft}
          canEdit={canEdit}
          onSectionVisibilityChange={onSectionVisibilityChange}
          onSlideTextOverridesSaved={onSlideTextOverridesSaved}
        />
        <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
      </div>
    </div>
  );
}

export function BulletinScriptureStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.scriptureTitle" introKey="bulletin.steps.scriptureIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
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
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}

export function BulletinOfferingStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.offeringTitle" introKey="bulletin.steps.offeringIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
      <TextField
        label={t('bulletin.lastWeekOffering')}
        value={draft.lastWeekOfferingDate}
        disabled={!canEdit}
        onChange={(v) => onPatch('lastWeekOfferingDate', v)}
      />
      <TextField
        label={t('bulletin.offeringQuarter')}
        value={draft.offeringQuarterLabel}
        disabled={!canEdit}
        onChange={(v) => onPatch('offeringQuarterLabel', v)}
      />
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}

export function BulletinBirthdayStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.birthdayTitle" introKey="bulletin.steps.birthdayIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
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
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}

export function BulletinPreServiceStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  const showChair = Boolean(draft.showPreServiceChairName);
  return (
    <StepShell titleKey="bulletin.steps.preServiceTitle" introKey="bulletin.steps.preServiceIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
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
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
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
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: AnnouncementsProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.announcementsTitle" introKey="bulletin.steps.announcementsIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
      {announcements.map((item, index) => (
        <div key={item.key} className="bulletin-announcement-block">
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
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}

export function BulletinVerseStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.verseTitle" introKey="bulletin.steps.verseIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
      <TextField
        label={t('bulletin.verseOfWeek')}
        value={draft.verseOfWeek}
        disabled={!canEdit}
        multiline
        onChange={(v) => onPatch('verseOfWeek', v)}
      />
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}

export function BulletinMoreStep({
  draft,
  canEdit,
  saving,
  onPatch,
  onSave,
  sectionId,
  onSectionVisibilityChange,
  onSlideTextOverridesSaved,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell titleKey="bulletin.steps.moreTitle" introKey="bulletin.steps.moreIntro">
      <BulletinSectionControls
        sectionId={sectionId}
        draft={draft}
        canEdit={canEdit}
        onSectionVisibilityChange={onSectionVisibilityChange}
        onSlideTextOverridesSaved={onSlideTextOverridesSaved}
      />
      <p className="bulletin-field-hint">{t('bulletin.sectionVisibleNavHint')}</p>
      <TextField
        label={t('bulletin.staffMeeting')}
        value={draft.staffMeetingDate}
        disabled={!canEdit}
        onChange={(v) => onPatch('staffMeetingDate', v)}
      />
      <TextField
        label={t('bulletin.testimonyShare')}
        value={draft.testimonyShareDate}
        disabled={!canEdit}
        onChange={(v) => onPatch('testimonyShareDate', v)}
      />
      <TextField
        label={t('bulletin.serviceRoster')}
        value={draft.serviceRosterText}
        disabled={!canEdit}
        multiline
        onChange={(v) => onPatch('serviceRosterText', v)}
      />
      <TextField
        label={t('bulletin.baptism')}
        value={draft.baptismText}
        disabled={!canEdit}
        onChange={(v) => onPatch('baptismText', v)}
      />
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
      <SaveButton saving={saving} canEdit={canEdit} onSave={onSave} />
    </StepShell>
  );
}
