import type { Page } from '@playwright/test';
import { openInNewTab } from './environment.js';

const passages = {
  learning: /échange\(s\) : L’école doit permettre/u,
  support: /échange\(s\) : Un accompagnement régulier/u,
  programs: /échange\(s\) : Les programmes doivent/u,
};
export type Passage = keyof typeof passages;

/** Reader actions and business outcomes; selectors stay outside scenarios. */
export function reader(page: Page) {
  const openPassage = async (passage: Passage): Promise<void> => {
    if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape');
    await page.getByRole('button', { name: passages[passage] }).click();
  };
  return {
    items: async (passage: Passage) => {
      await openPassage(passage);
      const numbers = await page.locator('#items .item-link').evaluateAll((links) => links.map((link) =>
        Number(new URL((link as HTMLAnchorElement).href).pathname.split('/').at(-1))));
      await page.keyboard.press('Escape');
      return numbers;
    },
    openItem: async (passage: Passage, number: number) => {
      await openPassage(passage);
      await page.getByRole('dialog').getByRole('link', { name: new RegExp(`#${String(number)} `, 'u') }).click();
    },
    contribute: async (passage: Passage, kind: 'issue' | 'pr') => {
      await openPassage(passage);
      return openInNewTab(page, page.getByRole('dialog').getByRole('link', {
        name: kind === 'issue' ? 'Ouvrir une discussion' : 'Proposer une modification',
      }));
    },
    passageText: async (passage: Passage) => page.getByRole('button', { name: passages[passage] }).locator('..').locator('.passage').innerText(),
  };
}
