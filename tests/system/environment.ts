import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';
import { indexSchema } from '../../src/model.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import config from '../../vite.config.js';

export const test = base.extend<{ networkIsolation: Promise<void>; repositoryState: undefined }, { repositoryServer: string }>({
  repositoryServer: [async ({ browserName }, use, worker) => {
    const cacheDir = await mkdtemp(join(tmpdir(), `document-browser-${browserName}-`));
    const port = 4173 + worker.workerIndex;
    const server = await createServer({
      ...config({ command: 'serve', mode: 'fixtures' }), configFile: false, cacheDir,
      server: { host: '127.0.0.1', port, strictPort: true },
    });
    try {
      await server.listen();
      await use(`http://127.0.0.1:${String(port)}`);
    } finally {
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],
  baseURL: async ({ repositoryServer }, use) => { await use(repositoryServer); },
  networkIsolation: [async ({ context, page }, use) => {
    const external: string[] = [];
    const errors: string[] = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        external.push(url.href); await route.abort();
      } else await route.continue();
    });
    page.on('pageerror', (error) => { errors.push(error.message); });
    await use(Promise.resolve());
    expect(external, 'Workflow requests must stay within the test environment').toEqual([]);
    expect(errors, 'The browser must not report application errors').toEqual([]);
  }, { auto: true }],
  repositoryState: [async ({ request, page, networkIsolation }, use) => {
    await networkIsolation;
    const reset = await request.post('/__dev/action', { data: { type: 'reset' } });
    if (!reset.ok()) throw new Error('Could not reset the test repository');
    await page.goto('/');
    await page.locator('#units .unit').first().waitFor();
    await use(undefined);
  }, { auto: true }],
});
export async function published(page: Page) {
  return indexSchema.parse(await (await page.request.get('/annotations.json')).json() as unknown);
}
export async function openInNewTab(page: Page, link: Locator): Promise<Page> {
  const opened = page.context().waitForEvent('page');
  await link.click({ modifiers: ['Control'] });
  return opened;
}

/** GitHub commands and business state; page mechanics stay outside scenarios. */
export function github(page: Page) {
  const submit = async (name: string): Promise<void> => {
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    await page.waitForLoadState('domcontentloaded');
  };
  return {
    openRepository: async () => { await page.getByRole('link', { name: /^(?:Simuler|Simulateur) GitHub$/u }).click(); },
    openDiscussion: async (number: number) => { await page.goto(`/__dev/github/development/document-annotations/discussions/${String(number)}`); },
    returnToDocument: async () => {
      await page.getByRole('link', { name: 'Lire le document', exact: true }).click();
      await page.locator('#units .unit').first().waitFor();
    },
    closeDiscussion: async () => { await submit('Fermer'); },
    reopenDiscussion: async () => { await submit('Rouvrir'); },
    editDescription: async (body: string) => {
      await page.getByLabel('Description', { exact: true }).fill(body);
      await submit('Enregistrer la description');
    },
    comment: async (body: string) => {
      await page.getByLabel('Commentaire', { exact: true }).fill(body);
      await submit('Ajouter le commentaire');
    },
    document: async () => page.getByLabel('Document Markdown').inputValue(),
    publishDocument: async (markdown: string) => {
      await page.getByLabel('Document Markdown').fill(markdown);
      await submit('Publier ce document fictif');
    },
    followPeer: async (number: number) => {
      await page.locator('[data-bot-comment]').getByRole('link', { name: new RegExp(`^(?:Discussion|Issue|PR) #${String(number)}$`, 'u') }).click();
    },
    comments: async (number: number) => {
      const state = z.object({ items: z.array(z.object({ number: z.number(), comments: z.array(z.object({ body: z.string() })) })) }).parse(await (await page.request.get('/__dev/state')).json() as unknown);
      return state.items.find((item) => item.number === number)?.comments.map((comment) => comment.body) ?? [];
    },
    item: async () => ({
      number: Number(new URL(page.url()).pathname.split('/').at(-1)),
      peers: await page.locator('[data-bot-comment]').getByRole('link', { name: /^(?:Discussion|Issue|PR) #/u }).evaluateAll((links) =>
        links.map((link) => Number(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1)))),
    }),
  };
}
