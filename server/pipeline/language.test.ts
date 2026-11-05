import {describe, expect, it} from 'vitest';
import {detectLanguage} from './language';

const EN =
  'The transformer architecture fundamentally abandoned recurrence and relied entirely on attention mechanisms to model global dependencies between input and output tokens across the sequence.';
const SW =
  'Mfumo wa kompyuta unaosambazwa unahitaji makubaliano kati ya nodi nyingi ili kuhakikisha kwamba data inabaki thabiti hata wakati baadhi ya nodi zinapofeli au mtandao unapochelewa.';
const FR =
  'Les protocoles de consensus permettent aux noeuds de se mettre daccord sur un etat commun malgre les pannes et les retards du reseau dans un systeme distribue de grande taille.';
const DE =
  'Verteilte Systeme benötigen Konsensprotokolle, damit unabhängige Knoten sich trotz Ausfällen und Netzwerkverzögerungen auf einen gemeinsamen Zustand einigen können und die Daten konsistent bleiben.';

const paragraphs = (p: string, n: number) => Array.from({length: n}, () => p).join('\n\n');

describe('detectLanguage', () => {
  it('detects English', () => {
    expect(detectLanguage(paragraphs(EN, 4))).toMatchObject({code: 'en', name: 'English', mixed: false});
  });

  it('detects Swahili', () => {
    expect(detectLanguage(paragraphs(SW, 4))).toMatchObject({code: 'sw', name: 'Swahili', mixed: false});
  });

  it('detects French', () => {
    expect(detectLanguage(paragraphs(FR, 4))).toMatchObject({code: 'fr', name: 'French'});
  });

  it('reports other languages with their ISO code', () => {
    const result = detectLanguage(paragraphs(DE, 4));
    expect(result.code).toBe('other');
    expect(result.iso3).toBe('deu');
  });

  it('flags mixed-language documents', () => {
    const result = detectLanguage([EN, EN, EN, SW, SW].join('\n\n'));
    expect(result.mixed).toBe(true);
    expect(result.code).toBe('en');
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('is undetermined for very short or empty text', () => {
    expect(detectLanguage('')).toMatchObject({code: 'und', confidence: 0});
    expect(detectLanguage('ok')).toMatchObject({code: 'und'});
  });

  it('handles a single long paragraph without paragraph breaks', () => {
    expect(detectLanguage(`${EN} ${EN}`).code).toBe('en');
  });

  it('is not fooled by command lines, paths and reference lists in technical documents', () => {
    const tech =
      'FILES /usr/bin/ddstdecode SEE ALSO foo2ddst-wrapper(1), foo2ddst(1), pbmtojbg(1) AUTHOR Rick Richardson rick.richardson@example.com';
    const result = detectLanguage([EN, tech, tech, tech, EN, tech, tech, EN, tech, tech, tech, EN].join('\n\n'));
    expect(result).toMatchObject({code: 'en', mixed: false});
  });

  it('does not claim a mix from a stray unsupported language', () => {
    const result = detectLanguage([EN, EN, EN, EN, DE, DE].join('\n\n'));
    expect(result.code).toBe('en');
    expect(result.mixed).toBe(false);
  });

  it('reports undetermined, not a confident guess, for a label-only form with no prose', () => {
    // Real text from a CUPS form PDF that used to come back as French with confidence 1.
    const form = [
      'TASK INFORMATION', 'Task #:', 'Task name:', 'User:', 'Printer name:', 'Printer information:', 'Task creation time:',
      'Task printing time:', 'Source host:', 'Font for banner page:', 'Font size for banner:', "Task's UUID:", 'Driver:',
      'Driver version:', 'Printer manufacturer:', 'SeLinux user:', 'MLS level:', 'SeLinux domain:',
    ].join('\n');
    expect(detectLanguage(form)).toMatchObject({code: 'und', confidence: 0});
  });
});
