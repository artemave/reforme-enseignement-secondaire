import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { actionSchema } from './workspace.js';
import type { FixtureWorkspace } from './workspace.js';
import { fixtureRepository } from './scenario.js';
import { createPage, dashboard, errorPage, itemPage, itemPath, threadPage } from './pages.js';

export interface Reply { status: number; body: string; headers: Record<string, string> }
function html(body: string): Reply { return { status: 200, body, headers: { 'Content-Type': 'text/html; charset=utf-8' } }; }
export async function route(workspace: FixtureWorkspace, method: string, url: URL, body: unknown, onPublished?: () => void): Promise<Reply | null> {
  if (method === 'GET') {
    if (url.pathname === '/__dev/giscus/client.js') return { status: 200, body: `(()=>{const script=document.currentScript;const frame=document.createElement('iframe');frame.title='Discussion GitHub';frame.style.cssText='width:100%;height:450px;border:0';const params=new URLSearchParams();if(script.dataset.mapping==='number'){params.set('number',script.dataset.term);}else{const [revision,target]=script.dataset.term.split(':')[0].split('/');params.set('revision',revision);params.set('target',target);}frame.src='/__dev/giscus/thread?'+params;script.parentElement.append(frame);})();`, headers: { 'Content-Type': 'text/javascript' } };
    if (url.pathname === '/__dev/giscus/thread') return html(threadPage(workspace, url.searchParams));
    if (url.pathname === '/annotations.json') return { status: 200, body: JSON.stringify(workspace.index), headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } };
    if (url.pathname === '/__dev/state') return { status: 200, body: JSON.stringify({ items: workspace.backend.items, writes: workspace.backend.writes, index: workspace.index }), headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } };
    if (url.pathname === '/__dev/') return html(dashboard(workspace));
    const prefix = `/__dev/github/${fixtureRepository}`;
    if (url.pathname === `${prefix}/discussions/new`) return html(createPage('discussion', url.searchParams));
    if (url.pathname === `${prefix}/compare/main`) return html(createPage('pr', url.searchParams));
    const number = (new RegExp(`^${prefix}/(?:discussions|pull)/(\\d+)$`, 'u').exec(url.pathname))?.[1];
    if (number !== undefined) return html(itemPage(workspace.backend.item(Number(number))));
    if (url.pathname.startsWith(prefix)) return html(dashboard(workspace));
  }
  if (method === 'POST' && url.pathname === '/__dev/action') {
    const action = actionSchema.parse(body);
    await workspace.dispatch(action);
    onPublished?.();
    const number = action.type === 'create' ? workspace.backend.items.at(-1)?.number : 'number' in action ? action.number : undefined;
    return { status: 303, body: '', headers: { Location: number === undefined ? '/__dev/' : itemPath(workspace.backend.item(number)) } };
  }
  return null;
}

export function middleware(workspace: FixtureWorkspace, onPublished?: () => void) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const run = async (): Promise<void> => {
      try {
        const url = new URL(z.string().parse(request.url), 'http://localhost');
        const method = z.string().parse(request.method);
        let body: unknown = {};
        if (method === 'POST' && url.pathname === '/__dev/action') {
          const chunks: Uint8Array[] = [];
          for await (const raw of request) chunks.push(z.instanceof(Uint8Array).parse(raw as unknown));
          const text = Buffer.concat(chunks).toString('utf8');
          body = request.headers['content-type'] === 'application/json' ? JSON.parse(text) as unknown : Object.fromEntries(new URLSearchParams(text));
        }
        const reply = await route(workspace, method, url, body, onPublished);
        if (reply === null) { next(); return; }
        response.writeHead(reply.status, reply.headers); response.end(reply.body);
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(errorPage(error instanceof Error ? error.message : 'Unknown fixture error'));
      }
    };
    void run();
  };
}
