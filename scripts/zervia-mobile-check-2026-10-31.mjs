// Zervia mobile-width check — production zervia.app, Oct 31 2026.
// Pages: / /discover /providers /services at 390x844 and 360x740.
// Checks: horizontal overflow, console errors, key content assertions.
import { chromium } from 'playwright';

const BASE = 'https://zervia.app';
const VIEWPORTS = [
  { w: 390, h: 844, name: '390x844' },
  { w: 360, h: 740, name: '360x740' },
];
const PAGES = ['/', '/discover', '/providers', '/services'];

let proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (proxyServer && !/^[a-z]+:\/\//i.test(proxyServer)) proxyServer = 'http://' + proxyServer;

const results = [];
const browser = await chromium.launch(proxyServer ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1' } } : {});
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)); });
  for (const p of PAGES) {
    const slug = p === '/' ? 'home' : p.slice(1);
    try {
      await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => {
        const de = document.documentElement;
        const body = document.body.innerText || '';
        return {
          over: de.scrollWidth - de.clientWidth,
          hasAdLabel: /Advertisement/i.test(body),
          hasBookNow: /book now/i.test(body),
          hasNoVerify: /does not verify/i.test(body),
          hasBanned: /verified provider|trusted provider|background-checked|we vet/i.test(body),
        };
      });
      await page.screenshot({ path: `evidence/mobile-2026-10-31/${vp.name}-${slug}.png` });
      results.push({ viewport: vp.name, page: p, status: 'OK', ...info, errors: [...errors] });
      errors.length = 0;
    } catch (e) {
      results.push({ viewport: vp.name, page: p, status: 'FAIL', error: String(e).slice(0, 180) });
    }
  }
  await ctx.close();
}
await browser.close();
for (const r of results) {
  const flags = [];
  if (r.status !== 'OK') flags.push('LOAD-FAIL');
  if (r.over > 2) flags.push(`OVERFLOW+${r.over}px`);
  if (r.hasBookNow) flags.push('BOOK-NOW-FOUND');
  if (r.hasBanned) flags.push('BANNED-LANG');
  if (r.errors && r.errors.length) flags.push(`${r.errors.length} JS errors`);
  console.log(`${r.viewport} ${r.page}: ${flags.length ? 'ISSUES: ' + flags.join(', ') : 'CLEAN'} | ad=${!!r.hasAdLabel} noverify=${!!r.hasNoVerify}`);
}
const bad = results.filter(r => r.status !== 'OK' || (r.over || 0) > 2);
console.log(bad.length === 0 ? 'ZERVIA-MOBILE: NO OVERFLOW / NO LOAD FAILURES' : `ZERVIA-MOBILE: ${bad.length} PAGES NEED ATTENTION`);
