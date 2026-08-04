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
    // 旧生日页始终删；当月 7→P45 保留，其余月页删
    expect(paths).toContain('ppt/slides/slide23.xml');
    expect(paths).toContain('ppt/slides/slide24.xml');
    expect(paths).not.toContain('ppt/slides/slide45.xml');
    expect(paths).toContain('ppt/slides/slide39.xml');
    expect(paths).toContain('ppt/slides/slide50.xml');
  });

  it('keeps only the selected birthday month among P39–P50', () => {
    const march = bulletinSlidePathsToDelete({ birthdayMonth: '3' });
    expect(march).not.toContain('ppt/slides/slide41.xml');
    expect(march).toContain('ppt/slides/slide45.xml');

    const allGone = bulletinSlidePathsToDelete({ birthdayMonth: '' });
    expect(allGone).toContain('ppt/slides/slide41.xml');
    expect(allGone).toContain('ppt/slides/slide45.xml');
  });
});
