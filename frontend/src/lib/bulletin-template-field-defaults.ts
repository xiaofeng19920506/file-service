import type { WeeklyBulletin, BulletinAnnouncement } from '../api/bulletins';
import { computeOfferingTotalAmount } from './bulletin-offering';
import { normalizeTestimonyShareDate } from './bulletin-pptx-patches';
import { formatBulletinShortDate, sundayAfterIso } from './bulletin-date';
import {
  birthdayMonthFromServiceDate,
  resolveBirthdayFields,
  serializeBirthdayNamesByMonth,
} from './bulletin-birthday-months';
import { resolveServiceRosterFromSchedule } from './bulletin-service-rotation';

/**
 * 原版模板 `06_14_2026.pptx` 上对应表单字段的默认文字。
 * 库字段为空时用这些值填充左侧输入，保证与右侧幻灯片一致。
 */
export const BULLETIN_TEMPLATE_FIELD_DEFAULTS = {
  birthdayMonth: '7',
  /** 名单改在幻灯片上编辑；表单默认不再注入样例姓名 */
  birthdayNames: '{}',
  lastWeekOfferingDate: '06/07/2026',
  /** 与模板 P19 textIndex 14/18/22 一致（读自原版幻灯片） */
  offeringTitheAmount: '3260.00',
  offeringOtherAmount: '3000.00',
  offeringTotalAmount: '6260.00',
  verseOfWeek:
    '(以弗所書 2:8)  你 们 得 救 是 本 乎 恩 ，也 因 着 信 ； 这 并 不 是 出 於 自 己 ， 乃 是 神 所 赐 的 ；',
  /** P33 日期，写入标题与正文大号「8/30」 */
  testimonyShareDate: '8/30',
  /** 今日清洁人员（换行）；写入 P34 textIndex 1 */
  serviceRosterText: 'Michelle\n洪雪吟\n嘉文',
  serviceRosterTodayDate: '6/14',
  serviceRosterNextDate: '6/21',
  serviceRosterChair: '賴建平',
  serviceRosterWorship: '李麗婷',
  serviceRosterUsher: '惠美',
  serviceRosterCleanNames: '惠美\n悅心\nHelen',
  baptismText: '7月5日主日',
  staffMeetingYear: '2026',
  staffMeetingMonth: '6',
  staffMeetingDate: '下主日(6/21/2026)',
  staffMeetingStartTime: '12:45 pm',
  staffMeetingEndTime: '2:00 pm',
  rotationStartMonth: '7',
  rotationEndMonth: '9',
} as const;

const TEMPLATE_ANNOUNCEMENTS: Omit<BulletinAnnouncement, 'id' | 'sortOrder'>[] = [
  {
    category: 'thanks',
    title: '特別感謝',
    body: '感謝 Michelle 姐妹與 Kevin 弟兄奉獻吸塵器給教會，願主耶穌紀念並祝福他們的擺上與服事！',
  },
  {
    category: 'celebration',
    title: '家有喜事',
    body: '恭喜盧牧師和師母\n他們的女兒Angelica已於4月23日平安順利生下孫女兒：\nGenevieve Lu- Chuk',
  },
];

function pickText(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed ? value! : fallback;
}

function defaultTodayRosterDate(serviceDate: string): string {
  const fromService = serviceDate.trim() ? formatBulletinShortDate(serviceDate.trim()) : '';
  return fromService || BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterTodayDate;
}

function defaultNextRosterDate(serviceDate: string): string {
  if (serviceDate.trim()) {
    return formatBulletinShortDate(sundayAfterIso(serviceDate.trim()));
  }
  return BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterNextDate;
}

