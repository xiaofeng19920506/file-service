import JSZip from 'jszip';
import type { ScriptureSlideBodies, WeeklyBulletin } from '../api/bulletins';
import { applyScripturePagesToZip } from './bulletin-scripture-pptx-zip';
import { patchCoverDateLineInSlideXml } from './bulletin-pptx-patches';
import { applyIndexedTextReplacementsToSlideXml } from './pptx-preview';

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function formatScriptureBookRun(book: string): string {
  const trimmed = book.trim();
  if (!trimmed) return '';
  return /\s$/.test(trimmed) ? trimmed : `${trimmed}   `;
}

function formatScriptureReferenceRun(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return '';
  return trimmed.startsWith(' ') ? trimmed : ` ${trimmed}`;
}

/**
 * 生成与预览 PNG API（`patchBulletinPreviewInPptx`）放映顺序一致的 PPTX。
 * 浏览器端使用 API 拉取的经文分页，避免 deckPlan 与 `data-slide` 错位。
 */
export async function buildPreviewMatchingPptx(
  templateBlob: Blob,
  bulletin: Pick<
    WeeklyBulletin,
    'serviceDate' | 'serviceTime' | 'scriptureBook' | 'scriptureReference'
  >,
  scriptureBodies: ScriptureSlideBodies | null,
  filename = 'bulletin-preview.pptx',
): Promise<File> {
  const zip = await JSZip.loadAsync(await templateBlob.arrayBuffer());

  if (bulletin.serviceDate) {
    const slide1 = zip.file('ppt/slides/slide1.xml');
    if (slide1) {
      const xml = await slide1.async('string');
      zip.file(
        'ppt/slides/slide1.xml',
        patchCoverDateLineInSlideXml(
          xml,
          bulletin.serviceDate,
          bulletin.serviceTime || '11:00',
        ),
      );
    }
  }

  const book = bulletin.scriptureBook?.trim() ?? '';
  const reference = bulletin.scriptureReference?.trim() ?? '';

  if (book || reference) {
    const slide4 = zip.file('ppt/slides/slide4.xml');
    if (slide4) {
      let xml = await slide4.async('string');
      const replacements: { textIndex: number; text: string }[] = [];
      const bookRun = formatScriptureBookRun(book);
      const refRun = formatScriptureReferenceRun(reference);
      if (bookRun) replacements.push({ textIndex: 4, text: bookRun });
      if (refRun) replacements.push({ textIndex: 5, text: refRun });
      if (replacements.length) {
        xml = applyIndexedTextReplacementsToSlideXml(xml, replacements);
      }
      zip.file('ppt/slides/slide4.xml', xml);
    }
  }

  if (book && reference && scriptureBodies) {
    await applyScripturePagesToZip(
      zip,
      scriptureBodies.chinesePages,
      scriptureBodies.englishPages,
    );
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], filename, { type: PPTX_MIME });
}
