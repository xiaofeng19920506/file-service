import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildRotationMonthReplacements,
  stabilizeRotationSlideXml,
} from './bulletin-pptx-patches';

describe('rotation month replacements', () => {
  it('writes matching range into title and body', () => {
    expect(
      buildRotationMonthReplacements({
        rotationStartMonth: '4',
        rotationEndMonth: '6',
      }),
    ).toEqual([
      { textIndex: 0, text: '本季度(4-6 月)的清潔服事輪值表 ' },
      {
        textIndex: 1,
        text: '本季度(4-6 月)的服事輪值表 已張貼在各個佈告欄與後堂冰箱上，請家人們前往查看！',
      },
    ]);
  });
});

describe('stabilizeRotationSlideXml', () => {
  it('fixes clipped title: y=0, taller box, no inset, smaller font', async () => {
    const templatePath = join(process.cwd(), 'shared/templates/bulletin/06_14_2026.pptx');
    const zip = await JSZip.loadAsync(readFileSync(templatePath));
    const before = await zip.file('ppt/slides/slide32.xml')!.async('string');
    const out = stabilizeRotationSlideXml(before);
    expect(out).toContain('y="0"');
    expect(out).toContain('cy="1100000"');
    expect(out).toContain('tIns="0"');
    expect(out).toContain('sz="3600"');
    expect(out).not.toMatch(/y="-\d+"/);
  });
});
