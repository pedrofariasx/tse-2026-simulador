import fs from 'node:fs';
import path from 'node:path';
import {
  decodeJws, getText, pool, extractRows, ensureDirs,
  voteUrl, abUrl, munConfigUrl, RAW, OUT, CICLO, ELEICAO, TURNO, CARGO,
} from './lib.mjs';

ensureDirs();

const levels = process.argv.slice(2).filter(a => !a.startsWith('-'));
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const CONC = Number((process.argv.find(a => a.startsWith('--conc=')) || '').split('=')[1] || 10);

console.log('=== TSE scraper ===');
console.log(`ciclo=${CICLO} eleicao=${ELEICAO} turno=${TURNO} cargo=${CARGO} conc=${CONC}`);

// ---------- 1. config ----------
const cfgTxt = await getText(munConfigUrl());
const cfg = decodeJws(cfgTxt);
const jsonlPath = path.join(OUT, `tse_${ELEICAO}_t${TURNO}.jsonl`);
fs.writeFileSync(path.join(RAW, CICLO, 'mun-config.json'), JSON.stringify(cfg, null, 1));
console.log(`municipios config: ${cfg.abr.length} areas`);

// ---------- 2. build target list ----------
const targets = [];
targets.push({ kind: 'br', uf: 'br', file: 'br' });
for (const a of cfg.abr) {
  targets.push({ kind: 'uf', uf: a.cd, ds: a.ds });
  if (levels.includes('all') || levels.includes('mun')) {
    for (const m of a.mu) targets.push({ kind: 'mun', uf: a.cd, mun: m.cd, nome: m.nm, ibge: m.cdi });
  }
  if (levels.includes('all') || levels.includes('zona')) {
    for (const m of a.mu) for (const z of m.z || []) targets.push({ kind: 'zona', uf: a.cd, mun: m.cd, zona: z, nome: m.nm });
  }
}
if (LIMIT) targets.length = Math.min(targets.length, LIMIT);

const byKind = targets.reduce((a, t) => (a[t.kind] = (a[t.kind] || 0) + 1, a), {});
console.log('targets:', byKind, 'total', targets.length);

// ---------- 3. resume support ----------
const donePath = path.join(OUT, `tse_${ELEICAO}_t${TURNO}.done`);
const doneSet = new Set(fs.existsSync(donePath) ? fs.readFileSync(donePath, 'utf8').split('\n').filter(Boolean) : []);
if (doneSet.size) console.log(`resume: ${doneSet.size} already fetched`);

const out = fs.createWriteStream(jsonlPath, { flags: 'a' });
let rowsWritten = 0;
const key = t => `${t.kind}/${t.uf}/${t.mun || ''}/${t.zona || ''}`;
const pending = targets.filter(t => !doneSet.has(key));

const markDone = k => {
  doneSet.add(k);
  if (doneSet.size % 400 === 0) {
    out.write(''); // flush marker for the stream ordering
    fs.writeFileSync(donePath, [...doneSet].join('\n'));
  }
};

const res = await pool(pending, CONC, async t => {
  const url = voteUrl({ uf: t.uf, mun: t.mun, zona: t.zona });
  const txt = await getText(url, 3, 40000);
  if (!txt) return;
  const json = decodeJws(txt);
  const rows = extractRows(json, {
    nivel: t.kind, uf: t.uf, uf_nome: t.ds || '', municipio: t.mun || '', municipio_nome: t.nome || '',
    ibge: t.ibge || '', zona: t.zona || '',
  });
  out.write(rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  rowsWritten += rows.length;
  markDone(key(t));
}, { label: 'votos' });

await new Promise(r => out.end(r));
fs.writeFileSync(donePath, [...doneSet].join('\n'));
console.log(`rows written: ${rowsWritten} | failed: ${res.failed}`);
if (res.errors.length) console.log('errors:', JSON.stringify(res.errors.slice(0, 10), null, 1));

// ---------- 4. companion files (turnout per mun/zona) ----------
if (levels.includes('all') || levels.includes('ab')) {
  const abPath = path.join(OUT, `tse_${ELEICAO}_t${TURNO}_ab.jsonl`);
  const abOut = fs.createWriteStream(abPath, { flags: 'w' });
  const ufs = cfg.abr.map(a => a.cd);
  await pool(ufs, 6, async uf => {
    const txt = await getText(abUrl(uf), 3, 60000);
    if (!txt) return;
    const json = decodeJws(txt);
    for (const e of json.abr || []) {
      abOut.write(JSON.stringify({
        ele: json.ele, turno: json.t, geradora: uf, cdabr: e.cdabr, tpabr: e.tpabr,
        atualizado: `${e.dt} ${e.ht}`,
        s: e.s, e: e.e,
      }) + '\n');
    }
  }, { label: 'ab   ' });
  abOut.end();
}

console.log('done ->', jsonlPath);
