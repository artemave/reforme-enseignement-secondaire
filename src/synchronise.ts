import { passagePath } from './routes.js';
import { BOT_MARKER } from './matcher.js';
import type { Annotation, AnnotationIndex, Item, Mapping, Unit, GiscusConfig } from './model.js';

export type Match = (item: Item, units: Unit[]) => Promise<Mapping>;
export interface SyncConfig { repository: string; branch: string; documentPath: string; revision: string; siteUrl: string; botLogin: string }

export async function synchronise(github: { state(): Promise<Item[]>; writeComment(number: number, body: string, id?: number | string, kind?: Item['kind']): Promise<void>; deleteComment(id: number | string): Promise<void>; giscus?: GiscusConfig }, units: Unit[], config: SyncConfig, match: Match, now: string): Promise<AnnotationIndex> {
  const items = await github.state();
  const annotations: Annotation[] = [];
  // Compute everything before mutating GitHub. AI/API failures must not clear existing mappings.
  for (const item of items.filter((entry) => entry.open)) {
    const result = await match(item, units);
    if (result.targetId !== null && units.some((unit) => unit.id === result.targetId)) annotations.push({ number: item.number, kind: item.kind, title: item.title, url: item.url, targetId: result.targetId });
  }
  annotations.sort((a, b) => a.number - b.number);
  for (const item of items) {
    const bots = item.comments.filter((comment) => comment.login === config.botLogin && comment.body.startsWith(BOT_MARKER));
    const existing = bots[0];
    if (!item.open && existing === undefined) continue;
    const annotation = annotations.find((entry) => entry.number === item.number && entry.kind === item.kind);
    const target = units.find((unit) => unit.id === annotation?.targetId);
    const peers = annotations.filter((entry) => entry.targetId === annotation?.targetId && (entry.number !== item.number || entry.kind !== item.kind));
    const location = new URL(config.siteUrl);
    if (target !== undefined) location.pathname += passagePath(config, target);
    const content = [BOT_MARKER, '### Document annotations',
      target === undefined ? 'No confident match to the current document.' : `Target: [${target.id}](${location.href}) (document revision \`${config.revision}\`).`,
      peers.length === 0 ? 'No other open items mapped to this exact target.' : `Other open items on this exact target:\n${peers.map((peer) => `- [${peer.kind === 'pr' ? 'PR' : peer.kind === 'discussion' ? 'Discussion' : 'Issue'} #${String(peer.number)}](${peer.url})`).join('\n')}`,
      'Shared context does not imply resolution, approval or acceptance. Editorial decisions remain with the repository owner.',
    ].join('\n\n');
    if (existing?.body !== content) await github.writeComment(item.number, content, existing?.id, item.kind);
    for (const duplicate of bots.slice(1)) await github.deleteComment(duplicate.id);
  }
  return { version: 1, repository: config.repository, branch: config.branch, documentPath: config.documentPath, revision: config.revision, generatedAt: now, units, annotations, ...(github.giscus === undefined ? {} : { giscus: github.giscus }) };
}
