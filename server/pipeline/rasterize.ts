import {createRequire} from 'node:module';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {unprocessable} from '../lib/errors';

export interface PageImage {
  mime: 'image/png' | 'image/jpeg';
  data: Buffer;
  width: number;
  height: number;
}

export interface RasterizeOptions {
  /** Refuse PDFs with more pages than this. */
  maxPages: number;
  /** Longest side of the rendered page in pixels (about 140 DPI for A4). */
  targetLongSidePx?: number;
  /** Vision APIs cap image size; re-encode as JPEG above this many bytes. */
  maxImageBytes?: number;
}

/** Directory of pdf.js' bundled standard fonts, so non-embedded fonts (Helvetica etc.) render as real glyphs. */
function standardFontsDir(): string {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  return path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
}

/**
 * Renders every page of a PDF to an image (for vision-model OCR). Runs fully in memory.
 * Pages are rendered one at a time to keep peak memory low.
 */
export async function rasterizePdf(buffer: Buffer, opts: RasterizeOptions): Promise<PageImage[]> {
  const target = opts.targetLongSidePx ?? 1600;
  const maxBytes = opts.maxImageBytes ?? 3_000_000;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const task = pdfjs.getDocument({data: new Uint8Array(buffer), verbosity: 0, standardFontDataUrl: standardFontsDir()});
  let doc;
  try {
    doc = await task.promise;
  } catch {
    await task.destroy().catch(() => undefined);
    throw unprocessable('The PDF could not be read. It may be corrupted or password-protected.');
  }

  try {
    if (doc.numPages > opts.maxPages) {
      throw unprocessable(`This scanned PDF has ${doc.numPages} pages; the OCR limit is ${opts.maxPages}. Split it into smaller files.`);
    }
    const images: PageImage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({scale: 1});
      const scale = Math.min(4, target / Math.max(base.width, base.height));
      const viewport = page.getViewport({scale});
      const width = Math.max(1, Math.round(viewport.width));
      const height = Math.max(1, Math.round(viewport.height));

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // PDFs are transparent by default; OCR needs dark text on white
      ctx.fillRect(0, 0, width, height);
      await page.render({canvas: canvas as unknown as HTMLCanvasElement, viewport}).promise;

      let data = canvas.toBuffer('image/png');
      let mime: PageImage['mime'] = 'image/png';
      if (data.length > maxBytes) {
        data = canvas.toBuffer('image/jpeg', 80);
        mime = 'image/jpeg';
      }
      images.push({mime, data, width, height});
      page.cleanup();
    }
    return images;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
