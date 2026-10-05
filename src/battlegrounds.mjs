import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';

const geos = JSON.parse(fs.readFileSync(path.join(OUT, 'geos.json'), 'utf8'));
const inf = JSON.parse(fs.readFileSync(path.join(OUT, 'blocos_inferidos.json'), 'utf8'));
const BR = geos.find(g => g.nivel === 'br');
const { LULA, BOLS } = inf;
const K = Object.fromEntries(inf.candidatos.map(c => [c.chave, c.votos]));

// "massa de decisão": o bloco de。Cury+Renan (protesto, ideologicamente indefinido)
//ponderado pelo tamanho da população APTÁ — onde adiar/objetar mais pesa no resultado.
const muns = geos.filter(g => g.nivel === 'mun' && g.vv > 0 && g.aptos > 0);
const rows = muns.map(g => {
  const prot = (g.v['70'] || 0) + (g.v['14'] || 0);
  const caiado = g.v['55'] || 0;
  const l = g.v[LULA] || 0, f = g.v[BOLS] || 0;
  const out = prot + caiado;
  return {
    uf: g.uf.toUpperCase(), ufNome: g.uf_nome, cd: g.municipio, nome: g.municipio_nome, ibge: g.ibge,
    vv: g.vv, aptos: g.aptos, part: g.pct_comparecimento,
    lula: l, flav: f, m1: l - f, m1p: 100 * (l - f) / g.vv,
    prot, caiado, out, outp: 100 * out / g.vv,
    massa: prot * Math.sqrt(g.aptos / 1e6),      //_volume_ x raíz da população
  };
});

const f = n => Math.round(n).toLocaleString('pt-BR');
const totProt = rows.reduce((a, r) => a + r.prot, 0);
const totOut = rows.reduce((a, r) => a + r.out, 0);
let acc = 0;
const sortedMassa = [...rows].sort((a, b) => b.massa - a.massa);
console.log('='.repeat(96));
console.log('  MUNICÍPIOS QUE DECIDEM O 2º TURNO  (onde está a massa de voto indefinido)');
console.log('='.repeat(96));
console.log(`voto de protesto (Cury+Renan) total: ${f(totProt)}   |  + Caiado: ${f(totOut)}`);
console.log('  massa = protesto x raiz(aptos/1e6), ou seja,SIZE x PESO DO VOTO INDEFINIDO\n');
console.log('  #   município/UF                  prot.     Caiado    indéf.   1T margem  part.   massa');
sortedMassa.slice(0, 25).forEach((r, i) => {
  console.log(`  ${String(i + 1).padStart(2)}  ${(r.nome + '/' + r.uf).padEnd(26)} ${f(r.prot).padStart(9)} ${f(r.caiado).padStart(9)} ${(r.outp.toFixed(1) + '%').padStart(8)} ${(r.m1p >= 0 ? '+' : '') + r.m1p.toFixed(1).padStart(9)} ${r.part.toFixed(1)}% ${f(r.massa).padStart(9)}`);
});

// cobertura: top-N，集中
console.log('\n  concentração do voto de protesto:');
let c = 0;
for (const n of [50, 100, 250, 500, 1000, 5571]) { c = [...rows].sort((a, b) => b.prot - a.prot).slice(0, n).reduce((a, r) => a + r.prot, 0); console.log(`    top ${String(n).padStart(4)} municípios: ${(100 * c / totProt).toFixed(1)}% do protesto`); }

// municípios mais próximos (margem 1T menor)
console.log('\n  municípios mais competitive em 1º turno (|margem| < 2 ppts, >20 mil votos):');
const close = rows.filter(r => r.vv > 20000 && Math.abs(r.m1p) < 2).sort((a, b) => b.vv - a.vv);
console.log(`    ${close.length} municípios`);
for (const r of close.slice(0, 15)) {
  console.log(`      ${(r.nome + '/' + r.uf).padEnd(28)} vv ${f(r.vv).padStart(9)}  margem ${(r.m1p >= 0 ? '+' : '') + r.m1p.toFixed(1)}  indef ${r.outp.toFixed(1)}%  part ${r.part.toFixed(1)}%`);
}

// quantos municipios cada lado precisa
const flipped = [...rows].filter(r => r.m1 > 0).length;
console.log(`\n  Lula ganha em ${flipped} municípios · Flávio ganha em ${rows.length - flipped} de ${rows.length}`);
console.log(`  Lula precisa virar X municípios para compensar 2.323.104 votos de vantagem:`);
const target = -(rows.reduce((a, r) => a + r.m1, 0));
let need = [], acc2 = 0;
for (const r of [...rows].sort((a, b) => (b.m1 - a.vv * 0.12) - (a.m1 - a.vv * 0.12))) { acc2 += (r.vv * 0.12 - r.m1); need.push(r); if (acc2 >= Math.abs(target)) break; }
console.log(`    precisaria de ~${need.length} inverter simultaneamente (assumindo 12 ppts de troca de votos em cada)`);

fs.writeFileSync(path.join(OUT, 'battlegrounds.json'), JSON.stringify({
  totProt, totOut,
  top: sortedMassa.slice(0, 300),
  close: close.slice(0, 300),
  resumo: { n_municipios: rows.length, lula_ganha: flipped },
}, null, 1));
console.log('\n-> battlegrounds.json');
