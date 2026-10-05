import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

const geos = JSON.parse(fs.readFileSync(path.join(OUT, 'geos.json'), 'utf8'));
const inf = JSON.parse(fs.readFileSync(path.join(OUT, 'blocos_inferidos.json'), 'utf8'));
const BR = geos.find(g => g.nivel === 'br');
const { LULA, BOLS } = inf;

// central parameters (same as model.mjs)
const P = {
  lula: { a: 0.965, s: 0.975 },          // logit 3.60 -> 0.9746
  flav: { a: 0.958, s: 0.050 },          // logit -2.95 -> 0.0500
  caiado: { a: 0.915, s: 0.114 },
  cury: { a: 0.720, s: 0.440 },
  renan: { a: 0.720, s: 0.378 },
  zema: { a: 0.900, s: 0.083 },
  esq: { a: 0.935, s: 0.940 },
  dc: { a: 0.860, s: 0.488 },
  branco: { a: 0.280, s: 0.310 },
  nulo: { a: 0.600, s: 0.332 },
};
const K = {
  lula: inf.candidatos.find(c => c.chave === LULA).votos,
  flav: inf.candidatos.find(c => c.chave === BOLS).votos,
  caiado: inf.candidatos.find(c => c.chave === '55').votos,
  cury: inf.candidatos.find(c => c.chave === '70').votos,
  renan: inf.candidatos.find(c => c.chave === '14').votos,
  zema: inf.candidatos.find(c => c.chave === '30').votos,
  esq: ['16', '21', '80', '29'].reduce((a, k) => a + (inf.candidatos.find(c => c.chave === k) || { votos: 0 }).votos, 0),
  dc: ['27', '35'].reduce((a, k) => a + (inf.candidatos.find(c => c.chave === k) || { votos: 0 }).votos, 0),
  branco: BR.branco,
  nulo: BR.nulo,
};

const res = p => {
  let L = 0, B = 0;
  for (const b of Object.keys(K)) {
    const act = K[b] * p[b].a;
    L += act * p[b].s; B += act * (1 - p[b].s);
  }
  return { L, B, m: L - B, total: L + B };
};

console.log('='.repeat(74));
console.log('  ANÁLISE DE PONTO DE EQUILÍBRIO — quem vence por quê');
console.log('='.repeat(74));
const base = res(P);
const f = n => Math.round(n).toLocaleString('pt-BR');
console.log(`\nCenário central: Lula ${f(base.L)} | Flávio ${f(base.B)} | margem ${f(base.m)} (${base.m > 0 ? 'Lula' : 'Flávio'})`);
console.log(`Comparecimento projetado ${f(base.total)} = ${(100 * base.total / BR.aptos).toFixed(1)}% do eleitorado apto\n`);

console.log('1) SUPOSTO DE LUZ PARA O VOTO DE PROTESTO (Cury + Renan somam ' + f(K.cury + K.renan) + ')');
console.log('   mantendo todo o resto no cenário central:');
for (const x of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const p = { ...P, cury: { ...P.cury, s: x }, renan: { ...P.renan, s: x } };
  const r = res(p);
  console.log(`     protesto -> Lula ${(100 * x).toFixed(0).padStart(3)}%  =>  margem Lula ${f(r.m).padStart(13)}  ${r.m > 0 ? '>>> LULA VENCE' : 'Flávio'}`);
}

console.log('\n2) DESVIO DA BASE DO FLÁVIO PARA LULA (Cury/Renan no centro):');
for (const d of [0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20]) {
  const p = { ...P, flav: { ...P.flav, s: d } };
  const r = res(p);
  console.log(`     desvio ${(100 * d).toFixed(0).padStart(3)}%  =>  margem Lula ${f(r.m).padStart(13)}  ${r.m > 0 ? '>>> LULA VENCE' : 'Flávio'}`);
}

console.log('\n3) CAIADO (PSD) MIGRANDO PARA LULA:');
for (const x of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
  const p = { ...P, caiado: { ...P.caiado, s: x } };
  const r = res(p);
  console.log(`     Caiado -> Lula ${(100 * x).toFixed(0).padStart(3)}%  =>  margem Lula ${f(r.m).padStart(13)}  ${r.m > 0 ? '>>> LULA VENCE' : 'Flávio'}`);
}

