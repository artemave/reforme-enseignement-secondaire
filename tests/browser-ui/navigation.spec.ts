import { expect } from '@playwright/test';
import { test } from '../system/environment.js';

test('Repeated return navigation preserves the reading position after upgrading from manual restoration', async ({ page }) => {
  for (const action of ['return link', 'browser Back']) {
    await test.step(action, async () => {
      await page.evaluate(() => { history.scrollRestoration = 'manual'; });
      await page.reload({ waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => history.scrollRestoration)).toBe('auto');
      const paragraph = page.getByRole('link', { name: /échange\(s\) : Les familles participent/u });
      await paragraph.scrollIntoViewIfNeeded();
      await page.evaluate(() => { window.scrollTo({ top: 400, behavior: 'instant' }); });
      await page.evaluate(() => {
        window.addEventListener('pagehide', () => {
          sessionStorage.setItem('reader-position', String(window.scrollY));
        });
      });
      await paragraph.click();
      await expect(page.getByRole('heading', { name: 'Discussion du paragraphe' })).toBeVisible();
      const position = await page.evaluate(() => Number(sessionStorage.getItem('reader-position')));
      expect(position).toBeGreaterThan(0);

      if (action === 'return link') await page.getByRole('link', { name: 'Revenir au document' }).click();
      else await page.goBack({ waitUntil: 'domcontentloaded' });

      await expect(paragraph).toBeVisible();
      await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - position)).toBeLessThanOrEqual(2);
    });
  }
});
