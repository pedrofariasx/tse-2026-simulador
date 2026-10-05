import fs from 'node:fs';
import path from 'node:path';
import { OUT, RAW, CICLO } from './lib.mjs';

const SRC = path.join(OUT, 'tse_6257_t1.jsonl');
const cfg = JSON.parse(fs.readFileSync(path.join(RAW, CICLO, 'mun-config.json'), 'utf8'));
const UF_NAME = Object.fromEntries(cfg.abr.map(a => [a.cd, a.ds]));
const MU_NAME = {};
for (const a of cfg.abr) for (const m of a.mu) MU_NAME[`${a.cd}/${m.cd}`] = { nome: m.nm, ibge: m.cdi, zonas: m.z || [] };

console.log('lendo', SRC);
const geos = new Map();
const cands = new Map();

for (const ln of fs.readFileSync(SRC, 'utf8').split('\n')) {
  if (!ln) continue;
  const r = JSON.parse(ln);
  const k = `${r.nivel}|${r.uf}|${r.municipio}|${r.zona}`;
  let g = geos.get(k);
  if (!g) {
    g = {
      nivel: r.nivel, uf: r.uf, uf_nome: UF_NAME[r.uf] || r.uf_nome || r.uf,
      municipio: r.municipio, municipio_nome: '', ibge: '', zona: r.zona,
      atualizado: r.atualizado, v: {},
      vv: 0, branco: 0, nulo: 0, vanulado: 0, aptos: 0, aptos_totalizados: 0,
      comparecimento: 0, pct_comparecimento: 0, pct_aptencao: 0,
      secoes: 0, secoes_totalizadas: 0, pct_secoes: 0,
    };
    const meta = MU_NAME[`${r.uf}/${r.municipio}`];
    if (meta) { g.municipio_nome = meta.nome; g.ibge = meta.ibge; }
    geos.set(k, g);
  }
  g.atualizado = r.atualizado;
  if (r.__tot) {
    g.vv = Number(r.votos_validos || 0);
    g.branco = Number(r.votos_branco || 0);
    g.nulo = Number(r.votos_nulo || 0);
    g.vanulado = Number(r.votos_anulado || 0);
    g.aptos = Number(r.aptos_total || 0);
    g.aptos_totalizados = Number(r.aptos_totalizados || 0);
    g.comparecimento = Number(r.comparecimento || 0);
    g.pct_comparecimento = Number(String(r.pct_comparecimento).replace(',', '.')) || 0;
    g.pct_aptencao = Number(String(r.pct_aptencao).replace(',', '.')) || 0;
    g.secoes = Number(r.secoes_total || 0);
    g.secoes_totalizadas = Number(r.secoes_totalizadas || 0);
    g.pct_secoes = Number(String(r.pct_secoes).replace(',', '.')) || 0;
  } else {
    g.v[r.candidatura] = Number(r.votos || 0);
    if (!cands.has(r.sqcand)) cands.set(r.sqcand, {
      sqcand: r.sqcand, chave: r.candidatura, nome: r.nome, chapa: r.chapa,
      partido: r.partido_sigla, num: r.partido_numero, fed: r.fed_sigla, votos_br: 0,
    });
    if (r.nivel === 'br') cands.get(r.sqcand).votos_br = Number(r.votos || 0);
  }
}

const br = [...geos.values()].find(g => g.nivel === 'br');
const candsBR = [...geos.values()].find(g => g.nivel === 'br');
const candList = [...cands.values()].sort((a, b) => b.votos_br - a.votos_br);
const meta = {};
for (const c of candList) meta[c.chave] = c;

console.log(`geografias: ${geos.size} | candidaturas: ${candList.length}`);
console.log(`\n=== apuracao oficial (BR, ${br.atualizado}, ${br.pct_secoes}% das secoes) ===`);
console.log('votos validos :', br.vv.toLocaleString('pt-BR'));
console.log('em branco    :', br.branco.toLocaleString('pt-BR'));
console.log('nulos         :', br.nulo.toLocaleString('pt-BR'));
console.log('aptos         :', br.aptos.toLocaleString('pt-BR'), '| comparecimento', br.comparecimento.toLocaleString('pt-BR'), `(${br.pct_comparecimento}%)`);

console.log('\n=== candidatos ===');
const totalCand = candList.reduce((a, c) => a + c.votos_br, 0);
for (const c of candList) {
  console.log(
    String(c.votos_br).padStart(10),
    (100 * c.votos_br / br.vv).toFixed(3).padStart(7) + '%',
    c.partido.padEnd(10),
    ('n' + c.num).padEnd(4),
    c.nome.padEnd(26),
    '| chapa:', c.chapa
  );
}
console.log('\nsoma candidatos :', totalCand.toLocaleString('pt-BR'), '| validos:', br.vv.toLocaleString('pt-BR'),
  '| branco+nulo:', (br.branco + br.nulo).toLocaleString('pt-BR'));

// consistency
const byLevel = {};
for (const g of geos.values()) byLevel[g.nivel] = (byLevel[g.nivel] || 0) + 1;
console.log('\n=== contagem por nivel ===', byLevel);
for (const lvl of ['mun', 'uf', 'zona']) {
  const s = [...geos.values()].filter(g => g.nivel === lvl).reduce((a, g) => a + g.vv, 0);
  console.log(`soma ${lvl.padEnd(5)} validos: ${s.toLocaleString('pt-BR')}  (diff vs BR: ${(s - br.vv).toLocaleString('pt-BR')}, ${(100 * (s - br.vv) / br.vv).toFixed(4)}%)`);
}

fs.writeFileSync(path.join(OUT, 'geos.json'), JSON.stringify([...geos.values()]));
fs.writeFileSync(path.join(OUT, 'candidatos.json'), JSON.stringify(candList, null, 1));
console.log('\n-> geos.json, candidatos.json');

// also emit tidy CSVs for the user
const csvEsc = s => { const v = String(s ?? ''); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rows = [];
for (const g of geos.values()) {
  const base = [g.nivel, g.uf, g.uf_nome, g.municipio, g.municipio_nome, g.ibge, g.zona, g.vv, g.branco, g.nulo, g.aptos, g.pct_comparecimento, g.pct_secoes, g.atualizado];
  for (const c of candList) {
    const v = g.v[c.chave] || 0;
    if (g.nivel === 'br' || v > 0) {
      rows.push([...base, c.partido, c.num, c.nome, c.sqcand, v, (100 * v / (g.vv || 1)).toFixed(3), c.chapa].map(csvEsc).join(';'));
    }
  }
}
const header = ['nivel', 'uf', 'uf_nome', 'municipio', 'municipio_nome', 'ibge', 'zona', 'votos_validos', 'votos_branco', 'votos_nulo', 'aptos', 'pct_comparecimento', 'pct_secoes', 'atualizado', 'partido', 'partido_numero', 'candidato', 'sqcand', 'votos', 'pct', 'chapa'].join(';');
fs.writeFileSync(path.join(OUT, `tse_2026_presidencia_1turno_completo.csv`), header + '\n' + rows.join('\n') + '\n');
console.log('-> CSV:', rows.length.toLocaleString('pt-BR'), 'linhas');
