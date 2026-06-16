import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  patchBulletinPreviewInPptx,
  patchCoverSlideInPptx,
  patchCoverDateLineInSlideXml,
  patchScriptureSlideInSlideXml,
} from './bulletin-pptx-patch.js';

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

describe('patchScriptureSlideInSlideXml', () => {
  it('updates book and reference runs without changing title', async () => {
    const tpl = await readFile(templatePath);
    const zip = await JSZip.loadAsync(tpl);
    const xml = await zip.file('ppt/slides/slide4.xml')!.async('string');
    const next = patchScriptureSlideInSlideXml(xml, '以赛亚 Isaiah', '40:1-5');
    expect(next).toContain('讀經 ');
    expect(next).toContain('Scripture Reading');
    expect(next).toContain('以赛亚 Isaiah');
    expect(next).toContain('40:1-5');
    expect(next).not.toContain('箴言 Proverbs');
  });

  it('combines cover and scripture in preview patch', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-06-21',
      serviceTime: '11:00',
      scriptureBook: '约翰福音 John',
      scriptureReference: '3:16',
    });
    const zip = await JSZip.loadAsync(patched);
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const slide4 = await zip.file('ppt/slides/slide4.xml')!.async('string');
    expect(slide1).toContain('06/21/2026');
    expect(slide4).toContain('约翰福音 John');
    expect(slide4).toContain('3:16');
  });

  it('fills scripture body on slides 5 and 6', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      scriptureBook: '箴言 Proverbs',
      scriptureReference: '15:1-11',
    });
    const zip = await JSZip.loadAsync(patched);
    const slide5 = await zip.file('ppt/slides/slide5.xml')!.async('string');
    const slide6 = await zip.file('ppt/slides/slide6.xml')!.async('string');
    expect(slide5).toContain('回答柔和');
    expect(slide5).toContain('11 ');
    expect(slide6).toContain('gentle answer');
    expect(slide6).toContain('human hearts');
  });
});
