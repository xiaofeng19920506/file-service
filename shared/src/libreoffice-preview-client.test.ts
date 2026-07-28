import { describe, expect, it } from 'vitest';
import {
  isValidLibreOfficePreviewUrlList,
  parseLibreOfficePreviewUrls,
} from './libreoffice-preview-client.js';

describe('parseLibreOfficePreviewUrls', () => {
  it('splits and trims comma-separated urls', () => {
    expect(
      parseLibreOfficePreviewUrls(' http://localhost:3010 , http://localhost:3011/ '),
    ).toEqual(['http://localhost:3010', 'http://localhost:3011']);
  });

  it('returns empty for blank', () => {
    expect(parseLibreOfficePreviewUrls('')).toEqual([]);
    expect(parseLibreOfficePreviewUrls(null)).toEqual([]);
  });
});

describe('isValidLibreOfficePreviewUrlList', () => {
  it('accepts single and comma-separated http(s) urls', () => {
    expect(isValidLibreOfficePreviewUrlList('http://localhost:3010')).toBe(true);
    expect(
      isValidLibreOfficePreviewUrlList('http://localhost:3010,http://localhost:3011'),
    ).toBe(true);
    expect(isValidLibreOfficePreviewUrlList('https://preview.example.com')).toBe(true);
  });

  it('rejects invalid or non-http urls', () => {
    expect(isValidLibreOfficePreviewUrlList('not-a-url')).toBe(false);
    expect(isValidLibreOfficePreviewUrlList('ftp://localhost:3010')).toBe(false);
    expect(isValidLibreOfficePreviewUrlList('http://localhost:3010,bad')).toBe(false);
    expect(isValidLibreOfficePreviewUrlList('')).toBe(false);
    expect(isValidLibreOfficePreviewUrlList(',')).toBe(false);
  });
});
