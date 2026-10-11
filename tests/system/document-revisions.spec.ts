import { expect } from '@playwright/test';
import { test, github, published } from './environment.js';
import { reader } from './document-reader.js';

test('Inserting document text preserves annotations on existing passages', async ({ page }) => {
  await test.step('Given two annotations on an existing passage', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When the maintainer publishes an introduction before that passage', async () => {
    await github(page).openRepository();
    const original = await github(page).document();
    await github(page).publishDocument(original.replace('\n\n', '\n\nUne introduction ajoutée.\n\n'));
    await github(page).returnToDocument();
  });
  await test.step('Then the passage keeps its existing discussions and proposals', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
});

test('Removing a document passage removes its annotations', async ({ page }) => {
  await test.step('Given annotations on a passage that will be removed', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When the maintainer replaces the passage and publishes the document', async () => {
    const passage = await reader(page).passageText('learning');
    await github(page).openRepository();
    const original = await github(page).document();
    await github(page).publishDocument(original.replace(passage, 'Un nouveau passage remplace les anciens objectifs.'));
    await github(page).returnToDocument();
  });
  await test.step('Then publication retains only annotations for the remaining passages', async () => {
    expect((await published(page)).annotations.map((item) => item.number)).toEqual([1, 2, 5]);
  });
});
