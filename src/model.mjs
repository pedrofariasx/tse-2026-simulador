import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

const geos = JSON.parse(fs.readFileSync(path.join(OUT, 'geos.json'), 'utf8'));
const inf = JSON.parse(fs.readFileSync(path.join(OUT, 'blocos_inferidos.json'), 'utf8'));
const BR = geos.find(g => g.nivel === 'br');
const { LULA, BOLS } = inf;
const byKey = Object.fromEntries(inf.candidatos.map(c => [c.chave, c]));
const get = k => byKey[k].votos;
const geof = Object.fromEntries(inf.geografia.map(r => [r.chave, r]));

// ---------------- RNG ----------------
let _s = 987654321 >>> 0;
const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };
let _sp = null;
function gs() {
  if (_sp !== null) { const s = _sp; _sp = null; return s; }
  let u, v, q;
  do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
  const f = Math.sqrt(-2 * Math.log(q) / q); _sp = v * f; return u * f;
}
const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
// proper logit-normal: noise is additive on the LOGIT scale, so the result is
// always in (0,1) and stays realistically tight for high-probability blocs.
function share(mu, sig) { return 1 / (1 + Math.exp(-(mu + gs() * sig))); }
// activation: mean of 4 uniforms mapped to [lo,hi], centred on mean
function act(mean, sig, lo, hi) {
  const u = (rnd() + rnd() + rnd() + rnd()) / 4;      // ~N(.5, .289)
  return cl(mean + (u - 0.5) * 2 * (sig / 0.289), lo, hi);
}

// ---------------- geography ----------------
const REG = {
  norte: ['ac', 'ap', 'am', 'ro', 'rr', 'to', 'pa'],
  nordeste: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'],
  centro: ['go', 'mt', 'ms', 'df'],
  sudeste: ['mg', 'es', 'rj', 'sp'],
  sul: ['pr', 'sc', 'rs'],
};
const ufRegion = {}; for (const [r, l] of Object.entries(REG)) for (const u of l) ufRegion[u] = r;
const REGS = Object.keys(REG);

const muns = geos.filter(g => g.nivel === 'mun' && g.pct_secoes >= 90);
const UFS = [...new Set(muns.map(m => m.uf))];
const ufIdx = new Map(UFS.map((u, i) => [u, i]));
const regIdx = new Map(REGS.map((r, i) => [r, i]));

// ---------------- blocs ----------------
// a: [mean, sd] ativação · s: [logit-mean, sd] fração que vai para LULA
const BL = [
  // a:[mean,sd,lo,hi] ativacao · s:[logitMean, sysSd] incercaza SISTEMATICA · r:[sd] ruido regional
  // chaves logit calibradas na retencao empirica do 1o->2o turno de 2022 (Lula 99,85% da propria base)
  { id: 'lula',   n: 'Lula (PT)',             k: [LULA],            a: [0.965, 0.016, 0.90, 0.999], s: [ 3.60, 0.32], r: 0.05, why: 'incumbente; retencao historica ~99,8%' },
  { id: 'flav',   n: 'Flavio Bolsonaro (PL)', k: [BOLS],            a: [0.958, 0.022, 0.86, 0.999], s: [-2.95, 0.36], r: 0.06, why: 'primeira presidenciaria; desvio para Lula e cauda' },
  { id: 'caiado', n: 'Caiado (PSD)',          k: ['55'],            a: [0.915, 0.045, 0.75, 0.995], s: [-2.05, 0.45], r: 0.09, why: 'centro-direita; aliado historico de Bolsonaro' },
  { id: 'cury',   n: 'Cury (AVANTE)',         k: ['70'],            a: [0.720, 0.090, 0.48, 0.96], s: [-0.24, 0.55], r: 0.12, why: 'personalista/protesto; INDEFINIDO' },
  { id: 'renan',  n: 'Renan Santos (MISSAO)', k: ['14'],            a: [0.720, 0.090, 0.48, 0.96], s: [-0.49, 0.55], r: 0.12, why: 'protesto; INDEFINIDO' },
  { id: 'zema',   n: 'Zema (NOVO)',           k: ['30'],            a: [0.900, 0.045, 0.72, 0.995], s: [-2.40, 0.45], r: 0.09, why: 'libertarianismo; forte inclinacao espacial-direita' },
  { id: 'esq',    n: 'Esquerda periferica',   k: ['16','21','80','29'], a: [0.935, 0.030, 0.82, 0.998], s: [ 2.75, 0.45], r: 0.06, why: 'PSTU/PCB/UP/PCO votam em Lula' },
  { id: 'dc',     n: 'DC / DEMOCRATA',        k: ['27','35'],       a: [0.860, 0.070, 0.58, 0.99], s: [-0.05, 0.50], r: 0.10, why: 'pequeno; indefinido' },
  { id: 'branco', n: 'Em branco',             k: [],                a: [0.280, 0.075, 0.10, 0.60], s: [-0.80, 0.50], r: 0.09, why: 'anulam de novo ou nao vao' },
  { id: 'nulo',   n: 'Nulo',                  k: [],                a: [0.600, 0.085, 0.33, 0.88], s: [-0.70, 0.48], r: 0.08, why: 'erro acidental; split proximo ao Constant' },
];
const NB = BL.length, NM = muns.length, NU = UFS.length, NR = REGS.length;
const W = new Float64Array(NM * NB);
for (let i = 0; i < NM; i++) {
  const g = muns[i];
  for (let b = 0; b < NB; b++) {
    if (BL[b].id === 'branco') W[i * NB + b] = g.branco || 0;
    else if (BL[b].id === 'nulo') W[i * NB + b] = g.nulo || 0;
    else { let s = 0; for (const k of BL[b].k) s += (g.v[k] || 0); W[i * NB + b] = s; }
  }
}
const ufOf = new Int32Array(NM), rgOf = new Int32Array(NM), vvOf = new Float64Array(NM);
for (let i = 0; i < NM; i++) { ufOf[i] = ufIdx.get(muns[i].uf); rgOf[i] = regIdx.get(ufRegion[muns[i].uf] || 'sudeste'); vvOf[i] = muns[i].vv; }

