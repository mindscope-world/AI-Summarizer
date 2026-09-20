import JSZip from 'jszip';
import {describe, expect, it} from 'vitest';
import {AppError} from '../lib/errors';
import {makeDocx} from '../testing/fixtures';
import {extractDocx} from './docx';
import {assertSafeArchive, DEFAULT_LIMITS} from './zipGuard';

const failure = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  return null;
};

describe('assertSafeArchive', () => {
  it('accepts a normal document', async () => {
    const docx = await makeDocx(['A paragraph of ordinary text.', 'Another one.']);
    expect(failure(() => assertSafeArchive(docx))).toBeNull();
  });

  it('refuses an archive that declares more data than the limit, with a 422', async () => {
    const docx = await makeDocx(['x '.repeat(2000)]);
    const err = failure(() => assertSafeArchive(docx, {...DEFAULT_LIMITS, maxUncompressedBytes: 1000}));
    expect(err).toMatchObject({status: 422});
    expect(err!.message).toMatch(/expands to far more data/);
  });

  it('refuses an archive with an absurd number of parts', async () => {
    const zip = new JSZip();
    for (let i = 0; i < 30; i++) zip.file(`f${i}.txt`, 'x');
    const buf = await zip.generateAsync({type: 'nodebuffer'});
    expect(failure(() => assertSafeArchive(buf, {...DEFAULT_LIMITS, maxEntries: 10}))).toMatchObject({status: 422});
  });

  it('catches a real compression bomb by its declared size (a few KB that inflate to 100 MB)', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', Buffer.alloc(100 * 1024 * 1024), {compression: 'DEFLATE', compressionOptions: {level: 9}});
    const bomb = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: {level: 9}});
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(failure(() => assertSafeArchive(bomb, {...DEFAULT_LIMITS, maxUncompressedBytes: 50 * 1024 * 1024}))).toMatchObject({status: 422});
  });

  it('treats a file without a ZIP directory as unreadable rather than crashing', () => {
    expect(failure(() => assertSafeArchive(Buffer.from('PK\u0003\u0004 not really a zip at all')))).toMatchObject({status: 422});
    expect(failure(() => assertSafeArchive(Buffer.alloc(0)))).toMatchObject({status: 422});
  });

  it('is applied when extracting a DOCX, before any inflating', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', Buffer.alloc(300 * 1024 * 1024), {compression: 'DEFLATE', compressionOptions: {level: 9}});
    const bomb = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: {level: 9}});
    const started = Date.now();
    await expect(extractDocx(bomb)).rejects.toMatchObject({status: 422});
    expect(Date.now() - started).toBeLessThan(2000);
  }, 30_000);
});
