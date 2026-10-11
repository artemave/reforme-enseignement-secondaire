import { z } from 'zod';
import { GitHub } from '../src/github.js';
import { matchItem } from '../src/matcher.js';
import { synchronise } from '../src/synchronise.js';
import { parseDocument } from '../src/document.js';
import { revisionOf } from '../src/artifacts.js';
import type { AnnotationIndex } from '../src/model.js';
import { FakeGitHub } from './fake-github.js';
import { fixtureRepository, fixtureTime, seedItems } from './scenario.js';

const number = z.coerce.number().int().positive();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), kind: z.enum(['issue', 'pr']), title: z.string().trim().min(1), body: z.string() }),
  z.object({ type: z.literal('edit'), number, title: z.string().trim().min(1), body: z.string() }),
  z.object({ type: z.literal('comment'), number, body: z.string().trim().min(1) }),
  z.object({ type: z.literal('state'), number, state: z.enum(['open', 'closed', 'merged']) }),
  z.object({ type: z.literal('diff'), number, body: z.string() }),
  z.object({ type: z.literal('document'), markdown: z.string() }),
  z.object({ type: z.literal('matching'), available: z.enum(['yes', 'no']) }),
  z.object({ type: z.literal('rebuild') }), z.object({ type: z.literal('reset') }),
]);
export type Action = z.infer<typeof actionSchema>;

/** Simulate event → fresh GitHub read → matching → comments → publication. */
export class FixtureWorkspace {
  backend: FakeGitHub;
  markdown: string;
  index: AnnotationIndex;
  private pending = Promise.resolve();
  constructor(readonly initialMarkdown: string, readonly siteUrl = 'http://localhost:5173/') {
    this.markdown = initialMarkdown;
    this.backend = new FakeGitHub(seedItems(initialMarkdown));
    this.index = { version: 1, repository: fixtureRepository, branch: 'main', documentPath: 'content/document.md', revision: revisionOf(initialMarkdown), generatedAt: fixtureTime, units: parseDocument(initialMarkdown), annotations: [] };
  }
  dispatch(action: Action): Promise<AnnotationIndex> {
    const run = this.pending.then(async () => {
      switch (action.type) {
        case 'create': {
          const number = Math.max(0, ...this.backend.items.map((item) => item.number)) + 1;
          this.backend.items.push({ number, kind: action.kind, title: action.title, body: action.body, url: `https://github.com/${fixtureRepository}/${action.kind === 'issue' ? 'issues' : 'pull'}/${String(number)}`, open: true, merged: false, labels: [], comments: [], discussion: [], edits: [], includesCreatedEdit: false, lastEditedAt: null, diff: '' });
          break;
        }
        case 'edit': this.backend.edit(action.number, action.title, action.body); break;
        case 'comment': this.backend.item(action.number).comments.push({ id: this.backend.nextCommentId++, login: 'fixture-reader', body: action.body }); break;
        case 'state': {
          const item = this.backend.item(action.number);
          if (action.state === 'merged' && item.kind !== 'pr') throw new Error('Only proposals can be merged');
          item.open = action.state === 'open'; item.merged = action.state === 'merged'; break;
        }
        case 'diff': this.backend.item(action.number).diff = action.body; break;
        case 'document': this.markdown = action.markdown; break;
        case 'matching': this.backend.matchingUnavailable = action.available === 'no'; break;
        case 'reset': this.markdown = this.initialMarkdown; this.backend = new FakeGitHub(seedItems(this.initialMarkdown)); break;
        case 'rebuild': break;
      }
      const units = parseDocument(this.markdown);
      const config = { repository: fixtureRepository, branch: 'main', documentPath: 'content/document.md', revision: revisionOf(this.markdown), siteUrl: this.siteUrl, botLogin: 'github-actions[bot]' };
      const next = await synchronise(new GitHub(fixtureRepository, 'fake-token', this.backend.fetch), units, config,
        (item, document) => matchItem(item, document, { token: 'fake-key', endpoint: 'https://fixture-model.invalid/chat', model: 'fixture' }, config.botLogin, this.backend.fetch), fixtureTime);
      this.index = next; return next;
    });
    // A failed run must preserve the last index and not poison later queued runs.
    this.pending = run.then(() => undefined, () => undefined);
    return run;
  }
}
