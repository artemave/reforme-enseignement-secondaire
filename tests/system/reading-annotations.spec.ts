import { expect } from '@playwright/test';
import { test, github } from './environment.js';
import { reader } from './document-reader.js';

test('GitHub cross-references connect items on the same document passage', async ({ page }) => {
  await test.step('Given two discussions on the same passage', async () => {
    expect(await reader(page).items('learning')).toEqual([3, 4]);
  });
  await test.step('When a reader follows the discussion and its other-discussion cross-reference', async () => {
    await reader(page).openItem('learning', 3);
    await github(page).followPeer(4);
  });
  await test.step('Then GitHub shows the other discussion with a cross-reference back to the discussion', async () => {
    expect(await github(page).item()).toEqual({ number: 4, peers: [3] });
  });
});
