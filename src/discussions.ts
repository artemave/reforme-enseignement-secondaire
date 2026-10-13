import { z } from 'zod';
import { GitHub } from './github.js';
import { request } from './http.js';
import type { Fetch } from './http.js';
import type { Comment, Item, GiscusConfig } from './model.js';

const page = z.object({ nodes: z.array(z.unknown()), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) });
const response = z.object({ data: z.object({ node: z.object({ connection: page }) }) });
const metadata = z.object({ data: z.object({ repository: z.object({ id: z.string(), discussionCategories: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })) }) }) }) });
const discussion = z.object({ id: z.string(), number: z.number(), title: z.string(), body: z.string(), url: z.string(), closed: z.boolean(), includesCreatedEdit: z.boolean(), lastEditedAt: z.string().nullable() });
// GraphQL Bot.logins omit the [bot] suffix used by REST and our configuration.
const actor = z.object({ __typename: z.string(), login: z.string() }).transform((value) => value.__typename === 'Bot' ? `${value.login}[bot]` : value.login);
const comment = z.object({ id: z.string(), body: z.string(), author: actor.nullable() });
const edit = z.object({ diff: z.string().nullable(), editedAt: z.string(), deletedAt: z.string().nullable() });

/** Fetch Discussions and their context for matching and comment reconciliation. */
export class Discussions {
  readonly github: GitHub;
  giscus?: GiscusConfig;
  readonly ids = new Map<number, string>();
  constructor(readonly repository: string, readonly token: string, readonly fetcher: Fetch = fetch) {
    this.github = new GitHub(repository, token, fetcher);
  }
  async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const result = z.object({ data: z.record(z.string(), z.unknown()).nullable().optional(), errors: z.array(z.object({ message: z.string() })).optional() }).parse(await request(this.fetcher, 'https://api.github.com/graphql', this.token, 'POST', { query, variables }));
    if (result.errors !== undefined && result.errors.length > 0) throw new Error(`GitHub GraphQL: ${result.errors.map((error) => error.message).join('; ')}`);
    return z.object({ data: z.record(z.string(), z.unknown()) }).parse(result);
  }
  async nodes(id: string, type: string, field: string, fields: string): Promise<unknown[]> {
    const result: unknown[] = [];
    let cursor: string | null = null;
    for (;;) {
      const value = response.parse(await this.graphql(`query($id:ID!,$cursor:String){node(id:$id){... on ${type}{connection:${field}(first:100,after:$cursor){nodes{${fields}} pageInfo{hasNextPage endCursor}}}}}`, { id, cursor }));
      const connection = value.data.node.connection;
      result.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage) return result;
      cursor = connection.pageInfo.endCursor;
      if (cursor === null) throw new Error('Missing discussion pagination cursor');
    }
  }
  async state(): Promise<Item[]> {
    const [owner, name] = this.repository.split('/');
    const repo = metadata.parse(await this.graphql('query($owner:String!,$name:String!){repository(owner:$owner,name:$name){id discussionCategories(first:100){nodes{id name slug}}}}', { owner, name })).data.repository;
    const category = repo.discussionCategories.nodes.find((entry) => entry.slug === 'general');
    if (category === undefined) throw new Error('Enable the General discussion category before publishing');
    this.giscus = { repositoryId: repo.id, categoryId: category.id, category: category.name, categorySlug: category.slug, clientUrl: 'https://giscus.app/client.js' };
    this.ids.clear();
    const items: Item[] = [];
    for (const raw of await this.nodes(repo.id, 'Repository', 'discussions', 'id number title body url closed includesCreatedEdit lastEditedAt')) {
      const entry = discussion.parse(raw);
      this.ids.set(entry.number, entry.id);
      const comments: Comment[] = [];
      for (const rawComment of await this.nodes(entry.id, 'Discussion', 'comments', 'id body author{__typename login}')) {
        const parsed = comment.parse(rawComment);
        comments.push({ id: parsed.id, body: parsed.body, login: parsed.author ?? '[deleted]' });
        for (const reply of await this.nodes(parsed.id, 'DiscussionComment', 'replies', 'id body author{__typename login}')) {
          const parsedReply = comment.parse(reply);
          comments.push({ id: parsedReply.id, body: parsedReply.body, login: parsedReply.author ?? '[deleted]' });
        }
      }
      const edits = entry.closed ? [] : (await this.nodes(entry.id, 'Discussion', 'userContentEdits', 'diff editedAt deletedAt')).map((rawEdit) => edit.parse(rawEdit));
      items.push({ number: entry.number, kind: 'discussion', title: entry.title, body: entry.body, url: entry.url, open: !entry.closed, labels: (await this.nodes(entry.id, 'Discussion', 'labels', 'name')).map((label) => z.object({ name: z.string() }).parse(label).name), comments, discussion: [], edits, includesCreatedEdit: entry.includesCreatedEdit, lastEditedAt: entry.lastEditedAt, diff: '' });
    }
    return items;
  }
  async writeComment(number: number, body: string, id?: number | string, kind: Item['kind'] = 'discussion'): Promise<void> {
    if (kind !== 'discussion') { await this.github.writeComment(number, body, id); return; }
    const input = id === undefined ? { discussionId: z.string().parse(this.ids.get(number)), body } : { commentId: id, body };
    const mutation = id === undefined ? 'addDiscussionComment' : 'updateDiscussionComment';
    const type = id === undefined ? 'AddDiscussionCommentInput' : 'UpdateDiscussionCommentInput';
    z.object({ data: z.record(z.string(), z.unknown()) }).parse(await this.graphql(`mutation($input:${type}!){${mutation}(input:$input){comment{id}}}`, { input }));
  }
  async deleteComment(id: number | string): Promise<void> {
    if (typeof id === 'number') { await this.github.deleteComment(id); return; }
    z.object({ data: z.record(z.string(), z.unknown()) }).parse(await this.graphql('mutation($input:DeleteDiscussionCommentInput!){deleteDiscussionComment(input:$input){clientMutationId}}', { input: { id } }));
  }
}
