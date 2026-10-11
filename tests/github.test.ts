import { describe, expect, it, vi } from 'vitest';
import { GitHub } from '../src/github.js';
import { fetchQueue } from './fixtures.js';
const history = (next = false, cursor: string | null = null) => ({ data: { repository: { issueOrPullRequest: { includesCreatedEdit: true, lastEditedAt: 'date', userContentEdits: { nodes: [{ diff: null, editedAt: 'date', deletedAt: null }], pageInfo: { hasNextPage: next, endCursor: cursor } } } } } });
const raw = (number: number, state = 'open', pr = false) => ({ number, state, title: 'Title', body: null, html_url: `https://github.com/a/b/issues/${String(number)}`, labels: [{ name: 'label' }], ...(pr ? { pull_request: {} } : {}) });
describe('GitHub state', () => {
  it('paginates REST lists and preserves existing query strings', async () => {
    const fetcher = fetchQueue(Array.from({ length: 100 }, () => 1), [2], []);
    const github = new GitHub('a/b', 'token', fetcher);
    expect(await github.pages('/issues?state=all')).toHaveLength(101);
    expect(fetcher.mock.calls[1]?.[0]).toContain('&per_page=100&page=2');
    expect(await github.pages('/issues')).toEqual([]);
    expect(fetcher.mock.calls[2]?.[0]).toContain('?per_page=100&page=1');
  });
  it('paginates GraphQL edit history and rejects missing cursors/API errors', async () => {
    const fetcher = fetchQueue(history(true, 'cursor'), history());
    const github = new GitHub('a/b', 'token', fetcher);
    expect((await github.edits(1)).edits).toHaveLength(2);
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain('"cursor":"cursor"');
    await expect(new GitHub('a/b', 't', fetchQueue(history(true))).edits(1)).rejects.toThrow('Missing history pagination cursor');
    await expect(new GitHub('a/b', 't', fetchQueue({ errors: [] })).edits(1)).rejects.toThrow();
  });
  it('fetches issues, PR patches, reviews and comments; skips closed-item matching context', async () => {
    const fetcher = fetchQueue(
      [raw(1), { ...raw(2, 'open', true), body: 'body' }, raw(3, 'closed')],
      [{ id: 1, body: 'comment', user: { login: 'reader' } }, { id: 2, body: 'deleted', user: null }], history(),
      [], history(), [{ filename: 'd.md', patch: 'diff' }, { filename: 'image.png' }], [{ body: 'review' }], [{ body: 'inline' }],
      [],
    );
    const result = await new GitHub('a/b', 'token', fetcher).state();
    expect(result[0]?.comments[1]?.login).toBe('[deleted]');
    expect(result[0]?.body).toBe('');
    expect(result[1]).toMatchObject({ kind: 'pr', body: 'body', discussion: ['review', 'inline'], diff: 'd.md\ndiff\n\nimage.png\n[Binary or unavailable diff]' });
    expect(result[2]?.edits).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(9);
  });
  it('creates, updates and deletes comments', async () => {
    const fetcher = fetchQueue({}, {}, {});
    const github = new GitHub('a/b', 'token', fetcher);
    await github.writeComment(1, 'body'); await github.writeComment(1, 'changed', 2); await github.deleteComment(3);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'PATCH', 'DELETE']);
    expect(fetcher.mock.calls[1]?.[0]).toContain('/issues/comments/2');
  });
  it('uses global fetch by default', async () => {
    vi.stubGlobal('fetch', fetchQueue([]));
    expect(await new GitHub('a/b', 'token').pages('/issues')).toEqual([]);
    vi.unstubAllGlobals();
  });
});
