import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  stabilizeBirthdayTitleSlideXml,
  stabilizeServiceRosterSlideXml,
  stabilizeStaffMeetingSlideXml,
  stabilizeTestimonySlideXml,
} from './bulletin-header-layout';

const templatePath = join(process.cwd(), 'shared/templates/bulletin/06_14_2026.pptx');

async function slideXml(n: number): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(templatePath));
  return zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
}

describe('header title stabilize', () => {
  it('P31 staff meeting: y=0, wrap none, smaller font', async () => {
    const out = stabilizeStaffMeetingSlideXml(await slideXml(31));
    expect(out).toContain('y="0"');
    expect(out).toContain('wrap="none"');
    expect(out).toContain('sz="4800"');
    expect(out).not.toMatch(/y="-\d+"/);
  });

  it('P33 testimony: y=0, wrap none, 36pt', async () => {
    const out = stabilizeTestimonySlideXml(await slideXml(33));
    expect(out).toContain('y="0"');
    expect(out).toContain('wrap="none"');
    expect(out).toContain('sz="3600"');
  });

  it('P34 roster: both titles taller + wrap none', async () => {
    const out = stabilizeServiceRosterSlideXml(await slideXml(34));
    expect(out).toContain('wrap="none"');
    expect(out).toContain('cy="1100000"');
    expect(out).toContain('sz="3600"');
    expect(out).toContain('今日');
    expect(out).toContain('下主日');
  });

  it('P24 birthday: wrap none', async () => {
    const out = stabilizeBirthdayTitleSlideXml(await slideXml(24));
    expect(out).toContain('wrap="none"');
  });
});
