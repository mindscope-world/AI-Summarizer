import {describe, expect, it} from 'vitest';
import {usableMetadataText} from './pdf';

describe('usableMetadataText', () => {
  it.each([undefined, null, 42, '', '  ', '()', '--', 'x', 'Untitled', 'unknown', 'Microsoft Word - notes.doc'])(
    'discards junk metadata %j',
    (value) => {
      expect(usableMetadataText(value)).toBeUndefined();
    },
  );

  it('keeps a real title, trimmed', () => {
    expect(usableMetadataText('  Distributed Systems: Lecture 4  ')).toBe('Distributed Systems: Lecture 4');
    expect(usableMetadataText('Kamau, J.')).toBe('Kamau, J.');
  });
});
