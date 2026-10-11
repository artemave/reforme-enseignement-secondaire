import { expect } from '@playwright/test';
import { test, github } from './environment.js';
import { reader } from './document-reader.js';

test('Opening a proposal adds it alongside existing discussions', async ({ page }) => {
  await test.step('Given a passage with a discussion and a proposal', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When an author opens another GitHub proposal from the passage', async () => {
    const proposal = await reader(page).contribute('learning', 'pr');
    await github(proposal).create('pr', 'Illustrer les objectifs des apprentissages');
    await proposal.close();
  });
  await test.step('Then the open document includes all three items', async () => {
    await expect.poll(() => reader(page).items('learning')).toEqual([3, 4, 9]);
  });
});

test('Merging a proposal preserves the independent discussion', async ({ page }) => {
  await test.step('Given a proposal and a discussion on the same passage', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When the maintainer merges the proposal on GitHub', async () => {
    await reader(page).openItem('learning', 4);
    await github(page).merge();
    await github(page).returnToDocument();
  });
  await test.step('Then the document still links to the open discussion', async () => {
    expect(await reader(page).items('learning')).toEqual([3]);
  });
});

test('Updating a proposal diff moves its annotation to the affected passage', async ({ page }) => {
  await test.step('Given a proposal on the learning passage', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When its author changes the diff to the support passage', async () => {
    const passage = await reader(page).passageText('support');
    await reader(page).openItem('learning', 4);
    await github(page).updateDiff(passage);
    await github(page).returnToDocument();
  });
  await test.step('Then the proposal moves and the discussion stays on its original passage', async () => {
    expect({ learning: await reader(page).items('learning'), support: await reader(page).items('support') })
      .toEqual({ learning: [3], support: [4, 5] });
  });
});
