import { describe, expect, it, vi } from 'vitest';
import { Discussions } from '../src/discussions.js';
import { FakeGitHub } from '../dev/fake-github.js';
import { seedItems, fixtureRepository } from '../dev/scenario.js';
import { fetchQueue } from './fixtures.js';
import { readFile } from 'node:fs/promises';

const metadata = { data: { repository: { id: 'repo', discussionCategories: { nodes: [{ id: 'cat', name: 'General', slug: 'general' }] } } } };
const connection = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) => ({ data: { node: { connection: { nodes, pageInfo: { hasNextPage, endCursor } } } } });
const post = { id: 'D_1', number: 1, title: 'Discussion', body: 'Body', url: 'https://github.com/a/b/discussions/1', closed: false, includesCreatedEdit: false, lastEditedAt: null };

describe('GitHub Discussions', () => {
  it('paginates connections and refuses incomplete pagination or GraphQL errors', async () => {
    const transport = fetchQueue(connection([1], true, 'next'), connection([2]));
    expect(await new Discussions('a/b', 'token', transport).nodes('D', 'Discussion', 'comments', 'id')).toEqual([1, 2]);
    expect(transport.mock.calls[1]?.[1]?.body).toContain('"cursor":"next"');
    await expect(new Discussions('a/b', 't', fetchQueue(connection([], true))).nodes('D', 'Discussion', 'comments', 'id')).rejects.toThrow('Missing discussion pagination cursor');
    await expect(new Discussions('a/b', 't', fetchQueue({ data: null, errors: [{ message: 'Denied' }] })).graphql('query', {})).rejects.toThrow('GitHub GraphQL: Denied');
    await expect(new Discussions('a/b', 't', fetchQueue({ data: {}, errors: [] })).graphql('query', {})).resolves.toEqual({ data: {} });
  });
  it('fetches replies, original history and labels; retains closed discussions for comment reconciliation', async () => {
    const transport = fetchQueue(metadata, connection([post, { ...post, id: 'D_2', number: 2, closed: true }]),
      connection([{ id: 'C_1', body: 'Root', author: null }, { id: 'C_2', body: 'Root 2', author: { __typename: 'User', login: 'reader' } }]),
      connection([{ id: 'C_3', body: 'Reply', author: null }, { id: 'C_4', body: 'Reply 2', author: { __typename: 'User', login: 'other' } }]), connection([]),
      connection([{ diff: 'Original', editedAt: 'date', deletedAt: null }]), connection([{ name: 'label' }]),
      connection([]), connection([]));
    const github = new Discussions('a/b', 'token', transport);
    const items = await github.state();
    expect(items[0]).toMatchObject({ kind: 'discussion', labels: ['label'], edits: [{ diff: 'Original' }], comments: [{ login: '[deleted]' }, { login: '[deleted]' }, { login: 'other' }, { login: 'reader' }] });
    expect(items[1]).toMatchObject({ open: false, edits: [] });
    expect(github.giscus?.category).toBe('General');
    const absent = { data: { repository: { id: 'repo', discussionCategories: { nodes: [] } } } };
    await expect(new Discussions('a/b', 't', fetchQueue(absent)).state()).rejects.toThrow('General discussion category');
  });
  it('writes discussion comments using node IDs and delegates PR comments to REST', async () => {
    const transport = fetchQueue({ data: {} }, { data: {} }, { data: {} }, {}, {}, {});
    const github = new Discussions('a/b', 'token', transport);
    github.ids.set(1, 'D_1');
    await github.writeComment(1, 'Created');
    await github.writeComment(1, 'Edited', 'C_1');
    await github.deleteComment('C_1');
    await github.writeComment(1, 'PR comment', undefined, 'pr');
    await github.writeComment(1, 'Updated PR', 2, 'pr');
    await github.deleteComment(2);
    expect(transport.mock.calls[0]?.[1]?.body).toContain('"discussionId":"D_1"');
    expect(transport.mock.calls[1]?.[1]?.body).toContain('"commentId":"C_1"');
    expect(transport.mock.calls[2]?.[1]?.body).toContain('deleteDiscussionComment');
    expect(transport.mock.calls.slice(3).map((call) => call[1]?.method)).toEqual(['POST', 'PATCH', 'DELETE']);
    await expect(github.writeComment(999, 'Unknown')).rejects.toThrow();
  });
  it('uses the shared fake for comment creation, updates and duplicate removal', async () => {
    const markdown = await readFile('dev/fixtures/document.md', 'utf8');
    const backend = new FakeGitHub(seedItems(markdown));
    const github = new Discussions(fixtureRepository, 'fake', backend.fetch);
    await github.state();
    await github.writeComment(1, 'created');
    expect((await github.state())[0]?.comments[0]?.login).toBe('github-actions[bot]');
    await github.writeComment(1, 'updated', 'C_1000');
    expect(backend.item(1).comments[0]?.body).toBe('updated');
    await github.deleteComment('C_1000');
    expect(backend.item(1).comments).toEqual([]);
    await expect(github.deleteComment('C_99999')).rejects.toThrow();
    expect(backend.graphql('query{node{connection:comments}}', { id: 'D_1' }).status).toBe(200);
  });
  it('supports the default global transport', async () => {
    vi.stubGlobal('fetch', fetchQueue({ data: {} }));
    await new Discussions('a/b', 't').graphql('query', {});
    vi.unstubAllGlobals();
  });
});
