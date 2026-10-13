import type { Annotation, AnnotationIndex, Unit } from './model.js';

function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/** giscus uses the term verbatim as the new Discussion's title. */
export function discussionTerm(index: Pick<AnnotationIndex, 'revision' | 'generatedAt'>, unit: Unit): string {
  const truncated = unit.kind === 'paragraph' && unit.markdown.length > unit.label.length ? '…' : '';
  return `Discussion : ${unit.label}${truncated} · ${fingerprint(`${index.revision}/${unit.id}/${index.generatedAt}`)}`;
}

export function embedDiscussion(index: AnnotationIndex, item: Annotation | Unit, root: Document, container: HTMLElement): void {
  container.replaceChildren();
  if (index.giscus === undefined || ('number' in item && item.kind !== 'discussion')) return;
  const script = root.createElement('script');
  script.src = index.giscus.clientUrl;
  script.async = true; script.crossOrigin = 'anonymous';
  // Open discussions are selected by number from the index. A fresh publication
  // gives empty passages a new strict lookup key so closed threads cannot reappear.
  const attributes = { repo: index.repository, 'repo-id': index.giscus.repositoryId, category: index.giscus.category, 'category-id': index.giscus.categoryId, mapping: 'number' in item ? 'number' : 'specific', term: 'number' in item ? String(item.number) : discussionTerm(index, item), strict: '1', 'reactions-enabled': '0', 'emit-metadata': '0', 'input-position': 'top', theme: root.documentElement.dataset['theme'] ?? 'preferred_color_scheme', lang: 'fr' };
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(`data-${name}`, value);
  container.append(script);
}
