import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { BIBLE_BOOKS } from '../../lib/bible-books';
import { useI18n } from '../../i18n';
import BulletinScriptureReferenceFields from './BulletinScriptureReferenceFields';
import {
  BIRTHDAY_NAME_MAX,
  arrangeBirthdayNames,
  joinBirthdayNames,
  moveBirthdayName,
  parseBirthdayNames,
} from '../../lib/bulletin-birthday';

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
  /** 输入过程只改本地；失焦 / 单行 Enter 再提交 */
  commitOnBlur?: boolean;
};

function TextField({ label, value, disabled, onChange, multiline, commitOnBlur }: FieldProps) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (local !== value) onChange(local);
  };

  if (multiline) {
    return (
      <label className="bulletin-field">
        {label}
        <textarea
          rows={4}
          value={commitOnBlur ? local : value}
          disabled={disabled}
          onChange={(e) => (commitOnBlur ? setLocal(e.target.value) : onChange(e.target.value))}
          onBlur={commitOnBlur ? commit : undefined}
        />
      </label>
    );
  }

  return (
    <label className="bulletin-field">
      {label}
      <input
        type="text"
        value={commitOnBlur ? local : value}
        disabled={disabled}
        onChange={(e) => (commitOnBlur ? setLocal(e.target.value) : onChange(e.target.value))}
        onBlur={commitOnBlur ? commit : undefined}
        onKeyDown={
          commitOnBlur
            ? (e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }
            : undefined
        }
      />
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
        commitOnBlur
        onChange={(v) => onPatch('lastWeekOfferingDate', v)}
      />
      <TextField
        label={t('bulletin.offeringTithe')}
        value={tithe}
        disabled={!canEdit}
        commitOnBlur
        onChange={(v) => onPatch('offeringTitheAmount', v)}
      />
      <TextField
        label={t('bulletin.offeringOther')}
        value={other}
        disabled={!canEdit}
        commitOnBlur
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
  const namesFromDraft = parseBirthdayNames(draft.birthdayNames);
  // 本地保留空行：joinBirthdayNames 会滤掉空字符串，不能只用 draft 驱动 UI
  const [rows, setRows] = useState<string[]>(() =>
    namesFromDraft.length > 0 ? namesFromDraft : [''],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const parsed = parseBirthdayNames(draft.birthdayNames);
    const next = parsed.length > 0 ? parsed : [''];
    setRows((prev) => {
      const prevFilled = prev.map((s) => s.trim()).filter(Boolean);
      const nextFilled = next.map((s) => s.trim()).filter(Boolean);
      // 草稿名单未变时保留用户正在编辑的本地行（含空 input）
      if (
        prevFilled.join('\n') === nextFilled.join('\n') &&
        prev.length >= next.length
      ) {
        return prev;
      }
      return next;
    });
  }, [draft.birthdayNames]);

  const draftJoined = joinBirthdayNames(namesFromDraft);
  const draftJoinedRef = useRef(draftJoined);
  draftJoinedRef.current = draftJoined;
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  const commitNames = (next?: string[]) => {
    const uiRows = (next ?? rowsRef.current).length > 0 ? (next ?? rowsRef.current) : [''];
    setRows(uiRows);
    rowsRef.current = uiRows;
    const joined = joinBirthdayNames(uiRows);
    if (joined !== draftJoinedRef.current) onPatch('birthdayNames', joined);
  };

  // 切走步骤时若还有未 blur 的改动，补一次提交
  useEffect(() => {
    return () => {
      const joined = joinBirthdayNames(rowsRef.current);
      if (joined !== draftJoinedRef.current) {
        onPatchRef.current('birthdayNames', joined);
      }
    };
  }, []);

  const filledCount = rows.map((s) => s.trim()).filter(Boolean).length;

  return (
    <StepShell titleKey="bulletin.steps.birthdayTitle" introKey="bulletin.steps.birthdayIntro">
      <TextField
        label={t('bulletin.birthdayMonth')}
        value={draft.birthdayMonth}
        disabled={!canEdit}
        commitOnBlur
        onChange={(v) => onPatch('birthdayMonth', v)}
      />
      <div className="bulletin-birthday-names">
        <span className="bulletin-birthday-names-label">{t('bulletin.birthdayNames')}</span>
        <p className="bulletin-field-hint">{t('bulletin.birthdayNamesHint')}</p>
        <div className="bulletin-birthday-names-list">
          {rows.map((name, index) => (
            <div key={`bday-${index}`} className="bulletin-birthday-name-row">
              <input
                type="text"
                className="bulletin-birthday-name-input"
                value={name}
                disabled={!canEdit}
                placeholder={t('bulletin.birthdayNamePlaceholder', { n: String(index + 1) })}
                onChange={(e) => {
                  const next = [...rows];
                  next[index] = e.target.value;
                  setRows(next);
                  rowsRef.current = next;
                }}
                onBlur={() => commitNames()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              {canEdit ? (
                <div className="bulletin-birthday-name-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={index === 0}
                    aria-label={t('bulletin.moveBirthdayNameUp')}
                    onClick={() => commitNames(moveBirthdayName(rows, index, index - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={index >= rows.length - 1}
                    aria-label={t('bulletin.moveBirthdayNameDown')}
                    onClick={() => commitNames(moveBirthdayName(rows, index, index + 1))}
                  >
                    ↓
                  </button>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        commitNames(rows.filter((_, i) => i !== index));
                      }}
                    >
                      {t('bulletin.removeBirthdayName')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="bulletin-birthday-names-toolbar">
            {rows.length < BIRTHDAY_NAME_MAX ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const next = [...rows, ''];
                  setRows(next);
                  rowsRef.current = next;
                }}
              >
                {t('bulletin.addBirthdayName')}
              </button>
            ) : null}
            {filledCount >= 2 ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const arranged = arrangeBirthdayNames(rows);
                  const emptyTail = rows.length - filledCount;
                  commitNames(
                    emptyTail > 0 ? [...arranged, ...Array(emptyTail).fill('')] : arranged,
                  );
                }}
              >
                {t('bulletin.arrangeBirthdayNames')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
          commitOnBlur
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
            commitOnBlur
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
            commitOnBlur
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
        commitOnBlur
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
        commitOnBlur
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
            : sectionId === 'rotation'
              ? 'bulletin.sections.rotation'
              : 'bulletin.steps.moreTitle';
  const introKey =
    sectionId === 'staff_meeting' ||
    sectionId === 'future_testimony' ||
    sectionId === 'service_roster' ||
    sectionId === 'weekly_meetings' ||
    sectionId === 'rotation'
      ? 'bulletin.steps.sectionFieldIntro'
      : 'bulletin.steps.moreIntro';

  return (
    <StepShell titleKey={titleKey} introKey={introKey}>
      {show('staff_meeting') ? (
        <>
          <TextField
            label={t('bulletin.staffMeetingYear')}
            value={draft.staffMeetingYear ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('staffMeetingYear', v)}
          />
          <TextField
            label={t('bulletin.staffMeetingMonth')}
            value={draft.staffMeetingMonth ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('staffMeetingMonth', v)}
          />
          <TextField
            label={t('bulletin.staffMeetingDate')}
            value={draft.staffMeetingDate}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('staffMeetingDate', v)}
          />
          <TextField
            label={t('bulletin.staffMeetingStartTime')}
            value={draft.staffMeetingStartTime ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('staffMeetingStartTime', v)}
          />
          <TextField
            label={t('bulletin.staffMeetingEndTime')}
            value={draft.staffMeetingEndTime ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('staffMeetingEndTime', v)}
          />
          <p className="bulletin-field-hint">{t('bulletin.staffMeetingHint')}</p>
        </>
      ) : null}
      {show('rotation') ? (
        <>
          <TextField
            label={t('bulletin.rotationStartMonth')}
            value={draft.rotationStartMonth ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('rotationStartMonth', v)}
          />
          <TextField
            label={t('bulletin.rotationEndMonth')}
            value={draft.rotationEndMonth ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('rotationEndMonth', v)}
          />
          <p className="bulletin-field-hint">{t('bulletin.rotationMonthsHint')}</p>
        </>
      ) : null}
      {show('future_testimony') ? (
        <>
          <TextField
            label={t('bulletin.testimonyShare')}
            value={draft.testimonyShareDate ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('testimonyShareDate', v)}
          />
          <p className="bulletin-field-hint">{t('bulletin.testimonyShareHint')}</p>
        </>
      ) : null}
      {show('service_roster') ? (
        <TextField
          label={t('bulletin.serviceRoster')}
          value={draft.serviceRosterText}
          disabled={!canEdit}
          multiline
          commitOnBlur
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
