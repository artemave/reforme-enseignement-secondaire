import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
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
    openIssue: async (number: number) => { await page.goto(`/__dev/github/development/document-annotations/issues/${String(number)}`); },
    returnToDocument: async () => {
      await page.getByRole('link', { name: 'Lire le document', exact: true }).click();
      await page.locator('#units .unit').first().waitFor();
    },
    create: async (kind: 'issue' | 'pr', title: string) => {
      await page.getByLabel('Titre', { exact: true }).fill(title);
      await submit(kind === 'issue' ? 'Créer la discussion' : 'Créer la proposition');
    },
    closeIssue: async () => { await submit('Fermer'); },
    reopenIssue: async () => { await submit('Rouvrir'); },
    merge: async () => { await submit('Fusionner la proposition'); },
    editDescription: async (body: string) => {
      await page.getByLabel('Description', { exact: true }).fill(body);
      await submit('Enregistrer la description');
    },
    comment: async (body: string) => {
      await page.getByLabel('Commentaire', { exact: true }).fill(body);
      await submit('Ajouter le commentaire');
    },
    updateDiff: async (body: string) => {
      await page.getByLabel('Diff de la proposition').fill(body);
      await submit('Enregistrer le diff');
    },
    document: async () => page.getByLabel('Document Markdown').inputValue(),
    publishDocument: async (markdown: string) => {
      await page.getByLabel('Document Markdown').fill(markdown);
      await submit('Publier ce document fictif');
    },
    followPeer: async (number: number) => {
      await page.locator('[data-bot-comment]').getByRole('link', { name: new RegExp(`^(?:Issue|PR) #${String(number)}$`, 'u') }).click();
    },
    item: async () => ({
      number: Number(new URL(page.url()).pathname.split('/').at(-1)),
      peers: await page.locator('[data-bot-comment]').getByRole('link', { name: /^(?:Issue|PR) #/u }).evaluateAll((links) =>
        links.map((link) => Number(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1)))),
    }),
  };
}
