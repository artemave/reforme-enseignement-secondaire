import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { test } from '../system/environment.js';

test('The reader fits the screen and its navigation, annotations and contribution controls work', async ({ page }, info) => {
  const activate = async (control: Locator): Promise<void> => {
    if (info.project.use.hasTouch === true) await control.tap();
    else await control.click();
  };
  const panel = page.getByRole('dialog');
  const learning = page.getByRole('button', { name: /échange\(s\) : L’école doit permettre/u });

  await test.step('The document and section navigation fit the viewport', async () => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.use.hasTouch === true) await expect(page.locator('.annotation-help')).toBeVisible();
    else {
      await expect(page.locator('.legend .discussion-icon')).toHaveText('?');
      await expect(page.locator('.legend .proposal-icon')).toHaveText('↗');
    }
    const section = page.getByRole('navigation', { name: 'Sommaire' }).getByRole('link').first();
    await activate(section);
    await expect(page).toHaveURL(/#u-\d+$/u);
  });

  await test.step('Dark mode follows the system preference and keeps the bubble hover continuous', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    const lightBackground = await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    const darkBackground = await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(darkBackground).not.toBe(lightBackground);
    await activate(learning);
    await expect(panel.locator('.discussion-icon')).toBeVisible();
    await expect(panel.locator('.proposal-icon')).toBeVisible();
    await expect(panel.locator('.contribute p')).toHaveCount(0);
    await activate(panel.getByRole('button', { name: 'Fermer', exact: true }));
    if (info.project.use.hasTouch !== true) {
      await learning.hover();
      const outline = learning.locator('.annotation-shape path');
      await expect(outline).toHaveCount(1);
      expect(await outline.evaluate((path) => getComputedStyle(path).fill)).not.toBe('none');
    }
    await page.emulateMedia({ colorScheme: 'light' });
  });

  if (info.project.use.hasTouch === true) {
    await test.step('The narrow mobile header stays readable without overlapping links', async () => {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const separated = await page.locator('.masthead').evaluate((header) => {
        const brand = header.querySelector('.brand')?.getBoundingClientRect();
        const repository = header.querySelector('#repository')?.getBoundingClientRect();
        if (brand === undefined || repository === undefined) return false;
        return brand.bottom <= repository.top || brand.right + 8 <= repository.left;
      });
      expect(separated).toBe(true);
      await expect(page.locator('.annotation-help')).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
    });
  }

  await test.step('An annotated passage opens a usable discussion panel', async () => {
    await expect(learning).toHaveText('2');
    expect(await learning.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44;
    })).toBe(true);
    await activate(learning);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: /Discussion #3/u })).toBeVisible();
    await expect(panel.getByRole('link', { name: /Proposition #4/u })).toBeVisible();
    const inside = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    });
    expect(inside).toBe(true);
    const actionsInside = await panel.locator('#new-issue, #new-pr').evaluateAll((links) => links.map((link) => {
      const action = link.getBoundingClientRect();
      const bounds = link.closest('dialog')?.getBoundingClientRect();
      return bounds !== undefined && action.top >= bounds.top && action.bottom <= bounds.bottom;
    }));
    expect(actionsInside).toEqual([true, true]);
    await activate(panel.getByRole('button', { name: 'Fermer', exact: true }));
    await expect(panel).not.toBeVisible();
    await expect(learning).toBeFocused();
    await activate(learning);
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await expect(learning).toBeFocused();
  });

  await test.step('An unannotated passage offers working question and proposal links', async () => {
    const programs = page.getByRole('button', { name: /échange\(s\) : Les programmes doivent/u });
    await expect(programs).toHaveText('+');
    await activate(programs);
    await expect(panel).toContainText('Aucun échange ouvert');
    const suggestion = panel.getByRole('link', { name: 'Proposer une modification' });
    await activate(suggestion);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouvelle proposition');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(/Les programmes doivent relier/u);
    await page.goBack();
    if (!await panel.isVisible()) await activate(programs);
    await activate(panel.getByRole('link', { name: 'Ouvrir une discussion' }));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouvelle discussion');
    await expect(page.getByLabel('Description', { exact: true })).toHaveValue(/Les programmes doivent relier/u);
  });
});
