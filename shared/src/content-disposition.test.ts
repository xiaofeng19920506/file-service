import { describe, expect, it } from 'vitest';
import { contentDisposition } from './content-disposition.js';

describe('contentDisposition', () => {
  it('keeps ascii filenames', () => {
    expect(contentDisposition('inline', 'file.pptx')).toBe(
      'inline; filename="file.pptx"; filename*=UTF-8\'\'file.pptx',
    );
  });

  it('encodes chinese filenames for HTTP headers', () => {
    const header = contentDisposition('inline', '周报-2026-07-26-封面.pptx');
    expect(header.startsWith('inline; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E5%91%A8%E6%8A%A5');
    expect(/[^\x00-\x7F]/.test(header)).toBe(false);
  });
});
