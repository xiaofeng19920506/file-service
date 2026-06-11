import { Automizer } from 'pptx-automizer';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function mergePresentations(
  orderedPptxPaths: string[],
  outputFile: string,
): Promise<void> {
  if (orderedPptxPaths.length === 0) {
    throw new Error('no input presentations');
  }
  const workDir = join(dirname(outputFile), `automizer-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    for (let i = 0; i < orderedPptxPaths.length; i++) {
      await copyFile(orderedPptxPaths[i], join(workDir, `${i}.pptx`));
    }
    const automizer = new Automizer({
      templateDir: workDir,
      outputDir: workDir,
      removeExistingSlides: false,
      autoImportSlideMasters: true,
      verbosity: 0,
    });
    let pres = automizer.loadRoot('0.pptx');
    for (let i = 1; i < orderedPptxPaths.length; i++) {
      pres = pres.load(`${i}.pptx`, `t${i}`);
    }
    if (orderedPptxPaths.length > 1) {
      const info = await pres.getInfo();
      for (let i = 1; i < orderedPptxPaths.length; i++) {
        const label = `t${i}`;
        const slides = info.slidesByTemplate(label);
        const orderedSlides = [...slides].sort((a, b) => a.number - b.number);
        for (const slide of orderedSlides) {
          pres = pres.addSlide(label, slide.number);
        }
      }
    }
    const outputName = 'merged.pptx';
    await pres.write(outputName);
    await copyFile(join(workDir, outputName), outputFile);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
