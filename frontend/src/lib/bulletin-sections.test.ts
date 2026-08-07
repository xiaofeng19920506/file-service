import { describe, expect, it } from 'vitest';
import {
  BULLETIN_NAV_SECTIONS,
  BULLETIN_NAV_TREE,
  buildBulletinNavTree,
  findNavNode,
  resolveNavTargetSectionId,
  announcementSectionId,
} from './bulletin-sections';

describe('bulletin-sections tree', () => {
  it('keeps pre-family sections flat at depth 0', () => {
    const before = [
      'cover',
      'pre_service',
      'scripture',
      'worship',
      'communion',
      'welcome',
      'youth_prayer',
      'testimony_week',
      'message',
    ];
    for (const id of before) {
      expect(BULLETIN_NAV_SECTIONS.find((s) => s.id === id)?.depth).toBe(0);
    }
  });

  it('nests family_time children and announcement group', () => {
    const family = findNavNode('family_time');
    expect(family?.children?.map((c) => c.id)).toEqual([
      'offering',
      'birthday',
      'announcements_group',
      'verse_of_week',
      'department_reports',
      'doxology_benediction',
    ]);

    const announcements = findNavNode('announcements_group');
    expect(announcements?.children?.map((c) => c.id)).toEqual([
      'baptism',
      'weekly_meetings',
      'staff_meeting',
      'rotation',
      'future_testimony',
      'service_roster',
    ]);
    expect(announcements?.groupOnly).toBe(true);

    expect(BULLETIN_NAV_SECTIONS.find((s) => s.id === 'offering')?.depth).toBe(1);
    expect(BULLETIN_NAV_SECTIONS.find((s) => s.id === 'weekly_meetings')?.depth).toBe(2);
    expect(BULLETIN_NAV_SECTIONS.find((s) => s.id === 'doxology')?.depth).toBe(2);
  });

  it('injects dynamic announcement children before baptism', () => {
    const tree = buildBulletinNavTree(
      [
        { id: 'a1', title: '特别感谢' },
        { id: 'a2', title: '' },
      ],
      (n) => `公告 ${n}`,
    );
    const group = findNavNode('announcements_group', tree);
    expect(group?.children?.map((c) => c.id)).toEqual([
      announcementSectionId('a1'),
      announcementSectionId('a2'),
      'baptism',
      'weekly_meetings',
      'staff_meeting',
      'rotation',
      'future_testimony',
      'service_roster',
    ]);
    expect(group?.children?.[0]?.label).toBe('特别感谢');
    expect(group?.children?.[1]?.label).toBe('公告 2');
    expect(resolveNavTargetSectionId('announcements_group', tree)).toBe(
      announcementSectionId('a1'),
    );
  });

  it('resolves group-only nodes to the first concrete child', () => {
    expect(resolveNavTargetSectionId('doxology_benediction')).toBe('doxology');
    expect(resolveNavTargetSectionId('announcements_group')).toBe('baptism');
    expect(resolveNavTargetSectionId('offering')).toBe('offering');
  });

  it('preserves leaf ids used by deck / hiddenSections', () => {
    const leafIds = BULLETIN_NAV_SECTIONS.filter((s) => !s.groupOnly).map((s) => s.id);
    expect(leafIds).toContain('family_time');
    expect(leafIds).toContain('baptism');
    expect(leafIds).not.toContain('announcements_group');
    expect(leafIds).not.toContain('doxology_benediction');
    expect(BULLETIN_NAV_TREE.length).toBe(10);
  });

  it('keeps testimony week as preview-only (no more form fields)', () => {
    expect(findNavNode('testimony_week')?.editableStepId).toBeNull();
    expect(findNavNode('staff_meeting')?.editableStepId).toBe('more');
    expect(findNavNode('future_testimony')?.editableStepId).toBe('more');
    expect(findNavNode('rotation')?.editableStepId).toBe('more');
    expect(findNavNode('department_reports')?.editableStepId).toBeNull();
  });
});
