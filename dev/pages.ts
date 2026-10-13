import { fixtureRepository } from './scenario.js';
import type { FixtureItem } from './scenario.js';
import type { FixtureWorkspace } from './workspace.js';
import { fixtureHref } from './links.js';
import { discussionTerm } from '../src/giscus.js';

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (character) => `&#${String(character.charCodeAt(0))};`);
}
/** Keep quotations readable while making Markdown and bare HTTP links navigable. */
export function linkedText(text: string): string {
  let result = ''; let offset = 0;
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/gu)) {
    const href = match[2] ?? match[0];
    result += `${escapeHtml(text.slice(offset, match.index))}<a href="${escapeHtml(fixtureHref(href, fixtureRepository))}">${escapeHtml(match[1] ?? href)}</a>`;
    offset = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(offset));
}
function shell(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · GitHub simulé</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#243c48;background:#f7fafc;max-width:850px;margin:40px auto;padding:0 24px}a{color:#255d82}label{display:block;margin:16px 0}input,textarea{display:block;width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid #a9c1cf;border-radius:6px}textarea{min-height:130px}button{padding:10px 16px;margin:6px 6px 6px 0;background:#255d82;color:white;border:0;border-radius:6px;font:inherit;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#e9f1f6;padding:16px;border-radius:8px}section{border-top:1px solid #dce6eb;margin-top:24px;padding-top:16px}small{color:#526b79}.notice{background:#e3eff7;padding:12px 16px;border-radius:6px}li{margin:12px 0}:focus-visible{outline:3px solid #c68b28;outline-offset:3px}</style></head><body><p class="notice">Mode développement : données fictives, aucun appel à GitHub ou à un modèle réel.</p><nav><a href="/">Lire le document</a> · <a href="/__dev/">Simulateur GitHub</a></nav><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
function hidden(name: string, value: string): string { return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`; }
function form(type: string, content: string, number?: number): string {
  return `<form method="post" action="/__dev/action">${hidden('type', type)}${number === undefined ? '' : hidden('number', String(number))}${content}</form>`;
}
export function itemPath(item: FixtureItem): string { return `/__dev/github/${fixtureRepository}/${item.kind === 'discussion' ? 'discussions' : 'pull'}/${String(item.number)}`; }
export function dashboard(workspace: FixtureWorkspace): string {
  return shell('Simulateur GitHub', `<p>Ouvrez une discussion pour modifier sa description, ajouter un commentaire ou changer son état. Chaque action reconstruit les annotations avec le pipeline réel.</p><ul>${workspace.backend.items.map((item) => `<li><a href="${itemPath(item)}">${escapeHtml(item.title)}</a> <small>#${String(item.number)} · ${item.kind === 'discussion' ? 'Discussion' : 'Proposition'} · ${item.open ? 'Ouverte' : item.merged ? 'Fusionnée' : 'Fermée'}</small></li>`).join('')}</ul><section><h2>Publication</h2><p>${String(workspace.index.annotations.length)} annotations publiées. ${String(workspace.backend.writes.length)} écritures de commentaires bot.</p>${form('rebuild', '<button>Reconstruire les annotations</button>')}${form('reset', '<button>Réinitialiser les exemples</button>')}</section><section><h2>Faire évoluer le document</h2>${form('document', `<label for="markdown">Document Markdown</label><textarea id="markdown" name="markdown">${escapeHtml(workspace.markdown)}</textarea><button>Publier ce document fictif</button>`)}<small>Cette modification reste en mémoire et ne change aucun fichier.</small></section><section><h2>Simuler une panne du modèle</h2>${form('matching', '<button name="available" value="no">Rendre le modèle indisponible</button><button name="available" value="yes">Rétablir le modèle</button>')}</section>`);
}
export function createPage(kind: 'discussion' | 'pr', params: URLSearchParams): string {
  const title = kind === 'discussion' ? 'Nouvelle discussion' : 'Nouvelle proposition';
  return shell(title, `<p>Cette page remplace le formulaire GitHub uniquement dans le simulateur. Sur GitHub, une proposition nécessite une branche contenant vos modifications.</p>${form('create', `${hidden('kind', kind)}<label for="title">Titre</label><input id="title" name="title" required value="${escapeHtml(params.get('title') ?? '')}"><label for="description">Description</label><textarea id="description" name="body">${escapeHtml(params.get('body') ?? '')}</textarea><button>${kind === 'discussion' ? 'Créer la discussion' : 'Créer la proposition'}</button>`)}`);
}
export function itemPage(item: FixtureItem): string {
  return shell(item.title, `<p>#${String(item.number)} · ${item.kind === 'discussion' ? 'Discussion' : 'Proposition'} · <strong>${item.open ? 'Ouverte' : item.merged ? 'Fusionnée' : 'Fermée'}</strong></p><pre data-description>${linkedText(item.body)}</pre><section><h2>Commentaires</h2>${item.comments.map((comment) => `<article><strong>${escapeHtml(comment.login)}</strong><pre ${comment.login === 'github-actions[bot]' ? 'data-bot-comment' : 'data-reader-comment'}>${linkedText(comment.body)}</pre></article>`).join('')}${form('comment', '<label for="comment">Commentaire</label><textarea id="comment" name="body" required></textarea><button>Ajouter le commentaire</button>', item.number)}</section><section><h2>Modifier la description</h2>${form('edit', `<label for="title">Titre</label><input id="title" name="title" required value="${escapeHtml(item.title)}"><label for="description">Description</label><textarea id="description" name="body">${escapeHtml(item.body)}</textarea><button>Enregistrer la description</button>`, item.number)}</section><section><h2>Décision éditoriale</h2>${form('state', `${hidden('state', item.open ? 'closed' : 'open')}<button>${item.open ? 'Fermer' : 'Rouvrir'}</button>`, item.number)}${item.kind === 'pr' && item.open ? form('state', `${hidden('state', 'merged')}<button>Fusionner la proposition</button>`, item.number) : ''}</section>${item.kind === 'pr' ? `<section><h2>Mettre à jour le diff</h2>${form('diff', `<label for="diff">Diff de la proposition</label><textarea id="diff" name="body">${escapeHtml(item.diff)}</textarea><button>Enregistrer le diff</button>`, item.number)}</section>` : ''}`);
}
export function errorPage(message: string): string {
  return shell('La reconstruction a échoué', `<p role="alert">${escapeHtml(message)}</p><p>Le dernier index publié est conservé. Rétablissez le modèle ou corrigez l’action, puis reconstruisez les annotations.</p>`);
}

/** Local comment widget shares the repository and publication pipeline. */
export function threadPage(workspace: FixtureWorkspace, params: URLSearchParams): string {
  const number = params.get('number');
  const item = number === null ? undefined : workspace.backend.item(Number(number));
  const comments = item?.comments.filter((comment) => comment.login !== 'github-actions[bot]') ?? [];
  const target = workspace.index.units.find((unit) => discussionTerm(workspace.index, unit) === params.get('term'));
  const content = item === undefined
    ? `${hidden('targetId', target?.id ?? '')}${hidden('revision', workspace.index.revision)}`
    : hidden('number', String(item.number));
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:inherit}body{margin:0;padding:0;font:16px/1.6 system-ui,sans-serif}textarea{box-sizing:border-box;width:100%;min-height:100px;font:inherit;padding:12px;border:1px solid #719bb5;border-radius:6px;background:transparent;color:inherit}button{font:inherit;padding:10px 16px;background:#255d82;color:white;border:0;border-radius:6px;cursor:pointer}article{border-bottom:1px solid #719bb5;padding:12px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#719bb5}label{display:block}</style></head><body>${item === undefined ? '' : `<a href="${itemPath(item)}" target="_parent">Discussion #${String(item.number)} sur GitHub</a>`}${form(item === undefined ? 'start-discussion' : 'comment', `${content}<label for="comment">Commentaire</label><textarea id="comment" name="body" required></textarea><button>Ajouter le commentaire</button>`)}${comments.map((comment) => `<article><strong>${escapeHtml(comment.login)}</strong><p>${escapeHtml(comment.body)}</p></article>`).join('')}</body></html>`;
}
