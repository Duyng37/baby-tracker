// Uses an existing Playwright installation; does not add it to application dependencies.
// node scripts/test-time-input-browser.mjs [path-to-playwright-package]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const { webkit } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QuickRecord } from '/src/ui/QuickRecord.tsx';
import { Sheet } from '/src/ui/Sheet.tsx';
import '/src/styles.css';
Date.now = () => Date.parse('2026-09-06T11:37:00Z');
function Fixture() {
  const [milk, setMilk] = React.useState('formula');
  return React.createElement(Sheet, { title: 'Ghi sữa bình', onClose: () => {} },
    React.createElement('p', { className: 'sheet-scope' }, 'Bé thử nghiệm'),
    React.createElement(QuickRecord, { type: 'bottle', timezone: 'Asia/Ho_Chi_Minh',
      saving: false, milk, onMilkChange: setMilk, onSave: () => { window.testSaves++; } }));
}
window.testSaves = 0;
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`;

// No .env, auth/API plugins, real accounts, service worker, or application database.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, envDir: false,
  cacheDir: '.vitest/time-browser-cache',
  plugins: [react(), { name: 'time-input-test-fixture', configureServer(vite) {
    vite.middlewares.use('/time-input-test.html', async (request, response, next) => {
      try {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(await vite.transformIndexHtml('/time-input-test.html', html));
      } catch (error) { next(error); }
    });
  } }], optimizeDeps: { include: ['react', 'react-dom/client'] },
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await webkit.launch({ headless: true });
  const cases = [
    { name: 'WebKit touch 390x844', viewport: { width: 390, height: 844 }, mobile: true },
    { name: 'WebKit touch 375x667', viewport: { width: 375, height: 667 }, mobile: true },
    { name: 'WebKit touch 430x932', viewport: { width: 430, height: 932 }, mobile: true },
    { name: 'WebKit desktop', viewport: { width: 1280, height: 900 }, mobile: false },
  ];
  for (const scenario of cases) {
    const context = await browser.newContext({ viewport: scenario.viewport,
      isMobile: scenario.mobile, hasTouch: scenario.mobile, deviceScaleFactor: scenario.mobile ? 3 : 1 });
    try {
      let externalRequests = 0;
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        externalRequests++; return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error('Fixture error:', error.message); });
      await page.goto(`${origin}/time-input-test.html`);
      const button = name => page.getByRole('button', { name, exact: true });
      const activate = locator => scenario.mobile ? locator.tap() : locator.click();
      const field = page.getByRole('textbox', { name: 'Giờ', exact: true });
      const popup = page.locator('.time-input-popover');
      const opener = button('Mở bộ chọn giờ: Giờ');
      await field.waitFor();
      assert.equal(await field.inputValue(), '18:37');

      // Actual touch input, not dispatchEvent/onClick calls: reproduces the iPhone video.
      await activate(opener);
      await activate(button('31 phút'));
      assert.equal(await page.locator('.time-input-heading output').innerText(), '18:31');
      assert.equal(await field.inputValue(), '18:37');
      await activate(button('Xong'));
      await popup.waitFor({ state: 'detached' });
      assert.equal(await field.inputValue(), '18:31', `${scenario.name}: Xong lost the selected minute`);

      await activate(opener);
      assert.equal(await button('31 phút').getAttribute('aria-pressed'), 'true');
      await activate(button('22 giờ'));
      await activate(button('Hủy'));
      assert.equal(await field.inputValue(), '18:31');
      assert.equal(await popup.count(), 0);

      // Tapping the trigger must close, not blur-close and immediately reopen.
      await activate(opener);
      await activate(button('32 phút'));
      await activate(opener);
      assert.equal(await popup.count(), 0);
      assert.equal(await field.inputValue(), '18:31');

      await activate(opener);
      await activate(button('33 phút'));
      await activate(page.getByRole('heading', { name: 'Ghi sữa bình', exact: true }));
      assert.equal(await popup.count(), 0);
      assert.equal(await field.inputValue(), '18:31');

      // Normal keyboard focus order and activation still work in both contexts.
      await field.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '18 giờ');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Tab');
      assert.equal(await button('Hủy').evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await button('Xong').evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await field.inputValue(), '18:30');
      assert.equal(await popup.count(), 0);
      await activate(opener);
      await page.keyboard.press('Escape');
      assert.equal(await popup.count(), 0);
      assert.equal(await page.locator('dialog[open]').count(), 1);
      assert.equal(await page.evaluate(() => window.testSaves), 0);
      assert.equal(externalRequests, 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${scenario.name}: confirm, cancel, trigger, outside, keyboard, Escape`);
    } finally { await context.close(); }
  }
  console.log(`PASS all ${cases.length} WebKit scenarios; no application records saved or external requests.`);
} finally { await browser?.close(); await server.close(); }