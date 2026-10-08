import fs from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';
import { discoverCandidates } from './candidatos.mjs';

const TURNO = (process.argv.find((a) => a.startsWith('--turno=')) || '').split('=')[1] || '1';
const BUCKET_MIN = 5;

// Localiza os arquivos de origem para o turno (qualquer ID de eleição).
const reAb = new RegExp(`^tse_\\d+_t${TURNO}_ab\\.jsonl$`);
const reVotos = new RegExp(`^tse_\\d+_t${TURNO}\\.jsonl$`);
const files = fs.readdirSync(OUT);
const abFile = files.find((f) => reAb.test(f));
const votosFile = files.find((f) => reVotos.test(f));
if (!abFile || !votosFile) {
  console.error(`arquivos do turno ${TURNO} não encontrados em ${OUT}`);
  console.error('  esperado: tse_<id>_t' + TURNO + '_ab.jsonl e tse_<id>_t' + TURNO + '.jsonl');
  console.error('  rode: npm run scrape -- --turno=' + TURNO);
  process.exit(1);
}
const SRC = path.join(OUT, abFile);
const VOTOS_SRC = path.join(OUT, votosFile);
const DEST = path.join(OUT, TURNO === '1' ? 'evolution.json' : `evolution-t${TURNO}.json`);

// Descobre os sqcand de Flávio e Lula no nível "br".
const cand = await discoverCandidates(VOTOS_SRC);
if (!cand.flavio || !cand.lula) {
  console.error('não encontrei Flávio/Lula no nível br de', votosFile);
  process.exit(1);
}
const SQ_FLAVIO = cand.flavio;
const SQ_LULA = cand.lula;
console.log(`candidatos: Flávio=${cand.nomes.flavio} (${SQ_FLAVIO}) | Lula=${cand.nomes.lula} (${SQ_LULA})`);

const parseTs = (s) => {
  const [d, t] = s.split(' ');
  const [dd, mm, yyyy] = d.split('/').map(Number);
  const [hh, mi, ss] = t.split(':').map(Number);
  return new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime();
};

const fmtTs = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// votos por municipio (nivel "mun" do arquivo unificado)
console.log('lendo votos municipais', VOTOS_SRC);
const votosMun = new Map();
for (const ln of fs.readFileSync(VOTOS_SRC, 'utf8').split('\n')) {
  if (!ln) continue;
  const r = JSON.parse(ln);
  if (r.nivel !== 'mun') continue;
  const key = `${r.uf}/${r.municipio}`;
  let m = votosMun.get(key);
  if (!m) { m = { flavio: 0, lula: 0, validos: 0 }; votosMun.set(key, m); }
  if (r.__tot) {
    m.validos = Number(r.votos_validos || 0);
  } else if (r.sqcand === SQ_FLAVIO) {
    m.flavio = Number(r.votos || 0);
  } else if (r.sqcand === SQ_LULA) {
    m.lula = Number(r.votos || 0);
  }
}
console.log(`municipios com votos: ${votosMun.size}`);

console.log('lendo', SRC);
const muns = [];
let totSec = 0, totEle = 0, totMun = 0;
let missing = 0;
let missSec = 0, missEle = 0, missFlavio = 0, missLula = 0, missValidos = 0;

for (const ln of fs.readFileSync(SRC, 'utf8').split('\n')) {
  if (!ln) continue;
  const r = JSON.parse(ln);
  if (r.tpabr !== 'mun') continue;
  const sec = Number(r.s?.ts || 0);
  const ele = Number(r.e?.te || 0);
  totSec += sec;
  totEle += ele;
  totMun++;
  const key = `${r.geradora}/${r.cdabr}`;
  const v = votosMun.get(key) || { flavio: 0, lula: 0, validos: 0 };
  const at = (r.atualizado || '').trim();
  if (!at) {
    missing++;
    missSec += sec; missEle += ele;
    missFlavio += v.flavio; missLula += v.lula; missValidos += v.validos;
    continue;
  }
  muns.push({ t: parseTs(at), sec, ele, flavio: v.flavio, lula: v.lula, validos: v.validos });
}

