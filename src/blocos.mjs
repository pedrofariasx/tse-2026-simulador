import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

const geos = JSON.parse(fs.readFileSync(path.join(OUT, 'geos.json'), 'utf8'));
const cands = JSON.parse(fs.readFileSync(path.join(OUT, 'candidatos.json'), 'utf8'));
const BR = geos.find(g => g.nivel === 'br');
const byKey = Object.fromEntries(cands.map(c => [c.chave, c]));
const LULA = cands[1].chave, BOLS = cands[0].chave;

const REG = {
  norte: ['ac', 'ap', 'am', 'ro', 'rr', 'to', 'pa'],
  nordeste: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'],
  centro: ['go', 'mt', 'ms', 'df'],
  sudeste: ['mg', 'es', 'rj', 'sp'],
  sul: ['pr', 'sc', 'rs'],
};
const ufRegion = {}; for (const [r, l] of Object.entries(REG)) for (const u of l) ufRegion[u] = r;

const muns = geos.filter(g => g.nivel === 'mun' && g.vv >= 150 && g.pct_secoes >= 95);
const sh = (g, k) => (g.v[k] || 0) / (g.vv || 1);
for (const g of muns) g.A = sh(g, BOLS) - sh(g, LULA);   // eixo +1 = território bolsonarista

// baseline: eixo médio de TODOS os votos válidos (candidato puramente proporcional)
const sumVV = muns.reduce((a, g) => a + g.vv, 0);
const A_base = muns.reduce((a, g) => a + g.A * g.vv, 0) / sumVV;

function lean(k) {
  let sw = 0, sx = 0, sx2 = 0, n = 0;
  for (const g of muns) {
    const v = g.v[k] || 0;
    if (!v) continue;
    sw += v; sx += v * g.A; sx2 += v * g.A * g.A; n++;
  }
  if (!sw) return null;
  const A = sx / sw, sd = Math.sqrt(Math.max(0, sx2 / sw - A * A));
  return { A, sd, n, share: sw / sumVV, A_base, lean: A - A_base };
}

console.log(`ABERTURA 1º TURNO — ${BR.atualizado} · ${BR.pct_secoes}% das seções apuradas`);
console.log(`votos válidos ${BR.vv.toLocaleString('pt-BR')} · branco ${BR.branco.toLocaleString('pt-BR')} · nulo ${BR.nulo.toLocaleString('pt-BR')}\n`);
console.log(`municípios na análise: ${muns.length}`);
console.log(`eixo territorial médio do eleitorado (A_base) = ${A_base.toFixed(4)}  (+1 = bolsonarista, -1 = lulista)\n`);

const out = [];
console.log('candidato'.padEnd(28), 'partido'.padEnd(11), 'votos'.padStart(10), '  eixo A   desvio   desvio-pp   leitura');
for (const c of cands) {
  const k = c.chave;
  const L = lean(k);
  if (!L) continue;
  const dev = L.A - L.A_base;
  const leitura = k === BOLS ? 'EIXO DO LIDER' : k === LULA ? 'EIXO DO 2º' :
    dev < -0.06 ? 'território<<< lulista' : dev > 0.06 ? 'território>>> bolsonarista' :
      Math.abs(dev) < 0.02 ? 'PROPORCIONAL (protesto)' : 'leve desvio';
  out.push({ chave: k, nome: c.nome, partido: c.partido, num: c.num, votos: c.votos_br, pct: 100 * c.votos_br / BR.vv, A: L.A, sd: L.sd, dev, leitura });
  console.log(c.nome.padEnd(28), (c.partido + '/' + c.num).padEnd(11), String(c.votos_br).padStart(10),
    L.A.toFixed(4).padStart(9), (dev >= 0 ? '+' : '') + dev.toFixed(4), (dev >= 0 ? '+' : '') + dev.toFixed(4).padStart(9), '  ', leitura);
}

// dispersão: quão concentrada é a base
console.log('\n=== dispersão territorial (dp do eixo onde o candidato vota) ===');
for (const r of out.sort((a, b) => b.votos - a.votos)) {
  console.log('  ', r.nome.padEnd(28), 'dp=' + r.sd.toFixed(3), '|Desvio|=' + Math.abs(r.dev).toFixed(3), r.leitura);
}

// região de origem dos votos dos candidatos decisivos
console.log('\n=== de onde vêm os votos dos candidatos eliminados ===');
const decisivos = out.filter(r => !['EIXO DO LIDER', 'EIXO DO 2º'].includes(r.leitura) && r.votos > 200000);
for (const r of decisivos) {
  const mix = {};
  for (const g of muns) { const v = g.v[r.chave] || 0; if (!v) continue; const rg = ufRegion[g.uf] || 'ext'; mix[rg] = (mix[rg] || 0) + v; }
  const tot = Object.values(mix).reduce((a, x) => a + x, 0);
  console.log(`  ${r.nome.padEnd(26)} (${r.partido}) ` + Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(100 * v / tot).toFixed(0)}%`).join('  '));
}

fs.writeFileSync(path.join(OUT, 'blocos_inferidos.json'), JSON.stringify({
  apuracao: { atualizado: BR.atualizado, pct_secoes: BR.pct_secoes, vv: BR.vv, branco: BR.branco, nulo: BR.nulo, aptos: BR.aptos, comparecimento: BR.comparecimento, pct_comparecimento: BR.pct_comparecimento },
  LULA, BOLS, n_municipios: muns.length, A_base,
  candidatos: cands.map(c => ({ chave: c.chave, nome: c.nome, partido: c.partido, num: c.num, votos: c.votos_br, pct: 100 * c.votos_br / BR.vv, chapa: c.chapa })),
  geografia: out,
}, null, 1));
console.log('\n-> blocos_inferidos.json');