console.log('='.repeat(78));
console.log(`  MODELO DE TRANSFERÊNCIA — 2º TURNO 2026 (eleição 6258)`);
console.log(`  apuração 1º turno: ${BR.atualizado} · ${BR.pct_secoes}% das seções`);
console.log('='.repeat(78));
console.log('\npesos dos blocos (nacionais):');
let totAll = 0; for (let b = 0; b < NB; b++) for (let i = 0; i < NM; i++) totAll += W[i * NB + b];
for (let b = 0; b < NB; b++) {
  let s = 0; for (let i = 0; i < NM; i++) s += W[i * NB + b];
  console.log(`  ${BL[b].n.padEnd(26)} ${Math.round(s).toLocaleString('pt-BR').padStart(12)}  ${(100 * s / totAll).toFixed(2).padStart(5)}%`);
}

// ---------------- Monte Carlo ----------------
const NS = Number((process.argv.find(a => a.startsWith('--sims=')) || '').split('=')[1] || 30000);
function run(label, tweak, nSims = NS) {
  _s = 987654321 >>> 0;
  const n = nSims;
  const aB = new Float64Array(NB), sB = new Float64Array(NB), regS = new Float64Array(NR * NB);
  const ufL = new Float64Array(NU), ufB = new Float64Array(NU);
  const rgL = new Float64Array(NR), rgB = new Float64Array(NR);
  const ufW = new Float64Array(NU), rgW = new Float64Array(NR);
  const marg = new Float64Array(n);
  let wL = 0, TL = 0, TB = 0;
  const t0 = Date.now();
  for (let sim = 0; sim < n; sim++) {
    for (let b = 0; b < NB; b++) {
      let A = BL[b].a, S = BL[b].s;
      if (tweak) [A, S] = tweak(b, BL[b], A, S) || [A, S];
      aB[b] = act(A[0], A[1], A[2], A[3]);
      // systematic: one global draw per bloc per simulation (dominates the outcome)
      sB[b] = share(S[0], S[1]);
      // idiosyncratic: small regional deviation around the global draw
      const rr = BL[b].r;
      for (let r = 0; r < NR; r++) regS[r * NB + b] = rr * gs();
    }
    ufL.fill(0); ufB.fill(0); rgL.fill(0); rgB.fill(0);
    for (let i = 0; i < NM; i++) {
      const off = i * NB, rb = rgOf[i] * NB;
      let L = 0, Bv = 0;
      for (let b = 0; b < NB; b++) {
        const w = W[off + b];
        if (w === 0) continue;
        const s = cl(sB[b] + regS[rb + b], 0, 1);
        const q = w * aB[b];
        L += q * s; Bv += q - q * s;
      }
      ufL[ufOf[i]] += L; ufB[ufOf[i]] += Bv; rgL[rgOf[i]] += L; rgB[rgOf[i]] += Bv;
    }
    let sl = 0, sb = 0;
    for (let u = 0; u < NU; u++) { sl += ufL[u]; sb += ufB[u]; if (ufL[u] > ufB[u]) ufW[u]++; }
    for (let r = 0; r < NR; r++) if (rgL[r] > rgB[r]) rgW[r]++;
    if (sl > sb) wL++;
    TL += sl; TB += sb;
    marg[sim] = sl - sb;
  }
  const sorted = [...marg].sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const pct = {}; for (const f of [0.01,0.05,0.10,0.25,0.50,0.75,0.90,0.95,0.99]) pct['p'+(f*100)] = q(f);
  const close = t => [...marg].filter(m => Math.abs(m) < t * 1e6).length / n;
  return { diag: { pct, close1: close(1), close5: close(5), close10: close(10) }, label, pL: wL / n, med: q(0.5), p5: q(0.05), p25: q(0.25), p75: q(0.75), p95: q(0.95), mL: TL / n, mB: TB / n, ufW, rgW, ufL, ufB, ufBavg: ufB, secs: (Date.now() - t0) / 1000 };
}