muns.sort((a, b) => a.t - b.t);
console.log(`municipios com horario: ${muns.length} | sem horario: ${missing}`);
console.log(`secoes: ${totSec} | eleitores: ${totEle}`);

const t0 = muns[0].t;
const t1 = muns[muns.length - 1].t;
const bucketMs = BUCKET_MIN * 60 * 1000;
const nBuckets = Math.ceil((t1 - t0) / bucketMs) + 1;

const buckets = Array.from({ length: nBuckets }, (_, i) => ({
  t: t0 + i * bucketMs,
  secoes: 0,
  eleitores: 0,
  municipios: 0,
  flavio: 0,
  lula: 0,
  validos: 0,
}));

for (const m of muns) {
  const i = Math.min(Math.floor((m.t - t0) / bucketMs), nBuckets - 1);
  buckets[i].secoes += m.sec;
  buckets[i].eleitores += m.ele;
  buckets[i].municipios += 1;
  buckets[i].flavio += m.flavio;
  buckets[i].lula += m.lula;
  buckets[i].validos += m.validos;
}

// municipios sem horario: atribuidos ao ultimo bucket (totalizacao final)
const last = buckets[nBuckets - 1];
last.secoes += missSec;
last.eleitores += missEle;
last.municipios += missing;
last.flavio += missFlavio;
last.lula += missLula;
last.validos += missValidos;

let cSec = 0, cEle = 0, cMun = 0, cFlavio = 0, cLula = 0, cValidos = 0;
const series = buckets.map((b) => {
  cSec += b.secoes;
  cEle += b.eleitores;
  cMun += b.municipios;
  cFlavio += b.flavio;
  cLula += b.lula;
  cValidos += b.validos;
  return {
    t: fmtTs(b.t),
    secoes: cSec,
    eleitores: cEle,
    municipios: cMun,
    pct_secoes: Number(((100 * cSec) / totSec).toFixed(2)),
    pct_eleitores: Number(((100 * cEle) / totEle).toFixed(2)),
    flavio: cFlavio,
    lula: cLula,
    validos: cValidos,
    pct_flavio: cValidos ? Number(((100 * cFlavio) / cValidos).toFixed(2)) : 0,
    pct_lula: cValidos ? Number(((100 * cLula) / cValidos).toFixed(2)) : 0,
  };
});

const half = series.find((s) => s.pct_secoes >= 50);
const out = {
  gerado_em: new Date().toISOString(),
  turno: TURNO,
  origem: `${abFile} + ${votosFile} (nivel municipio)`,
  nota: 'Cada municipio entra na serie no horario de sua ultima atualizacao durante a apuracao (horario de Brasilia). A curva aproxima o progresso da totalizacao e o acumulado de votos conforme os municipios foram totalizados.',
  candidatos: { flavio: cand.nomes.flavio, lula: cand.nomes.lula },
  totais: { secoes: totSec, eleitores: totEle, municipios: totMun },
  inicio: series[0].t,
  fim: series[series.length - 1].t,
  momentos: {
    inicio: series[0].t,
    metade: half ? half.t : null,
    fim: series[series.length - 1].t,
  },
  series,
};

fs.writeFileSync(DEST, JSON.stringify(out));
console.log(`-> ${DEST}`);
console.log(`inicio ${series[0].t} | 50% em ${half ? half.t : '?'} | fim ${series[series.length - 1].t}`);
console.log(`pontos: ${series.length} (buckets de ${BUCKET_MIN}min)`);
const f = series[series.length - 1];
console.log(`final: Flavio ${f.flavio.toLocaleString('pt-BR')} (${f.pct_flavio}%) | Lula ${f.lula.toLocaleString('pt-BR')} (${f.pct_lula}%)`);
