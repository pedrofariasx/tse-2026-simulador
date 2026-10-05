import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const OUT = 'data/logs/mobile';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, dsf: 2 },
  { name: 'iphone-14', width: 390, height: 844, dsf: 3 },
  { name: 'pixel-7', width: 412, height: 915, dsf: 2.6 },
  { name: 'tablet', width: 768, height: 1024, dsf: 2 },
];

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    locale: 'pt-BR',
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4500);

  // diagnostics
  const diag = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const overflow = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.right > docW + 2) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return;
        overflow.push({
          tag: el.tagName,
          id: el.id || null,
          cls: (el.className?.toString?.() || '').slice(0, 70),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    });
    // horizontal page scroll?
    const bodyScrollW = document.body.scrollWidth;
    return {
      docW,
      bodyScrollW,
      pageOverflows: bodyScrollW > docW + 1,
      headerH: Math.round(document.querySelector('header')?.getBoundingClientRect().height || 0),
      overflowCount: overflow.length,
      overflow: overflow.slice(0, 12),
      tapTargets: [...document.querySelectorAll('a,button,input[type=range],select')]
        .map(el => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, id: el.id || null, txt: (el.innerText || '').slice(0, 22), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter(x => x.w > 0 && (x.h < 32)),
    };
  });

  console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
  console.log(`doc=${diag.docW} scrollW=${diag.bodyScrollW} overflowX=${diag.pageOverflows} headerH=${diag.headerH} overflowEls=${diag.overflowCount} errors=${errs.length}`);
  if (diag.overflow.length) {
    console.log('  overflowing:');
    diag.overflow.forEach(o => console.log(`    ${o.tag}${o.id ? '#' + o.id : ''} .${o.cls} → right=${o.right} w=${o.width}`));
  }
  if (diag.tapTargets.length) {
    console.log(`  small tap targets (${diag.tapTargets.length}):`);
    diag.tapTargets.slice(0, 10).forEach(t => console.log(`    ${t.tag}${t.id ? '#' + t.id : ''} "${t.txt}" ${t.w}x${t.h}`));
  }

  // section screenshots
  for (const [label, sel] of [['top', null], ['sim', '#simulador'], ['ia', '#ia'], ['matriz', '#matriz'], ['mun', '#municipios']]) {
    if (sel) {
      await page.evaluate(s => document.querySelector(s)?.scrollIntoView(), sel);
      await page.waitForTimeout(500);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT}/${vp.name}-${label}.png` });
  }

  await ctx.close();
}

await browser.close();
console.log('\nscreenshots ->', OUT);