const cen = run('CENTRAL', null);
const fmt = n => Math.round(n).toLocaleString('pt-BR');
console.log(`\n${cen.secs.toFixed(1)}s para ${NS.toLocaleString('pt-BR')} simulações\n`);
console.log('='.repeat(78));
console.log('  CENÁRIO CENTRAL');
console.log('='.repeat(78));
console.log(`  P(Lula vence)             ${(100 * cen.pL).toFixed(1)}%`);
console.log(`  P(Flávio Bolsonaro vence) ${(100 * (1 - cen.pL)).toFixed(1)}%`);
console.log(`  2º turno médio: Lula ${fmt(cen.mL)} | Flávio ${fmt(cen.mB)} | total ${fmt(cen.mL + cen.mB)} = ${(100 * (cen.mL + cen.mB) / BR.aptos).toFixed(1)}% do eleitorado apto (vs ${BR.pct_comparecimento}% no 1o turno)`);
console.log(`  margem Lula-Flávio (mediana) ${fmt(cen.med)}   |  IC90 ${fmt(cen.p5)} … ${fmt(cen.p95)}`);
{
  const d = cen.diag;
  console.log('  percentis:', Object.entries(d.pct).map(([k, v]) => k + '=' + fmt(v)).join('  '));
  console.log(`  P(|margem|<1M): ${(100 * d.close1).toFixed(1)}%   <5M: ${(100 * d.close5).toFixed(1)}%   <10M: ${(100 * d.close10).toFixed(1)}%`);
}

// ---------------- sensitivity ----------------
const scen = [
  { lab: 'otimista Flávio', over: { cury: [-1.30, 0.35], renan: [-1.30, 0.35], flav: [-3.60, 0.35] } },
  { lab: 'otimista Lula',   over: { cury: [1.35, 0.35], renan: [1.35, 0.35], flav: [-2.20, 0.35] } },
  { lab: 'protesto -> 100% Flávio', over: { cury: [-1.20, 0.10], renan: [-1.20, 0.10] } },
  { lab: 'protesto -> 100% Lula',   over: { cury: [1.20, 0.10], renan: [1.20, 0.10] } },
  { lab: 'mobilização -10ppts (todos)', dAct: -0.10 },
  { lab: 'Caiado migra para Lula', over: { caiado: [1.60, 0.45] } },
  { lab: 'desvio alto Flávio->Lula', over: { flav: [-1.30, 0.45] } },
  { lab: 'branco/nulo muito pro-Lula', over: { branco: [0.60, 0.40], nulo: [0.60, 0.40] } },
  { lab: '[LIMITE] todas rivais -> Lula', over: { flav: [4.0, 0.1], caiado: [4.0, 0.1], cury: [4.0, 0.1], renan: [4.0, 0.1], zema: [4.0, 0.1], esq: [4.0, 0.1], dc: [4.0, 0.1], branco: [4.0, 0.1], nulo: [4.0, 0.1] } },
  { lab: '[LIMITE] todas rivais -> Flavio', over: { flav: [-4.0, 0.1], caiado: [-4.0, 0.1], cury: [-4.0, 0.1], renan: [-4.0, 0.1], zema: [-4.0, 0.1], esq: [-4.0, 0.1], dc: [-4.0, 0.1], branco: [-4.0, 0.1], nulo: [-4.0, 0.1] } },
  { lab: 'Flavio mobiliza 4ppts a menos', dAct: { flav: -0.04 } },
  { lab: 'Lula mobiliza 3ppts a mais', dAct: { lula: +0.03 } },
  { lab: 'Flavio desvia 8% p/ Lula', over: { flav: [-1.55, 0.25] } },
];
console.log('\n' + '='.repeat(78));
console.log('  ANÁLISE DE SENSIBILIDADE');
console.log('='.repeat(78));
console.log('  cenário'.padEnd(32) + 'P(Lula)   P(Flávio)   margem mediana');
const sens = [];
for (const sc of scen) {
  const tw = (b, o, A, S) => {
    const da = typeof sc.dAct === 'object' ? sc.dAct[o.id] : sc.dAct;
    if (da) A = [cl(A[0] + da, 0.2, 0.995), A[1] * 1.2, A[2], A[3]];
    const o2 = sc.over && sc.over[o.id];
    if (o2) S = o2;
    return [A, S];
  };
  const r = run(sc.lab, tw, 6000);
  sens.push({ lab: sc.lab, pL: r.pL, med: r.med });
  console.log('  ' + sc.lab.padEnd(32) + `${(100 * r.pL).toFixed(1)}%`.padStart(8) + `${(100 * (1 - r.pL)).toFixed(1)}%`.padStart(12) + fmt(r.med).padStart(19));
}

