import { navigateBack } from './navigation.js';
import { renderHelp } from './help.js';
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

/** Include nested headings; stop at the next heading of the same or higher level. */
function sectionHtml(index: AnnotationIndex, target: Unit): string {
  const start = index.units.findIndex((unit) => unit.id === target.id);
  // The Markdown parser emits each heading unit as <hN>…</hN>.
  const level = Number(target.html[2]);
  const remaining = index.units.slice(start + 1);
  const next = remaining.findIndex((unit) => unit.kind !== 'paragraph' && Number(unit.html[2]) <= level);
  return target.html + (next === -1 ? remaining : remaining.slice(0, next)).map((unit) => unit.html).join('');
}

function openDiscussion(index: AnnotationIndex, root: Document, unit: Unit): void {
  const annotations = index.annotations.filter((item) => item.kind === 'discussion');
  element<HTMLElement>(root, '#panel-title').textContent = unit.kind === 'paragraph' ? 'Discussion du paragraphe' : unit.kind === 'section' ? 'Discussion de la section' : unit.label;
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
}

export function render(index: AnnotationIndex, root: Document, target?: Unit): void {
  const units = element<HTMLElement>(root, '#units');
  const contents = element<HTMLElement>(root, '#contents');
  const discussionPage = element<HTMLElement>(root, '#annotations');
  const annotations = index.annotations.filter((item) => item.kind === 'discussion');
  units.replaceChildren(); contents.replaceChildren();
  root.querySelectorAll('[data-document-back]').forEach((back) => { back.remove(); });
  element<HTMLElement>(root, '.document-meta').hidden = target !== undefined;
  element<HTMLElement>(root, '.site-header').hidden = target !== undefined;
  element<HTMLAnchorElement>(root, '#how-it-works').href = new URL('comment-ca-marche/', root.baseURI).href;
  element<HTMLElement>(root, '#updated').textContent = `Actualisé le ${new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(index.generatedAt))}`;
  for (const unit of index.units) {
    const row = root.createElement('section'); row.id = unit.id; row.className = `unit ${unit.kind}`;
    const passage = root.createElement(target === undefined ? 'div' : 'blockquote'); passage.className = 'passage';
    const html = target?.id === unit.id && unit.kind === 'section' ? sectionHtml(index, unit) : unit.html;
    const purifier = root.defaultView === null ? DOMPurify : DOMPurify(root.defaultView);
    passage.innerHTML = purifier.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['id', 'name'] });
    for (const heading of passage.querySelectorAll('h2,h3,h4,h5,h6')) {
      const anchor = link(root, '', new URL(`./#${unit.id}`, root.baseURI).href);
      anchor.append(...heading.childNodes); heading.append(anchor);
    }
    const button = link(root, '', new URL(unit.kind === 'title' ? '#annotations' : passagePath(index, unit), root.baseURI).href); button.className = 'annotation-button';
    const matching = annotations.filter((item) => item.targetId === unit.id);
    button.innerHTML = '<svg class="annotation-shape" viewBox="0 0 44 44" aria-hidden="true"><path d="M15 7H29Q38 7 38 16V27Q38 36 29 36H22L15 41V36Q6 36 6 27V16Q6 7 15 7Z" /></svg>';
    const label = root.createElement('span'); label.className = 'annotation-label';
    const comments = matching.reduce((total, item) => total + item.comments, 0);
    label.textContent = comments === 0 ? '' : String(comments); button.append(label);
    button.classList.toggle('has-items', matching.length > 0);
    button.setAttribute('aria-label', `${String(comments)} échange(s) : ${unit.label}`);
    row.append(passage);
    if (target === undefined) row.prepend(button);
    if (target === undefined || unit.id === target.id) units.append(row);
    if (unit.kind === 'section') contents.append(link(root, unit.label, new URL(`./#${unit.id}`, root.baseURI).href));
  }
  const selected = target ?? index.units.find((unit) => unit.kind === 'title');
  discussionPage.hidden = selected === undefined;
  element<HTMLElement>(root, '#panel-title').hidden = target === undefined;
  units.after(discussionPage);
  if (selected !== undefined) openDiscussion(index, root, selected);
  if (target !== undefined) {
    const back = link(root, 'Revenir au document', new URL(`./#${target.id}`, root.baseURI).href);
    back.dataset['documentBack'] = '';
    navigateBack(root, back);
    const chevron = root.createElement('span'); chevron.className = 'back-chevron';
    chevron.textContent = '‹'; chevron.setAttribute('aria-hidden', 'true');
    back.prepend(chevron);
    units.before(back, element<HTMLElement>(root, '#panel-title'));
    root.title = `${target.label} — Document`;
    // giscus copies the page description into each new Discussion's body.
    element<HTMLMetaElement>(root, 'meta[name="description"]').content = target.markdown;
  }
}

export async function load(root: Document, fetcher: Fetch = fetch): Promise<void> {
  try {
    // This URL stays the same across publications; never reuse a previous index.
    // Back navigation is available immediately, before the freshness request finishes.
    root.querySelectorAll<HTMLAnchorElement>('[data-document-back]').forEach((back) => { navigateBack(root, back); });
    const embedded = root.querySelector('#annotation-index');
    const response = await fetcher('./annotations.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Index unavailable');
    const index = indexSchema.parse(await response.json() as unknown);
    const reuse = embedded !== null && JSON.stringify(index) === JSON.stringify(indexSchema.parse(JSON.parse(embedded.textContent) as unknown));
    const base = new URL('.', root.baseURI).pathname;
    if (new URL(root.URL).pathname === `${base}comment-ca-marche/`) {
      if (!reuse) renderHelp(index, root);
      return;
    }
    const route = resolvePassage(index, new URL(root.URL).pathname, base);
    if (route.redirect) root.defaultView?.history.replaceState(null, '', base);
    if (!reuse) render(index, root, route.target);
    else {
      const selected = route.target ?? index.units.find((unit) => unit.kind === 'title');
      if (selected !== undefined) openDiscussion(index, root, selected);
    }
    if (route.notice !== undefined) {
      const notice = root.createElement('p'); notice.className = 'flash'; notice.setAttribute('role', 'status'); notice.textContent = route.notice;
      element<HTMLElement>(root, '#document').prepend(notice);
    }
  } catch {
    // A network failure must not discard the readable, already published page.
    if (root.querySelector('#annotation-index') !== null) return;
    const units = element<HTMLElement>(root, '#units');
    units.textContent = 'Le document est momentanément indisponible. Consultez le fichier Markdown sur GitHub ou réessayez plus tard.';
    units.setAttribute('role', 'alert');
  }
}
