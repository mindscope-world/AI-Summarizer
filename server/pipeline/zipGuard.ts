import {unprocessable} from '../lib/errors';

/** A .docx is a ZIP: a few kilobytes can declare (and inflate to) gigabytes. */
export const DEFAULT_LIMITS = {
  /** Sum of every entry's uncompressed size. Real documents, images included, are far below this. */
  maxUncompressedBytes: 250 * 1024 * 1024,
  maxEntries: 5_000,
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN = 22;

/**
 * Reads a ZIP's central directory and refuses archives that declare too much data, before anything
 * is inflated. It checks the sizes the archive *declares*; an archive that lies about them is also
 * caught later, because the ZIP reader used for extraction rejects entries whose real size differs.
 */
export function assertSafeArchive(buffer: Buffer, limits = DEFAULT_LIMITS): void {
  const bad = () => unprocessable('The DOCX file could not be read. It may be corrupted or not a real Word document.');

  // The end-of-central-directory record sits at the very end, followed only by an optional comment (<= 64 KB).
  let eocd = -1;
  for (let i = buffer.length - EOCD_MIN; i >= Math.max(0, buffer.length - EOCD_MIN - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad();

  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  // 0xFFFF / 0xFFFFFFFF mean ZIP64, which Word documents never need.
  if (entries === 0xffff || directoryOffset === 0xffffffff) throw unprocessable('This DOCX uses an archive format that is not supported.');
  if (entries > limits.maxEntries) throw unprocessable(`This DOCX contains too many parts (${entries}). It may not be a real Word document.`);

  let total = 0;
  let offset = directoryOffset;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw bad();
    total += buffer.readUInt32LE(offset + 24);
    if (total > limits.maxUncompressedBytes) {
      throw unprocessable('This DOCX expands to far more data than a normal document, so it was not opened.');
    }
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}
