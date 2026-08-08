import { describe, expect, it } from 'vitest';
import {
  bulletinSlidePathsToDelete,
  resolveHiddenSections,
  setBulletinSectionVisible,
} from './bulletin-section-visibility';

describe('bulletin section visibility', () => {
  it('merges legacy skip flags into hidden sections', () => {
    expect(
      resolveHiddenSections({
        hiddenSections: ['offering'],
        skipTestimonyWeek: true,
        skipDepartmentReports: true,
      }),
    ).toEqual(expect.arrayContaining(['offering', 'testimony_week', 'department_reports']));
  });

  it('toggles section visibility', () => {
    expect(setBulletinSectionVisible([], 'birthday', false)).toEqual(['birthday']);
    expect(setBulletinSectionVisible(['birthday'], 'birthday', true)).toEqual([]);
  });

  it('always deletes slide 3, worship extras 7/9, and hidden section slides', () => {
    const paths = bulletinSlidePathsToDelete({
      hiddenSections: ['communion', 'testimony_week'],
      weeklyMeetingVariant: 28,
      birthdayMonth: 7,
    });
    expect(paths).toContain('ppt/slides/slide3.xml');
    expect(paths).toContain('ppt/slides/slide7.xml');
    expect(paths).toContain('ppt/slides/slide9.xml');
    expect(paths).not.toContain('ppt/slides/slide8.xml');
    expect(paths).toContain('ppt/slides/slide10.xml');
    expect(paths).toContain('ppt/slides/slide16.xml');
    expect(paths).toContain('ppt/slides/slide29.xml');
    expect(paths).toContain('ppt/slides/slide30.xml');
    expect(paths).not.toContain('ppt/slides/slide28.xml');
    // 旧生日提醒始终删；锚点 P24 在未隐藏生日时保留
    expect(paths).toContain('ppt/slides/slide23.xml');
    expect(paths).not.toContain('ppt/slides/slide24.xml');
  });

  it('retains hidden section slides when retainHiddenSections is set', () => {
    const paths = bulletinSlidePathsToDelete({
      hiddenSections: ['communion', 'birthday', 'weekly_meetings'],
      weeklyMeetingVariant: 29,
      retainHiddenSections: true,
    });
    expect(paths).not.toContain('ppt/slides/slide10.xml');
    expect(paths).not.toContain('ppt/slides/slide24.xml');
    // 预览保留隐藏本週聚会时仍只留所选版式
    expect(paths).not.toContain('ppt/slides/slide29.xml');
    expect(paths).toContain('ppt/slides/slide28.xml');
    expect(paths).toContain('ppt/slides/slide30.xml');
    expect(paths).toContain('ppt/slides/slide3.xml');
  });

  it('deletes birthday anchor when birthday section is hidden', () => {
    const paths = bulletinSlidePathsToDelete({
      hiddenSections: ['birthday'],
      birthdayMonth: '7',
    });
    expect(paths).toContain('ppt/slides/slide24.xml');
  });

  it('defaults weekly meeting variant to slide 28 when unset', () => {
    const paths = bulletinSlidePathsToDelete({
      weeklyMeetingVariant: null,
    });
    expect(paths).not.toContain('ppt/slides/slide28.xml');
    expect(paths).toContain('ppt/slides/slide29.xml');
    expect(paths).toContain('ppt/slides/slide30.xml');
  });

  it('maps legacy announcements hidden id to noop', () => {
    expect(resolveHiddenSections({ hiddenSections: ['announcements', 'special_thanks'] })).toEqual(
      [],
    );
  });

  it('keeps announcement:uuid in hiddenSections', () => {
    expect(
      resolveHiddenSections({ hiddenSections: ['announcement:abc'] }),
    ).toEqual(['announcement:abc']);
  });

  it('deletes announcement template slides when visible count is 0', () => {
    const paths = bulletinSlidePathsToDelete({ visibleAnnouncementCount: 0 });
    expect(paths).toContain('ppt/slides/slide25.xml');
    expect(paths).toContain('ppt/slides/slide26.xml');
  });

  it('keeps P28 when weeklyMeetingVariant is null or invalid', () => {
    for (const weeklyMeetingVariant of [null, 0, 27, 99, '0', '99'] as const) {
      const paths = bulletinSlidePathsToDelete({
        visibleAnnouncementCount: 2,
        weeklyMeetingVariant,
      });
      expect(paths).not.toContain('ppt/slides/slide28.xml');
      expect(paths).toContain('ppt/slides/slide29.xml');
      expect(paths).toContain('ppt/slides/slide30.xml');
    }
  });
});
