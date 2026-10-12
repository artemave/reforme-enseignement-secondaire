import { expect } from '@playwright/test';
import { test } from '../system/environment.js';

test.use({ javaScriptEnabled: false });

test('Published document and paragraph pages are readable before JavaScript runs', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Réforme');
  await expect(page.getByText('Chargement du document…')).toHaveCount(0);

  await page.getByRole('link', { name: /échange\(s\) : L’école doit permettre/u }).click();

  await expect(page.getByRole('heading', { name: 'Discussion du paragraphe' })).toBeVisible();
  await expect(page.locator('blockquote')).toContainText('L’école doit permettre');
  await expect(page.locator('.site-header')).toBeHidden();
});
