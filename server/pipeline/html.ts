import {Readability} from '@mozilla/readability';
import {parseHTML} from 'linkedom';

export interface HtmlExtraction {
  text: string;
  title?: string;
  author?: string;
  siteName?: string;
  warnings: string[];
}

const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'NAV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'FIGURE', 'FIGCAPTION', 'BR', 'HR',
]);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'FORM', 'BUTTON']);

/** Flattens an HTML fragment to plain text: block elements become paragraphs, list items get "- ". */
function htmlToText(root: Node): string {
  const parts: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) parts.push(t);
    buf = '';
  };
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      buf += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    const block = BLOCK.has(tag);
    if (block) flush();
    if (tag === 'LI') buf += '- ';
    for (const child of Array.from(el.childNodes)) visit(child);
    if (block) flush();
  };
  visit(root);
  flush();
  return parts.join('\n\n');
}

/** Extracts the main article from an HTML page (Readability), falling back to the whole body. */
export function extractHtml(html: string): HtmlExtraction {
  const warnings: string[] = [];
  const {document} = parseHTML(html);

  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined;
  const fallbackTitle = document.querySelector('title')?.textContent?.trim() || meta('og:title');

  let article: ReturnType<Readability['parse']> = null;
  try {
    // Readability mutates the document, so give it its own copy.
    const copy = parseHTML(html).document;
    article = new Readability(copy as unknown as Document, {charThreshold: 200}).parse();
  } catch {
    article = null;
  }

  if (article?.content) {
    const fragment = parseHTML(`<div id="root">${article.content}</div>`).document.getElementById('root');
    const text = fragment ? htmlToText(fragment) : '';
    if (text.trim()) {
      return {
        text,
        title: article.title?.trim() || fallbackTitle,
        author: article.byline?.trim() || meta('author') || undefined,
        siteName: article.siteName?.trim() || meta('og:site_name'),
        warnings,
      };
    }
  }

  warnings.push('Could not isolate the main article; the whole page text was used and may include menus or ads.');
  const body = document.body ?? document.documentElement;
  return {
    text: body ? htmlToText(body) : '',
    title: fallbackTitle,
    author: meta('author'),
    siteName: meta('og:site_name'),
    warnings,
  };
}
