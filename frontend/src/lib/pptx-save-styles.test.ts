import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JSZip } from './jszip';
import { applyRunPatchToElement } from './ppt-ops/text';
import { applyShapeTextToSlideXml } from './pptx-shape-text';
import { applySlideXmlOverridesToPptx } from './pptx-preview';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const TEMPLATE = 'shared/templates/bulletin/06_14_2026.pptx';
const SLIDE_PATH = 'ppt/slides/slide1.xml';

/** 与 applySlideEditsToPptx 相同：先把 overlay 合进 XML 再整页写回 */
function mergeOverridesIntoXml(
  xml: string,
  shapeTextOverrides: Record<number, { text: string; bold?: boolean }> | undefined,
): string {
  if (!shapeTextOverrides) return xml;
  let next = xml;
  for (const [idxStr, value] of Object.entries(shapeTextOverrides)) {
    const idx = Number(idxStr);
    if (!Number.isFinite(idx)) continue;
    next = applyShapeTextToSlideXml(next, idx, value);
  }
  return next;
}

describe('PPT save content + styles', () => {
  it('writes bold/size/font and new text into the pptx slide part', async () => {
    const bytes = new Uint8Array(fs.readFileSync(TEMPLATE));
    const file = new File([bytes], 'test.pptx', { type: PPTX_MIME });
    const zip0 = await JSZip.loadAsync(await file.arrayBuffer());
    const original = await zip0.file(SLIDE_PATH)!.async('string');
    const elId = Number(original.match(/<p:cNvPr[^>]*\sid="(\d+)"/)?.[1] ?? '0');
    expect(elId).toBeGreaterThan(0);

    let edited = applyRunPatchToElement(original, elId, { bold: true });
    edited = applyShapeTextToSlideXml(edited, 0, {
      text: '保存后仍应加粗',
      bold: true,
      fontSizePt: 24,
      fontFamily: 'Arial',
    });

    const saved = await applySlideXmlOverridesToPptx(file, [{ slidePath: SLIDE_PATH, xml: edited }]);
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    const xml = await zip.file(SLIDE_PATH)!.async('string');

    expect(xml).toContain('保存后仍应加粗');
    expect(xml).toMatch(/<a:rPr[^>]*\sb="1"/);
    expect(xml).toMatch(/sz="2400"/);
    expect(xml).toContain('typeface="Arial"');
  });

  it('merges shapeTextOverrides into slideXmlOverride so styles are not wiped', async () => {
    const bytes = new Uint8Array(fs.readFileSync(TEMPLATE));
    const file = new File([bytes], 'test.pptx', { type: PPTX_MIME });
    const zip0 = await JSZip.loadAsync(await file.arrayBuffer());
    const original = await zip0.file(SLIDE_PATH)!.async('string');
    const elId = Number(original.match(/<p:cNvPr[^>]*\sid="(\d+)"/)?.[1] ?? '0');

    const styled = applyRunPatchToElement(original, elId, { bold: true, fontSizePt: 28 });
    const merged = mergeOverridesIntoXml(styled, {
      0: { text: '合并后的正文', bold: true },
    });

    const saved = await applySlideXmlOverridesToPptx(file, [
      { slidePath: SLIDE_PATH, xml: merged },
    ]);
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    const xml = await zip.file(SLIDE_PATH)!.async('string');

    expect(xml).toContain('合并后的正文');
    expect(xml).toMatch(/<a:rPr[^>]*\sb="1"/);
  });
});
