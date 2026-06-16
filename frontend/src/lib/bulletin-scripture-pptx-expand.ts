import JSZip from 'jszip';
import type { ScriptureSlideBodies } from '../api/bulletins';
import {
  patchChineseScriptureBodyInSlideXml,
  patchSlide6ScriptureBodyInSlideXml,
} from './bulletin-scripture-body-patch';
import { duplicateSlideInPptx } from './pptx-preview';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const SLIDE5_PATH = 'ppt/slides/slide5.xml';
const SLIDE6_PATH = 'ppt/slides/slide6.xml';

/** 在读经段复制 slide 5/6 模板以容纳多页经文（首屏已在 applySlidePatches 中写入） */
export async function expandScriptureSlidesInPptx(
  file: File,
  bodies: ScriptureSlideBodies,
): Promise<File> {
  const zhExtra = bodies.chinesePages.slice(1).filter((p) => p.trim());
  const enExtra = bodies.englishPages.slice(1).filter((p) => p.length);
  if (!zhExtra.length && !enExtra.length) return file;

  let working = file;

  let lastChinesePath = SLIDE5_PATH;
  for (const text of zhExtra) {
    const { file: next, newSlidePath } = await duplicateSlideInPptx(working, SLIDE5_PATH, {
      insertAfterPath: lastChinesePath,
    });
    const zip = await JSZip.loadAsync(next);
    const entry = zip.file(newSlidePath);
    if (entry) {
      const xml = await entry.async('string');
      zip.file(newSlidePath, patchChineseScriptureBodyInSlideXml(xml, text));
      const buf = await zip.generateAsync({ type: 'arraybuffer' });
      working = new File([buf], working.name, { type: PPTX_MIME });
    } else {
      working = next;
    }
    lastChinesePath = newSlidePath;
  }

  let lastEnglishPath = SLIDE6_PATH;
  for (const lines of enExtra) {
    const { file: next, newSlidePath } = await duplicateSlideInPptx(working, SLIDE6_PATH, {
      insertAfterPath: lastEnglishPath,
    });
    const zip = await JSZip.loadAsync(next);
    const entry = zip.file(newSlidePath);
    if (entry) {
      const xml = await entry.async('string');
      zip.file(newSlidePath, patchSlide6ScriptureBodyInSlideXml(xml, null, lines));
      const buf = await zip.generateAsync({ type: 'arraybuffer' });
      working = new File([buf], working.name, { type: PPTX_MIME });
    } else {
      working = next;
    }
    lastEnglishPath = newSlidePath;
  }

  return working;
}
