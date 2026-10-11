import DOMPurify from 'dompurify';
import { contributionUrl } from './document.js';
import { indexSchema } from './model.js';
import type { AnnotationIndex, Unit } from './model.js';
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

export function render(index: AnnotationIndex, root: Document): void {
  const units = element<HTMLElement>(root, '#units');
  const contents = element<HTMLElement>(root, '#contents');
  const dialog = element<HTMLDialogElement>(root, '#annotations');
  units.replaceChildren(); contents.replaceChildren();
  element<HTMLAnchorElement>(root, '#repository').href = `https://github.com/${index.repository}`;
  element<HTMLElement>(root, '#updated').textContent = `Actualisé le ${new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(index.generatedAt))}`;
  const open = (unit: Unit): void => {
    element<HTMLElement>(root, '#panel-title').textContent = unit.kind === 'paragraph' ? 'Discussion du passage' : unit.label;
    element<HTMLElement>(root, '#passage').textContent = unit.markdown;
    const items = element<HTMLElement>(root, '#items'); items.replaceChildren();
    const matching = index.annotations.filter((item) => item.targetId === unit.id);
    for (const item of matching) {
      const entry = link(root, item.title, item.url);
      const badge = root.createElement('span');
      badge.textContent = `${item.kind === 'issue' ? 'Discussion' : 'Proposition'} #${String(item.number)}`;
      badge.className = 'item-kind';
      const icon = root.createElement('span');
      icon.className = `item-kind-icon ${item.kind === 'issue' ? 'discussion-icon' : 'proposal-icon'}`;
      icon.textContent = item.kind === 'issue' ? '?' : '↗';
      icon.setAttribute('aria-hidden', 'true');
      badge.prepend(icon);
      entry.prepend(badge); entry.className = 'item-link'; items.append(entry);
    }
    if (matching.length === 0) {
      const empty = root.createElement('p'); empty.textContent = 'Aucun échange ouvert sur ce passage. Vous pouvez commencer la discussion.';
      empty.className = 'empty-state'; items.append(empty);
    }
    element<HTMLAnchorElement>(root, '#new-issue').href = contributionUrl(index, unit, 'issue');
    element<HTMLAnchorElement>(root, '#new-pr').href = contributionUrl(index, unit, 'pr');
    dialog.showModal();
  };
  for (const unit of index.units) {
    const row = root.createElement('section'); row.id = unit.id; row.className = `unit ${unit.kind}`;
    const passage = root.createElement('div'); passage.className = 'passage';
    passage.innerHTML = DOMPurify.sanitize(unit.html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['id', 'name'] });
    const button = root.createElement('button'); button.type = 'button'; button.className = 'annotation-button';
    const matching = index.annotations.filter((item) => item.targetId === unit.id);
    button.innerHTML = '<svg class="annotation-shape" viewBox="0 0 44 44" aria-hidden="true"><path d="M15 7H29Q38 7 38 16V27Q38 36 29 36H22L15 41V36Q6 36 6 27V16Q6 7 15 7Z" /></svg>';
    button.append(root.createTextNode(matching.length === 0 ? '+' : String(matching.length)));
    button.classList.toggle('has-items', matching.length > 0);
    button.setAttribute('aria-label', `${String(matching.length)} échange(s) : ${unit.label}`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => { open(unit); });
    row.append(passage, button); units.append(row);
    if (unit.kind === 'section') contents.append(link(root, unit.label, `#${unit.id}`));
  }
  element<HTMLButtonElement>(root, '#close-panel').onclick = () => { dialog.close(); };
  dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
}

export async function load(root: Document, fetcher: Fetch = fetch): Promise<void> {
  try {
    const response = await fetcher('./annotations.json');
    if (!response.ok) throw new Error('Index unavailable');
    render(indexSchema.parse(await response.json() as unknown), root);
  } catch {
    const units = element<HTMLElement>(root, '#units');
    units.textContent = 'Le document est momentanément indisponible. Consultez le fichier Markdown sur GitHub ou réessayez plus tard.';
    units.setAttribute('role', 'alert');
  }
}
