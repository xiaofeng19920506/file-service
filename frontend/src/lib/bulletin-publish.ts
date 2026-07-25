import { fetchBlobContent, fetchBlobPreviewPptx, uploadFile } from '../api/client';
import {
  fetchBulletinTemplateFile,
  updateBulletin,
  type WeeklyBulletin,
} from '../api/bulletins';
import { generateBulletinPptx } from './bulletin-pptx';
import { pptxSlidesAreWellFormed } from './pptx-integrity';

export function bulletinPptxTitle(serviceDate: string): string {
  return `周报 ${serviceDate}`;
}

async function loadSectionPptxBlobs(
  overrides: Record<string, string> | undefined,
): Promise<Record<string, Blob>> {
  const out: Record<string, Blob> = {};
  for (const [sectionId, blobId] of Object.entries(overrides ?? {})) {
    if (!sectionId || !blobId) continue;
    const blob = await fetchBlobContent(blobId);
    // 结构损坏的分区文件会让整份周报出现空白页，宁可退回模板生成的原始分区
    if (!(await pptxSlidesAreWellFormed(blob))) {
      console.warn(`bulletin section pptx ${sectionId} (${blobId}) is malformed, using template`);
      continue;
    }
    out[sectionId] = blob;
  }
  return out;
}

export async function buildBulletinPptxFile(bulletin: WeeklyBulletin): Promise<File> {
  const template = await fetchBulletinTemplateFile();
  const sectionBlobs = await loadSectionPptxBlobs(bulletin.sectionPptxOverrides);
  return generateBulletinPptx(template, bulletin, sectionBlobs);
}

/** 优先使用已发布到诗库的 PPT，否则客户端即时生成 */
export async function resolveBulletinPptxBlob(bulletin: WeeklyBulletin): Promise<Blob> {
  if (bulletin.outputBlobId) {
    return fetchBlobPreviewPptx(bulletin.outputBlobId);
  }
  return buildBulletinPptxFile(bulletin);
}

export async function publishBulletinPptx(
  bulletin: WeeklyBulletin,
): Promise<{ blobId: string; bulletin: WeeklyBulletin }> {
  const file = await buildBulletinPptxFile(bulletin);
  const uploaded = await uploadFile(file, {
    title: bulletinPptxTitle(bulletin.serviceDate),
    notes: `weekly bulletin ${bulletin.serviceDate}`,
  });

  const updated = await updateBulletin(bulletin.id, {
    outputBlobId: uploaded.blobId,
    status: 'ready',
  });

  return { blobId: uploaded.blobId, bulletin: updated };
}
