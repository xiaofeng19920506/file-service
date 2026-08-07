import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { WeeklyBulletin } from '../../api/bulletins';
import { BIBLE_BOOKS } from '../../lib/bible-books';
import { useI18n } from '../../i18n';
import BulletinScriptureReferenceFields from './BulletinScriptureReferenceFields';
import {
  BIRTHDAY_MONTHS,
  resolveBirthdayFields,
  type BirthdayMonth,
} from '../../lib/bulletin-birthday-months';
import {
  ROSTER_NAME_MAX,
  joinRosterNames,
  parseRosterNames,
} from '../../lib/bulletin-roster';

type StepShellProps = {
  children: ReactNode;
};

function StepShell({ children }: StepShellProps) {
  return (
    <div className="bulletin-wizard-step">
      <div className="bulletin-cover-step-fields">{children}</div>
    </div>
  );
}

/** 中文等 IME 组字时按 Enter 是「上屏」不是「提交」；此时 blur 会把半成品与上屏各写一次 */
function isImeKeyEvent(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/** 多人名列表（服事轮值：可点添加） */
function RosterNameListField({
  label,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onCommit: (joined: string) => void;
}) {
  const { t } = useI18n();
  const namesFromValue = parseRosterNames(value);
  const [rows, setRows] = useState<string[]>(() =>
    namesFromValue.length > 0 ? namesFromValue : [''],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const draftJoinedRef = useRef(joinRosterNames(namesFromValue));
  draftJoinedRef.current = joinRosterNames(namesFromValue);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const composingRef = useRef(false);

  useEffect(() => {
    const parsed = parseRosterNames(value);
    const next = parsed.length > 0 ? parsed : [''];
    setRows((prev) => {
      const prevFilled = prev.map((s) => s.trim()).filter(Boolean);
      const nextFilled = next.map((s) => s.trim()).filter(Boolean);
      if (
        prevFilled.join('\n') === nextFilled.join('\n') &&
        prev.length >= next.length
      ) {
        return prev;
      }
      return next;
    });
  }, [value]);

  const commitNames = (next?: string[]) => {
    const uiRows = (next ?? rowsRef.current).length > 0 ? (next ?? rowsRef.current) : [''];
    setRows(uiRows);
    rowsRef.current = uiRows;
    const joined = joinRosterNames(uiRows);
    if (joined !== draftJoinedRef.current) onCommit(joined);
  };

  useEffect(() => {
    return () => {
      const joined = joinRosterNames(rowsRef.current);
      if (joined !== draftJoinedRef.current) onCommitRef.current(joined);
    };
  }, []);

  return (
    <div className="bulletin-birthday-names">
      <span className="bulletin-birthday-names-label">{label}</span>
      <div className="bulletin-birthday-names-list">
        {rows.map((name, index) => (
          <div key={`roster-${index}`} className="bulletin-birthday-name-row">
            <input
              type="text"
              className="bulletin-birthday-name-input"
              value={name}
              disabled={!canEdit}
              placeholder={t('bulletin.rosterNamePlaceholder', { n: String(index + 1) })}
              onChange={(e) => {
                const valueNext = e.target.value;
                setRows((prev) => {
                  const next = [...prev];
                  next[index] = valueNext;
                  rowsRef.current = next;
                  return next;
                });
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                composingRef.current = false;
                const valueNext = e.currentTarget.value;
                setRows((prev) => {
                  const next = [...prev];
                  next[index] = valueNext;
                  rowsRef.current = next;
                  return next;
                });
              }}
              onBlur={() => {
                if (composingRef.current) return;
                commitNames();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeKeyEvent(e)) e.currentTarget.blur();
              }}
            />
            {canEdit ? (
              <div className="bulletin-birthday-name-actions">
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => commitNames(rows.filter((_, i) => i !== index))}
                  >
                    {t('bulletin.removeRosterName')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit && rows.length < ROSTER_NAME_MAX ? (
        <div className="bulletin-birthday-names-toolbar">
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              const next = [...rows, ''];
              setRows(next);
              rowsRef.current = next;
            }}
          >
            {t('bulletin.addRosterName')}
          </button>
        </div>
      ) : null}
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
  const composingRef = useRef(false);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    if (composingRef.current) return;
    if (local !== value) onChange(local);
  };

  if (multiline) {
    return (
      <label className="bulletin-field">
        {label}
        <textarea
          rows={3}
          value={commitOnBlur ? local : value}
          disabled={disabled}
          onChange={(e) => (commitOnBlur ? setLocal(e.target.value) : onChange(e.target.value))}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            if (commitOnBlur) setLocal(e.currentTarget.value);
          }}
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
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          if (commitOnBlur) setLocal(e.currentTarget.value);
        }}
        onBlur={commitOnBlur ? commit : undefined}
        onKeyDown={
          commitOnBlur
            ? (e) => {
                if (e.key === 'Enter' && !isImeKeyEvent(e)) e.currentTarget.blur();
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
  /** 打开分区幻灯片编辑器（生日等「改幻灯片」入口） */
  onEditSlides?: (sectionId: string) => void;
};

export function BulletinScriptureStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell>
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
    <StepShell>
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
    </StepShell>
  );
}

export function BulletinBirthdayStep({
  draft,
  canEdit,
  onPatch,
  onEditSlides,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  const selectedMonth = resolveBirthdayFields({
    birthdayMonth: draft.birthdayMonth,
    birthdayNames: draft.birthdayNames,
    serviceDate: draft.serviceDate,
  }).month;

  return (
    <StepShell>
      <label className="bulletin-field">
        {t('bulletin.birthdayMonth')}
        <select
          value={String(selectedMonth)}
          disabled={!canEdit}
          onChange={(e) => {
            const month = Number(e.target.value) as BirthdayMonth;
            onPatch('birthdayMonth', String(month));
          }}
        >
          {BIRTHDAY_MONTHS.map((m) => (
            <option key={m} value={String(m)}>
              {t('bulletin.birthdayMonthOption', { n: String(m) })}
            </option>
          ))}
        </select>
        <span className="bulletin-field-hint">{t('bulletin.birthdayMonthHint')}</span>
      </label>
      {canEdit && onEditSlides ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onEditSlides('birthday')}
        >
          {t('bulletin.editSlides')}
        </button>
      ) : null}
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
    <StepShell>
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

type FixedAnnouncementSlotProps = {
  draft: WeeklyBulletin;
  canEdit: boolean;
  saving?: boolean;
  /** 0 = 特别感谢(P25)，1 = 家有喜事(P26) */
  slotIndex: 0 | 1;
  announcements: AnnouncementDraft[];
  onAnnouncementsChange: (next: AnnouncementDraft[]) => void;
  onSave?: () => void;
};

function ensureAnnouncementSlots(list: AnnouncementDraft[]): AnnouncementDraft[] {
  const next = [...list];
  while (next.length < 2) {
    next.push({
      key: crypto.randomUUID(),
      category: next.length === 0 ? 'thanks' : 'celebration',
      title: '',
      body: '',
    });
  }
  return next.slice(0, 2);
}

/** 固定公告槽：特别感谢 / 家有喜事各一页，不可增删 */
export function BulletinFixedAnnouncementStep({
  canEdit,
  saving,
  slotIndex,
  announcements,
  onAnnouncementsChange,
  onSave,
}: FixedAnnouncementSlotProps) {
  const { t } = useI18n();
  const slots = ensureAnnouncementSlots(announcements);
  const item = slots[slotIndex]!;

  return (
    <StepShell>
      <TextField
        label={t('bulletin.announcementTitle')}
        value={item.title ?? ''}
        disabled={!canEdit}
        commitOnBlur
        onChange={(v) => {
          const next = ensureAnnouncementSlots(announcements);
          next[slotIndex] = { ...next[slotIndex]!, title: v };
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
          const next = ensureAnnouncementSlots(announcements);
          next[slotIndex] = { ...next[slotIndex]!, body: v };
          onAnnouncementsChange(next);
        }}
      />
      {canEdit && onSave ? (
        <div className="bulletin-announcement-actions">
          <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
            {saving ? t('bulletin.saving') : t('bulletin.save')}
          </button>
        </div>
      ) : null}
    </StepShell>
  );
}

/** @deprecated 使用 BulletinFixedAnnouncementStep */
export function BulletinAnnouncementsStep({
  draft,
  canEdit,
  saving,
  announcements,
  onAnnouncementsChange,
  onSave,
}: AnnouncementsProps) {
  return (
    <BulletinFixedAnnouncementStep
      draft={draft}
      canEdit={canEdit}
      saving={saving}
      slotIndex={0}
      announcements={announcements}
      onAnnouncementsChange={onAnnouncementsChange}
      onSave={onSave}
    />
  );
}

export function BulletinBaptismStep({
  draft,
  canEdit,
  onPatch,
}: BulletinStepPanelProps) {
  const { t } = useI18n();
  return (
    <StepShell>
      <TextField
        label={t('bulletin.baptism')}
        value={draft.baptismText}
        disabled={!canEdit}
        commitOnBlur
        onChange={(v) => onPatch('baptismText', v)}
      />
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
    <StepShell>
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

  return (
    <StepShell>
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
        </>
      ) : null}
      {show('service_roster') ? (
        <>
          <TextField
            label={t('bulletin.serviceRosterTodayDate')}
            value={draft.serviceRosterTodayDate ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('serviceRosterTodayDate', v)}
          />
          <RosterNameListField
            label={t('bulletin.serviceRosterTodayNames')}
            value={draft.serviceRosterText ?? ''}
            canEdit={canEdit}
            onCommit={(joined) => onPatch('serviceRosterText', joined)}
          />
          <TextField
            label={t('bulletin.serviceRosterNextDate')}
            value={draft.serviceRosterNextDate ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('serviceRosterNextDate', v)}
          />
          <TextField
            label={t('bulletin.serviceRosterChair')}
            value={draft.serviceRosterChair ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('serviceRosterChair', v)}
          />
          <TextField
            label={t('bulletin.serviceRosterWorship')}
            value={draft.serviceRosterWorship ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('serviceRosterWorship', v)}
          />
          <TextField
            label={t('bulletin.serviceRosterUsher')}
            value={draft.serviceRosterUsher ?? ''}
            disabled={!canEdit}
            commitOnBlur
            onChange={(v) => onPatch('serviceRosterUsher', v)}
          />
          <RosterNameListField
            label={t('bulletin.serviceRosterCleanNames')}
            value={draft.serviceRosterCleanNames ?? ''}
            canEdit={canEdit}
            onCommit={(joined) => onPatch('serviceRosterCleanNames', joined)}
          />
        </>
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
