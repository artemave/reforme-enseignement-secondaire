// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { FakeGitHub } from '../dev/fake-github.js';
import { fixtureRepository, fixtureTime, seedItems, passageBody } from '../dev/scenario.js';
import { FixtureWorkspace, actionSchema } from '../dev/workspace.js';
import { GitHub } from '../src/github.js';
import { BOT_MARKER } from '../src/matcher.js';
import { parseDocument } from '../src/document.js';
const markdown = await readFile('dev/fixtures/document.md', 'utf8');
const base = `https://api.github.com/repos/${fixtureRepository}`;
function fake(items = seedItems(markdown)) { return new FakeGitHub(items); }
const request = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const payload = (document: readonly { id: string; markdown: string }[], description: string, original: string | null, diff: string, comments: string[]) => request('POST', { messages: [{ role: 'user', content: JSON.stringify({ currentDocument: document, item: { description, originalDescription: original, diff, comments, reviews: [] } }) }] });

describe('shared fake GitHub contract', () => {
  it('seeds title, section, paragraph, historical, unmatched, closed examples', () => {
    expect(seedItems(markdown)).toHaveLength(8);
    expect(seedItems('').every((item) => item.diff === '')).toBe(true);
    expect(seedItems('Only a paragraph.')).toHaveLength(8);
    expect(fake().item(5).edits[0]?.diff).toContain('Un accompagnement');
    expect(() => fake().item(999)).toThrow('does not exist');
  });
  it('supports every real GitHub adapter operation and records writes', async () => {
    const backend = fake(); backend.item(4).kind = 'pr'; backend.item(4).diff = 'L’école'; backend.item(4).discussion = ['A review']; const github = new GitHub(fixtureRepository, 'fake', backend.fetch);
    const items = await github.state();
    expect(items[3]?.diff).toContain('L’école'); expect(items[3]?.discussion).toHaveLength(2);
    await github.writeComment(1, 'created'); await github.writeComment(1, 'edited', 1000);
    expect(backend.item(1).comments[0]?.body).toBe('edited');
    await github.deleteComment(1000); expect(backend.item(1).comments).toEqual([]);
    expect(backend.writes.map((write) => write.method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });
  it('paginates actual adapter reads beyond 100 items, comments and history versions', async () => {
    const first = fake().item(1);
    const items = Array.from({ length: 101 }, (_, i) => ({ ...first, number: i + 1, comments: [], edits: [] }));
    const backend = fake(items);
    backend.item(1).comments = Array.from({ length: 101 }, (_, id) => ({ id, body: 'comment', login: 'reader' }));
    backend.item(1).edits = Array.from({ length: 101 }, () => ({ diff: 'body', editedAt: fixtureTime, deletedAt: null }));
    const github = new GitHub(fixtureRepository, 'fake', backend.fetch);
    expect(await github.pages('/issues')).toHaveLength(101);
    expect(await github.pages('/issues/1/comments')).toHaveLength(101);
    expect((await github.edits(1)).edits).toHaveLength(101);
    expect((await backend.fetch(`${base}/issues?per_page=1&page=2`)).status).toBe(200);
    expect((await backend.fetch(`${base}/issues`)).status).toBe(200);
  });
  it('never falls back to the internet and rejects unsupported hosts, repos, methods and comments', async () => {
    const backend = fake();
    for (const [url, method] of [
      ['https://example.com', 'GET'], ['https://api.github.com/repos/other/repo/issues', 'GET'],
      [`${base}/issues/1/comments`, 'PUT'], [`${base}/issues/comments/31`, 'GET'],
      [`${base}/issues/comments/999`, 'PATCH'], [`${base}/unknown`, 'GET'],
      [`${base}/pulls/4/files`, 'POST'],
    ]) expect((await backend.fetch(String(url), { method: String(method) })).status).toBe(404);
    expect((await backend.fetch('https://fixture-model.invalid/chat', request('POST', { messages: [] }))).status).toBe(400);
  });
  it('matching is deterministic, conservative and clearly fake', async () => {
    const backend = fake(); const url = 'https://fixture-model.invalid/chat';
    const units = [{ id: 'u-1', markdown: 'first' }, { id: 'u-2', markdown: 'second' }] as const;
    const response = await backend.fetch(url, payload(units, 'first', null, '', []));
    expect(await response.text()).toContain('Deterministic fixture');
    const formQuote = await backend.fetch(url, payload(units, '## Passage\r\n\r\nfirst\r\n\r\n## Contexte\r\n\r\nContext', null, '', []));
    expect(await formQuote.text()).toContain('u-1');
    const ambiguous = await backend.fetch(url, payload(units, 'unknown', null, 'first\nsecond', []));
    expect(await ambiguous.text()).toContain('null');
    const missing = await backend.fetch(url, payload(units, 'unknown', null, '', []));
    expect(await missing.text()).toContain('null');
    const duplicate = await backend.fetch(url, payload([units[0], units[0]], 'first', null, '', []));
    expect(await duplicate.text()).toContain('null');
    backend.matchingUnavailable = true;
    expect((await backend.fetch(url, payload(units, 'first', null, '', []))).status).toBe(503);
  });
  it('preserves the original through repeated edits', () => {
    const backend = fake(); const original = backend.item(1).body;
    backend.edit(1, 'first edit', 'first'); backend.edit(1, 'second edit', 'second');
    expect(backend.item(1).edits.map((edit) => edit.diff)).toEqual(['second', 'first', original]);
  });
});

describe('simulated event → synchronisation → publication', () => {
  it('publishes representative annotations and leaves unchanged bot comments untouched', async () => {
    const workspace = new FixtureWorkspace(markdown);
    const index = await workspace.dispatch({ type: 'rebuild' });
    expect(index.annotations.map((a) => a.number)).toEqual([1, 2, 3, 4, 5]);
    expect(workspace.backend.item(3).comments.find((c) => c.body.startsWith(BOT_MARKER))?.body).toContain('Discussion #4');
    const writes = workspace.backend.writes.length;
    await workspace.dispatch({ type: 'rebuild' }); expect(workspace.backend.writes).toHaveLength(writes);
  });
  it('handles creation, comment context, edits, PR diffs, closure, reopening and acceptance', async () => {
    const workspace = new FixtureWorkspace(markdown);
    await workspace.dispatch({ type: 'rebuild' });
    const first = parseDocument(markdown)[0];
    if (first === undefined) throw new Error('Expected title');
    await workspace.dispatch({ type: 'create', kind: 'discussion', title: 'New issue', body: passageBody(first) });
    await workspace.dispatch({ type: 'create', kind: 'pr', title: 'New proposal', body: 'No quote' });
    expect(workspace.index.annotations.some((a) => a.number === 9)).toBe(true);
    await workspace.dispatch({ type: 'diff', number: 10, body: first.markdown });
    expect(workspace.index.annotations.some((a) => a.number === 10)).toBe(false);
    await workspace.dispatch({ type: 'comment', number: 6, body: first.markdown });
    await workspace.dispatch({ type: 'edit', number: 9, title: 'Edited', body: first.markdown });
    await workspace.dispatch({ type: 'state', number: 9, state: 'closed' });
    expect(workspace.index.annotations.some((a) => a.number === 9)).toBe(false);
    await workspace.dispatch({ type: 'state', number: 9, state: 'open' });
    await workspace.dispatch({ type: 'state', number: 10, state: 'merged' });
    expect(workspace.backend.item(10).merged).toBe(true);
    expect(workspace.backend.item(9).open).toBe(true);
    await expect(workspace.dispatch({ type: 'state', number: 9, state: 'merged' })).rejects.toThrow('Only proposals');
  });
  it('serialises queued changes and recovers after a failed run without publishing bad data', async () => {
    const workspace = new FixtureWorkspace(markdown);
    const first = await workspace.dispatch({ type: 'rebuild' }); const writes = workspace.backend.writes.length;
    await expect(workspace.dispatch({ type: 'matching', available: 'no' })).rejects.toThrow('503');
    expect(workspace.index).toBe(first); expect(workspace.backend.writes).toHaveLength(writes);
    await workspace.dispatch({ type: 'matching', available: 'yes' });
    await Promise.all([
      workspace.dispatch({ type: 'create', kind: 'discussion', title: 'Queued one', body: 'No match' }),
      workspace.dispatch({ type: 'create', kind: 'discussion', title: 'Queued two', body: 'No match' }),
    ]);
    expect(workspace.backend.items.slice(-2).map((item) => item.number)).toEqual([9, 10]);
    await workspace.dispatch({ type: 'document', markdown: '# Different\n\nA different document.' });
    expect(workspace.index.annotations).toEqual([]);
    await workspace.dispatch({ type: 'reset' }); expect(workspace.backend.items).toHaveLength(8);
  });
  it('can create the first item in an empty fake repository', async () => {
    const workspace = new FixtureWorkspace(markdown); workspace.backend.items.splice(0);
    await workspace.dispatch({ type: 'create', kind: 'discussion', title: 'First', body: 'No match' });
    expect(workspace.backend.items[0]?.number).toBe(1);
  });
  it('validates submitted actions', () => {
    expect(actionSchema.parse({ type: 'state', number: '3', state: 'closed' })).toEqual({ type: 'state', number: 3, state: 'closed' });
    expect(() => actionSchema.parse({ type: 'create', kind: 'discussion', title: '', body: '' })).toThrow();
  });
});
