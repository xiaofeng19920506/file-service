import { describe, expect, it } from 'vitest';
import { moveElement, setElementBox } from './ppt-ops/shape';
import {
  DEFAULT_SLIDE_SIZE,
  emuToPct,
  pctToEmu,
  readBox,
  findElementById,
  slideSizeFromXml,
} from './ppt-ops/xml';

const SLIDE = { cx: 9144000, cy: 5143500 };

function slideXml(box = { x: 13500, y: 1645925, cx: 9117000, cy: 2997000 }): string {
  return (
    '<p:sld><p:cSld><p:spTree>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="264" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>hi</a:t></a:r></a:p></p:txBody>' +
    '</p:sp></p:spTree></p:cSld></p:sld>'
  );
}

describe('slideSizeFromXml', () => {
  it('reads cx/cy regardless of attribute order', () => {
    expect(slideSizeFromXml('<p:presentation><p:sldSz cx="9144000" cy="5143500"/>')).toEqual(SLIDE);
    // Google Slides 导出把 cy 写在前面，旧正则会静默回退默认值
    expect(slideSizeFromXml('<p:presentation><p:sldSz cy="5143500" cx="9144000"/>')).toEqual(SLIDE);
  });

  it('reads sldSz with extra attributes and non self-closing form', () => {
    expect(
      slideSizeFromXml('<p:sldSz type="screen16x9" cy="5143500" cx="9144000"></p:sldSz>'),
    ).toEqual(SLIDE);
  });

  it('falls back when missing or invalid', () => {
    expect(slideSizeFromXml(null)).toEqual(DEFAULT_SLIDE_SIZE);
    expect(slideSizeFromXml('<p:sldSz cx="0" cy="0"/>')).toEqual(DEFAULT_SLIDE_SIZE);
    expect(slideSizeFromXml('<p:sldSz cy="5143500" cx="9144000"/>', SLIDE)).toEqual(SLIDE);
  });
});

describe('canvas drag round-trip', () => {
  it('keeps size unchanged and applies the requested offset', () => {
    const xml = slideXml();
    const before = readBox(findElementById(xml, 264)!.xml)!;

    const next = moveElement(
      xml,
      264,
      pctToEmu(6.28, SLIDE.cx),
      pctToEmu(7.45, SLIDE.cy),
      SLIDE,
    );
    const after = readBox(findElementById(next, 264)!.xml)!;

    expect(after.cx).toBe(before.cx);
    expect(after.cy).toBe(before.cy);
    expect(emuToPct(after.x - before.x, SLIDE.cx)).toBeCloseTo(6.28, 2);
    expect(emuToPct(after.y - before.y, SLIDE.cy)).toBeCloseTo(7.45, 2);
  });

  it('resize writes back the exact percentage box the canvas showed', () => {
    const xml = slideXml();
    const pct = { leftPct: 0.147638, topPct: 32.0001, widthPct: 99.7047, heightPct: 58.2677 };
    const next = setElementBox(xml, 264, {
      x: pctToEmu(pct.leftPct, SLIDE.cx),
      y: pctToEmu(pct.topPct, SLIDE.cy),
      cx: pctToEmu(pct.widthPct, SLIDE.cx),
      cy: pctToEmu(pct.heightPct, SLIDE.cy),
    });
    const box = readBox(findElementById(next, 264)!.xml)!;

    expect(emuToPct(box.x, SLIDE.cx)).toBeCloseTo(pct.leftPct, 3);
    expect(emuToPct(box.cx, SLIDE.cx)).toBeCloseTo(pct.widthPct, 3);
    expect(emuToPct(box.cy, SLIDE.cy)).toBeCloseTo(pct.heightPct, 3);
  });
});
