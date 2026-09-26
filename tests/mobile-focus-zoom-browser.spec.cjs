const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

const TEXT_CONTROLS = [
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="color"])',
  'select',
  'textarea'
].join(',');

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

test('les champs mobiles gardent 16 px sans bloquer le zoom utilisateur', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StoreRunnerNavigation && window.state);

  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).toContain('initial-scale=1');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/i);

  await page.evaluate(() => {
    if (typeof window.goTab === 'function') window.goTab('planPanel');
    else if (typeof goTab === 'function') goTab('planPanel');
  });

  const shortcut = page.locator('#planningSettingsShortcut');
  await expect(shortcut).toBeVisible();
  await shortcut.tap();

  const target = page.locator('#target');
  await expect(target).toBeVisible();

  const visibleControls = await page.locator(TEXT_CONTROLS).evaluateAll((controls) => controls
    .filter((el) => el.getClientRects().length > 0 && !el.disabled)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      type: el.getAttribute('type') || '',
      fontSize: parseFloat(getComputedStyle(el).fontSize)
    }))
  );

  expect(visibleControls.length).toBeGreaterThan(0);
  const tooSmall = visibleControls.filter((control) => control.fontSize < 16);
  expect(tooSmall, 'Un champ < 16 px déclenche l’auto-zoom Safari/iOS au focus').toEqual([]);

  await target.focus();
  await expect(target).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await target.blur();
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
