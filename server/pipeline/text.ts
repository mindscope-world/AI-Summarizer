/**
 * Decodes uploaded text: honours UTF-8/UTF-16 byte-order marks, tries strict UTF-8,
 * and falls back to Windows-1252 (common for older Word exports saved as .txt).
 */
export function decodeText(buffer: Buffer): {text: string; warnings: string[]} {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {text: new TextDecoder('utf-8').decode(buffer.subarray(3)), warnings: []};
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), warnings: []};
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Node's TextDecoder has no utf-16be label reliably; swap bytes then decode as LE.
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return {text: new TextDecoder('utf-16le').decode(swapped), warnings: []};
  }
  try {
    return {text: new TextDecoder('utf-8', {fatal: true}).decode(buffer), warnings: []};
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(buffer),
      warnings: ['The file is not valid UTF-8; it was decoded as Windows-1252. Some characters may look wrong.'],
    };
  }
}
