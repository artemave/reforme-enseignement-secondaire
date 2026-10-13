// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { middleware } from '../dev/server.js';
import { FixtureWorkspace } from '../dev/workspace.js';
import type { Action } from '../dev/workspace.js';
import { contributionUrl } from '../src/document.js';
import { Discussions } from '../src/discussions.js';
import { BOT_MARKER } from '../src/matcher.js';
import { indexSchema, unitSchema } from '../src/model.js';

it('opening and closing a passage-linked discussion publishes and removes its annotation', async () => {
  const workspace = new FixtureWorkspace(await readFile('dev/fixtures/document.md', 'utf8'));
  await workspace.dispatch({ type: 'rebuild' });
  const onPublished = vi.fn();
  const handle = middleware(workspace, onPublished);
  const server = createServer((request, response) => {
    handle(request, response, () => { response.writeHead(404); response.end(); });
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected HTTP server address');
  const base = `http://127.0.0.1:${String(address.port)}`;
  const published = async () => indexSchema.parse(await (await fetch(`${base}/annotations.json`)).json() as unknown);
  const action = async (body: Action) => {
    const response = await fetch(`${base}/__dev/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'manual',
    });
    expect(response.status).toBe(303);
    return response;
  };
  const github = new Discussions(workspace.index.repository, 'test-token', workspace.backend.fetch);
  try {
    const before = await published();
    const passage = unitSchema.parse(before.units.find((unit) =>
      unit.kind === 'paragraph' && !before.annotations.some((item) => item.targetId === unit.id)));
    const form = new URL(contributionUrl(before, passage));
    const title = z.string().parse(form.searchParams.get('title'));
    const body = z.string().parse(form.searchParams.get('body'));
    const created = await action({ type: 'create', kind: 'discussion', title, body });
    const number = z.coerce.number().int().positive().parse(z.string().parse(created.headers.get('location')).split('/').at(-1));

    const opened = await published();
    expect(opened.annotations).toEqual([...before.annotations, {
      number, kind: 'discussion', title, targetId: passage.id, comments: 0,
      url: `https://github.com/${before.repository}/discussions/${String(number)}`,
    }]);
    const issue = (await github.state()).find((item) => item.number === number);
    expect(issue?.open).toBe(true);
    expect(issue?.body).toContain(passage.markdown);
    const comments = issue?.comments.filter((comment) => comment.body.startsWith(BOT_MARKER));
    expect(comments).toHaveLength(0);

    await action({ type: 'state', number, state: 'closed' });
    expect((await published()).annotations).toEqual(before.annotations);
    const closed = (await github.state()).find((item) => item.number === number);
    expect(closed?.open).toBe(false);
    const reconciled = closed?.comments.filter((comment) => comment.body.startsWith(BOT_MARKER));
    expect(reconciled).toHaveLength(0);
    expect(onPublished).toHaveBeenCalledTimes(2);
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error !== undefined) reject(error); else resolve(); }); });
  }
});
