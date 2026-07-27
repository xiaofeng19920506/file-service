import { describe, expect, it } from 'vitest';
import { applyIndexedTextReplacementsToSlideXml } from '@file-service/shared';
import { buildOfferingDateReplacements } from './bulletin-pptx-patches';

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
    // Minimal slide19-like date paragraph runs (indexes 5–11)
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
    // Global indexes would start at 0 here; offset by padding 5 dummy runs
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
