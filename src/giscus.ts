import type { Annotation, AnnotationIndex, Unit } from './model.js';

export function embedDiscussion(index: AnnotationIndex, item: Annotation | Unit, root: Document, container: HTMLElement): void {
  container.replaceChildren();
  if (index.giscus === undefined || ('number' in item && item.kind !== 'discussion')) return;
  const script = root.createElement('script');
  script.src = index.giscus.clientUrl;
  script.async = true; script.crossOrigin = 'anonymous';
  const attributes = { repo: index.repository, 'repo-id': index.giscus.repositoryId, category: index.giscus.category, 'category-id': index.giscus.categoryId, mapping: 'number' in item ? 'number' : 'specific', term: 'number' in item ? String(item.number) : `${index.revision}/${item.id}: ${item.markdown.slice(0, 150)}`, strict: '1', 'reactions-enabled': '0', 'emit-metadata': '0', 'input-position': 'top', theme: 'preferred_color_scheme', lang: 'fr' };
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(`data-${name}`, value);
  container.append(script);
}
