import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { patchCoverSlideInPptx, patchCoverDateLineInSlideXml } from './bulletin-pptx-patch.js';

const templatePath = join(import.meta.dirname, '../templates/bulletin/06_14_2026.pptx');

function shapeY(xml: string, shapeId: string): string | null {
  const marker = `<p:cNvPr id="${shapeId}"`;
  const idIdx = xml.indexOf(marker);
  if (idIdx < 0) return null;
  const start = xml.lastIndexOf('<p:sp>', idIdx);
  const end = xml.indexOf('</p:sp>', idIdx) + 7;
  const block = xml.slice(start, end);
  return block.match(/<a:off x="\d+" y="(\d+)"/)?.[1] ?? null;
}

describe('patchCoverDateLineInSlideXml', () => {
  it('patches shape 265 only and keeps prayer shape 264 in place', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchCoverSlideInPptx(tpl, {
      serviceDate: '2026-06-21',
      serviceTime: '11:00',
    });
    const zip = await JSZip.loadAsync(patched);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');

    expect(shapeY(xml, '264')).toBe('1645925');
    expect(shapeY(xml, '265')).toBe('987000');
    expect(xml).toContain('06/21/2026');
    expect(xml).toContain('11:00');
    expect(xml).toMatch(/id="265"[\s\S]*wrap="none"/);
    expect(xml).toMatch(/id="265"[\s\S]*<a:noAutofit\/>/);
  });

  it('writes date and time in one paragraph on shape 265', async () => {
    const tpl = await readFile(templatePath);
    const zip = await JSZip.loadAsync(tpl);
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const next = patchCoverDateLineInSlideXml(xml, '2026-06-21', '11:00');
    const marker = '<p:cNvPr id="265"';
    const idIdx = next.indexOf(marker);
    const start = next.lastIndexOf('<p:sp>', idIdx);
    const end = next.indexOf('</p:sp>', idIdx) + 7;
    const block = next.slice(start, end);
    expect(block.match(/<a:p>/g)?.length).toBe(1);
    expect(block).toContain('06/21/2026');
    expect(block).toContain('11:00');
    expect(block).toContain('主日崇拜');
  });
});
