import fs from 'node:fs';
import path from 'node:path';
import { OUT, RAW } from './lib.mjs';
import { discoverCandidates } from './candidatos.mjs';

const TURNO = (process.argv.find((a) => a.startsWith('--turno=')) || '').split('=')[1] || '1';

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
const AB_SRC = path.join(OUT, abFile);
const VOTOS_SRC = path.join(OUT, votosFile);
const DEST = path.join(OUT, TURNO === '1' ? 'mapa.json' : `mapa-t${TURNO}.json`);

// Descobre os sqcand de Flávio e Lula no nível "br".
const cand = await discoverCandidates(VOTOS_SRC);
if (!cand.flavio || !cand.lula) {
  console.error('não encontrei Flávio/Lula no nível br de', votosFile);
  process.exit(1);
}
const SQ_FLAVIO = cand.flavio;
const SQ_LULA = cand.lula;
console.log(`candidatos: Flávio=${cand.nomes.flavio} | Lula=${cand.nomes.lula}`);

const parseTs = (s) => {
  const [d, t] = s.split(' ');
  const [dd, mm, yyyy] = d.split('/').map(Number);
  const [hh, mi, ss] = t.split(':').map(Number);
  return new Date(yyyy, mm - 1, dd, hh, mi, ss).getTime();
};

// config: nomes de UF e municipios + ibge (mesma malha para ambos os turnos)
const cfgPath = path.join(RAW, 'ele2026', 'mun-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const UF_NOME = {};
const MU_META = {};
for (const a of cfg.abr) {
  UF_NOME[a.cd] = a.ds;
  for (const m of a.mu) MU_META[`${a.cd}/${m.cd}`] = { nome: m.nm, ibge: m.cdi };
}

// votos por municipio (nivel "mun")
console.log('lendo votos', VOTOS_SRC);
const votos = new Map();
for (const ln of fs.readFileSync(VOTOS_SRC, 'utf8').split('\n')) {
  if (!ln) continue;
  const r = JSON.parse(ln);
  if (r.nivel !== 'mun') continue;
  const key = `${r.uf}/${r.municipio}`;
  let m = votos.get(key);
  if (!m) { m = { flavio: 0, lula: 0 }; votos.set(key, m); }
  if (r.sqcand === SQ_FLAVIO) m.flavio = Number(r.votos || 0);
  else if (r.sqcand === SQ_LULA) m.lula = Number(r.votos || 0);
}

// timestamps do arquivo ab
console.log('lendo ab', AB_SRC);
const municipios = [];
let semTs = 0;
let maxT = 0;
for (const ln of fs.readFileSync(AB_SRC, 'utf8').split('\n')) {
  if (!ln) continue;
  const r = JSON.parse(ln);
  if (r.tpabr !== 'mun') continue;
  const key = `${r.geradora}/${r.cdabr}`;
  const meta = MU_META[key] || { nome: '', ibge: '' };
  const v = votos.get(key) || { flavio: 0, lula: 0 };
  const at = (r.atualizado || '').trim();
  let t = 0;
  if (at) {
    t = parseTs(at);
    if (t > maxT) maxT = t;
  } else {
    semTs++;
  }
  municipios.push({
    uf: r.geradora,
    uf_nome: UF_NOME[r.geradora] || r.geradora,
    municipio: r.cdabr,
    ibge: meta.ibge,
    nome: meta.nome,
    t,
    flavio: v.flavio,
    lula: v.lula,
  });
}

// municipios sem timestamp: colocam no final (totalizacao final)
for (const m of municipios) if (!m.t) m.t = maxT;

const out = {
  gerado_em: new Date().toISOString(),
  turno: TURNO,
  origem: `${abFile} + ${votosFile}`,
  t0: Math.min(...municipios.map((m) => m.t)),
  t1: maxT,
  municipios,
};

fs.writeFileSync(DEST, JSON.stringify(out));
console.log(`-> ${DEST}`);
console.log(`municipios: ${municipios.length} | sem timestamp: ${semTs}`);
console.log(`t0: ${new Date(out.t0).toISOString()} | t1: ${new Date(out.t1).toISOString()}`);
