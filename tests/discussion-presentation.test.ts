import { expect, it, vi } from 'vitest';
import { discussionPresentation } from '../src/discussion-presentation.js';
import { synchronise } from '../src/synchronise.js';
import { item, unit, config, now } from './fixtures.js';
import { Discussions } from '../src/discussions.js';
import { FakeGitHub } from '../dev/fake-github.js';
import { seedItems } from '../dev/scenario.js';
import { readFile } from 'node:fs/promises';

const revision = 'a'.repeat(64);
const title = `${revision}/u-1: A *quoted* passage (${now})`;
const generated = { ...item, kind: 'discussion' as const, title, body: `# ${title}\n\nUn document de travail ouvert à la discussion. Retrouvez les questions.\n\nhttps://example.com/passage/${revision}/u-1/\n\n<!-- sha1: keep-this-hash -->` };

it('retains the lookup hash and backlink while removing visible bookkeeping and generic description', () => {
  const cleaned = discussionPresentation(generated, [{ ...unit, markdown: 'A *quoted* passage.\nAnother line.' }], revision);
  expect(cleaned).toEqual({ title: 'Discussion : A quoted passage.', body: `> A *quoted* passage.\n> Another line.\n\n[Lire dans le document](https://example.com/passage/${revision}/u-1/)\n\n<!-- sha1: keep-this-hash -->` });
  expect(discussionPresentation({ ...generated, title: generated.title.replace(` (${now})`, ''), body: generated.body.replace(` (${now})`, '') }, [], revision)?.title).toBe('Discussion : A quoted passage');
  expect(discussionPresentation(generated, [unit], 'new-revision')?.body).toContain('> A *quoted* passage');
  const long = discussionPresentation(generated, [{ ...unit, markdown: 'long passage '.repeat(20) }], revision);
  expect(long?.title.length).toBeLessThanOrEqual(133);
  expect(long?.title.endsWith('…')).toBe(true);
});
it('preserves authored titles and descriptions, and does not re-edit a cleaned discussion', () => {
  expect(discussionPresentation(item, [unit], revision)).toBeNull();
  expect(discussionPresentation({ ...generated, kind: 'issue' }, [unit], revision)).toBeNull();
  expect(discussionPresentation({ ...generated, body: 'An edited description' }, [unit], revision)).toBeNull();
  expect(discussionPresentation({ ...generated, body: `# ${title}\n\nNo lookup metadata` }, [unit], revision)).toBeNull();
  const cleaned = discussionPresentation(generated, [unit], revision);
  if (cleaned === null) throw new Error('Expected presentation');
  expect(discussionPresentation({ ...generated, ...cleaned }, [unit], revision)).toBeNull();
});
it('cleans titles through the shared GitHub backend without changing comments and does so once', async () => {
  const backend = new FakeGitHub(seedItems(await readFile('dev/fixtures/document.md', 'utf8')));
  const discussion = backend.item(3);
  const initialComments = structuredClone(discussion.comments);
  Object.assign(discussion, generated, { number: 3, comments: initialComments });
  backend.items.splice(0, backend.items.length, discussion);
  const github = new Discussions('development/document-annotations', 'fake', backend.fetch);
  const matched = { targetId: unit.id, confidence: 1, evidence: 'Title', reason: 'match' };
  const result = await synchronise(github, [unit], { ...config, revision }, () => Promise.resolve(matched), now);
  expect(result.annotations.find((entry) => entry.number === 3)?.title).toBe('Discussion : Title');
  expect(backend.item(3).comments).toEqual(initialComments);
  const edits = backend.writes.filter((entry) => entry.path === '/discussions/3');
  expect(edits).toHaveLength(1);
  await synchronise(github, [unit], { ...config, revision }, () => Promise.resolve(matched), now);
  expect(backend.writes.filter((entry) => entry.path === '/discussions/3')).toHaveLength(1);
  const readonly = { state: () => Promise.resolve([generated]), writeComment: vi.fn(), deleteComment: vi.fn() };
  await synchronise(readonly, [unit], { ...config, revision }, () => Promise.resolve(matched), now);
});
