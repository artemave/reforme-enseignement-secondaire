import { discussionPresentation } from './discussion-presentation.js';
import { BOT_MARKER } from './matcher.js';
import type { Annotation, AnnotationIndex, Item, Mapping, Unit, GiscusConfig } from './model.js';

export type Match = (item: Item, units: Unit[]) => Promise<Mapping>;
export interface SyncConfig { repository: string; branch: string; documentPath: string; revision: string; siteUrl: string; botLogin: string }

export async function synchronise(github: { state(): Promise<Item[]>; writeDiscussion?(number: number, title: string, body: string): Promise<void>; writeComment(number: number, body: string, id?: number | string, kind?: Item['kind']): Promise<void>; deleteComment(id: number | string): Promise<void>; giscus?: GiscusConfig }, units: Unit[], config: SyncConfig, match: Match, now: string): Promise<AnnotationIndex> {
  const items = await github.state();
  const annotations: Annotation[] = [];
  // Compute everything before mutating GitHub. AI/API failures must not clear existing mappings.
  for (const item of items.filter((entry) => entry.open)) {
    const result = await match(item, units);
    if (result.targetId !== null && units.some((unit) => unit.id === result.targetId)) annotations.push({ number: item.number, kind: item.kind, title: discussionPresentation(item, units, config.revision)?.title ?? item.title, url: item.url, targetId: result.targetId });
  }
  for (const item of items) {
    const presentation = discussionPresentation(item, units, config.revision);
    if (presentation !== null) {
      try {
        await github.writeDiscussion?.(item.number, presentation.title, presentation.body);
      } catch (error) {
        // Cosmetic cleanup must not prevent fresh annotations from being published.
        console.warn(`Could not simplify discussion #${String(item.number)}:`, error instanceof Error ? error.message : 'Unknown GitHub error');
      }
    }
  }
  annotations.sort((a, b) => a.number - b.number);
  for (const item of items) {
    const bots = item.comments.filter((comment) => comment.login === config.botLogin && comment.body.startsWith(BOT_MARKER));
    const existing = bots[0];
    if (!item.open && existing === undefined) continue;
    const annotation = annotations.find((entry) => entry.number === item.number && entry.kind === item.kind);
    const peers = annotation === undefined ? [] : annotations.filter((entry) => entry.targetId === annotation.targetId && (entry.number !== item.number || entry.kind !== item.kind));
    if (peers.length === 0) {
      for (const comment of bots) await github.deleteComment(comment.id);
      continue;
    }
    const content = [BOT_MARKER, '### Autres discussions',
      peers.map((peer) => `- [${peer.kind === 'pr' ? 'PR' : peer.kind === 'discussion' ? 'Discussion' : 'Issue'} #${String(peer.number)} : ${peer.title}](${peer.url})`).join('\n'),
    ].join('\n\n');
    if (existing?.body !== content) await github.writeComment(item.number, content, existing?.id, item.kind);
    for (const duplicate of bots.slice(1)) await github.deleteComment(duplicate.id);
  }
  return { version: 1, repository: config.repository, branch: config.branch, documentPath: config.documentPath, revision: config.revision, generatedAt: now, units, annotations, ...(github.giscus === undefined ? {} : { giscus: github.giscus }) };
}