/** 空字段用模板原文填充，使左侧表单与右侧幻灯片一致 */
export function withTemplateFieldDefaults(bulletin: WeeklyBulletin): WeeklyBulletin {
  const announcements =
    bulletin.announcements?.some((a) => a.body.trim() || (a.title ?? '').trim())
      ? bulletin.announcements
      : TEMPLATE_ANNOUNCEMENTS.map((a, i) => ({
          id: `template-ann-${i}`,
          sortOrder: i,
          category: a.category,
          title: a.title,
          body: a.body,
        }));

  const defaultMonth = birthdayMonthFromServiceDate(bulletin.serviceDate);
  const hasStoredMonth = Boolean(bulletin.birthdayMonth?.trim());
  const hasStoredNames = Boolean(bulletin.birthdayNames?.trim());
  const birthdayResolved = resolveBirthdayFields({
    birthdayMonth: hasStoredMonth ? bulletin.birthdayMonth : String(defaultMonth),
    birthdayNames: hasStoredNames ? bulletin.birthdayNames : '{}',
    serviceDate: bulletin.serviceDate,
  });

  // 命中季度服事表时始终覆盖 P34/P32；否则沿用库字段或模板默认
  const fromSchedule = resolveServiceRosterFromSchedule(bulletin.serviceDate);

  return {
    ...bulletin,
    birthdayMonth: String(birthdayResolved.month),
    birthdayNames: serializeBirthdayNamesByMonth(birthdayResolved.namesByMonth),
    lastWeekOfferingDate: pickText(
      bulletin.lastWeekOfferingDate,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.lastWeekOfferingDate,
    ),
    offeringTitheAmount: pickText(
      bulletin.offeringTitheAmount,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringTitheAmount,
    ),
    offeringOtherAmount: pickText(
      bulletin.offeringOtherAmount,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringOtherAmount,
    ),
    // 与 buildOfferingAmountReplacements 一致：已有总数优先，空时再按十一+其他推算
    offeringTotalAmount: pickText(
      bulletin.offeringTotalAmount,
      computeOfferingTotalAmount(
        pickText(bulletin.offeringTitheAmount, BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringTitheAmount),
        pickText(bulletin.offeringOtherAmount, BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringOtherAmount),
      ) || BULLETIN_TEMPLATE_FIELD_DEFAULTS.offeringTotalAmount,
    ),
    verseOfWeek: pickText(bulletin.verseOfWeek, BULLETIN_TEMPLATE_FIELD_DEFAULTS.verseOfWeek),
    testimonyShareDate: normalizeTestimonyShareDate(
      pickText(
        bulletin.testimonyShareDate,
        BULLETIN_TEMPLATE_FIELD_DEFAULTS.testimonyShareDate,
      ),
    ),
    serviceRosterText: fromSchedule
      ? fromSchedule.serviceRosterText
      : pickText(bulletin.serviceRosterText, BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterText),
    serviceRosterTodayDate: fromSchedule
      ? fromSchedule.serviceRosterTodayDate
      : pickText(bulletin.serviceRosterTodayDate, defaultTodayRosterDate(bulletin.serviceDate)),
    serviceRosterNextDate: fromSchedule
      ? fromSchedule.serviceRosterNextDate
      : pickText(bulletin.serviceRosterNextDate, defaultNextRosterDate(bulletin.serviceDate)),
    serviceRosterChair: fromSchedule
      ? fromSchedule.serviceRosterChair
      : pickText(bulletin.serviceRosterChair, BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterChair),
    serviceRosterWorship: fromSchedule
      ? fromSchedule.serviceRosterWorship
      : pickText(
          bulletin.serviceRosterWorship,
          BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterWorship,
        ),
    serviceRosterUsher: fromSchedule
      ? fromSchedule.serviceRosterUsher
      : pickText(bulletin.serviceRosterUsher, BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterUsher),
    serviceRosterCleanNames: fromSchedule
      ? fromSchedule.serviceRosterCleanNames
      : pickText(
          bulletin.serviceRosterCleanNames,
          BULLETIN_TEMPLATE_FIELD_DEFAULTS.serviceRosterCleanNames,
        ),
    baptismText: pickText(bulletin.baptismText, BULLETIN_TEMPLATE_FIELD_DEFAULTS.baptismText),
    staffMeetingYear: pickText(
      bulletin.staffMeetingYear,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.staffMeetingYear,
    ),
    staffMeetingMonth: pickText(
      bulletin.staffMeetingMonth,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.staffMeetingMonth,
    ),
    staffMeetingDate: pickText(
      bulletin.staffMeetingDate,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.staffMeetingDate,
    ),
    staffMeetingStartTime: pickText(
      bulletin.staffMeetingStartTime,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.staffMeetingStartTime,
    ),
    staffMeetingEndTime: pickText(
      bulletin.staffMeetingEndTime,
      BULLETIN_TEMPLATE_FIELD_DEFAULTS.staffMeetingEndTime,
    ),
    rotationStartMonth: fromSchedule
      ? fromSchedule.rotationStartMonth
      : pickText(
          bulletin.rotationStartMonth,
          BULLETIN_TEMPLATE_FIELD_DEFAULTS.rotationStartMonth,
        ),
    rotationEndMonth: fromSchedule
      ? fromSchedule.rotationEndMonth
      : pickText(bulletin.rotationEndMonth, BULLETIN_TEMPLATE_FIELD_DEFAULTS.rotationEndMonth),
    announcements,
  };
}
