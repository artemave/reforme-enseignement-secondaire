import { expect } from '@playwright/test';
import { test, github } from './environment.js';
import { reader } from './document-reader.js';

test('Opening a passage-linked discussion publishes it to the document', async ({ page }) => {
  await test.step('Given a passage with no discussions', async () => {
    expect(await reader(page).items('programs')).toEqual([]);
  });
  await test.step('When a reader leaves the first comment on that passage', async () => {
    await reader(page).comment('programs', 'Relier les matières dans un projet');
  });
  await test.step('Then the open document includes the new discussion', async () => {
    await expect.poll(() => reader(page).items('programs')).toEqual([9]);
  });
});

test('Closing a discussion removes it from the document', async ({ page }) => {
  await test.step('Given a passage with two discussions', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When the maintainer closes the discussion on GitHub', async () => {
    await reader(page).openItem('learning', 3);
    await github(page).closeDiscussion();
    await github(page).returnToDocument();
  });
  await test.step('Then only the other discussion remains on that passage', async () => {
    expect(await reader(page).items('learning')).toEqual([4]);
  });
});

test('Reopening a discussion restores its annotation', async ({ page }) => {
  await test.step('Given a closed discussion on a passage with another open discussion', async () => {
    await github(page).openDiscussion(3);
    await github(page).closeDiscussion();
    await github(page).returnToDocument();
    expect(await reader(page).items('learning')).toEqual([4]);
  });
  await test.step('When the maintainer reopens the discussion on GitHub', async () => {
    await github(page).openDiscussion(3);
    await github(page).reopenDiscussion();
    await github(page).returnToDocument();
  });
  await test.step('Then both items are linked to the passage again', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
});

test('Editing a discussion moves its annotation to the selected passage', async ({ page }) => {
  await test.step('Given a discussion on the learning passage', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When its author changes the description to quote the support passage', async () => {
    const passage = await reader(page).passageText('support');
    await reader(page).openItem('learning', 3);
    await github(page).editDescription(`## Passage\n\n${passage}\n\n## Contexte\n\nAccompagner chaque élève`);
    await github(page).returnToDocument();
  });
  await test.step('Then the discussion moves while the other discussion stays on its original passage', async () => {
    expect({ learning: await reader(page).items('learning'), support: await reader(page).items('support') })
      .toEqual({ learning: [4], support: [3, 5] });
  });
});

test('Adding passage context to a discussion makes it discoverable from the document', async ({ page }) => {
  await test.step('Given a passage with two related items', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When a reader quotes that passage in an unrelated discussion', async () => {
    const passage = await reader(page).passageText('learning');
    await github(page).openDiscussion(6);
    await github(page).comment(passage);
    await github(page).returnToDocument();
  });
  await test.step('Then the discussion joins the existing annotations', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4, 6]);
  });
});
