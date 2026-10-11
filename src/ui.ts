import { passagePath, resolvePassage } from './routes.js';
import { embedDiscussion } from './giscus.js';
import DOMPurify from 'dompurify';
import { indexSchema } from './model.js';
import type { Annotation, AnnotationIndex, Unit } from './model.js';
import type { Fetch } from './http.js';

// The caller specifies the expected DOM element type for a required selector.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function element<T extends Element>(root: Document, selector: string): T {
  const result = root.querySelector<T>(selector);
  if (result === null) throw new Error(`Missing element: ${selector}`);
  return result;
}
function link(root: Document, text: string, href: string): HTMLAnchorElement {
  const anchor = root.createElement('a');
  anchor.textContent = text; anchor.href = href;
  return anchor;
}

export function render(index: AnnotationIndex, root: Document, target?: Unit): void {
  const units = element<HTMLElement>(root, '#units');
  const contents = element<HTMLElement>(root, '#contents');
  const discussionPage = element<HTMLElement>(root, '#annotations');
  const annotations = index.annotations.filter((item) => item.kind === 'discussion');
  units.replaceChildren(); contents.replaceChildren();
  element<HTMLElement>(root, '.document-meta').hidden = target !== undefined;
  element<HTMLAnchorElement>(root, '#repository').href = `https://github.com/${index.repository}`;
  element<HTMLElement>(root, '#updated').textContent = `Actualisé le ${new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(index.generatedAt))}`;
  const open = (unit: Unit): void => {
    element<HTMLElement>(root, '#panel-title').textContent = unit.kind === 'paragraph' ? 'Discussion du passage' : unit.label;
    const items = element<HTMLElement>(root, '#items'); items.replaceChildren();
    const matching = annotations.filter((item) => item.targetId === unit.id);
    const show = (selected: Annotation | Unit): void => {
      embedDiscussion(index, selected, root, element<HTMLElement>(root, '#thread'));
      items.replaceChildren();
      const others = matching.filter((item) => item !== selected);
      items.hidden = others.length === 0;
      if (others.length === 0) return;
      const heading = root.createElement('h3'); heading.textContent = 'Autres discussions';
      const list = root.createElement('ul');
      for (const item of others) {
        const entry = link(root, item.title, item.url);
        entry.setAttribute('aria-label', `Discussion #${String(item.number)} : ${item.title}`);
        entry.onclick = (event) => { event.preventDefault(); show(item); };
        const row = root.createElement('li'); row.append(entry); list.append(row);
      }
      items.append(heading, list);
    };
    show(matching[0] ?? unit);
  };
  for (const unit of index.units) {
    const row = root.createElement('section'); row.id = unit.id; row.className = `unit ${unit.kind}`;
    const passage = root.createElement(target === undefined ? 'div' : 'blockquote'); passage.className = 'passage';
    passage.innerHTML = DOMPurify.sanitize(unit.html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['id', 'name'] });
    for (const heading of passage.querySelectorAll('h2,h3,h4,h5,h6')) {
      const anchor = link(root, '', new URL(`./#${unit.id}`, root.baseURI).href);
      anchor.append(...heading.childNodes); heading.append(anchor);
    }
    const button = link(root, '', new URL(unit.kind === 'title' ? '#annotations' : passagePath(index, unit), root.baseURI).href); button.className = 'annotation-button';
    const matching = annotations.filter((item) => item.targetId === unit.id);
    button.innerHTML = '<svg class="annotation-shape" viewBox="0 0 44 44" aria-hidden="true"><path d="M15 7H29Q38 7 38 16V27Q38 36 29 36H22L15 41V36Q6 36 6 27V16Q6 7 15 7Z" /></svg>';
    button.append(root.createTextNode(matching.length === 0 ? '+' : String(matching.length)));
    button.classList.toggle('has-items', matching.length > 0);
    button.setAttribute('aria-label', `${String(matching.length)} échange(s) : ${unit.label}`);
    row.append(passage);
    if (target === undefined) row.append(button);
    if (target === undefined || unit.id === target.id) units.append(row);
    if (unit.kind === 'section') contents.append(link(root, unit.label, new URL(`./#${unit.id}`, root.baseURI).href));
  }
  const selected = target ?? index.units.find((unit) => unit.kind === 'title');
  discussionPage.hidden = selected === undefined;
  units.after(discussionPage);
  if (selected !== undefined) open(selected);
  if (target !== undefined) {
    const back = link(root, 'Revenir au document', new URL(`./#${target.id}`, root.baseURI).href);
    const chevron = root.createElement('span'); chevron.className = 'back-chevron';
    chevron.textContent = '‹'; chevron.setAttribute('aria-hidden', 'true');
    back.prepend(chevron);
    units.before(back, element<HTMLElement>(root, '#panel-title'));
    root.title = `${target.label} — Document`;
  }
}

export async function load(root: Document, fetcher: Fetch = fetch): Promise<void> {
  try {
    const response = await fetcher('./annotations.json');
    if (!response.ok) throw new Error('Index unavailable');
    const index = indexSchema.parse(await response.json() as unknown);
    const base = new URL('.', root.baseURI).pathname;
    const route = resolvePassage(index, new URL(root.URL).pathname, base);
    if (route.redirect) root.defaultView?.history.replaceState(null, '', base);
    render(index, root, route.target);
    if (route.notice !== undefined) {
      const notice = root.createElement('p'); notice.className = 'flash'; notice.setAttribute('role', 'status'); notice.textContent = route.notice;
      element<HTMLElement>(root, '#document').prepend(notice);
    }
  } catch {
    const units = element<HTMLElement>(root, '#units');
    units.textContent = 'Le document est momentanément indisponible. Consultez le fichier Markdown sur GitHub ou réessayez plus tard.';
    units.setAttribute('role', 'alert');
  }
}
