import type JSZip from 'jszip';

function slideNumber(path: string): number {
  return parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? '0', 10);
}

function listSlidePaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
}

function nextSlidePath(zip: JSZip): string {
  const nums = listSlidePaths(zip).map(slideNumber);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `ppt/slides/slide${next}.xml`;
}

function nextNumericRelId(relsXml: string): string {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

function nextSldId(presentationXml: string): number {
  const ids = [...presentationXml.matchAll(/<p:sldId id="(\d+)"/g)].map((m) =>
    parseInt(m[1], 10),
  );
  return (ids.length ? Math.max(...ids) : 255) + 1;
}

function readPresentationParts(zip: JSZip) {
  const presPath = 'ppt/presentation.xml';
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const presEntry = zip.file(presPath);
  const relsEntry = zip.file(relsPath);
  if (!presEntry || !relsEntry) throw new Error('invalid_pptx');
  return { presPath, relsPath, presEntry, relsEntry };
}

function slidePathToRelId(relsXml: string, slidePath: string): string | null {
  const fileName = slidePath.split('/').pop()!;
  const escaped = fileName.replace(/\./g, '\\.');
  const byIdFirst = new RegExp(
    `Id="(rId\\d+)"[^>]*Target="(?:(?:\\.\\./)?slides/)?${escaped}"`,
  );
  const byTargetFirst = new RegExp(
    `Target="(?:(?:\\.\\./)?slides/)?${escaped}"[^>]*Id="(rId\\d+)"`,
  );
  return byIdFirst.exec(relsXml)?.[1] ?? byTargetFirst.exec(relsXml)?.[1] ?? null;
}

async function addContentTypeAsync(zip: JSZip, partPath: string) {
  const ctPath = '[Content_Types].xml';
  const entry = zip.file(ctPath);
  if (!entry) return;
  const norm = partPath.startsWith('/') ? partPath : `/ppt/${partPath.replace(/^ppt\//, '')}`;
  let xml = await entry.async('string');
  if (xml.includes(`PartName="${norm}"`)) return;
  const override = `<Override PartName="${norm}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  xml = xml.replace('</Types>', `${override}</Types>`);
  zip.file(ctPath, xml);
}

function remapSlideRelsAndXml(
  relsXml: string,
  slideXml: string,
): { relsXml: string; slideXml: string } {
  const idMap = new Map<string, string>();
  let counter = 1;
  for (const m of relsXml.matchAll(/Id="(rId\d+)"/g)) {
    const oldId = m[1];
    if (!idMap.has(oldId)) idMap.set(oldId, `rId${9000 + counter++}`);
  }
  let newRels = relsXml;
  let newSlide = slideXml;
  for (const [oldId, newId] of idMap) {
    newRels = newRels.replaceAll(`Id="${oldId}"`, `Id="${newId}"`);
    newSlide = newSlide.replaceAll(`r:embed="${oldId}"`, `r:embed="${newId}"`);
    newSlide = newSlide.replaceAll(`r:link="${oldId}"`, `r:link="${newId}"`);
  }
  return { relsXml: newRels, slideXml: newSlide };
}

/** 在 ZIP 内复制一页幻灯片，返回新 slide 路径 */
export async function duplicateSlideInZip(
  zip: JSZip,
  sourceSlidePath: string,
  options?: { insertAfterPath?: string | null },
): Promise<string> {
  const srcEntry = zip.file(sourceSlidePath);
  if (!srcEntry) throw new Error('slide_not_found');

  const srcRelsPath = sourceSlidePath
    .replace('ppt/slides/', 'ppt/slides/_rels/')
    .replace('.xml', '.xml.rels');
  const srcRelsEntry = zip.file(srcRelsPath);

  const newSlidePath = nextSlidePath(zip);
  const newSlideFile = newSlidePath.split('/').pop()!;
  const newRelsPath = `ppt/slides/_rels/${newSlideFile}.rels`;

  let slideXml = await srcEntry.async('string');

  if (srcRelsEntry) {
    let relsXml = await srcRelsEntry.async('string');
    ({ relsXml, slideXml } = remapSlideRelsAndXml(relsXml, slideXml));
    zip.file(newRelsPath, relsXml);
  }

  zip.file(newSlidePath, slideXml);
  await addContentTypeAsync(zip, newSlidePath);

  const { presPath, relsPath, presEntry, relsEntry } = readPresentationParts(zip);
  let presXml = await presEntry.async('string');
  let presRels = await relsEntry.async('string');

  const newPresRelId = nextNumericRelId(presRels);
  const target = `slides/${newSlideFile}`;
  presRels = presRels.replace(
    '</Relationships>',
    `<Relationship Id="${newPresRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/></Relationships>`,
  );

  const newSldId = nextSldId(presXml);
  const sldIdTag = `<p:sldId id="${newSldId}" r:id="${newPresRelId}"/>`;

  const insertAfter = options?.insertAfterPath;
  if (insertAfter === null) {
    presXml = presXml.replace(/<p:sldIdLst>/, `<p:sldIdLst>${sldIdTag}`);
  } else if (insertAfter) {
    const afterRelId = slidePathToRelId(presRels, insertAfter);
    if (afterRelId) {
      const re = new RegExp(`(<p:sldId[^>]*r:id="${afterRelId}"[^/]*/>)`);
      presXml = presXml.replace(re, `$1${sldIdTag}`);
    } else {
      presXml = presXml.replace('</p:sldIdLst>', `${sldIdTag}</p:sldIdLst>`);
    }
  } else {
    presXml = presXml.replace('</p:sldIdLst>', `${sldIdTag}</p:sldIdLst>`);
  }

  zip.file(presPath, presXml);
  zip.file(relsPath, presRels);

  return newSlidePath;
}

async function removeContentTypeAsync(zip: JSZip, partPath: string) {
  const ctPath = '[Content_Types].xml';
  const entry = zip.file(ctPath);
  if (!entry) return;
  const norm = partPath.startsWith('/') ? partPath : `/ppt/${partPath.replace(/^ppt\//, '')}`;
  let xml = await entry.async('string');
  xml = xml.replace(
    new RegExp(`<Override PartName="${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`, 'g'),
    '',
  );
  zip.file(ctPath, xml);
}

/** 从 PPTX zip 中移除指定幻灯片（同步改 presentation / rels / content types） */
export async function removeSlidesFromPptxZip(zip: JSZip, slidePaths: string[]): Promise<void> {
  if (!slidePaths.length) return;
  const { presPath, relsPath, presEntry, relsEntry } = readPresentationParts(zip);
  let presXml = await presEntry.async('string');
  let presRels = await relsEntry.async('string');

  for (const slidePath of slidePaths) {
    const relId = slidePathToRelId(presRels, slidePath);
    if (relId) {
      // 不能用 [^/]*：Relationship@Type 的 URL 含大量 "/"
      presXml = presXml.replace(new RegExp(`<p:sldId[^>]*r:id="${relId}"[^>]*/>`, 'g'), '');
      presRels = presRels.replace(new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*/>`, 'g'), '');
      presRels = presRels.replace(new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*>\\s*</Relationship>`, 'g'), '');
    }
    const relsFile = slidePath
      .replace('ppt/slides/', 'ppt/slides/_rels/')
      .replace('.xml', '.xml.rels');
    zip.remove(slidePath);
    zip.remove(relsFile);
    await removeContentTypeAsync(zip, slidePath);
  }

  zip.file(presPath, presXml);
  zip.file(relsPath, presRels);
}
