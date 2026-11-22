import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const site = 'https://grappa159.github.io/perm-izakaya/';
await mkdir('results', { recursive: true });
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => {
        if (response.url().startsWith(site) && response.status() >= 400) errors.push(response.url());
      });
      await page.goto(site);
      await page.locator('.item').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (engine === chromium && [390, 1440].includes(width)) {
        await page.screenshot({ path: 'results/hero-' + width + '.png' });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows at ' + width);
      if (width < 761) {
        await page.locator('.menu-btn').click();
        assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'false');
      }
      const menu = await (await page.request.get(site + 'menu.json')).json();
      assert.equal(await page.locator('.item').count(), menu.items.length);
      for (const category of menu.categories) {
        await page.locator('[data-category]').filter({ hasText: category }).click();
        assert.equal(await page.locator('.item').count(), menu.items.filter(item => item.section === category).length);
      }
      await page.getByRole('button', { name: 'Все', exact: true }).click();
      await page.locator('#menu-search').fill('рамен');
      assert(await page.locator('.item').count() > 0);
      await page.locator('#menu-search').fill('zzzx');
      assert.equal(await page.locator('.item').count(), 0);
      for (const tile of await page.locator('.gallery-item').all()) {
        await tile.click();
        assert(await page.locator('#photo-dialog').isVisible());
        await page.locator('#photo-dialog-image').evaluate(image => image.decode());
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#photo-dialog').isVisible(), false);
      }
      await page.goto(site + 'admin/');
      await page.locator('#items .item').first().waitFor();
      const downloaded = page.waitForEvent('download');
      await page.locator('#download').click();
      assert.equal((await downloaded).suggestedFilename(), 'menu.json');
      assert.deepEqual(errors, []);
      console.log(engine.name(), width, 'PASS');
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
