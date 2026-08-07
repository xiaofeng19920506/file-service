import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  extractIndexedTextRuns,
  buildVerseOfWeekSlideReplacements,
  patchBulletinPreviewInPptx,
  patchCoverSlideInPptx,
  patchCoverDateLineInSlideXml,
  patchScriptureSlideInSlideXml,
  reapplyBulletinFormFieldsInPptx,
  stabilizeCommunionEnglishSlideXml,
  stabilizeOfferingReportSlideXml,
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
    expect(slide6).toContain('gentle answer');
    const allSlideXml = await Promise.all(
      Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .map((p) => zip.file(p)!.async('string')),
    );
    const combined = allSlideXml.join('');
    expect(combined).toContain('11 ');
    expect(combined).toContain('human hearts');
    expect(slide5).toContain('<a:noAutofit/>');
    expect(slide5).toContain('sz="2900"');
    expect(slide5).not.toContain('<a:spAutoFit/>');
    expect(slide6).toContain('<a:noAutofit/>');
    expect(slide6).toContain('sz="2400"');
    expect(slide6).not.toContain('<a:spAutoFit/>');
  });

  it('inserts extra slides for long scripture without ellipsis', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '119:1-40',
    });
    const zip = await JSZip.loadAsync(patched);
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    const sldCount = (pres.match(/<p:sldId /g) ?? []).length;

    // 与「不填经文」的页数比较：模板本身会按分区可见性裁剪，硬编码页数会过时
    const baseZip = await JSZip.loadAsync(await patchBulletinPreviewInPptx(tpl, {}));
    const basePres = await baseZip.file('ppt/presentation.xml')!.async('string');
    const baseCount = (basePres.match(/<p:sldId /g) ?? []).length;
    expect(sldCount).toBeGreaterThan(baseCount);

    const slidePaths = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    let zhHits = 0;
    let enHits = 0;
    for (const path of slidePaths) {
      const xml = await zip.file(path)!.async('string');
      if (xml.includes('法度') || xml.includes('律例')) zhHits++;
      if (xml.includes('statutes') || xml.includes('precepts')) enHits++;
    }
    expect(zhHits).toBeGreaterThan(1);
    expect(enHits).toBeGreaterThan(1);

    const allZh = slidePaths.map(async (p) => zip.file(p)!.async('string'));
    const combined = (await Promise.all(allZh)).join('');
    expect(combined).not.toContain('…');
    expect(combined).toContain('40 ');
  });

  it('resolves numbered books for ChiUn filenames', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      scriptureBook: '诗篇 Psalms',
      scriptureReference: '150:1-6',
    });
    const zip = await JSZip.loadAsync(patched);
    const slide5 = await zip.file('ppt/slides/slide5.xml')!.async('string');
    expect(slide5).toContain('讚美耶和華');
  });

  it('patches chair name on slide 2 and removes slide 3', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      showPreServiceChairName: true,
      preServiceChairNames: '王凯弟兄',
    });
    const zip = await JSZip.loadAsync(patched);
    expect(zip.file('ppt/slides/slide3.xml')).toBeNull();
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide2).toContain('王凯弟兄');
    expect(slide2).toContain('主席會前禱');
  });

  it('reapplies cover date and chair after a blank slide2 overwrite (splice simulation)', async () => {
    const tpl = await readFile(templatePath);
    const base = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      showPreServiceChairName: true,
      preServiceChairNames: '王凯弟兄',
    });
    // 模拟分区 override 用空白页覆盖 slide2（冲掉主席姓名）
    const wiped = await JSZip.loadAsync(base);
    wiped.file(
      'ppt/slides/slide2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="276" name="title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>空白覆盖</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    );
    const wipedBuf = await wiped.generateAsync({ type: 'nodebuffer' });

    const restored = await reapplyBulletinFormFieldsInPptx(wipedBuf, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      showPreServiceChairName: true,
      preServiceChairNames: '王凯弟兄',
    });
    const zip = await JSZip.loadAsync(restored);
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide1).toContain('07/26/2026');
    expect(slide2).toContain('王凯弟兄');
  });

  it('skips form reapply for sections replaced by custom PPT', async () => {
    const tpl = await readFile(templatePath);
    const base = await patchBulletinPreviewInPptx(tpl, {
      serviceDate: '2026-07-26',
      serviceTime: '11:00',
      showPreServiceChairName: true,
      preServiceChairNames: '王凯弟兄',
    });
    const wiped = await JSZip.loadAsync(base);
    wiped.file(
      'ppt/slides/slide2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="276" name="title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>自定义会前</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`,
    );
    const wipedBuf = await wiped.generateAsync({ type: 'nodebuffer' });

    const restored = await reapplyBulletinFormFieldsInPptx(
      wipedBuf,
      {
        serviceDate: '2026-07-26',
        serviceTime: '11:00',
        showPreServiceChairName: true,
        preServiceChairNames: '王凯弟兄',
      },
      { skipPreService: true },
    );
    const zip = await JSZip.loadAsync(restored);
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide1).toContain('07/26/2026');
    expect(slide2).toContain('自定义会前');
    expect(slide2).not.toContain('王凯弟兄');
  });

  it('duplicates P25 for each extra announcement and drops template P26', async () => {
    const { listPptxSlidesInPresentationOrder } = await import('./pptx-presentation-order.js');
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {
      announcements: [
        { title: '特别感谢', body: '感谢甲' },
        { title: '家有喜事', body: '恭喜乙' },
        { title: '新增公告', body: '第三条内容' },
      ],
      visibleAnnouncementCount: 3,
    });
    const zip = await JSZip.loadAsync(patched);
    const order = await listPptxSlidesInPresentationOrder(patched);
    const paths = order.map((s) => s.slidePath);
    const i25 = paths.indexOf('ppt/slides/slide25.xml');
    const i27 = paths.indexOf('ppt/slides/slide27.xml');
    expect(i25).toBeGreaterThanOrEqual(0);
    expect(paths).not.toContain('ppt/slides/slide26.xml');
    expect(i27).toBe(i25 + 3);
    const secondPath = paths[i25 + 1]!;
    const thirdPath = paths[i25 + 2]!;
    expect(secondPath).not.toBe('ppt/slides/slide27.xml');
    expect(thirdPath).not.toBe('ppt/slides/slide27.xml');
    const slide25 = await zip.file('ppt/slides/slide25.xml')!.async('string');
    const second = await zip.file(secondPath)!.async('string');
    const third = await zip.file(thirdPath)!.async('string');
    expect(slide25).toContain('特别感谢');
    expect(slide25).toContain('感谢甲');
    expect(second).toContain('家有喜事');
    expect(second).toContain('恭喜乙');
    expect(third).toContain('新增公告');
    expect(third).toContain('第三条内容');
    // 复制页必须沿用 P25 的 layout16，不能残留 P26 的 layout12
    const secondRels = await zip
      .file(secondPath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels')!
      .async('string');
    expect(secondRels).toContain('slideLayout16');
    expect(secondRels).not.toContain('slideLayout12');
  });

  it('second announcement is a P25 duplicate so 家有喜事 leftovers are gone', async () => {
    const { listPptxSlidesInPresentationOrder } = await import('./pptx-presentation-order.js');
    const tpl = await readFile(templatePath);
    const longBody = [
      '第一行：教会感谢各位同工的摆上与服事。',
      '第二行：本週有多项服事需要更多弟兄姊妹参与。',
      '第三行：请在主日后与同工联系报名。',
      '第四行：愿主纪念并赐福每一位摆上的人。',
      '第五行：详细内容请见周报或现场询问招待。',
    ].join('\n');
    const patched = await patchBulletinPreviewInPptx(tpl, {
      announcements: [
        { title: '特别感谢', body: '短公告' },
        { title: '服事邀请', body: longBody },
      ],
      visibleAnnouncementCount: 2,
    });
    const zip = await JSZip.loadAsync(patched);
    const order = await listPptxSlidesInPresentationOrder(patched);
    const paths = order.map((s) => s.slidePath);
    expect(paths).not.toContain('ppt/slides/slide26.xml');
    const i25 = paths.indexOf('ppt/slides/slide25.xml');
    const secondPath = paths[i25 + 1]!;
    const second = await zip.file(secondPath)!.async('string');
    expect(second).toContain('服事邀请');
    expect(second).toContain('第一行：教会感谢');
    expect(second).toContain('第五行：详细内容');
    // 不再残留模板「家有喜事」正文 / 诗篇经文框
    expect(second).not.toContain('Angelica');
    expect(second).not.toContain('诗篇 127');
    expect(second).not.toContain('Genevieve');
    // 正文框加高（y=1420500 → 贴近画幅底部）
    expect(second).toContain('cy="3579500"');
    expect(second).toContain('sz="2600"');
    const secondRels = await zip
      .file(secondPath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels')!
      .async('string');
    expect(secondRels).toContain('slideLayout16');
  });
});

describe('stabilizeCommunionEnglishSlideXml', () => {
  it('disables spAutoFit and caps body font at 28pt', () => {
    const xml =
      '<a:spAutoFit/><a:rPr sz="3100"/><a:rPr sz="1800"/><a:rPr sz="2800"/><a:ext cx="9144000" cy="4740900"/>';
    const out = stabilizeCommunionEnglishSlideXml(xml);
    expect(out).toContain('<a:noAutofit/>');
    expect(out).not.toContain('spAutoFit');
    expect(out).toContain('sz="2800"');
    expect(out).toContain('sz="1800"');
    expect(out).not.toContain('sz="3100"');
    expect(out).toContain('cy="5000000"');
  });

  it('applies to communion English slides in preview patch', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {});
    const zip = await JSZip.loadAsync(patched);
    for (const n of [12, 13]) {
      const xml = await zip.file(`ppt/slides/slide${n}.xml`)!.async('string');
      expect(xml).not.toContain('spAutoFit');
      expect(xml).toMatch(/sz="2800"/);
      expect(xml).not.toMatch(/sz="(2[9]|[3-9]\d)\d{2}"/);
    }
  });
});

describe('stabilizeOfferingReportSlideXml', () => {
  it('keeps title on one line and centers amount rows without dropping text indices', async () => {
    const tpl = await readFile(templatePath);
    const zip = await JSZip.loadAsync(tpl);
    const before = await zip.file('ppt/slides/slide19.xml')!.async('string');
    const beforeRuns = extractIndexedTextRuns(before);
    const out = stabilizeOfferingReportSlideXml(before);
    const afterRuns = extractIndexedTextRuns(out);
    expect(afterRuns.map((r) => r.textIndex)).toEqual(beforeRuns.map((r) => r.textIndex));
    expect(out).toMatch(/wrap="none"/);
    expect(out).toContain('sz="2400"');
    expect(out).toContain('sz="4000"');
    expect(out).toContain('cy="980000"');
    expect(out).toContain('十一奉獻');
    expect(out).toContain('其他奉獻');
    expect(out).toContain('$3,000.00</a:t>');
    expect(out).toContain('(Tithes):  ');
    expect(out).toContain('(Other):  ');
    // 金额正文框：其他奉献所在段落已居中
    expect(out).toMatch(/algn="ctr"[^>]*>[\s\S]*?<a:t>其他奉獻<\/a:t>/);
  });

  it('applies in preview patch', async () => {
    const tpl = await readFile(templatePath);
    const patched = await patchBulletinPreviewInPptx(tpl, {});
    const zip = await JSZip.loadAsync(patched);
    const xml = await zip.file('ppt/slides/slide19.xml')!.async('string');
    expect(xml).toContain('wrap="none"');
    expect(xml).toContain('cy="980000"');
    expect(xml).toContain('sz="2400"');
  });
});

describe('buildVerseOfWeekSlideReplacements', () => {
  it('writes full verse into textIndex 16 and clears leftover citation/body runs', async () => {
    const tpl = await readFile(templatePath);
    const verse = '(約翰福音 3:16)  神爱世人，甚至将他的独生子赐给他们';
    const patched = await patchBulletinPreviewInPptx(tpl, { verseOfWeek: verse });
    const zip = await JSZip.loadAsync(patched);
    const runs = extractIndexedTextRuns(await zip.file('ppt/slides/slide35.xml')!.async('string'));
    const joined = runs
      .filter((r) => r.textIndex >= 16)
      .map((r) => r.text)
      .join('');
    expect(joined).toContain(verse);
    expect(joined).not.toContain('以弗所書');
    expect(joined.match(/約翰福音/g)?.length).toBe(1);
    expect(buildVerseOfWeekSlideReplacements(verse).map((r) => r.textIndex)).toEqual([16, 17, 18, 19]);
  });
});
