import { z } from 'zod';
import type { Fetch } from '../src/http.js';
import type { Mapping } from '../src/model.js';
import { fixtureRepository, fixtureTime } from './scenario.js';
import type { FixtureItem } from './scenario.js';

const aiInput = z.object({ currentDocument: z.array(z.object({ id: z.string(), markdown: z.string() })), item: z.object({ description: z.string(), originalDescription: z.string().nullable(), diff: z.string(), comments: z.array(z.string()), reviews: z.array(z.string()) }) });
const completionRequest = z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) });
const bodySchema = z.object({ body: z.string() });
const variablesSchema = z.object({ variables: z.object({ number: z.number(), cursor: z.string().nullable() }) });

function quote(text: string): string {
  const normalised = text.replace(/\r\n/gu, '\n');
  return /## Passage\n\n([\s\S]*?)\n\n## Contexte/u.exec(normalised)?.[1]?.trim() ?? normalised.trim();
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function page<T>(values: T[], url: URL): T[] {
  const size = Number(url.searchParams.get('per_page') ?? '100');
  const offset = (Number(url.searchParams.get('page') ?? '1') - 1) * size;
  return values.slice(offset, offset + size);
}

/** A strict, network-free HTTP test double consumed by the real GitHub adapter. */
export class FakeGitHub {
  readonly items: FixtureItem[];
  readonly writes: { method: string; path: string; body: string }[] = [];
  matchingUnavailable = false;
  nextCommentId = 1000;
  constructor(items: FixtureItem[]) { this.items = structuredClone(items); }

  item(number: number): FixtureItem {
    const item = this.items.find((entry) => entry.number === number);
    if (item === undefined) throw new Error(`Fictional item #${String(number)} does not exist`);
    return item;
  }

  readonly fetch: Fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === 'https://fixture-model.invalid' && request.method === 'POST') {
      if (this.matchingUnavailable) return json({ error: 'Simulated matching outage' }, 503);
      const completion = completionRequest.parse(await request.json() as unknown);
      const user = completion.messages.find((message) => message.role === 'user');
      if (user === undefined) return json({ error: 'Missing matching input' }, 400);
      const data = aiInput.parse(JSON.parse(user.content) as unknown);
      const current = data.currentDocument.filter((unit) => unit.markdown === quote(data.item.description));
      const context = [data.item.originalDescription ?? '', data.item.diff, ...data.item.comments, ...data.item.reviews].map(quote);
      const candidates = current.length > 0 ? current : data.currentDocument.filter((unit) => context.includes(unit.markdown) || data.item.diff.replace(/\r\n/gu, '\n').includes(unit.markdown));
      const target = candidates.length === 1 ? candidates[0] : undefined;
      const decision: Mapping = { targetId: target?.id ?? null, evidence: target?.markdown ?? '', confidence: target === undefined ? 0 : 1, reason: 'Deterministic fixture: unique exact quotation only; not a real AI model.' };
      return json({ choices: [{ message: { content: JSON.stringify(decision) } }] });
    }
    if (url.origin !== 'https://api.github.com') return json({ error: 'Unexpected fixture host; no network fallback' }, 404);
    if (url.pathname === '/graphql' && request.method === 'POST') {
      const payload = z.object({ query: z.string(), variables: z.record(z.string(), z.unknown()) }).parse(await request.json() as unknown);
      if (!payload.query.includes('issueOrPullRequest')) return this.graphql(payload.query, payload.variables);
      const { variables } = variablesSchema.parse(payload);
      const item = this.item(variables.number);
      const offset = Number(variables.cursor ?? '0');
      const nodes = item.edits.slice(offset, offset + 100);
      const next = offset + nodes.length;
      return json({ data: { repository: { issueOrPullRequest: { includesCreatedEdit: item.includesCreatedEdit, lastEditedAt: item.lastEditedAt,
        userContentEdits: { nodes, pageInfo: { hasNextPage: next < item.edits.length, endCursor: String(next) } },
      } } } });
    }
    const prefix = `/repos/${fixtureRepository}`;
    if (!url.pathname.startsWith(`${prefix}/`)) return json({ error: 'Unknown fixture repository' }, 404);
    const path = url.pathname.slice(prefix.length);
    if (path === '/issues' && request.method === 'GET') return json(page(this.items.map((item) => ({ number: item.number, title: item.title, body: item.body, html_url: item.url, state: item.open ? 'open' : 'closed', labels: item.labels.map((name) => ({ name })), ...(item.kind === 'pr' ? { pull_request: {} } : {}) })), url));
    const comments = /^\/issues\/(\d+)\/comments$/u.exec(path);
    if (comments !== null) {
      const item = this.item(Number(comments[1]));
      if (request.method === 'GET') return json(page(item.comments.map((comment) => ({ ...comment, user: { login: comment.login } })), url));
      if (request.method === 'POST') {
        const { body } = bodySchema.parse(await request.json() as unknown);
        const comment = { id: this.nextCommentId++, login: 'github-actions[bot]', body };
        item.comments.push(comment); this.writes.push({ method: 'POST', path, body });
        return json(comment, 201);
      }
    }
    const existing = /^\/issues\/comments\/(\d+)$/u.exec(path);
    if (existing !== null) {
      const id = Number(existing[1]);
      const target = this.items.flatMap((item) => item.comments.map((comment) => ({ item, comment }))).find(({ comment }) => comment.id === id);
      if (target === undefined) return json({ error: 'Unknown comment' }, 404);
      if (request.method === 'PATCH') {
        const { body } = bodySchema.parse(await request.json() as unknown);
        target.comment.body = body; this.writes.push({ method: 'PATCH', path, body }); return json(target.comment);
      }
      if (request.method === 'DELETE') {
        target.item.comments = target.item.comments.filter((entry) => entry.id !== id);
        this.writes.push({ method: 'DELETE', path, body: '' }); return new Response(null, { status: 204 });
      }
    }
    const pull = /^\/pulls\/(\d+)\/(files|reviews|comments)$/u.exec(path);
    if (pull !== null && request.method === 'GET') {
      const item = this.item(Number(pull[1]));
      return json(page<unknown>(pull[2] === 'files' ? [{ filename: 'content/document.md', patch: item.diff }] : item.discussion.map((body) => ({ body })), url));
    }
    return json({ error: 'Unsupported fake GitHub request' }, 404);
  };

  graphql(query: string, variables: Record<string, unknown>): Response {
    if (query.includes('discussionCategories')) return json({ data: { repository: { id: 'fixture-repository', discussionCategories: { nodes: [{ id: 'fixture-category', name: 'General', slug: 'general' }] } } } });
    if (query.startsWith('mutation')) {
      const input = z.record(z.string(), z.unknown()).parse(variables['input']);
      if (query.includes('addDiscussionComment(')) {
        const item = this.item(Number(z.string().parse(input['discussionId']).slice(2)));
        const body = z.string().parse(input['body']);
        const comment = { id: this.nextCommentId++, body, login: 'github-actions[bot]' };
        item.comments.push(comment); this.writes.push({ method: 'POST', path: `/discussions/${String(item.number)}/comments`, body });
        return json({ data: { addDiscussionComment: { comment: { id: `C_${String(comment.id)}` } } } });
      }
      const deleting = query.includes('deleteDiscussionComment(');
      const id = Number(z.string().parse(input[deleting ? 'id' : 'commentId']).slice(2));
      const item = this.items.find((entry) => entry.comments.some((comment) => comment.id === id));
      if (item === undefined) return json({ errors: [{ message: 'Unknown discussion comment' }] });
      if (deleting) {
        item.comments = item.comments.filter((comment) => comment.id !== id);
        this.writes.push({ method: 'DELETE', path: `/discussion/comments/${String(id)}`, body: '' });
        return json({ data: { deleteDiscussionComment: { clientMutationId: null } } });
      }
      const body = z.string().parse(input['body']);
      for (const comment of item.comments.filter((entry) => entry.id === id)) comment.body = body;
      this.writes.push({ method: 'PATCH', path: `/discussion/comments/${String(id)}`, body });
      return json({ data: { updateDiscussionComment: { comment: { id: `C_${String(id)}` } } } });
    }
    const id = z.string().parse(variables['id']);
    let values: unknown[];
    if (query.includes('... on Repository')) values = this.items.filter((item) => item.kind === 'discussion').map((item) => ({ id: `D_${String(item.number)}`, number: item.number, title: item.title, body: item.body, url: item.url, closed: !item.open, includesCreatedEdit: item.includesCreatedEdit, lastEditedAt: item.lastEditedAt }));
    else if (query.includes('... on DiscussionComment')) values = [];
    else {
      const item = this.item(Number(id.slice(2)));
      if (query.includes('connection:userContentEdits')) values = item.edits;
      else if (query.includes('connection:labels')) values = item.labels.map((name) => ({ name }));
      else values = item.comments.map((comment) => ({ id: `C_${String(comment.id)}`, body: comment.body, author: { __typename: comment.login.endsWith('[bot]') ? 'Bot' : 'User', login: comment.login.replace(/\[bot\]$/u, '') } }));
    }
    const offset = Number(variables['cursor'] ?? '0');
    const nodes = values.slice(offset, offset + 100);
    const next = offset + nodes.length;
    return json({ data: { node: { connection: { nodes, pageInfo: { hasNextPage: next < values.length, endCursor: String(next) } } } } });
  }

  edit(number: number, title: string, body: string): void {
    const item = this.item(number);
    if (!item.includesCreatedEdit) item.edits.push({ diff: item.body, editedAt: fixtureTime, deletedAt: null });
    item.edits.unshift({ diff: body, editedAt: fixtureTime, deletedAt: null });
    item.includesCreatedEdit = true; item.lastEditedAt = fixtureTime;
    item.title = title; item.body = body;
  }
}
