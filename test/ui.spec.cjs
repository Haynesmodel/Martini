const { test, expect } = require('@playwright/test'); const AxeBuilder = require('@axe-core/playwright').default;
test('production history shell normalizes stale routes and stays unpromoted', async ({ page }) => {
  for (const route of ['?tab=pulse', '?tab=current', '?tab=shotguns', '?tab=history']) {
    await page.goto(route); await expect(page.getByRole('heading', { name: 'Martini Family Fantasy Football League' })).toBeVisible();
    await expect(page.getByTestId('history-blocked')).toBeVisible(); await expect(page.locator('table')).toHaveCount(0);
  }
});
test('Pages-base assets are served by the production artifact', async ({ page, request }) => {
  await page.goto('?tab=history');
  for (const asset of ['assets/asset-manifest.json', 'assets/hero/martini-480.avif', 'assets/hero/martini-1280.webp', 'assets/share/martini-default-card.png']) {
    const response = await request.get(asset); expect(response.ok(), asset).toBeTruthy();
  }
  await expect(page.locator('picture source[type="image/avif"]')).toHaveAttribute('srcset', /martini-480\.avif/);
});
test('corrupt required asset shows controlled error without tables', async ({ page, request }) => {
  const manifestResponse = await request.get('assets/asset-manifest.json'); const manifest = await manifestResponse.json(); manifest.assets.H2H.sha256 = '0'.repeat(64);
  await page.route('**/assets/asset-manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) }));
  await page.goto('?tab=history'); await expect(page.getByTestId('history-error')).toBeVisible(); await expect(page.locator('table')).toHaveCount(0);
});
for (const width of [320, 390]) test(`mobile ${width}px has no overflow or axe violations`, async ({ page }) => { await page.setViewportSize({ width, height: 800 }); await page.goto('./'); await expect(page.locator('body')).toBeVisible(); assertNoOverflow(await page); const results = await new AxeBuilder({ page }).analyze(); expect(results.violations).toEqual([]); });
async function assertNoOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }
