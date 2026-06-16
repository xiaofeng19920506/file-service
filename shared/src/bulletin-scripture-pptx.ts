import type JSZip from 'jszip';
import {
  patchChineseScriptureBodyInSlideXml,
  patchEnglishScriptureBodyInSlideXml,
} from './bulletin-scripture-body-patch.js';
import { duplicateSlideInZip } from './pptx-duplicate-slide.js';

const SLIDE5_PATH = 'ppt/slides/slide5.xml';
const SLIDE6_PATH = 'ppt/slides/slide6.xml';

/** 在读经段插入多页中文/英文经文（slide 5/6 为模板，超出部分复制同版式页） */
export async function applyScripturePagesToZip(
  zip: JSZip,
  chinesePages: string[],
  englishPages: string[][],
): Promise<void> {
  const zhPages = chinesePages.filter((p) => p.trim());
  const enPages = englishPages.filter((p) => p.length);

  if (zhPages.length) {
    const slide5 = zip.file(SLIDE5_PATH);
    if (slide5) {
      const xml = await slide5.async('string');
      zip.file(SLIDE5_PATH, patchChineseScriptureBodyInSlideXml(xml, zhPages[0]));
    }

    let lastChinesePath = SLIDE5_PATH;
    for (let i = 1; i < zhPages.length; i++) {
      lastChinesePath = await duplicateSlideInZip(zip, SLIDE5_PATH, {
        insertAfterPath: lastChinesePath,
      });
      const entry = zip.file(lastChinesePath);
      if (!entry) continue;
      const xml = await entry.async('string');
      zip.file(lastChinesePath, patchChineseScriptureBodyInSlideXml(xml, zhPages[i]));
    }
  }

  if (enPages.length) {
    const slide6 = zip.file(SLIDE6_PATH);
    if (slide6) {
      const xml = await slide6.async('string');
      zip.file(SLIDE6_PATH, patchEnglishScriptureBodyInSlideXml(xml, enPages[0]));
    }

    let lastEnglishPath = SLIDE6_PATH;
    for (let i = 1; i < enPages.length; i++) {
      lastEnglishPath = await duplicateSlideInZip(zip, SLIDE6_PATH, {
        insertAfterPath: lastEnglishPath,
      });
      const entry = zip.file(lastEnglishPath);
      if (!entry) continue;
      const xml = await entry.async('string');
      zip.file(lastEnglishPath, patchEnglishScriptureBodyInSlideXml(xml, enPages[i]));
    }
  }
}
