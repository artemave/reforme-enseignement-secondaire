import { z } from 'zod';
import { request } from './http.js';
import type { Fetch } from './http.js';
import type { Comment, Edit, Item } from './model.js';

const actor = z.object({ login: z.string() });
const issue = z.object({ number: z.number(), title: z.string(), body: z.string().nullable(), html_url: z.string(), state: z.enum(['open', 'closed']), labels: z.array(z.object({ name: z.string() })), pull_request: z.unknown().optional() });
const comment = z.object({ id: z.number(), body: z.string(), user: actor.nullable() });
const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const historyResponse = z.object({ data: z.object({ repository: z.object({ issueOrPullRequest: z.object({ includesCreatedEdit: z.boolean(), lastEditedAt: z.string().nullable(), userContentEdits: z.object({ nodes: z.array(z.object({ diff: z.string().nullable(), editedAt: z.string(), deletedAt: z.string().nullable() })), pageInfo }) }) }) }) });
const files = z.array(z.object({ filename: z.string(), patch: z.string().optional() }));
const reviews = z.array(z.object({ body: z.string() }));

export class GitHub {
  readonly base: string;
  constructor(readonly repository: string, readonly token: string, readonly fetcher: Fetch = fetch) {
    this.base = `https://api.github.com/repos/${repository}`;
  }
  async pages(path: string): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let page = 1; ; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = z.array(z.unknown()).parse(await request(this.fetcher, `${this.base}${path}${separator}per_page=100&page=${String(page)}`, this.token));
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  }
  async edits(number: number): Promise<{ edits: Edit[]; includesCreatedEdit: boolean; lastEditedAt: string | null }> {
    const [owner, name] = this.repository.split('/');
    const result: Edit[] = [];
    let cursor: string | null = null;
    for (;;) {
      const response = historyResponse.parse(await request(this.fetcher, 'https://api.github.com/graphql', this.token, 'POST', {
        query: 'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){issueOrPullRequest(number:$number){... on Issue {includesCreatedEdit lastEditedAt userContentEdits(first:100,after:$cursor){nodes{diff editedAt deletedAt} pageInfo{hasNextPage endCursor}}} ... on PullRequest {includesCreatedEdit lastEditedAt userContentEdits(first:100,after:$cursor){nodes{diff editedAt deletedAt} pageInfo{hasNextPage endCursor}}}}}}',
        variables: { owner, name, number, cursor },
      }));
      const connection = response.data.repository.issueOrPullRequest.userContentEdits;
      result.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage) return { edits: result, includesCreatedEdit: response.data.repository.issueOrPullRequest.includesCreatedEdit, lastEditedAt: response.data.repository.issueOrPullRequest.lastEditedAt };
      cursor = connection.pageInfo.endCursor;
      if (cursor === null) throw new Error('Missing history pagination cursor');
    }
  }
  async state(): Promise<Item[]> {
    const result: Item[] = [];
    for (const raw of await this.pages('/issues?state=all&sort=created&direction=asc')) {
      const entry = issue.parse(raw);
      const kind = entry.pull_request === undefined ? 'issue' : 'pr';
      const comments: Comment[] = (await this.pages(`/issues/${String(entry.number)}/comments`)).map((rawComment) => {
        const parsed = comment.parse(rawComment);
        return { id: parsed.id, body: parsed.body, login: parsed.user?.login ?? '[deleted]' };
      });
      const item: Item = { number: entry.number, kind, title: entry.title, body: entry.body ?? '', url: entry.html_url, open: entry.state === 'open', labels: entry.labels.map((label) => label.name), comments, edits: [], includesCreatedEdit: false, lastEditedAt: null, diff: '', discussion: [] };
      if (item.open) {
        Object.assign(item, await this.edits(item.number));
        if (kind === 'pr') {
          const prefix = `/pulls/${String(item.number)}`;
          item.diff = files.parse(await this.pages(`${prefix}/files`)).map((file) => `${file.filename}\n${file.patch ?? '[Binary or unavailable diff]'}`).join('\n\n');
          item.discussion = [...reviews.parse(await this.pages(`${prefix}/reviews`)), ...reviews.parse(await this.pages(`${prefix}/comments`))].map((review) => review.body);
        }
      }
      result.push(item);
    }
    return result;
  }
  async writeComment(number: number, body: string, id?: number | string): Promise<void> {
    await request(this.fetcher, id === undefined ? `${this.base}/issues/${String(number)}/comments` : `${this.base}/issues/comments/${String(id)}`, this.token, id === undefined ? 'POST' : 'PATCH', { body });
  }
  async deleteComment(id: number | string): Promise<void> {
    await request(this.fetcher, `${this.base}/issues/comments/${String(id)}`, this.token, 'DELETE');
  }
}
