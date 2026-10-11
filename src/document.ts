import { marked } from 'marked';
import { z } from 'zod';
import type { AnnotationIndex, Unit } from './model.js';

/** Targets belong to this snapshot only; IDs deliberately do not survive revisions. */
export function parseDocument(markdown: string): Unit[] {
  const tokens = marked.lexer(markdown).filter((token) => token.type !== 'space' && token.type !== 'def');
  const headings: string[] = [];
  return tokens.map((token, position) => {
    const heading = token.type === 'heading' ? z.object({ depth: z.number().int(), text: z.string() }).parse(token) : null;
    if (heading !== null) {
      headings.splice(heading.depth - 1);
      headings[heading.depth - 1] = heading.text;
    }
    const passage = token.raw.trim();
    return {
      id: `u-${String(position + 1)}`,
      kind: heading !== null ? (heading.depth === 1 ? 'title' : 'section') : 'paragraph',
      markdown: passage, html: marked.parser([token], { async: false }),
      label: heading !== null ? heading.text : passage.slice(0, 90),
      context: [headings.filter(Boolean).join(' / '), tokens[position - 1]?.raw.trim(), passage, tokens[position + 1]?.raw.trim()].filter(Boolean).join('\n\n'),
    };
  });
}

function urlExcerpt(text: string): string {
  let excerpt = '';
  for (const character of text) {
    if (encodeURIComponent(excerpt + character).length > 2200) return `${excerpt}…`;
    excerpt += character;
  }
  return excerpt;
}

export function contributionUrl(index: Pick<AnnotationIndex, 'repository' | 'branch' | 'documentPath' | 'revision' | 'giscus'>, unit: Unit): string {
  const base = `https://github.com/${index.repository}`;
  // Keep GitHub URLs bounded even for large tables or code blocks.
  const body = `## Passage\n\n${urlExcerpt(unit.markdown)}\n\n## Contexte\n\n${urlExcerpt(unit.context)}\n\nDocument : ${index.documentPath}\nRévision : ${index.revision}\nCible : ${unit.id}\n\n## Proposition\n\n`;
  const params = new URLSearchParams({ title: `Discussion : ${unit.label.slice(0, 70)}`, body, category: index.giscus?.categorySlug ?? 'general' });
  return `${base}/discussions/new?${params.toString()}`;
}
