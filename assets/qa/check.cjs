'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { collectFailures } = require('./assert-results.cjs');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const results = { browser: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'Playwright bundled Chromium', status: 'not_started', checks: [], requests: [], errors: [], failures: [] };
let browser;
let stage = 'setup';
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' });
    res.end(error ? 'Missing' : bytes);
  });
});

function observe(page, base) {
  page.on('pageerror', error => results.errors.push(`Page error: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') results.errors.push(`Console error: ${message.text()}`);
  });
  page.on('requestfailed', request => results.errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', response => results.requests.push({ url: response.url().replace(base, ''), status: response.status() }));
}

async function run() {
  try {
    const { chromium } = require('playwright');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    stage = 'browser_launch';
    // Explicitly retain Chromium's sandbox. Do not add bypass flags or retry without it.
    const launchOptions = { headless: true, chromiumSandbox: true };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    browser = await chromium.launch(launchOptions);
    stage = 'browser_checks';
    for (const [name, width, height] of [['desktop', 1440, 1150], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      observe(page, base);
      await page.goto(base + '/prototype.html');
      const info = await page.evaluate(() => {
        const button = document.querySelector('button');
        const requiredLabels = ['Event timeline', 'Fixture dependency graph', 'Buggy / fixed comparison', 'Minimization log', 'Inconclusive', 'Runner error'];
        const describedBy = button?.getAttribute('aria-describedby');
        return {
          title: document.title,
          h1: document.querySelectorAll('h1').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          disabledRun: button?.disabled === true,
          prototypeLabel: document.body.innerText.includes('Design prototype · synthetic data'),
          labelsPresent: requiredLabels.every(label => document.body.innerText.includes(label)) &&
            Boolean(describedBy && document.getElementById(describedBy)?.textContent.trim()),
          anchorsValid: [...document.querySelectorAll('a[href^="#"]')].every(anchor =>
            Boolean(document.getElementById(anchor.getAttribute('href').slice(1))))
        };
      });
      await page.keyboard.press('Tab');
      const skipFirstFocus = await page.locator('.skip').evaluate(element => element === document.activeElement);
      await page.locator('summary').first().click();
      const disclosureOpens = await page.locator('details').first().getAttribute('open') !== null;
      results.checks.push({ viewport: name, width, height, ...info, skipFirstFocus, disclosureOpens });
      await page.screenshot({ path: path.join(__dirname, name + '.png'), fullPage: true });
      await page.close();
    }
    const architecture = await browser.newPage({ viewport: { width: 1200, height: 760 } });
    observe(architecture, base);
    await architecture.goto(base + '/architecture.svg');
    await architecture.screenshot({ path: path.join(__dirname, 'architecture.png') });
    await architecture.close();
  } catch (error) {
    results.errors.push(`${stage}: ${error.message}`);
    results.status = stage === 'browser_launch' || stage === 'setup' ? 'blocked' : 'failed';
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) { results.errors.push(`Browser cleanup: ${error.message}`); }
    }
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    results.failures = collectFailures(results);
    if (results.status !== 'blocked') results.status = results.failures.length ? 'failed' : 'passed';
    // Persist failure and launch-block diagnostics as well as successful results.
    const report = JSON.stringify(results, null, 2) + '\n';
    try { fs.writeFileSync(path.join(__dirname, 'results.json'), report); }
    catch (error) { console.error(`Could not write QA results: ${error.message}`); process.exitCode = 1; }
    console.log(report);
    if (results.failures.length || results.status !== 'passed') process.exitCode = 1;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
