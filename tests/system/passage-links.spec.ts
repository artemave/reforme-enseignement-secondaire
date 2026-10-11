import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, github } from './environment.js';
import { reader } from './document-reader.js';

test('A shared passage page lets a reader comment in the GitHub discussion', async ({ page }) => {
  let shared: Page;
  await test.step('Given a passage with two discussions', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When a reader opens its shared page and comments in the discussion', async () => {
    shared = await reader(page).openSharedPassage('learning');
    const thread = shared.frameLocator('iframe[title="Discussion GitHub"]');
    await thread.getByLabel('Commentaire', { exact: true }).fill('Une remarque depuis la page partagée.');
    await thread.getByRole('button', { name: 'Ajouter le commentaire', exact: true }).click();
  });
  await test.step('Then the comment is stored on GitHub and the passage keeps its related items', async () => {
    await expect.poll(async () => ({ items: await reader(shared).pageItems(), comment: await github(shared).comments(3) }))
      .toEqual({ items: [3, 4], comment: expect.arrayContaining(['Une remarque depuis la page partagée.']) });
    await shared.close();
  });
});

test('An outdated shared passage link returns to the current document with an explanation', async ({ page }) => {
  let sharedUrl: string;
  await test.step('Given a shared passage page with two related items', async () => {
    const shared = await reader(page).openSharedPassage('learning');
    sharedUrl = shared.url();
    expect(await reader(shared).pageItems()).toEqual([3, 4]);
    await shared.close();
  });
  await test.step('When the document changes and a reader visits the old URL', async () => {
    await github(page).openRepository();
    const document = await github(page).document();
    await github(page).publishDocument(`${document}\n\nUne nouvelle conclusion.`);
    await page.goto(sharedUrl);
  });
  await test.step('Then the current document explains that the link refers to an older revision', async () => {
    await expect(page.locator('.flash')).toHaveText('Ce lien renvoie à une ancienne version du document.');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
