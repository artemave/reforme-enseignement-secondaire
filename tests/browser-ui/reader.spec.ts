import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { test } from '../system/environment.js';

test('The reader fits the screen and its navigation, annotations and contribution controls work', async ({ page }, info) => {
  const activate = async (control: Locator): Promise<void> => {
    if (info.project.use.hasTouch === true) await control.tap();
    else await control.click();
  };
  const discussions = page.locator('#annotations');
  const learning = page.getByRole('link', { name: /échange\(s\) : L’école doit permettre/u });

  await test.step('The document and section navigation fit the viewport', async () => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.document-meta')).toBeVisible();
    await expect(page.locator('.document-footer').getByRole('link', { name: 'Voir sur GitHub' })).toHaveAttribute('href', /\/__dev\/github\/development\/document-annotations$/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contents = page.getByRole('navigation', { name: 'Sommaire' });
    await expect(contents).not.toBeVisible();
    await activate(page.locator('.contents summary'));
    await expect(contents).toBeVisible();
    await activate(contents.getByRole('link').first());
    await expect(page).toHaveURL(/#u-\d+$/u);
    await activate(page.locator('.contents summary'));
    await expect(contents).not.toBeVisible();
  });

  await test.step('Dark mode follows the system preference and keeps the bubble hover continuous', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    const lightBackground = await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
    if (info.project.use.hasTouch !== true) {
      await learning.hover();
      const outline = learning.locator('.annotation-shape path');
      await expect(outline).toHaveCount(1);
      expect(await outline.evaluate((path) => getComputedStyle(path).fill)).not.toBe('none');
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  if (info.project.use.hasTouch === true) {
    await test.step('The reader fits a narrow mobile screen', async () => {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
    });
  }

  await test.step('The count bubble navigates directly to the passage discussion page', async () => {
    await expect(learning).toHaveText('2');
    expect(await learning.evaluate((link) => {
      const bounds = link.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44;
    })).toBe(true);
    await learning.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/passage\/[^/]+\/u-\d+\/$/u);
    await expect(discussions.getByRole('heading', { name: 'Autres discussions' })).toBeVisible();
    await expect(discussions.locator('#items li')).toHaveCount(1);
    await expect(discussions.getByRole('link', { name: /Discussion #4/u })).toBeVisible();
    await expect(discussions.getByRole('button', { name: /Lire la discussion/u })).toHaveCount(0);
    await expect(discussions.locator('.proposal-icon')).toHaveCount(0);
    await expect(page.locator('#units .unit')).toHaveCount(1);
    await expect(page.locator('blockquote')).toHaveCount(1);
    await expect(page.locator('#units blockquote')).toContainText('L’école doit permettre');
    await expect(page.locator('.document-meta')).toBeHidden();
    await expect(page.locator('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await activate(page.getByRole('link', { name: 'Revenir au document' }));
    await expect(learning).toBeVisible();
  });

  await test.step('The plus bubble opens its passage page with a local comment form', async () => {
    const programs = page.getByRole('link', { name: /échange\(s\) : Les programmes doivent/u });
    await expect(programs).toHaveText('+');
    await activate(programs);
    await expect(page).toHaveURL(/\/passage\/[^/]+\/u-\d+\/$/u);
    await expect(discussions.locator('.contribute')).toHaveCount(0);
    await expect(page.locator('#thread script')).toHaveAttribute('src', '/__dev/giscus/client.js');
    const thread = page.frameLocator('iframe[title="Discussion GitHub"]');
    await expect(thread.getByLabel('Commentaire', { exact: true })).toBeVisible();
    await expect(thread.getByRole('button', { name: 'Ajouter le commentaire', exact: true })).toBeVisible();
  });
});
