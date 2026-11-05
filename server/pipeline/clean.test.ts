import {describe, expect, it} from 'vitest';
import {cleanDocument} from './clean';

describe('cleanDocument: character normalisation', () => {
  it('fixes ligatures, zero-width characters, soft hyphens and odd spaces', () => {
    const {text} = cleanDocument(['The o\uFB03ce\u200B bene\u00ADfits\u00A0from \uFB01ne work.']);
    expect(text).toBe('The office benefits from fine work.');
  });

  it('strips control characters but keeps text intact', () => {
    expect(cleanDocument(['Hello\u0000 wor\u0007ld.']).text).toBe('Hello world.');
  });

  it('treats form feeds as paragraph breaks and normalises CRLF', () => {
    expect(cleanDocument(['One.\r\nTwo.\fThree.']).text).toBe('One.\nTwo.\n\nThree.');
  });
});

describe('cleanDocument: line and paragraph repair', () => {
  it('repairs words hyphenated across a line break, but not real hyphens', () => {
    const {text} = cleanDocument(['Modern infor-\nmation systems rely on well-\nknown protocols and state-of-the-art tools.']);
    expect(text).toContain('information systems');
    expect(text).toContain('wellknown'); // known trade-off: a soft hyphen cannot be told from "well-known" split over a line
    expect(text).toContain('state-of-the-art');
  });

  it('rejoins a hard-wrapped paragraph but keeps blank-line paragraph breaks', () => {
    const wrapped = [
      'Distributed consensus protocols allow independent nodes to agree on a single value even',
      'when some of them fail or messages are delayed. Paxos and Raft are the two best known',
      'examples and both rely on majority quorums to make progress safely in the presence of',
      'crashes and network partitions across the cluster.',
      '',
      'A second paragraph follows here and it is also wrapped at a fixed column so that the',
      'cleaner has enough evidence to detect the wrapping width used by this document as a whole.',
    ].join('\n');
    const {text} = cleanDocument([wrapped]);
    const paragraphs = text.split('\n\n');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).not.toContain('\n');
    expect(paragraphs[0]).toContain('even when some of them fail');
    expect(paragraphs[1]).toContain('the wrapping width');
  });

  it('keeps note-style short lines and list items on separate lines', () => {
    const notes = ['Lecture 4: Consensus', 'Key ideas', '- quorum voting', '- leader election', '1. Paxos', '2. Raft'].join('\n');
    expect(cleanDocument([notes]).text).toBe(notes);
  });

  it('joins a sentence that continues in lowercase on the next line', () => {
    expect(cleanDocument(['The results were\nsignificant at the 5% level.']).text).toBe(
      'The results were significant at the 5% level.',
    );
  });

  it('removes table-of-contents dot leaders', () => {
    const {text} = cleanDocument(['Contents\nIntroduction ........ 3\nMethods . . . . . . 9\nBody text starts here.']);
    expect(text).not.toMatch(/\.{4}/);
    expect(text).toContain('Body text starts here.');
  });
});

describe('cleanDocument: PDF page furniture', () => {
  const page = (n: number, body: string[]) => ['University Lecture Notes', ...body, `Page ${n} of 5`].join('\n');

  it('removes running headers/footers and page numbers across pages', () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(n, [`Body sentence number ${n} is unique to this page.`]));
    const {text, warnings} = cleanDocument(pages);
    expect(text).not.toContain('University Lecture Notes');
    expect(text).not.toMatch(/Page \d of 5/);
    for (let n = 1; n <= 5; n++) expect(text).toContain(`Body sentence number ${n} is unique to this page.`);
    expect(warnings.join(' ')).toMatch(/Removed \d+ repeated header/);
  });

  it('leaves repeated lines alone when the document is short (fewer than 4 pages)', () => {
    const pages = [1, 2, 3].map((n) => page(n, [`Body ${n}.`]));
    expect(cleanDocument(pages).text).toContain('University Lecture Notes');
  });

  it('does not delete repeated text that sits in the middle of pages', () => {
    const pages = [1, 2, 3, 4].map((n) =>
      ['Top a', 'Top b', 'Top c', 'Important repeated sentence.', `Unique ${n}.`, 'Bottom a', 'Bottom b', 'Bottom c'].join('\n'),
    );
    expect(cleanDocument(pages).text).toContain('Important repeated sentence.');
  });

  it('never removes a repeated line from the body of a short page', () => {
    const pages = [1, 2, 3, 4, 5].map((n) =>
      ['Running header', `Unique opening ${n}.`, 'Repeated body line.', `Unique closing ${n}.`, `Page ${n} of 5`].join('\n'),
    );
    const {text} = cleanDocument(pages);
    expect(text).not.toContain('Running header');
    expect((text.match(/Repeated body line\./g) ?? []).length).toBe(5);
  });

  it('heals a paragraph that continues across a page break', () => {
    const pages = ['First page ends mid sentence and', 'continues on the next page.', 'Third.', 'Fourth.'];
    const {text} = cleanDocument(pages);
    expect(text).toContain('mid sentence and continues on the next page.');
  });

  it('keeps a real paragraph break between pages when the sentence had ended', () => {
    const {text} = cleanDocument(['First page ends here.', 'Second page starts here.']);
    expect(text).toBe('First page ends here.\n\nSecond page starts here.');
  });
});

describe('cleanDocument: references', () => {
  const doc = [
    'Introduction paragraph one.',
    'Middle paragraph two.',
    'Conclusion paragraph three.',
    'References',
    'Smith, J. (2020). A paper. Journal.',
    'Doe, A. (2021). Another paper. Journal.',
  ].join('\n\n');

  it('keeps the references section by default', () => {
    expect(cleanDocument([doc]).text).toContain('Smith, J.');
  });

  it('drops it when asked, and says so', () => {
    const {text, warnings} = cleanDocument([doc], {stripReferences: true});
    expect(text).toContain('Conclusion paragraph three.');
    expect(text).not.toContain('Smith, J.');
    expect(warnings.join(' ')).toMatch(/references/i);
  });

  it('ignores a "References" heading near the top of the document', () => {
    const early = ['References', 'Some early text.', 'More text.', 'Even more text.', 'And more.'].join('\n\n');
    expect(cleanDocument([early], {stripReferences: true}).text).toContain('Some early text.');
  });
});
