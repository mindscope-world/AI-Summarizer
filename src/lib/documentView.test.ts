import {describe, expect, it} from 'vitest';
import type {DocumentSummary} from '../types';
import {contentIn, languagesOf, originalLanguage, toExportDocument, toTranslateRequest, translationTargets} from './documentView';

const base = (over: Partial<DocumentSummary> = {}): DocumentSummary => ({
  id: 'd1',
  title: 'Consensus Protocols',
  dateBadge: 'Today',
  timeAgoGroup: 'Last 7 days',
  category: 'Computer Science',
  categoryColor: 'blue',
  tags: ['Raft'],
  excerpt: '',
  createdDate: 'September 20, 2026 05:41 PM',
  emotionalTone: '',
  promptQuestion: 'How do quorums help?',
  contentParagraphs: ['Nodes agree.', 'Raft elects a leader.'],
  bulletPoints: [
    {title: 'Quorums', text: 'A majority vote.', reviewed: true},
    {title: 'Leaders', text: 'One leader orders writes.'},
  ],
  discussionQuestions: [{id: 'q1', question: 'Why a majority?', context: 'Partitions.'}],
  currentDiscussionIndex: 0,
  userNotes: 'my notes',
  comments: [],
  sourceMetadata: {language: 'English', modelUsed: 'gpt', author: 'Amina', institution: 'EAU', fileName: 'l7.pdf', originalWordCount: 400, summaryWordCount: 40, reductionRate: '90%'},
  summaryWarnings: ['Check 34%.'],
  ...over,
});

const sw: NonNullable<DocumentSummary['translations']>[string] = {
  contentParagraphs: ['Nodi zinakubaliana.', 'Raft huchagua kiongozi.'],
  bulletPoints: [
    {title: 'Akidi', text: 'Kura ya walio wengi.'},
    {title: 'Viongozi', text: 'Kiongozi mmoja.'},
  ],
  discussionQuestions: [{question: 'Kwa nini wingi?', context: 'Migawanyiko.'}],
  promptQuestion: 'Akidi husaidiaje?',
  model: 'gpt-sw',
  warnings: ['Angalia 34%.'],
};

describe('languages', () => {
  it('knows the original language, what it can show and what it can still translate into', () => {
    const doc = base();
    expect(originalLanguage(doc)).toBe('English');
    expect(originalLanguage(base({sourceMetadata: {}}))).toBe('English');
    expect(languagesOf(doc)).toEqual(['English']);
    expect(translationTargets(doc)).toEqual(['Swahili']);
    expect(languagesOf(base({translations: {Swahili: sw}}))).toEqual(['English', 'Swahili']);
    expect(translationTargets(base({sourceMetadata: {language: 'Swahili'}}))).toEqual(['English']);
  });
});

describe('contentIn', () => {
  it('shows the document itself in its own language, and for languages it does not have', () => {
    const doc = base();
    expect(contentIn(doc, 'English')).toMatchObject({language: 'English', contentParagraphs: doc.contentParagraphs, warnings: ['Check 34%.'], model: 'gpt', stale: false});
    expect(contentIn(doc, 'Swahili').language).toBe('English');
  });

  it('shows a translation but keeps review ticks, question ids and the reader’s place', () => {
    const view = contentIn(base({translations: {Swahili: sw}}), 'Swahili');
    expect(view.language).toBe('Swahili');
    expect(view.contentParagraphs).toEqual(sw.contentParagraphs);
    expect(view.bulletPoints).toEqual([
      {title: 'Akidi', text: 'Kura ya walio wengi.', reviewed: true},
      {title: 'Viongozi', text: 'Kiongozi mmoja.'},
    ]);
    expect(view.discussionQuestions).toEqual([{id: 'q1', question: 'Kwa nini wingi?', context: 'Migawanyiko.'}]);
    expect(view.promptQuestion).toBe('Akidi husaidiaje?');
    expect(view.warnings).toEqual(['Angalia 34%.']); // its own notes, not the original's
    expect(view.model).toBe('gpt-sw');
    expect(view.stale).toBe(false);
  });

  it('falls back to the original for points added after the translation, and says it is out of date', () => {
    const doc = base({
      translations: {Swahili: sw},
      bulletPoints: [...base().bulletPoints, {title: 'New point', text: 'Added later.'}],
      discussionQuestions: [...base().discussionQuestions, {id: 'q2', question: 'Added question?', context: 'Later.'}],
    });
    const view = contentIn(doc, 'Swahili');
    expect(view.stale).toBe(true);
    expect(view.bulletPoints[2]).toEqual({title: 'New point', text: 'Added later.'});
    expect(view.discussionQuestions[1]).toEqual({id: 'q2', question: 'Added question?', context: 'Later.'});
    expect(view.bulletPoints[0].title).toBe('Akidi');
  });
});

describe('requests', () => {
  it('builds a translate request from the document as it is now', () => {
    expect(toTranslateRequest(base(), 'Swahili')).toEqual({
      targetLanguage: 'Swahili',
      sourceLanguage: 'English',
      contentParagraphs: ['Nodes agree.', 'Raft elects a leader.'],
      bulletPoints: [
        {title: 'Quorums', text: 'A majority vote.'},
        {title: 'Leaders', text: 'One leader orders writes.'},
      ],
      discussionQuestions: [{question: 'Why a majority?', context: 'Partitions.'}],
      promptQuestion: 'How do quorums help?',
    });
  });

  it('exports what is shown, with the reader’s notes and no review flags', () => {
    const en = toExportDocument(base(), 'English');
    expect(en).toMatchObject({title: 'Consensus Protocols', language: 'English', model: 'gpt', author: 'Amina', institution: 'EAU', sourceName: 'l7.pdf', userNotes: 'my notes', warnings: ['Check 34%.']});
    expect(en.bulletPoints[0]).toEqual({title: 'Quorums', text: 'A majority vote.'});

    const swahili = toExportDocument(base({translations: {Swahili: sw}}), 'Swahili');
    expect(swahili).toMatchObject({language: 'Swahili', model: 'gpt-sw', contentParagraphs: sw.contentParagraphs, warnings: ['Angalia 34%.'], userNotes: 'my notes'});
    expect(swahili.title).toBe('Consensus Protocols'); // titles are not translated
  });

  it('omits empty optional fields', () => {
    const out = toExportDocument(base({userNotes: '', summaryWarnings: undefined, category: '', sourceMetadata: {}}), 'English');
    expect(out.userNotes).toBeUndefined();
    expect(out.warnings).toBeUndefined();
    expect(out.category).toBeUndefined();
  });
});