// ---------------- geography ----------------
console.log('\n' + '='.repeat(78));
console.log('  ONDE A DISPUTA SE DECIDE');
console.log('='.repeat(78));
console.log('\npor região:');
const rgRows = REGS.map((r, i) => {
  let l = 0, b = 0, vv = 0;
  for (let m = 0; m < NM; m++) if (rgOf[m] === i) { vv += vvOf[m]; }
  return { r, pL: cen.rgW[i] / NS, reg: r };
});
for (const r of REGS.map((r, i) => ({ r, pL: cen.rgW[i] / NS })).sort((a, b) => b.pL - a.pL)) {
  console.log('  ' + r.r.padEnd(12) + `${(100 * r.pL).toFixed(1)}%`.padStart(8) + '  P(Lula)  ' + '█'.repeat(Math.round(r.pL * 40)).padEnd(40, '·'));
}

console.log('\npor UF (P(Lula) no 2º turno | margem do 1º turno):');
const ufRows = UFS.map((u, i) => {
  const g = muns.filter(m => m.uf === u);
  let vv = 0, bl = 0, bn = 0, apt = 0, comp = 0;
  for (const m of g) { vv += m.vv; bl += m.v[LULA] || 0; bn += m.v[BOLS] || 0; apt += m.aptos; comp += m.comparecimento; }
  return { uf: u, nome: g[0].uf_nome, vv, r1: (bl - bn) / vv, r1p: 100 * bl / vv, comp: comp / apt * 100, pL: cen.ufW[i] / NS };
}).sort((a, b) => b.r1 - a.r1);
console.log('  UF  ' + 'estado'.padEnd(22) + 'Lula 1T   Flavio 1T   margem 1T  part  P(Lula)2T');
for (const r of ufRows) {
  const fl = 100 - r.r1p;
  console.log('  ' + r.uf.toUpperCase().padEnd(4) + r.nome.padEnd(22) +
    `${r.r1p.toFixed(1).padStart(5)}%  ${fl.toFixed(1).padStart(7)}%   ${(r.r1p - fl >= 0 ? '+' : '') + (r.r1p - fl).toFixed(1)}`.padStart(9) +
    `   ${r.comp.toFixed(1)}%` + `${(100 * r.pL).toFixed(1)}%`.padStart(9) + '  ' + '█'.repeat(Math.round(r.pL * 30)).padEnd(30, '·'));
}

fs.writeFileSync(path.join(OUT, 'sim_result.json'), JSON.stringify({
  apuracao: inf.apuracao, sims: NS,
  central: { pLula: cen.pL, pFlavio: 1 - cen.pL, mLula: cen.mL, mFlavio: cen.mB, margem: cen.diag.pct, diag: cen.diag },
  sensibilidade: sens, uf: ufRows,
  n_municipios: NM,
}, null, 1));
console.log('\n-> sim_result.json');
