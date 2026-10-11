import type { Page } from '@playwright/test';
import { openInNewTab, published } from './environment.js';

const passages = {
  learning: /échange\(s\) : L’école doit permettre/u,
  support: /échange\(s\) : Un accompagnement régulier/u,
  programs: /échange\(s\) : Les programmes doivent/u,
};
export type Passage = keyof typeof passages;

/** Reader actions and business outcomes; selectors stay outside scenarios. */
export function reader(page: Page) {
  const openPassage = async (passage: Passage): Promise<void> => {
    await page.goto('/');
    await page.getByRole('link', { name: passages[passage] }).click();
    await page.locator('.passage-discussions').waitFor();
  };
  return {
    items: async (passage: Passage) => {
      await openPassage(passage);
      const numbers = (await published(page)).annotations.filter((item) => item.targetId === new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)).map((item) => item.number);
      await page.goto('/');
      return numbers;
    },
    openItem: async (passage: Passage, number: number) => {
      await openPassage(passage);
      const other = page.locator('#items').getByRole('link', { name: new RegExp(`^Discussion #${String(number)} :`, 'u') });
      if (await other.count() > 0) await other.click();
      await page.frameLocator('iframe[title="Discussion GitHub"]').getByRole('link', { name: `Discussion #${String(number)} sur GitHub`, exact: true }).click();
    },
    openSharedPassage: async (passage: Passage) => {
      await page.goto('/');
      const shared = await openInNewTab(page, page.getByRole('link', { name: passages[passage] }));
      await shared.locator('.passage-discussions').waitFor();
      return shared;
    },
    pageItems: async () => (await published(page)).annotations.filter((item) => item.targetId === new URL(page.url()).pathname.split('/').filter(Boolean).at(-1)).map((item) => item.number),
    comment: async (passage: Passage, body: string) => {
      await openPassage(passage);
      const thread = page.frameLocator('iframe[title="Discussion GitHub"]');
      await thread.getByLabel('Commentaire', { exact: true }).fill(body);
      await Promise.all([
        page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
        page.waitForResponse((response) => response.url().endsWith('/__dev/action') && response.request().method() === 'POST'),
        thread.getByRole('button', { name: 'Ajouter le commentaire', exact: true }).click(),
      ]);
      await page.waitForLoadState('domcontentloaded');
      await page.locator('#thread script[data-mapping="number"]').waitFor({ state: 'attached' });
    },
    passageText: async (passage: Passage) => page.getByRole('link', { name: passages[passage] }).locator('..').locator('.passage').innerText(),
  };
}
