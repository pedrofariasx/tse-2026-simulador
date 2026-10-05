import { chromium } from 'playwright';
import fs from 'node:fs';

const TARGET = 'https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6257/uf/br/cargo/1/vis/nominal/resultados';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'pt-BR', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

const log = [];
page.on('request', r => {
  const u = r.url();
  if (/feed|api|eleicao|resultado/i.test(u) && !/\.(js|css|png|jpg|svg|woff2?|ico|map)$/i.test(u)) {
    log.push({ method: r.method(), url: u, post: r.postData() || null });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/feed|api/i.test(u)) {
    let len = 0, ct = '';
    try { len = (await r.body()).length; ct = r.headers()['content-type'] || ''; } catch {}
    log.push({ type: 'resp', status: r.status(), url: u, bytes: len, ct });
  }
});

console.log('navigating...');
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(8000);

fs.writeFileSync(new URL('../data/raw/network-capture.json', import.meta.url), JSON.stringify(log, null, 2));

// dump some visible text to understand structure
const txt = await page.evaluate(() => document.body.innerText);
fs.writeFileSync(new URL('../data/raw/page-text.txt', import.meta.url), txt);
fs.writeFileSync(new URL('../data/raw/page.html', import.meta.url), await page.content());

console.log('captured', log.length, 'entries');
for (const l of log.slice(0, 40)) console.log(JSON.stringify(l).slice(0, 300));

await browser.close();
