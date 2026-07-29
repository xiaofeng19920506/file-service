import { describe, expect, it } from 'vitest';
import { applyIndexedTextReplacementsToSlideXml } from '@file-service/shared';
import {
  buildOfferingAmountReplacements,
  buildOfferingDateReplacements,
} from './bulletin-pptx-patches';

describe('buildOfferingDateReplacements', () => {
  it('writes full date into fragment start and clears trailing shards', () => {
    const reps = buildOfferingDateReplacements('06/07/2026');
    expect(reps).toEqual([
      { textIndex: 7, text: '06/07/2026' },
      { textIndex: 8, text: '' },
      { textIndex: 9, text: '' },
      { textIndex: 10, text: '' },
      { textIndex: 11, text: '' },
    ]);
  });

  it('does not mash date into the colon run', () => {
    const xml = `
<p:sp><p:txBody>
<a:p>
  <a:r><a:t>上週奉獻</a:t></a:r>
  <a:r><a:t>:</a:t></a:r>
  <a:r><a:t>0</a:t></a:r>
  <a:r><a:t>6/07</a:t></a:r>
  <a:r><a:t>/20</a:t></a:r>
  <a:r><a:t>2</a:t></a:r>
  <a:r><a:t>6</a:t></a:r>
</a:p>
</p:txBody></p:sp>`;
    const padded = `${'<a:r><a:t>x</a:t></a:r>'.repeat(5)}${xml}`;
    const out = applyIndexedTextReplacementsToSlideXml(
      padded,
      buildOfferingDateReplacements('06/07/2026'),
    );
    expect(out).toContain('上週奉獻');
    expect(out).toContain('<a:t>:</a:t>');
    expect(out).toContain('<a:t>06/07/2026</a:t>');
    expect(out).not.toMatch(/06\/07\/202606\/07\/2026/);
    expect(out).not.toContain('<a:t>6/07</a:t>');
  });
});

describe('buildOfferingAmountReplacements', () => {
  it('writes tithe, other, and computed total into correct amount runs', () => {
    expect(
      buildOfferingAmountReplacements({
        offeringTitheAmount: '3260',
        offeringOtherAmount: '3000',
      }),
    ).toEqual([
      { textIndex: 14, text: '$3,260.00' },
      { textIndex: 18, text: '$3,000.00' },
      { textIndex: 22, text: '$6,260.00' },
    ]);
  });

  it('prefers server total when present', () => {
    expect(
      buildOfferingAmountReplacements({
        offeringTitheAmount: '100',
        offeringOtherAmount: '50',
        offeringTotalAmount: '150.00',
      }),
    ).toContainEqual({ textIndex: 22, text: '$150.00' });
  });

  it('replaces template amounts without leaving old digits or mangling $1', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const JSZip = (await import('jszip')).default;
    const tpl = readFileSync(join(import.meta.dirname, '../../../shared/templates/bulletin/06_14_2026.pptx'));
    const zip = await JSZip.loadAsync(tpl);
    const xml = await zip.file('ppt/slides/slide19.xml')!.async('string');
    const out = applyIndexedTextReplacementsToSlideXml(
      xml,
      buildOfferingAmountReplacements({
        offeringTitheAmount: '1111',
        offeringOtherAmount: '2222',
      }),
    );
    expect(out).toContain('$1,111.00');
    expect(out).toContain('$2,222.00');
    expect(out).toContain('$3,333.00');
    expect(out).not.toContain('$3,260.00');
    expect(out).not.toContain('$3,000.00');
    expect(out).not.toContain('$6,260.00');
    // 回归：`$1` 曾被当成 replace 捕获组，金额变成 `,111.00`
    expect(out).not.toMatch(/<a:t[^>]*>,111\.00<\/a:t>/);
  });
});
