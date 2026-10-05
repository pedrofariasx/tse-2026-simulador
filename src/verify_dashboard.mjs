import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1600, height: 1200 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(6000);

// --- scoreboard populated? ---
const sb = await page.evaluate(() => ({
  pctFlavio: document.getElementById('pct-flavio')?.textContent,
  pctLula: document.getElementById('pct-lula')?.textContent,
  margin: document.getElementById('metric-margin')?.textContent,
  prob: document.getElementById('metric-prob')?.textContent,
  turnout: document.getElementById('metric-turnout')?.textContent,
}));
console.log('=== SCOREBOARD ==='); console.log(sb);

// --- AI section populated? ---
const ai = await page.evaluate(() => ({
  ts: document.getElementById('ai-timestamp')?.textContent,
  clima: (document.getElementById('ai-clima')?.textContent || '').slice(0, 110),
  destaques: document.querySelectorAll('#ai-destaques li').length,
  paramsRows: document.querySelectorAll('#ai-params-tbody tr').length,
  news: document.querySelectorAll('#ai-news-list > div').length,
  loadingHidden: document.getElementById('ai-loading')?.classList.contains('hidden'),
  applyVisible: !document.getElementById('btn-apply-ai')?.classList.contains('hidden'),
}));
console.log('\n=== AI SECTION ==='); console.log(ai);

// --- matrix + clusters + mun table ---
const other = await page.evaluate(() => ({
  matrixCells: document.querySelectorAll('#matrix-tbody td').length,
  matrixHighlight: document.querySelectorAll('#matrix-tbody td.ring-2').length,
  clusters: document.querySelectorAll('#clusters-container > div').length,
  munRows: document.querySelectorAll('#muns-tbody tr').length,
}));
console.log('\n=== OTHER SECTIONS ==='); console.log(other);

// --- charts rendered? ---
const charts = await page.evaluate(() => {
  const ids = ['chart-comparison', 'chart-sources-flavio', 'chart-sources-lula'];
  return ids.map(id => {
    const c = document.getElementById(id);
    if (!c) return id + ': MISSING';
    const has = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data.some(v => v !== 0);
    return id + ': ' + (has ? 'drawn' : 'EMPTY');
  });
});
console.log('\n=== CHARTS ==='); console.log(charts);

// --- test apply AI ---
await page.click('#btn-apply-ai');
await page.waitForTimeout(1200);
const afterApply = await page.evaluate(() => ({
  cury: document.getElementById('slider-cury')?.value,
  flavDef: document.getElementById('slider-flav-def')?.value,
  valCury: document.getElementById('val-cury')?.textContent,
  margin: document.getElementById('metric-margin')?.textContent,
}));
console.log('\n=== APPLY AI ==='); console.log(afterApply);

// --- test a slider manually ---
await page.evaluate(() => {
  const el = document.getElementById('slider-flav-def');
  el.value = 12; el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(600);
const afterSlider = await page.evaluate(() => ({
  winner: document.getElementById('metric-margin')?.textContent,
  badgeLula: !document.getElementById('badge-winner-lula')?.classList.contains('hidden'),
}));
console.log('\n=== SLIDER 12% DEVIATION ==='); console.log(afterSlider);

await page.screenshot({ path: 'data/logs/dash-top.png' });
await page.evaluate(() => document.getElementById('ia').scrollIntoView());
await page.waitForTimeout(800);
await page.screenshot({ path: 'data/logs/dash-ai.png' });
await page.evaluate(() => document.getElementById('matriz').scrollIntoView());
await page.waitForTimeout(600);
await page.screenshot({ path: 'data/logs/dash-matriz.png' });

console.log('\n=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 12).forEach(e => console.log('  ', e));

await browser.close();