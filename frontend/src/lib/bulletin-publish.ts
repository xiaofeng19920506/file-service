import { fetchBlobPreviewPptx, uploadFile } from '../api/client';
import {
  fetchBulletinTemplateFile,
  updateBulletin,
  type WeeklyBulletin,
} from '../api/bulletins';
import { generateBulletinPptx } from './bulletin-pptx';

export function bulletinPptxTitle(serviceDate: string): string {
  return `周报 ${serviceDate}`;
}

export async function buildBulletinPptxFile(bulletin: WeeklyBulletin): Promise<File> {
  const template = await fetchBulletinTemplateFile();
  return generateBulletinPptx(template, bulletin);
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