console.log('\n4) BRANCO + NULO (' + f(K.branco + K.nulo) + ') TODOS PARA LULA:');
for (const x of [0.31, 0.5, 0.7, 0.9, 1.0]) {
  const p = { ...P, branco: { ...P.branco, s: x }, nulo: { ...P.nulo, s: x } };
  const r = res(p);
  console.log(`     branco/nulo -> Lula ${(100 * x).toFixed(0).padStart(3)}%  =>  margem Lula ${f(r.m).padStart(13)}  ${r.m > 0 ? '>>> LULA VENCE' : 'Flávio'}`);
}

// ---- solve exact break-even by bisection ----
// solve fn(x) = target on [lo,hi]; auto-detects monotonic direction; NaN if no root
function solve(fn, lo, hi, target = 0) {
  const fLo = fn(lo) - target, fHi = fn(hi) - target;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return NaN;                 // no crossing in range
  const inc = fHi > fLo;
  let a = lo, b = hi;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const f = fn(m) - target;
    if ((f > 0) === inc) b = m; else a = m;
  }
  return (a + b) / 2;
}
console.log('\n' + '-'.repeat(74));
console.log('PONTOS DE EQUILÍBRIO EXATOS (com o resto no cenário central):');
const beProtest = solve(x => res({ ...P, cury: { ...P.cury, s: x }, renan: { ...P.renan, s: x } }).m, 0, 1);
const beFlav = solve(x => res({ ...P, flav: { ...P.flav, s: x } }).m, 0, 1);
const beCaiado = solve(x => res({ ...P, caiado: { ...P.caiado, s: x } }).m, 0, 1);
const beBN = solve(x => res({ ...P, branco: { ...P.branco, s: x }, nulo: { ...P.nulo, s: x } }).m, 0, 1);
console.log(`  Cury+Renan precisam ir ${(100 * beProtest).toFixed(1)}% para Lula (centro: ~41%)  [+${(100 * (beProtest - 0.41)).toFixed(1)} ppts]`);
console.log(`  Flávio precisa desviar ${(100 * beFlav).toFixed(1)}% para Lula (centro: 5,0%)     [+${(100 * (beFlav - 0.05)).toFixed(1)} ppts]`);
console.log(`  Caiado precisa migrar ${(100 * beCaiado).toFixed(1)}% para Lula (centro: 11,4%)  [+${(100 * (beCaiado - 0.114)).toFixed(1)} ppts]`);
console.log(`  Branco+nulo precisam ir ${(100 * beBN).toFixed(1)}% para Lula (centro: ~32%)    [+${(100 * (beBN - 0.32)).toFixed(1)} ppts]`);

// ---- how much of the pool would Lula need overall, jointly ----
console.log('\n' + '-'.repeat(74));
console.log('CENÁRIO CONJUNTO: e se TODAS as bases rivais (Caiado+Cury+Renan+Zema+');
console.log('branco+nulo) fossem para Lula com a MESMA proporção x, e Flávio mantivesse');
console.log('5% de desvio?');
for (const x of [0.4, 0.5, 0.6, 0.7, 0.8]) {
  const p = { ...P };
  for (const b of ['caiado', 'cury', 'renan', 'zema', 'branco', 'nulo']) p[b] = { ...p[b], s: x };
  const r = res(p);
  console.log(`   x=${(100 * x).toFixed(0)}%  margem Lula ${f(r.m).padStart(13)}  ${r.m > 0 ? '>>> LULA VENCE' : 'Flávio'}`);
}
const beAll = solve(x => { const p = { ...P }; for (const b of ['caiado', 'cury', 'renan', 'zema', 'branco', 'nulo']) p[b] = { ...p[b], s: x }; return res(p).m; }, 0, 1);
console.log(`\n  >>> Lula precisa de ${(100 * beAll).toFixed(1)}% de TODAS as bases rivais (hoje ~${(100 * (K.caiado * .114 + K.cury * .44 + K.renan * .378 + K.zema * .083 + K.branco * .31 + K.nulo * .332) / (K.caiado + K.cury + K.renan + K.zema + K.branco + K.nulo)).toFixed(1)}%) para vencer,`
  + ` com Flávio desviando 5%.`);

fs.writeFileSync(path.join(OUT, 'breakeven.json'), JSON.stringify({
  base, params: P, pesos: K,
  beProtest, beFlavio: beFlav, beCaiado, beBN, beAll,
}, null, 1));
console.log('\n-> breakeven.json');
